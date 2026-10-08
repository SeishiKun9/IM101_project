import "dotenv/config";
import crypto from "node:crypto";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { createLocationsRouter } from "./routes/locations.js";
import { createMapsRouter } from "./routes/maps.js";
import { createAdminLocationsRouter } from "./routes/adminLocations.js";
import { createAdminMapsRouter } from "./routes/adminMaps.js";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessions = new Map();
const adminSetupToken = process.env.ADMIN_SETUP_TOKEN || "";
const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

app.use(express.json({ limit: "15mb" }));
app.use(express.static(path.join(__dirname, "../../client/dist")));
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));

const itemLocationJoins = `
  JOIN categories c ON c.category_id = i.category_id
  LEFT JOIN buildings b ON b.building_id = i.building_id
  LEFT JOIN floors f ON f.floor_id = i.floor_id
  LEFT JOIN rooms r ON r.room_id = i.room_id
  LEFT JOIN campus_maps m ON m.map_id = i.map_id
  LEFT JOIN locations l ON l.location_id = i.location_id`;

const publicItemFields = `
  i.item_id AS id, i.item_type AS type, i.title, i.description,
  i.date_reported AS date, i.status, c.category_name AS category,
  COALESCE(b.name, i.location_snapshot->>'buildingName', l.building, 'Campus Area') AS building,
  COALESCE(r.name, i.location_description, i.location_snapshot->>'roomName', l.location_name, 'General Area') AS location,
  COALESCE(f.name, i.location_snapshot->>'floorName', l.floor, 'All floors') AS floor,
  i.building_id AS "buildingId", i.floor_id AS "floorId", i.room_id AS "roomId",
  i.location_description AS "locationDescription",
  i.matched_lost_id AS "matchedLostId",
  i.matched_found_id AS "matchedFoundId", i.review_lost_id AS "reviewLostId", i.finder_name AS "finderName",
  i.found_location AS "foundLocation", i.confirmation_date AS "confirmationDate",
  i.map_id AS "mapId",
  COALESCE(m.image_path, '/uploads/maps/campus-map-v1.jpg') AS "mapImageUrl",
  COALESCE(m.name, 'Campus Main Map') AS "mapName",
  i.map_x AS "mapX", i.map_y AS "mapY",
  i.location_snapshot AS "locationSnapshot",
  CASE WHEN i.is_anonymous THEN 'Anonymous' ELSE COALESCE(i.reporter_name, 'Unknown') END AS "reporterName",
  (SELECT image_path FROM item_images WHERE item_id = i.item_id ORDER BY uploaded_at LIMIT 1) AS image`;

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}
function requireDatabase(req, res, next) {
  if (!pool)
    return res.status(503).json({ error: "Database is not configured." });
  next();
}
function tokenFrom(req) {
  const header = req.get("authorization") || "";
  return header.startsWith("Bearer ") ? header.slice(7) : null;
}
function requireAuth(req, res, next) {
  const user = sessions.get(tokenFrom(req));
  if (!user)
    return res.status(401).json({ error: "Please sign in to continue." });
  req.user = user;
  next();
}
function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res
        .status(403)
        .json({ error: "You are not authorized for this workspace." });
    next();
  };
}
function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}
function verifyPassword(password, stored) {
  const [, salt, expected] = String(stored).split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex"),
  );
}
function safeUser(row) {
  return { id: row.user_id, name: row.name, email: row.email, role: row.role };
}
async function startSession(user) {
  const token = crypto.randomBytes(32).toString("hex");
  sessions.set(token, safeUser(user));
  return { token, user: safeUser(user) };
}
async function findUser(email) {
  const result = await pool.query(
    "SELECT user_id, name, email, password_hash, role FROM users WHERE email = $1",
    [email],
  );
  return result.rows[0];
}

app.get(
  "/api/health",
  asyncRoute(async (req, res) => {
    if (!pool) return res.json({ status: "ok", database: "not configured" });
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  }),
);

app.use(
  "/api/locations",
  createLocationsRouter({ pool, asyncRoute, requireDatabase }),
);
app.use("/api/maps", createMapsRouter({ pool, asyncRoute, requireDatabase }));
app.use(
  "/api/admin",
  createAdminLocationsRouter({
    pool,
    asyncRoute,
    requireDatabase,
    requireAuth,
    requireRole,
  }),
);
app.use(
  "/api/admin/maps",
  createAdminMapsRouter({
    pool,
    asyncRoute,
    requireDatabase,
    requireAuth,
    requireRole,
  }),
);

