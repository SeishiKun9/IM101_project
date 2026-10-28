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
    // 0. Ensure extensions & base schema
    try { await client.query("CREATE EXTENSION IF NOT EXISTS pgcrypto"); } catch {}
    try { await client.query("CREATE EXTENSION IF NOT EXISTS citext"); } catch {}
    try { await client.query("CREATE EXTENSION IF NOT EXISTS pg_trgm"); } catch {}
    try {
      await client.query("CREATE INDEX IF NOT EXISTS idx_items_title_trgm ON items USING gin (title gin_trgm_ops)");
    } catch {}

    // Check if foundational schema exists
    try {
      const tableCheck = await client.query(
        "SELECT 1 FROM information_schema.tables WHERE table_name = 'users' LIMIT 1"
      );
      if (tableCheck.rows.length === 0) {
        console.log("Empty database detected. Applying 001_init.sql...");
        const sql001Path = path.join(__dirname, "001_init.sql");
        if (fs.existsSync(sql001Path)) {
          const sql001 = fs.readFileSync(sql001Path, "utf8");
          await client.query(sql001);
          console.log("001_init.sql applied successfully.");
        }
      }
    } catch (initErr) {
      console.warn("Base schema init notice:", initErr.message);
    }

    try { await client.query("ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'found'"); } catch {}
    try { await client.query("ALTER TYPE item_status ADD VALUE IF NOT EXISTS 'completed'"); } catch {}
    try { await client.query("ALTER TYPE claim_status ADD VALUE IF NOT EXISTS 'claimed'"); } catch {}

    // 1. CRITICAL: Ensure audit_logs table and ALL columns exist unconditionally
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS audit_logs (
          id BIGSERIAL PRIMARY KEY
        );
      `);
      await client.query(`
        DO $$ BEGIN
          IF EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'audit_logs' AND column_name = 'audit_id') THEN
            ALTER TABLE audit_logs RENAME COLUMN audit_id TO id;
          END IF;
        END $$;
      `);
      await client.query(`
        ALTER TABLE audit_logs
          ADD COLUMN IF NOT EXISTS actor_user_id BIGINT,
          ADD COLUMN IF NOT EXISTS actor_username VARCHAR(120),
          ADD COLUMN IF NOT EXISTS actor_role VARCHAR(50),
          ADD COLUMN IF NOT EXISTS action VARCHAR(50) DEFAULT 'SYSTEM',
          ADD COLUMN IF NOT EXISTS status VARCHAR(30) NOT NULL DEFAULT 'SUCCESS',
          ADD COLUMN IF NOT EXISTS entity_type VARCHAR(80),
          ADD COLUMN IF NOT EXISTS entity_id VARCHAR(80),
          ADD COLUMN IF NOT EXISTS description TEXT,
          ADD COLUMN IF NOT EXISTS old_values JSONB,
          ADD COLUMN IF NOT EXISTS new_values JSONB,
          ADD COLUMN IF NOT EXISTS changed_fields JSONB,
          ADD COLUMN IF NOT EXISTS ip_address VARCHAR(80),
          ADD COLUMN IF NOT EXISTS user_agent TEXT,
          ADD COLUMN IF NOT EXISTS created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          ADD COLUMN IF NOT EXISTS user_id BIGINT,
          ADD COLUMN IF NOT EXISTS table_name VARCHAR(80),
          ADD COLUMN IF NOT EXISTS record_id BIGINT,
          ADD COLUMN IF NOT EXISTS old_data JSONB,
          ADD COLUMN IF NOT EXISTS new_data JSONB,
          ADD COLUMN IF NOT EXISTS action_time TIMESTAMPTZ DEFAULT now();
      `);
      console.log("audit_logs columns verified successfully.");
    } catch (auditTableErr) {
      console.error("Error setting up audit_logs columns:", auditTableErr.message);
    }

    // 2. CRITICAL: Ensure users table has all required columns
    try {
      await client.query(`
        ALTER TABLE users
          ADD COLUMN IF NOT EXISTS is_active BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS username VARCHAR(60),
          ADD COLUMN IF NOT EXISTS contact_number VARCHAR(30),
          ADD COLUMN IF NOT EXISTS default_anonymous BOOLEAN NOT NULL DEFAULT false,
          ADD COLUMN IF NOT EXISTS default_hide_phone BOOLEAN NOT NULL DEFAULT true,
          ADD COLUMN IF NOT EXISTS theme_preference VARCHAR(10) NOT NULL DEFAULT 'light',
          ADD COLUMN IF NOT EXISTS updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          ADD COLUMN IF NOT EXISTS password_reset_token_hash TEXT,
          ADD COLUMN IF NOT EXISTS password_reset_expires_at TIMESTAMPTZ;
      `);
      await client.query(`
        UPDATE users SET username = 'allen' WHERE user_id = 1 AND (username IS NULL OR username = '');
        UPDATE users SET username = LOWER(SPLIT_PART(email::text, '@', 1)) WHERE username IS NULL OR username = '';
      `);
      console.log("users columns verified successfully.");
    } catch (usersErr) {
      console.error("Error setting up users columns:", usersErr.message);
    }

    // 3. CRITICAL: Ensure campus_logo table exists
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS campus_logo (
          logo_id BIGSERIAL PRIMARY KEY,
          logo_name VARCHAR(120) NOT NULL DEFAULT 'Official Campus Logo',
          image_path TEXT NOT NULL,
          file_size BIGINT,
          mime_type VARCHAR(60),
          updated_by BIGINT REFERENCES users(user_id) ON DELETE SET NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        INSERT INTO campus_logo (logo_id, logo_name, image_path, created_at, updated_at)
        VALUES (1, 'Campus Main Logo', '/assets/img/campus-logo.svg', now(), now())
        ON CONFLICT (logo_id) DO NOTHING;
      `);
    } catch (logoErr) {
      console.error("Error setting up campus_logo:", logoErr.message);
    }

    // Ensure user_sessions table exists (persistent sessions)
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS user_sessions (
          session_token VARCHAR(128) PRIMARY KEY,
          user_id BIGINT REFERENCES users(user_id) ON DELETE CASCADE,
          user_data JSONB NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
          expires_at TIMESTAMPTZ NOT NULL DEFAULT now() + INTERVAL '7 days'
        );
        CREATE INDEX IF NOT EXISTS idx_user_sessions_user_id ON user_sessions(user_id);
        CREATE INDEX IF NOT EXISTS idx_user_sessions_expires_at ON user_sessions(expires_at);
      `);
      console.log("user_sessions table verified successfully.");
    } catch (sessionErr) {
      console.error("Error setting up user_sessions table:", sessionErr.message);
    }

    // Ensure notifications table exists
    try {
      await client.query(`
        CREATE TABLE IF NOT EXISTS notifications (
          notification_id BIGSERIAL PRIMARY KEY,
          user_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          title VARCHAR(150) NOT NULL,
          message TEXT NOT NULL,
          type VARCHAR(50) NOT NULL DEFAULT 'match_alert',
          link VARCHAR(255),
          item_id BIGINT REFERENCES items(item_id) ON DELETE CASCADE,
          is_read BOOLEAN NOT NULL DEFAULT false,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_notifications_user ON notifications(user_id, is_read, created_at DESC);
      `);
      console.log("notifications table verified successfully.");
    } catch (notifErr) {
      console.error("Error setting up notifications table:", notifErr.message);
    }

    // Ensure ownership_proofs columns (Item 19) and claim_messages table (Item 5) exist
    try {
      await client.query(`
        ALTER TABLE ownership_proofs ADD COLUMN IF NOT EXISTS description TEXT;
        ALTER TABLE ownership_proofs ADD COLUMN IF NOT EXISTS image_url TEXT;
        CREATE INDEX IF NOT EXISTS idx_ownership_proofs_claim_id ON ownership_proofs(claim_id);

        CREATE TABLE IF NOT EXISTS claim_messages (
          message_id BIGSERIAL PRIMARY KEY,
          claim_id BIGINT NOT NULL REFERENCES claims(claim_id) ON DELETE CASCADE,
          sender_id BIGINT NOT NULL REFERENCES users(user_id) ON DELETE CASCADE,
          message TEXT NOT NULL,
          created_at TIMESTAMPTZ NOT NULL DEFAULT now()
        );
        CREATE INDEX IF NOT EXISTS idx_claim_messages_claim_id ON claim_messages(claim_id, created_at ASC);
      `);
      console.log("claim_messages and ownership_proofs verified successfully.");
    } catch (msgErr) {
      console.error("Error setting up claim_messages and ownership_proofs:", msgErr.message);
    }

    // Task 15: Ensure items table has disposition tracking columns for unclaimed expiry policy
    try {
      await client.query(`
        ALTER TABLE items
          ADD COLUMN IF NOT EXISTS disposition_type VARCHAR(40) DEFAULT 'none',
          ADD COLUMN IF NOT EXISTS disposition_date TIMESTAMPTZ,
          ADD COLUMN IF NOT EXISTS disposition_notes TEXT,
          ADD COLUMN IF NOT EXISTS disposition_by BIGINT REFERENCES users(user_id);
        CREATE INDEX IF NOT EXISTS idx_items_disposition ON items(disposition_type, date_reported);
      `);
      console.log("items disposition columns verified successfully.");
    } catch (dispErr) {
      console.error("Error setting up items disposition columns:", dispErr.message);
    }

    // Ensure default categories exist
    try {
      const defaultCategories = [
        "Electronics",
        "Documents & IDs",
        "Clothing & Accessories",
        "Bags & Wallets",
        "Keys",
        "Books & Stationery",
        "Others",
      ];
      for (const cat of defaultCategories) {
        await client.query(
          "INSERT INTO categories (category_name) VALUES ($1) ON CONFLICT (category_name) DO NOTHING",
          [cat]
        );
      }
    } catch (catErr) {
      console.warn("Categories seed notice:", catErr.message);
    }

    // 4. Ensure default Administrator account exists
    try {
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
    } catch (adminErr) {
      console.error("Error verifying admin account:", adminErr.message);
    }

    // 5. Run file migrations in individual safe blocks
    // 002
    try {
      const sql002Path = path.join(__dirname, "002_workflow_security.sql");
      if (fs.existsSync(sql002Path)) {
        const sql002 = fs.readFileSync(sql002Path, "utf8");
        const filteredSql002 = sql002
          .split("\n")
          .filter((line) => !line.trim().startsWith("ALTER TYPE"))
          .join("\n");
        await client.query(filteredSql002);
      }
    } catch (err) {
      console.warn("Migration 002 warning:", err.message);
    }

    // 003
    try {
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

      // Seed buildings, floors, rooms
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
    } catch (err) {
      console.warn("Migration 003 warning:", err.message);
    }

    // 004
    try {
      const sql004Path = path.join(__dirname, "004_profile_and_theme.sql");
      if (fs.existsSync(sql004Path)) {
        const sql004 = fs.readFileSync(sql004Path, "utf8");
        await client.query(sql004);
      }
    } catch (err) {
      console.warn("Migration 004 warning:", err.message);
    }

    // 005
    try {
      const sql005Path = path.join(__dirname, "005_audit_logs.sql");
      if (fs.existsSync(sql005Path)) {
        const sql005 = fs.readFileSync(sql005Path, "utf8");
        await client.query(sql005);
      }
    } catch (err) {
      console.warn("Migration 005 warning:", err.message);
    }

    // Status consistency sync for existing items with approved/claimed claims
    try {
      await client.query(`
        UPDATE items
        SET status = 'claimed'
        WHERE status = 'found'
          AND (
            item_id IN (SELECT item_id FROM claims WHERE status = 'approved')
            OR item_id IN (
              SELECT matched_lost_id FROM items
              WHERE item_id IN (SELECT item_id FROM claims WHERE status = 'approved')
                AND matched_lost_id IS NOT NULL
            )
            OR matched_found_id IN (SELECT item_id FROM claims WHERE status = 'approved')
          );

        UPDATE items
        SET status = 'completed'
        WHERE status != 'completed'
          AND (
            item_id IN (SELECT item_id FROM claims WHERE status = 'claimed')
            OR item_id IN (
              SELECT matched_lost_id FROM items
              WHERE item_id IN (SELECT item_id FROM claims WHERE status = 'claimed')
                AND matched_lost_id IS NOT NULL
            )
            OR matched_found_id IN (SELECT item_id FROM claims WHERE status = 'claimed')
          );
      `);
    } catch (err) {
      console.warn("Status consistency sync warning:", err.message);
    }

    console.log("Database migrations applied and verified successfully!");
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
