import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const isRemoteDb =
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes("localhost") &&
  !process.env.DATABASE_URL.includes("127.0.0.1");

function createPool() {
  if (!process.env.DATABASE_URL) return null;
  return new Pool({
    connectionString: process.env.DATABASE_URL,
    ssl:
      process.env.NODE_ENV === "production" || isRemoteDb
        ? { rejectUnauthorized: false }
        : false,
  });
}

const campusLocationsSeed = {
  Scanlon: {
    "Ground floor": ["101c", "102c", "103c", "104c", "105c"],
    "2nd floor": ["201c", "202c", "203c", "204c", "205c"],
    "3rd floor": ["301c", "302c", "303c", "Library"],
    "4th floor": ["401c", "402c", "403c", "404c", "405c"],
    "5th floor": ["501c", "502c", "503c", "Faculty"],
  },
  "Lesage Building": {
    "Ground floor": ["Laboratory"],
    "2nd floor": [
      "201c",
      "202c",
      "203c",
      "204c",
      "205c",
      "206c",
      "207c",
      "208c",
      "209c",
      "210c",
    ],
    "3rd floor": [
      "301c",
      "302c",
      "303c",
      "304c",
      "305c",
      "306c",
      "307c",
      "308c",
      "309c",
      "310c",
    ],
    "4th floor": [
      "401c",
      "402c",
      "403c",
      "404c",
      "405c",
      "406c",
      "407c",
      "408c",
      "409c",
      "410c",
    ],
  },
  "Bates Building": {
    "Ground floor": ["007 Lab", "502B Lab", "503B Lab"],
    "2nd floor": Array.from(
      { length: 10 },
      (_, index) => `2${String(index + 1).padStart(2, "0")}B`,
    ),
    "3rd floor": Array.from(
      { length: 10 },
      (_, index) => `3${String(index + 1).padStart(2, "0")}B`,
    ),
  },
  "JHS Building": { "All floors": ["Elementary"] },
  "Barder Gym": { "All floors": ["Barder Gym"] },
  "Old Gym": { "All floors": ["Old Gym"] },
  Gates: { "All floors": ["Gate 1", "Gate 2", "Gate 3", "Gate 4"] },
  Others: { "All floors": ["Other campus area"] },
};