app.post(
  "/api/auth/register",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const {
      name,
      email,
      password,
      accountType = "client",
      setupToken = "",
    } = req.body;
    if (!name || !email || !password || password.length < 6)
      return res.status(400).json({
        error:
          "Name, school email, and a password of at least 6 characters are required.",
      });
    if (!["client", "admin"].includes(accountType))
      return res.status(400).json({ error: "Choose Client or Administrator." });
    if (
      accountType === "admin" &&
      (!adminSetupToken || setupToken !== adminSetupToken)
    )
      return res.status(403).json({
        error:
          "Administrator registration requires a valid setup authorization.",
      });
    const normalizedEmail = String(email).trim().toLowerCase();
    if (
      !normalizedEmail.endsWith(".edu") &&
      !normalizedEmail.endsWith(".edu.ph")
    )
      return res
        .status(400)
        .json({ error: "Please use your school email address." });
    try {
      const role = accountType === "admin" ? "admin" : "student";
      const result = await pool.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, password_hash, role",
        [name.trim(), normalizedEmail, hashPassword(password), role],
      );
      res.status(201).json(await startSession(result.rows[0]));
    } catch (error) {
      if (error.code === "23505")
        return res
          .status(409)
          .json({ error: "That email already has an account." });
      throw error;
    }
  }),
);

app.post(
  "/api/auth/login",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const user = await findUser(
      String(req.body.email || "")
        .trim()
        .toLowerCase(),
    );
    if (!user || !verifyPassword(req.body.password || "", user.password_hash))
      return res
        .status(401)
        .json({ error: "Email or password does not match." });
    res.json(await startSession(user));
  }),
);

app.post(
  "/api/auth/forgot-password",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const user = await findUser(email);
    const response = {
      message:
        "If that account exists, password reset instructions have been created.",
    };
    if (!user) return res.json(response);

    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    await pool.query(
      "UPDATE users SET password_reset_token_hash = $1, password_reset_expires_at = now() + interval '15 minutes' WHERE user_id = $2",
      [tokenHash, user.user_id],
    );
    if (process.env.NODE_ENV !== "production") response.resetToken = resetToken;
    res.json(response);
  }),
);

app.post(
  "/api/auth/reset-password",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const { token, password } = req.body;
    if (!token || !password || password.length < 6)
      return res.status(400).json({
        error:
          "A reset token and password of at least 6 characters are required.",
      });
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const result = await pool.query(
      "UPDATE users SET password_hash = $1, password_reset_token_hash = NULL, password_reset_expires_at = NULL WHERE password_reset_token_hash = $2 AND password_reset_expires_at > now() RETURNING user_id",
      [hashPassword(password), tokenHash],
    );
    if (!result.rows[0])
      return res
        .status(400)
        .json({ error: "That reset token is invalid or expired." });
    for (const [sessionToken, sessionUser] of sessions) {
      if (sessionUser.id === result.rows[0].user_id)
        sessions.delete(sessionToken);
    }
    res.json({ message: "Password reset successfully. You can sign in now." });
  }),
);
app.post("/api/auth/logout", requireAuth, (req, res) => {
  sessions.delete(tokenFrom(req));
  res.status(204).end();
});
app.get("/api/auth/me", requireAuth, (req, res) =>
  res.json({ user: req.user }),
);

app.get(
  "/api/items",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const values = [];
    const where = [];
    if (req.query.search) {
      values.push(`%${String(req.query.search).trim()}%`);
      where.push(
        `(i.title ILIKE $${values.length} OR i.description ILIKE $${values.length})`,
      );
    }
    if (["lost", "found"].includes(req.query.type)) {
      values.push(req.query.type);
      where.push(`i.item_type = $${values.length}`);
    }
    if (req.query.status && req.query.status !== "all") {
      values.push(req.query.status);
      where.push(`i.status = $${values.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";
    const result = await pool.query(
      `SELECT ${publicItemFields} FROM items i ${itemLocationJoins} ${whereSql} ORDER BY i.created_at DESC LIMIT 100`,
      values,
    );
    res.json(result.rows);
  }),
);

app.get(
  "/api/items/:itemId",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT ${publicItemFields} FROM items i ${itemLocationJoins} WHERE i.item_id = $1`,
      [req.params.itemId],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Report not found." });
    }
    res.json(result.rows[0]);
  }),
);

