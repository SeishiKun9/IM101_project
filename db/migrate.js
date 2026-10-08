import "dotenv/config";
import pg from "pg";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const { Pool } = pg;
const __dirname = path.dirname(fileURLToPath(import.meta.url));

if (!process.env.DATABASE_URL) {
  console.error("DATABASE_URL is not set in environment.");
  process.exit(1);
}

const pool = new Pool({
  connectionString: process.env.DATABASE_URL,
});

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

async function migrate() {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    console.log("Running migration 003_locations_and_maps...");

    const sqlPath = path.join(__dirname, "003_locations_and_maps.sql");
    const sql = fs.readFileSync(sqlPath, "utf8");
    await client.query(sql);

    // 1. Seed initial Campus Map if none exists
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
      console.log(`Seeded initial campus map with id ${initialMapId}`);
    }

    // 2. Seed initial buildings, floors, rooms
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
    console.log("Seeded buildings, floors, and rooms successfully.");

    // 3. Migrate existing items to link to building_id, floor_id, room_id, map_id, and snapshot
    const unlinkedItems = await client.query(`
      SELECT i.item_id, i.map_x, i.map_y, l.building, l.floor, l.location_name
      FROM items i
      LEFT JOIN locations l ON l.location_id = i.location_id
      WHERE i.building_id IS NULL AND i.location_id IS NOT NULL
    `);

    console.log(`Found ${unlinkedItems.rowCount} existing items to map.`);
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

      // Check if map coordinates exist, link to initialMapId
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

    await client.query("COMMIT");
    console.log("Migration completed successfully!");
  } catch (err) {
    await client.query("ROLLBACK");
    console.error("Migration failed:", err);
    process.exit(1);
  } finally {
    client.release();
    await pool.end();
  }
}

migrate();