export async function runMigrations(customPool = null) {
  const localPool = customPool || createPool();
  if (!localPool) {
    console.error("DATABASE_URL is not set in environment.");
    if (!customPool) process.exit(1);
    return;
  }

  const client = await localPool.connect();
  try {
    // 0. Ensure enum values and extensions (outside transaction block)
    await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto");
    await client.query("CREATE EXTENSION IF NOT EXISTS citext");
    try {
      await client.query("ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'found'");
    } catch {}
    try {
      await client.query("ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'completed'");
    } catch {}
    try {
      await client.query("ALTER TYPE claim_status ADD VALUE IF NOT EXISTS 'claimed'");
    } catch {}

    await client.query("BEGIN");

    // 1. Workflow & Security Updates (002)
    const sql002Path = path.join(__dirname, "002_workflow_security.sql");
    if (fs.existsSync(sql002Path)) {
      const sql002 = fs.readFileSync(sql002Path, "utf8");
      // Filter out ALTER TYPE which cannot run in transaction
      const filteredSql002 = sql002
        .split("\n")
        .filter((line) => !line.trim().startsWith("ALTER TYPE"))
        .join("\n");
      await client.query(filteredSql002);
    }

    // 2. Locations & Maps (003)
    const sql003Path = path.join(__dirname, "003_locations_and_maps.sql");
    if (fs.existsSync(sql003Path)) {
      const sql003 = fs.readFileSync(sql003Path, "utf8");
      await client.query(sql003);
    }

    // Seed initial Campus Map if none exists
    const mapCheck = await client.query("SELECT map_id FROM campus_maps LIMIT 1");
    let initialMapId = mapCheck.rows[0]?.map_id;

    if (!initialMapId) {
      const mapInsert = await client.query(
        `INSERT INTO campus_maps (name, description, image_path, version_number, is_active, is_archived)
         VALUES ($1, $2, $3, $4, true, false)
         RETURNING map_id`,
        [
          "Campus Main Map",
          "Official Holy Name University campus map",
          "/uploads/maps/campus-map-v1.jpg",
          1,
        ],
      );
      initialMapId = mapInsert.rows[0].map_id;
    }

    // Seed initial buildings, floors, rooms
    let buildingOrder = 1;
    for (const [buildingName, floors] of Object.entries(campusLocationsSeed)) {
      const bRes = await client.query(
        `INSERT INTO buildings (name, display_order, is_active, is_archived)
         VALUES ($1, $2, true, false)
         ON CONFLICT (LOWER(TRIM(name))) DO UPDATE SET display_order = EXCLUDED.display_order
         RETURNING building_id`,
        [buildingName, buildingOrder++],
      );
      const buildingId = bRes.rows[0].building_id;

      let floorOrder = 1;
      for (const [floorName, rooms] of Object.entries(floors)) {
        const fRes = await client.query(
          `INSERT INTO floors (building_id, name, display_order, is_active, is_archived)
           VALUES ($1, $2, $3, true, false)
           ON CONFLICT (building_id, LOWER(TRIM(name))) DO UPDATE SET display_order = EXCLUDED.display_order
           RETURNING floor_id`,
          [buildingId, floorName, floorOrder++],
        );
        const floorId = fRes.rows[0].floor_id;

        let roomOrder = 1;
        for (const roomName of rooms) {
          await client.query(
            `INSERT INTO rooms (floor_id, name, display_order, is_active, is_archived)
             VALUES ($1, $2, $3, true, false)
             ON CONFLICT (floor_id, LOWER(TRIM(name))) DO UPDATE SET display_order = EXCLUDED.display_order
             RETURNING room_id`,
            [floorId, roomName, roomOrder++],
          );
        }
      }
    }

    // Link unlinked legacy items
    const unlinkedItems = await client.query(`
      SELECT i.item_id, i.map_x, i.map_y, l.building, l.floor, l.location_name
      FROM items i
      LEFT JOIN locations l ON l.location_id = i.location_id
      WHERE i.building_id IS NULL AND i.location_id IS NOT NULL
    `);

    for (const item of unlinkedItems.rows) {
      let matchedBuildingId = null;
      let matchedFloorId = null;
      let matchedRoomId = null;

      if (item.building) {
        const b = await client.query(
          "SELECT building_id, name FROM buildings WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))",
          [item.building],
        );
        if (b.rows.length) {
          matchedBuildingId = b.rows[0].building_id;
          if (item.floor) {
            const f = await client.query(
              "SELECT floor_id, name FROM floors WHERE building_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))",
              [matchedBuildingId, item.floor],
            );
            if (f.rows.length) {
              matchedFloorId = f.rows[0].floor_id;
              if (item.location_name) {
                const r = await client.query(
                  "SELECT room_id, name FROM rooms WHERE floor_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))",
                  [matchedFloorId, item.location_name],
                );
                if (r.rows.length) {
                  matchedRoomId = r.rows[0].room_id;
                }
              }
            }
          }
        }
      }

      const hasPin = item.map_x !== null && item.map_y !== null;
      const mapIdToSet = hasPin ? initialMapId : null;

      const snapshot = {
        buildingName: item.building || null,
        floorName: item.floor || null,
        roomName: item.location_name || null,
        locationDescription: null,
        mapName: hasPin ? "Campus Main Map" : null,
      };

      await client.query(
        `UPDATE items
         SET building_id = $1,
             floor_id = $2,
             room_id = $3,
             map_id = $4,
             location_snapshot = $5
         WHERE item_id = $6`,
        [
          matchedBuildingId,
          matchedFloorId,
          matchedRoomId,
          mapIdToSet,
          JSON.stringify(snapshot),
          item.item_id,
        ],
      );
    }

    // 3. Profile & Theme Preferences (004)
    const sql004Path = path.join(__dirname, "004_profile_and_theme.sql");
    if (fs.existsSync(sql004Path)) {
      const sql004 = fs.readFileSync(sql004Path, "utf8");
      await client.query(sql004);
    }

    // 4. Audit Logs & System Branding (005)
    const sql005Path = path.join(__dirname, "005_audit_logs.sql");
    if (fs.existsSync(sql005Path)) {
      const sql005 = fs.readFileSync(sql005Path, "utf8");
      await client.query(sql005);
    }

    // 5. Ensure users has is_active and username columns guaranteed
    await client.query(`
      ALTER TABLE users ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(60);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS contact_number VARCHAR(30);
      ALTER TABLE users ADD COLUMN IF NOT EXISTS default_anonymous BOOLEAN NOT NULL DEFAULT false;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS default_hide_phone BOOLEAN NOT NULL DEFAULT true;
      ALTER TABLE users ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) NOT NULL DEFAULT 'light';
      ALTER TABLE users ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now();
    `);

    // 6. Ensure default Administrator account exists
    const adminCheck = await client.query(
      "SELECT user_id, email FROM users WHERE role = 'admin' LIMIT 1",
    );
    if (adminCheck.rows.length === 0) {
      console.log("No administrator user found in database. Seeding initial admin...");
      await client.query(
        `INSERT INTO users (name, email, username, password_hash, role, is_active, created_at, updated_at)
         VALUES ($1, $2, $3, $4, 'admin', true, now(), now())
         ON CONFLICT (email) DO UPDATE SET role = 'admin', is_active = true`,
        [
          "Allen Postanes Aguiman",
          "aguiman.allen@hnu.edu.ph",
          "allen",
          "scrypt:0ff61cebbfff71a5d32757ba81869bab:595adf0964fd7d64cb664f146ab0167782bb6eaa1f31ae5081c537ff801a5362b470dcfe3b1b3556f58c0fe3911a74736245f455783601a65e9260f386a5318a",
        ],
      );
      console.log("Seeded default admin user: aguiman.allen@hnu.edu.ph");
    }

    await client.query("COMMIT");
    console.log("Database migrations applied and verified successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration error:", err);
    throw err;
  } finally {
    client.release();
    if (!customPool) {
      await localPool.end();
    }
  }
}

// If executed directly from CLI: node db/migrate.js
if (process.argv[1] && process.argv[1].endsWith("migrate.js")) {
  runMigrations()
    .then(() => process.exit(0))
    .catch(() => process.exit(1));
}