app.get(
  "/api/stats",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS \"lostCount\" FROM items WHERE item_type = 'lost' AND status = 'reported'",
    );
    res.json(result.rows[0]);
  }),
);

app.post(
  "/api/items",
  requireDatabase,
  requireAuth,
  asyncRoute(async (req, res) => {
    const {
      itemType,
      title,
      description,
      dateReported,
      category = "Campus report",
      buildingId,
      floorId,
      roomId,
      locationDescription,
      building: legacyBuilding,
      floor: legacyFloor,
      room: legacyRoom,
      location: legacyLocation,
      reporterName,
      contactPhone,
      isAnonymous = false,
      hidePhone = true,
      mapId,
      mapX,
      mapY,
      image,
    } = req.body;

    if (
      !itemType ||
      !["lost", "found"].includes(itemType) ||
      !title?.trim() ||
      !description?.trim() ||
      !dateReported
    ) {
      return res.status(400).json({
        error: "Report type, title, description, and date are required.",
      });
    }

    // 1. Resolve & Validate Building
    let resolvedBuilding = null;
    if (buildingId) {
      const bRes = await pool.query(
        "SELECT building_id, name, is_active, is_archived FROM buildings WHERE building_id = $1",
        [buildingId],
      );
      if (
        !bRes.rows.length ||
        bRes.rows[0].is_archived ||
        !bRes.rows[0].is_active
      ) {
        return res.status(400).json({
          error:
            "The selected building is not active or available. Please refresh and select an active building.",
        });
      }
      resolvedBuilding = bRes.rows[0];
    } else if (legacyBuilding) {
      const bRes = await pool.query(
        "SELECT building_id, name, is_active, is_archived FROM buildings WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_archived = false",
        [legacyBuilding],
      );
      if (bRes.rows.length && bRes.rows[0].is_active) {
        resolvedBuilding = bRes.rows[0];
      }
    }

    if (!resolvedBuilding && !legacyLocation) {
      return res
        .status(400)
        .json({ error: "Please select a valid building or campus location." });
    }

    // 2. Resolve & Validate Floor (Optional, e.g. for whole building or outdoor areas)
    let resolvedFloor = null;
    if (floorId) {
      const fRes = await pool.query(
        "SELECT floor_id, building_id, name, is_active, is_archived FROM floors WHERE floor_id = $1",
        [floorId],
      );
      if (
        !fRes.rows.length ||
        fRes.rows[0].is_archived ||
        !fRes.rows[0].is_active
      ) {
        return res.status(400).json({
          error:
            "The selected floor is not active or available. Please reselect a valid floor.",
        });
      }
      if (
        resolvedBuilding &&
        fRes.rows[0].building_id !== resolvedBuilding.building_id
      ) {
        return res.status(400).json({
          error: "The selected floor does not belong to the selected building.",
        });
      }
      resolvedFloor = fRes.rows[0];
    } else if (legacyFloor && resolvedBuilding) {
      const fRes = await pool.query(
        "SELECT floor_id, building_id, name, is_active, is_archived FROM floors WHERE building_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND is_archived = false",
        [resolvedBuilding.building_id, legacyFloor],
      );
      if (fRes.rows.length && fRes.rows[0].is_active) {
        resolvedFloor = fRes.rows[0];
      }
    }

    // 3. Resolve & Validate Room (Optional, e.g. hallways, outdoor areas)
    let resolvedRoom = null;
    if (roomId) {
      const rRes = await pool.query(
        "SELECT room_id, floor_id, name, is_active, is_archived FROM rooms WHERE room_id = $1",
        [roomId],
      );
      if (
        !rRes.rows.length ||
        rRes.rows[0].is_archived ||
        !rRes.rows[0].is_active
      ) {
        return res.status(400).json({
          error:
            "The selected room is not active or available. Please reselect a valid room.",
        });
      }
      if (!resolvedFloor || rRes.rows[0].floor_id !== resolvedFloor.floor_id) {
        return res.status(400).json({
          error: "The selected room does not belong to the selected floor.",
        });
      }
      resolvedRoom = rRes.rows[0];
    } else if (legacyRoom && resolvedFloor) {
      const rRes = await pool.query(
        "SELECT room_id, floor_id, name, is_active, is_archived FROM rooms WHERE floor_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND is_archived = false",
        [resolvedFloor.floor_id, legacyRoom],
      );
      if (rRes.rows.length && rRes.rows[0].is_active) {
        resolvedRoom = rRes.rows[0];
      }
    }

    // 4. Validate Active Map & Coordinates
    const activeMapRes = await pool.query(
      "SELECT map_id, name, image_path FROM campus_maps WHERE is_active = true AND is_archived = false LIMIT 1",
    );
    const activeMap = activeMapRes.rows[0] || null;

    const hasPin =
      mapX !== undefined &&
      mapX !== null &&
      mapX !== "" &&
      mapY !== undefined &&
      mapY !== null &&
      mapY !== "";

    let resolvedMapId = null;
    let resolvedMapName = null;
    let resolvedMapVersion = null;

    if (hasPin) {
      if (mapId) {
        const mRes = await pool.query(
          "SELECT map_id, name, version_number FROM campus_maps WHERE map_id = $1",
          [mapId],
        );
        if (mRes.rows.length) {
          resolvedMapId = mRes.rows[0].map_id;
          resolvedMapName = mRes.rows[0].name;
          resolvedMapVersion = mRes.rows[0].version_number;
        }
      }
      if (!resolvedMapId && activeMap) {
        resolvedMapId = activeMap.map_id;
        resolvedMapName = activeMap.name;
        resolvedMapVersion = activeMap.version_number;
      }
    }

    if (itemType === "found") {
      if (!reporterName || !contactPhone || !image) {
        return res.status(400).json({
          error:
            "Found reports require finder name, contact phone, and item photo.",
        });
      }
      // If an active campus map exists, require placing a pin on it
      if (activeMap && !hasPin) {
        return res.status(400).json({
          error:
            "Found reports require a map pin pinpointing where the item was found.",
        });
      }
    }

    const locationSnapshot = {
      buildingName: resolvedBuilding?.name || legacyBuilding || null,
      floorName: resolvedFloor?.name || legacyFloor || null,
      roomName: resolvedRoom?.name || legacyRoom || null,
      locationDescription: (locationDescription || "").trim() || null,
      mapName: resolvedMapName || (hasPin ? "Campus Map" : null),
      mapVersion: resolvedMapVersion || null,
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const categoryResult = await client.query(
        "INSERT INTO categories (category_name) VALUES ($1) ON CONFLICT (category_name) DO UPDATE SET category_name = EXCLUDED.category_name RETURNING category_id",
        [category],
      );

      // Maintain legacy location record for backwards compatibility
      const legacyLocName =
        resolvedRoom?.name ||
        locationDescription?.trim() ||
        legacyRoom ||
        legacyLocation ||
        resolvedBuilding?.name ||
        "Campus Area";
      const legacyBuildingName =
        resolvedBuilding?.name || legacyBuilding || "Campus Area";
      const legacyFloorName =
        resolvedFloor?.name || legacyFloor || "All floors";

      const locationResult = await client.query(
        "INSERT INTO locations (location_name, building, floor) VALUES ($1, $2, $3) ON CONFLICT (building, location_name, floor) DO UPDATE SET floor = EXCLUDED.floor RETURNING location_id",
        [legacyLocName, legacyBuildingName, legacyFloorName],
      );

      const item = await client.query(
        `INSERT INTO items (
           reporter_id, category_id, location_id,
           building_id, floor_id, room_id, map_id,
           location_description, location_snapshot,
           item_type, title, description, date_reported,
           reporter_name, contact_phone, is_anonymous, hide_phone,
           map_x, map_y
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING item_id`,
        [
          req.user.id,
          categoryResult.rows[0].category_id,
          locationResult.rows[0].location_id,
          resolvedBuilding?.building_id || null,
          resolvedFloor?.floor_id || null,
          resolvedRoom?.room_id || null,
          resolvedMapId,
          (locationDescription || "").trim() || null,
          JSON.stringify(locationSnapshot),
          itemType,
          title.trim(),
          description.trim(),
          dateReported,
          reporterName || req.user.name,
          contactPhone || null,
          Boolean(isAnonymous),
          hidePhone !== false,
          hasPin ? mapX : null,
          hasPin ? mapY : null,
        ],
      );

      if (image) {
        await client.query(
          "INSERT INTO item_images (item_id, image_path) VALUES ($1, $2)",
          [item.rows[0].item_id, image],
        );
      }

      await client.query("COMMIT");
      res.status(201).json({ id: item.rows[0].item_id });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

// Deliberately update a report's location and map coordinates
app.patch(
  "/api/items/:itemId/location",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const { buildingId, floorId, roomId, locationDescription, mapX, mapY } =
      req.body;
    const itemQuery = await pool.query(
      "SELECT item_id, reporter_id FROM items WHERE item_id = $1",
      [req.params.itemId],
    );
    if (!itemQuery.rows.length) {
      return res.status(404).json({ error: "Item not found." });
    }
    const item = itemQuery.rows[0];
    if (
      item.reporter_id !== req.user.id &&
      !["staff", "admin"].includes(req.user.role)
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this item's location." });
    }

    let bName = null;
    let fName = null;
    let rName = null;

    if (buildingId) {
      const bRes = await pool.query(
        "SELECT name FROM buildings WHERE building_id = $1",
        [buildingId],
      );
      if (bRes.rows.length) bName = bRes.rows[0].name;
    }
    if (floorId) {
      const fRes = await pool.query(
        "SELECT name FROM floors WHERE floor_id = $1",
        [floorId],
      );
      if (fRes.rows.length) fName = fRes.rows[0].name;
    }
    if (roomId) {
      const rRes = await pool.query(
        "SELECT name FROM rooms WHERE room_id = $1",
        [roomId],
      );
      if (rRes.rows.length) rName = rRes.rows[0].name;
    }

    const hasPin =
      mapX !== undefined &&
      mapX !== null &&
      mapX !== "" &&
      mapY !== undefined &&
      mapY !== null &&
      mapY !== "";

    let mapId = null;
    let mapName = null;
    if (hasPin) {
      const activeMap = await pool.query(
        "SELECT map_id, name FROM campus_maps WHERE is_active = true AND is_archived = false LIMIT 1",
      );
      if (activeMap.rows.length) {
        mapId = activeMap.rows[0].map_id;
        mapName = activeMap.rows[0].name;
      }
    }

    const snapshot = {
      buildingName: bName,
      floorName: fName,
      roomName: rName,
      locationDescription: (locationDescription || "").trim() || null,
      mapName,
    };

    await pool.query(
      `UPDATE items
       SET building_id = $1, floor_id = $2, room_id = $3,
           location_description = $4, map_id = $5,
           map_x = $6, map_y = $7, location_snapshot = $8,
           updated_at = now()
       WHERE item_id = $9`,
      [
        buildingId || null,
        floorId || null,
        roomId || null,
        (locationDescription || "").trim() || null,
        mapId,
        hasPin ? mapX : null,
        hasPin ? mapY : null,
        JSON.stringify(snapshot),
        req.params.itemId,
      ],
    );

    res.json({ success: true });
  }),
);

app.get(
  "/api/my/reports",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT ${publicItemFields}, i.reporter_name AS "privateReporterName", i.contact_phone AS "contactPhone", i.is_anonymous AS "isAnonymous", i.hide_phone AS "hidePhone", COALESCE(json_agg(json_build_object('id', cl.claim_id, 'status', cl.status, 'claimDate', cl.claim_date, 'reviewedAt', cl.reviewed_at, 'rejectionReason', cl.rejection_reason, 'itemId', cl.item_id)) FILTER (WHERE cl.claim_id IS NOT NULL), '[]') AS claims FROM items i ${itemLocationJoins} LEFT JOIN claims cl ON (cl.item_id = i.item_id OR cl.item_id = i.matched_found_id) AND cl.claimant_id = $1 WHERE i.reporter_id = $1 GROUP BY i.item_id, c.category_name, b.name, f.name, r.name, m.image_path, m.name, l.building, l.location_name, l.floor ORDER BY i.created_at DESC`,
      [req.user.id],
    );
    res.json(result.rows);
  }),
);

app.post(
  "/api/items/:itemId/claims",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const item = await pool.query(
      "SELECT item_id, item_type, matched_lost_id, status FROM items WHERE item_id = $1",
      [req.params.itemId],
    );
    const found = item.rows[0];
    if (!found || found.item_type !== "found")
      return res.status(404).json({ error: "Found report not found." });
    if (!found.matched_lost_id)
      return res.status(403).json({
        error:
          "You did not submit the lost report associated with this item, so you are not eligible to claim it.",
      });
    const owner = await pool.query(
      "SELECT reporter_id FROM items WHERE item_id = $1",
      [found.matched_lost_id],
    );
    if (!owner.rows[0] || owner.rows[0].reporter_id !== req.user.id)
      return res.status(403).json({
        error:
          "You did not submit the lost report associated with this item, so you are not eligible to claim it.",
      });
    if (["claimed", "completed", "closed"].includes(found.status))
      return res
        .status(409)
        .json({ error: "This case has already been completed." });
    const existing = await pool.query(
      "SELECT status FROM claims WHERE item_id = $1 AND claimant_id = $2",
      [found.item_id, req.user.id],
    );
    if (
      existing.rows.some((row) =>
        ["pending", "approved", "claimed"].includes(row.status),
      )
    )
      return res
        .status(409)
        .json({ error: "You already have an active claim for this item." });
    const claim = await pool.query(
      "INSERT INTO claims (item_id, claimant_id) VALUES ($1, $2) ON CONFLICT (item_id, claimant_id) DO UPDATE SET status = 'pending', rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL RETURNING claim_id",
      [found.item_id, req.user.id],
    );
    res.status(201).json({ claimId: claim.rows[0].claim_id });
  }),
);

app.patch(
  "/api/items/:itemId/privacy",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const { isAnonymous, hidePhone } = req.body;
    const result = await pool.query(
      "UPDATE items SET is_anonymous = $1, hide_phone = $2 WHERE item_id = $3 AND reporter_id = $4 RETURNING item_id",
      [
        Boolean(isAnonymous),
        hidePhone !== false,
        req.params.itemId,
        req.user.id,
      ],
    );
    if (!result.rows[0])
      return res
        .status(403)
        .json({ error: "Only the report owner can update privacy settings." });
    res.json({ ok: true });
  }),
);

app.get(
  "/api/review/queue",
  requireAuth,
  requireDatabase,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const items = await pool.query(
      `SELECT ${publicItemFields}, i.reporter_name AS "privateReporterName", i.contact_phone AS "contactPhone", i.is_anonymous AS "isAnonymous", i.hide_phone AS "hidePhone" FROM items i ${itemLocationJoins} WHERE i.item_type = 'found' AND i.status IN ('reported', 'under_review') AND i.matched_lost_id IS NULL ORDER BY i.created_at`,
    );
    const lost = await pool.query(
      `SELECT ${publicItemFields}, i.reporter_name AS "privateReporterName", i.contact_phone AS "contactPhone", i.is_anonymous AS "isAnonymous", i.hide_phone AS "hidePhone" FROM items i ${itemLocationJoins} WHERE i.item_type = 'lost' AND i.status IN ('reported', 'under_review') AND i.matched_found_id IS NULL ORDER BY i.created_at`,
    );
    const claims = await pool.query(
      'SELECT cl.claim_id AS id, cl.status, cl.claim_date AS "claimDate", cl.reviewed_at AS "reviewedAt", cl.rejection_reason AS "rejectionReason", cl.item_id AS "itemId", u.name AS claimant, u.email, i.reporter_name AS "finderName", i.contact_phone AS "finderPhone" FROM claims cl JOIN users u ON u.user_id = cl.claimant_id JOIN items i ON i.item_id = cl.item_id ORDER BY cl.claim_date DESC',
    );
    const cases = await pool.query(
      `SELECT ${publicItemFields}, 
              i.reporter_name AS "privateReporterName", 
              i.contact_phone AS "contactPhone", 
              i.is_anonymous AS "isAnonymous", 
              i.hide_phone AS "hidePhone",
              lost_item.title AS "lostTitle",
              lost_item.reporter_name AS "lostReporterName"
       FROM items i 
       ${itemLocationJoins}
       LEFT JOIN items lost_item ON lost_item.item_id = i.matched_lost_id
       WHERE (i.item_type = 'found' AND i.matched_lost_id IS NOT NULL AND i.status IN ('found', 'claimed', 'completed'))
          OR (i.matched_lost_id IS NULL AND i.matched_found_id IS NULL AND i.status IN ('found', 'claimed', 'completed'))
       ORDER BY i.updated_at DESC`,
    );
    res.json({
      items: items.rows,
      lost: lost.rows,
      claims: claims.rows,
      cases: cases.rows,
    });
  }),
);

app.post(
  "/api/reports/:foundId/match",
  requireAuth,
  requireDatabase,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const { lostId, finderName, foundLocation, notes } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        "SELECT item_id, matched_lost_id FROM items WHERE item_id = $1 AND item_type = 'found' AND matched_lost_id IS NULL FOR UPDATE",
        [req.params.foundId],
      );
      const lost = await client.query(
        "SELECT item_id, matched_found_id FROM items WHERE item_id = $1 AND item_type = 'lost' AND matched_found_id IS NULL FOR UPDATE",
        [lostId],
      );
      if (!found.rows[0] || !lost.rows[0])
        return res
          .status(404)
          .json({ error: "Both reports are required for a match." });
      await client.query(
        "UPDATE items SET status = 'found', matched_lost_id = $1, review_lost_id = NULL, matched_by = $5, finder_name = $2, found_location = $3, confirmation_date = now(), verifier_notes = $4 WHERE item_id = $6",
        [
          lostId,
          finderName,
          foundLocation,
          notes,
          req.user.id,
          req.params.foundId,
        ],
      );
      await client.query(
        "UPDATE items SET status = 'found', matched_found_id = $1, matched_by = $5, finder_name = $2, found_location = $3, confirmation_date = now(), verifier_notes = $4 WHERE item_id = $6",
        [
          req.params.foundId,
          finderName,
          foundLocation,
          notes,
          req.user.id,
          lostId,
        ],
      );
      await client.query("COMMIT");
      res.json({ ok: true, message: "Item found. Please collect it at CSA." });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.patch(
  "/api/reports/:itemId/status",
  requireAuth,
  requireDatabase,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const { status, lostId } = req.body;
    if (!["under_review", "reported"].includes(status))
      return res
        .status(400)
        .json({ error: "Status must be Under review or Lost." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const itemResult = await client.query(
        "SELECT item_id, item_type, review_lost_id FROM items WHERE item_id = $1 FOR UPDATE",
        [req.params.itemId],
      );
      const item = itemResult.rows[0];
      if (!item) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Report not found." });
      }

      if (status === "under_review" && lostId) {
        const lostResult = await client.query(
          "SELECT item_id FROM items WHERE item_id = $1 AND item_type = 'lost' AND status IN ('reported', 'under_review') AND matched_found_id IS NULL FOR UPDATE",
          [lostId],
        );
        if (item.item_type !== "found" || !lostResult.rows[0]) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "Select an unresolved lost report for this review.",
          });
        }
        await client.query(
          "UPDATE items SET status = 'under_review', review_lost_id = $1 WHERE item_id = $2 AND matched_lost_id IS NULL",
          [lostId, item.item_id],
        );
        await client.query(
          "UPDATE items SET status = 'under_review' WHERE item_id = $1",
          [lostId],
        );
      } else if (status === "under_review") {
        const result = await client.query(
          "UPDATE items SET status = 'under_review' WHERE item_id = $1 AND status = 'reported' AND matched_lost_id IS NULL AND matched_found_id IS NULL RETURNING item_id",
          [item.item_id],
        );
        if (!result.rows[0]) {
          await client.query("ROLLBACK");
          return res
            .status(409)
            .json({ error: "This report cannot be moved to Under review." });
        }
      } else if (item.item_type === "found" && item.review_lost_id) {
        await client.query(
          "UPDATE items SET status = 'reported', review_lost_id = NULL WHERE item_id = $1 AND matched_lost_id IS NULL",
          [item.item_id],
        );
        await client.query(
          "UPDATE items SET status = 'reported' WHERE item_id = $1 AND matched_found_id IS NULL",
          [item.review_lost_id],
        );
      } else {
        const result = await client.query(
          "UPDATE items SET status = 'reported' WHERE item_id = $1 AND item_type = 'lost' AND matched_found_id IS NULL RETURNING item_id",
          [item.item_id],
        );
        if (!result.rows[0]) {
          await client.query("ROLLBACK");
          return res
            .status(409)
            .json({ error: "This report cannot be returned to Lost." });
        }
      }
      await client.query("COMMIT");
      res.json({ ok: true, status });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.post(
  "/api/claims/:claimId/decision",
  requireAuth,
  requireDatabase,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const { decision, reason = "" } = req.body;
    if (!["approved", "rejected"].includes(decision))
      return res
        .status(400)
        .json({ error: "Decision must be approved or rejected." });
    const result = await pool.query(
      "UPDATE claims SET status = $1, reviewed_by = $2, reviewed_at = now(), rejection_reason = $3 WHERE claim_id = $4 AND status = 'pending' RETURNING claim_id",
      [
        decision,
        req.user.id,
        decision === "rejected" ? reason : null,
        req.params.claimId,
      ],
    );
    if (!result.rows[0])
      return res
        .status(409)
        .json({ error: "Only pending claims can be decided." });
    res.json({ ok: true });
  }),
);

app.post(
  "/api/claims/:claimId/collect",
  requireAuth,
  requireDatabase,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      "UPDATE claims SET status = 'claimed' WHERE claim_id = $1 AND status = 'approved' RETURNING item_id",
      [req.params.claimId],
    );
    if (!result.rows[0])
      return res
        .status(409)
        .json({ error: "Only approved claims can be collected." });
    await pool.query(
      "UPDATE claims SET collection_date = now(), collected_by = $1 WHERE claim_id = $2",
      [req.user.id, req.params.claimId],
    );
    await pool.query(
      "UPDATE items SET status = 'completed', collection_date = now(), collected_by = $1 WHERE item_id = $2 OR matched_lost_id = $2 OR matched_found_id = $2",
      [req.user.id, result.rows[0].item_id],
    );
    res.json({ ok: true });
  }),
);

app.post(
  "/api/admin/accounts",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const { name, email, password, role } = req.body;
    if (!name || !email || !password || role !== "staff")
      return res.status(400).json({
        error: "Administrators can create Verifier / CSA accounts only.",
      });
    try {
      const result = await pool.query(
        "INSERT INTO users (name, email, password_hash, role) VALUES ($1, $2, $3, $4) RETURNING user_id, name, email, password_hash, role",
        [name, email.toLowerCase(), hashPassword(password), role],
      );
      res.status(201).json({ user: safeUser(result.rows[0]) });
    } catch (error) {
      if (error.code === "23505")
        return res
          .status(409)
          .json({ error: "That email already has an account." });
      throw error;
    }
  }),
);

app.get(
  "/api/admin/users",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      "SELECT user_id AS id, name, email, role, created_at AS \"createdAt\" FROM users WHERE role IN ('staff', 'admin') ORDER BY created_at DESC",
    );
    res.json(result.rows);
  }),
);

app.delete(
  "/api/admin/users/:userId",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    if (Number(req.params.userId) === req.user.id)
      return res
        .status(400)
        .json({ error: "You cannot remove your own administrator account." });
    try {
      const result = await pool.query(
        "DELETE FROM users WHERE user_id = $1 AND role = 'staff' RETURNING user_id",
        [req.params.userId],
      );
      if (!result.rows[0])
        return res.status(404).json({ error: "Verifier account not found." });
      res.status(204).end();
    } catch (error) {
      if (error.code === "23503")
        return res.status(409).json({
          error: "This verifier has related records and cannot be removed.",
        });
      throw error;
    }
  }),
);

app.get(
  "/api/admin/items",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT ${publicItemFields}, i.reporter_name AS "privateReporterName", i.contact_phone AS "contactPhone", i.is_anonymous AS "isAnonymous", i.hide_phone AS "hidePhone" FROM items i ${itemLocationJoins} ORDER BY i.created_at DESC LIMIT 100`,
    );
    res.json(result.rows);
  }),
);

app.delete(
  "/api/admin/items/:itemId",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const caseResult = await client.query(
        "SELECT item_id, matched_lost_id, matched_found_id FROM items WHERE item_id = $1 FOR UPDATE",
        [req.params.itemId],
      );
      if (!caseResult.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Report not found." });
      }
      const caseIds = [
        ...new Set(
          [
            caseResult.rows[0].item_id,
            caseResult.rows[0].matched_lost_id,
            caseResult.rows[0].matched_found_id,
          ].filter(Boolean),
        ),
      ];
      await client.query("DELETE FROM claims WHERE item_id = ANY($1)", [
        caseIds,
      ]);
      await client.query("DELETE FROM items WHERE item_id = ANY($1)", [
        caseIds,
      ]);
      await client.query("COMMIT");
      res.status(204).end();
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.use((error, req, res, next) => {
  console.error(error);
  res
    .status(500)
    .json({ error: "The server could not complete that request." });
});
app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "../../client/index.html")),
);
app.listen(port, () =>
  console.log(`Campus Lost & Found running at http://localhost:${port}`),
);
