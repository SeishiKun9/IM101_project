import express from "express";
import { logAdminAudit } from "../services/audit.js";

export function createAdminLocationsRouter({
  pool,
  asyncRoute,
  requireDatabase,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  function paths(base) {
    return [
      base,
      `/locations${base}`,
      `/api/admin${base}`,
      `/api/admin/locations${base}`,
    ];
  }

  // Apply admin protection to all routes in this router
  router.use(requireDatabase);
  router.use(requireAuth);
  router.use(requireRole("admin"));

  // ==================== BUILDINGS ====================

  router.get(
    paths("/buildings"),
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT b.building_id AS id, b.name, b.description, b.display_order AS "displayOrder",
                b.is_active AS "isActive", b.is_archived AS "isArchived",
                b.created_at AS "createdAt", b.updated_at AS "updatedAt",
                COUNT(DISTINCT f.floor_id)::int AS "floorsCount",
                COUNT(DISTINCT r.room_id)::int AS "roomsCount",
                COUNT(DISTINCT i.item_id)::int AS "reportsCount"
         FROM buildings b
         LEFT JOIN floors f ON f.building_id = b.building_id AND f.is_archived = false
         LEFT JOIN rooms r ON r.floor_id = f.floor_id AND r.is_archived = false
         LEFT JOIN items i ON i.building_id = b.building_id
         GROUP BY b.building_id
         ORDER BY b.is_archived ASC, b.display_order ASC, b.name ASC`,
      );
      res.json(result.rows);
    }),
  );

  router.get(
    paths("/buildings/:id/impact"),
    asyncRoute(async (req, res) => {
      const buildingRes = await pool.query(
        "SELECT building_id AS id, name FROM buildings WHERE building_id = $1",
        [req.params.id],
      );
      if (!buildingRes.rows.length) {
        return res.status(404).json({ error: "Building not found." });
      }
      const countsRes = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM floors WHERE building_id = $1 AND is_archived = false) AS "activeFloors",
           (SELECT COUNT(*)::int FROM floors WHERE building_id = $1) AS "totalFloors",
           (SELECT COUNT(*)::int FROM rooms r JOIN floors f ON f.floor_id = r.floor_id WHERE f.building_id = $1 AND r.is_archived = false) AS "activeRooms",
           (SELECT COUNT(*)::int FROM rooms r JOIN floors f ON f.floor_id = r.floor_id WHERE f.building_id = $1) AS "totalRooms",
           (SELECT COUNT(*)::int FROM items WHERE building_id = $1) AS "reportsCount"`,
        [req.params.id],
      );
      const counts = countsRes.rows[0];
      res.json({
        building: buildingRes.rows[0],
        ...counts,
        floorsCount: Number(counts.totalFloors),
        roomsCount: Number(counts.totalRooms),
        reportsCount: Number(counts.reportsCount),
        canDelete: Number(counts.totalFloors) === 0 && Number(counts.reportsCount) === 0,
      });
    }),
  );

  router.post(
    paths("/buildings"),
    asyncRoute(async (req, res) => {
      const { name, description, displayOrder = 0, isActive = true } = req.body;
      const cleanName = (name || "").trim();
      if (!cleanName) {
        return res.status(400).json({ error: "Building name is required." });
      }

      const dupCheck = await pool.query(
        "SELECT building_id FROM buildings WHERE LOWER(TRIM(name)) = LOWER(TRIM($1))",
        [cleanName],
      );
      if (dupCheck.rows.length) {
        return res
          .status(409)
          .json({ error: `A building named "${cleanName}" already exists.` });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const insertRes = await client.query(
          `INSERT INTO buildings (name, description, display_order, is_active, is_archived)
           VALUES ($1, $2, $3, $4, false)
           RETURNING building_id AS id, name, description, display_order AS "displayOrder",
                     is_active AS "isActive", is_archived AS "isArchived",
                     created_at AS "createdAt", updated_at AS "updatedAt"`,
          [cleanName, description ? description.trim() : null, Number(displayOrder) || 0, Boolean(isActive)],
        );
        const newBuilding = insertRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "CREATE",
          "buildings",
          newBuilding.id,
          null,
          newBuilding,
        );

        await client.query("COMMIT");
        res.status(201).json(newBuilding);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.put(
    paths("/buildings/:id"),
    asyncRoute(async (req, res) => {
      const buildingId = req.params.id;
      const { name, description, displayOrder = 0, isActive = true } = req.body;
      const cleanName = (name || "").trim();
      if (!cleanName) {
        return res.status(400).json({ error: "Building name is required." });
      }

      const dupCheck = await pool.query(
        "SELECT building_id FROM buildings WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND building_id != $2",
        [cleanName, buildingId],
      );
      if (dupCheck.rows.length) {
        return res
          .status(409)
          .json({ error: `Another building named "${cleanName}" already exists.` });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          "SELECT * FROM buildings WHERE building_id = $1",
          [buildingId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Building not found." });
        }
        const oldRow = oldRes.rows[0];

        const updateRes = await client.query(
          `UPDATE buildings
           SET name = $1, description = $2, display_order = $3, is_active = $4, updated_at = now()
           WHERE building_id = $5
           RETURNING building_id AS id, name, description, display_order AS "displayOrder",
                     is_active AS "isActive", is_archived AS "isArchived",
                     created_at AS "createdAt", updated_at AS "updatedAt"`,
          [
            cleanName,
            description !== undefined ? (description ? description.trim() : null) : oldRow.description,
            Number(displayOrder) || 0,
            Boolean(isActive),
            buildingId,
          ],
        );
        const updatedBuilding = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "UPDATE",
          "buildings",
          buildingId,
          oldRow,
          updatedBuilding,
        );

        await client.query("COMMIT");
        res.json(updatedBuilding);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.post(
    paths("/buildings/:id/archive"),
    asyncRoute(async (req, res) => {
      const buildingId = req.params.id;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          "SELECT * FROM buildings WHERE building_id = $1",
          [buildingId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Building not found." });
        }
        const oldRow = oldRes.rows[0];

        const updateRes = await client.query(
          `UPDATE buildings
           SET is_archived = true, is_active = false, updated_at = now()
           WHERE building_id = $1
           RETURNING building_id AS id, name, is_active AS "isActive", is_archived AS "isArchived"`,
          [buildingId],
        );
        const archivedBuilding = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "ARCHIVE",
          "buildings",
          buildingId,
          oldRow,
          archivedBuilding,
        );

        await client.query("COMMIT");
        res.json(archivedBuilding);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.post(
    paths("/buildings/:id/restore"),
    asyncRoute(async (req, res) => {
      const buildingId = req.params.id;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          "SELECT * FROM buildings WHERE building_id = $1",
          [buildingId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Building not found." });
        }
        const oldRow = oldRes.rows[0];

        const updateRes = await client.query(
          `UPDATE buildings
           SET is_archived = false, is_active = true, updated_at = now()
           WHERE building_id = $1
           RETURNING building_id AS id, name, is_active AS "isActive", is_archived AS "isArchived"`,
          [buildingId],
        );
        const restoredBuilding = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "RESTORE",
          "buildings",
          buildingId,
          oldRow,
          restoredBuilding,
        );

        await client.query("COMMIT");
        res.json(restoredBuilding);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.delete(
    paths("/buildings/:id"),
    asyncRoute(async (req, res) => {
      const buildingId = req.params.id;

      // Check dependent floors
      const floorsRes = await pool.query(
        "SELECT COUNT(*)::int AS count FROM floors WHERE building_id = $1",
        [buildingId],
      );
      const floorsCount = floorsRes.rows[0].count;
      if (floorsCount > 0) {
        return res.status(400).json({
          error: `Cannot permanently delete building because it contains ${floorsCount} floor(s). Delete the floors first, or archive this building instead.`,
        });
      }

      // Check referenced reports
      const reportsRes = await pool.query(
        "SELECT COUNT(*)::int AS count FROM items WHERE building_id = $1",
        [buildingId],
      );
      const reportsCount = reportsRes.rows[0].count;
      if (reportsCount > 0) {
        return res.status(400).json({
          error: `Cannot permanently delete building because ${reportsCount} report(s) reference it. Please archive this building to preserve report history.`,
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          "SELECT * FROM buildings WHERE building_id = $1",
          [buildingId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Building not found." });
        }
        const oldRow = oldRes.rows[0];

        await client.query("DELETE FROM buildings WHERE building_id = $1", [
          buildingId,
        ]);

        await logAdminAudit(
          client,
          req.user.id,
          "DELETE",
          "buildings",
          buildingId,
          oldRow,
          null,
        );

        await client.query("COMMIT");
        res.json({ message: "Building permanently deleted.", id: buildingId });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // ==================== FLOORS ====================

  router.get(
    paths("/floors"),
    asyncRoute(async (req, res) => {
      const values = [];
      let whereClause = "";
      if (req.query.buildingId) {
        values.push(req.query.buildingId);
        whereClause = `WHERE f.building_id = $${values.length}`;
      }

      const result = await pool.query(
        `SELECT f.floor_id AS id, f.building_id AS "buildingId", f.name,
                f.display_order AS "displayOrder", f.is_active AS "isActive",
                f.is_archived AS "isArchived", f.created_at AS "createdAt",
                f.updated_at AS "updatedAt", b.name AS "buildingName",
                b.is_archived AS "buildingArchived",
                COUNT(DISTINCT r.room_id)::int AS "roomsCount",
                COUNT(DISTINCT i.item_id)::int AS "reportsCount"
         FROM floors f
         JOIN buildings b ON b.building_id = f.building_id
         LEFT JOIN rooms r ON r.floor_id = f.floor_id AND r.is_archived = false
         LEFT JOIN items i ON i.floor_id = f.floor_id
         ${whereClause}
         GROUP BY f.floor_id, b.name, b.is_archived
         ORDER BY f.is_archived ASC, f.display_order ASC, f.name ASC`,
        values,
      );
      res.json(result.rows);
    }),
  );

  router.get(
    paths("/floors/:id/impact"),
    asyncRoute(async (req, res) => {
      const floorRes = await pool.query(
        `SELECT f.floor_id AS id, f.name, b.name AS "buildingName"
         FROM floors f JOIN buildings b ON b.building_id = f.building_id
         WHERE f.floor_id = $1`,
        [req.params.id],
      );
      if (!floorRes.rows.length) {
        return res.status(404).json({ error: "Floor not found." });
      }
      const countsRes = await pool.query(
        `SELECT
           (SELECT COUNT(*)::int FROM rooms WHERE floor_id = $1 AND is_archived = false) AS "activeRooms",
           (SELECT COUNT(*)::int FROM rooms WHERE floor_id = $1) AS "totalRooms",
           (SELECT COUNT(*)::int FROM items WHERE floor_id = $1) AS "reportsCount"`,
        [req.params.id],
      );
      const counts = countsRes.rows[0];
      res.json({
        floor: floorRes.rows[0],
        ...counts,
        roomsCount: Number(counts.totalRooms),
        reportsCount: Number(counts.reportsCount),
        canDelete: Number(counts.totalRooms) === 0 && Number(counts.reportsCount) === 0,
      });
    }),
  );

  router.post(
    paths("/floors"),
    asyncRoute(async (req, res) => {
      const { buildingId, name, displayOrder = 0, isActive = true } = req.body;
      const cleanName = (name || "").trim();
      if (!buildingId) {
        return res.status(400).json({ error: "Building is required." });
      }
      if (!cleanName) {
        return res.status(400).json({ error: "Floor name is required." });
      }

      // Check building exists and not archived
      const bRes = await pool.query(
        "SELECT building_id, name, is_archived FROM buildings WHERE building_id = $1",
        [buildingId],
      );
      if (!bRes.rows.length) {
        return res.status(404).json({ error: "Building not found." });
      }
      if (bRes.rows[0].is_archived) {
        return res.status(400).json({
          error: "Cannot add floors to an archived building. Restore it first.",
        });
      }

      const dupCheck = await pool.query(
        "SELECT floor_id FROM floors WHERE building_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))",
        [buildingId, cleanName],
      );
      if (dupCheck.rows.length) {
        return res.status(409).json({
          error: `A floor named "${cleanName}" already exists in ${bRes.rows[0].name}.`,
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const insertRes = await client.query(
          `INSERT INTO floors (building_id, name, display_order, is_active, is_archived)
           VALUES ($1, $2, $3, $4, false)
           RETURNING floor_id AS id, building_id AS "buildingId", name, display_order AS "displayOrder",
                     is_active AS "isActive", is_archived AS "isArchived",
                     created_at AS "createdAt", updated_at AS "updatedAt"`,
          [buildingId, cleanName, Number(displayOrder) || 0, Boolean(isActive)],
        );
        const newFloor = insertRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "CREATE",
          "floors",
          newFloor.id,
          null,
          newFloor,
        );

        await client.query("COMMIT");
        res.status(201).json(newFloor);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.put(
    paths("/floors/:id"),
    asyncRoute(async (req, res) => {
      const floorId = req.params.id;
      const { name, displayOrder = 0, isActive = true } = req.body;
      const cleanName = (name || "").trim();
      if (!cleanName) {
        return res.status(400).json({ error: "Floor name is required." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          "SELECT * FROM floors WHERE floor_id = $1",
          [floorId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Floor not found." });
        }
        const oldRow = oldRes.rows[0];

        const dupCheck = await client.query(
          "SELECT floor_id FROM floors WHERE building_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND floor_id != $3",
          [oldRow.building_id, cleanName, floorId],
        );
        if (dupCheck.rows.length) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: `Another floor named "${cleanName}" already exists in this building.`,
          });
        }

        const updateRes = await client.query(
          `UPDATE floors
           SET name = $1, display_order = $2, is_active = $3, updated_at = now()
           WHERE floor_id = $4
           RETURNING floor_id AS id, building_id AS "buildingId", name, display_order AS "displayOrder",
                     is_active AS "isActive", is_archived AS "isArchived",
                     created_at AS "createdAt", updated_at AS "updatedAt"`,
          [cleanName, Number(displayOrder) || 0, Boolean(isActive), floorId],
        );
        const updatedFloor = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "UPDATE",
          "floors",
          floorId,
          oldRow,
          updatedFloor,
        );

        await client.query("COMMIT");
        res.json(updatedFloor);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.post(
    paths("/floors/:id/archive"),
    asyncRoute(async (req, res) => {
      const floorId = req.params.id;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          "SELECT * FROM floors WHERE floor_id = $1",
          [floorId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Floor not found." });
        }
        const oldRow = oldRes.rows[0];

        const updateRes = await client.query(
          `UPDATE floors
           SET is_archived = true, is_active = false, updated_at = now()
           WHERE floor_id = $1
           RETURNING floor_id AS id, name, is_active AS "isActive", is_archived AS "isArchived"`,
          [floorId],
        );
        const archivedFloor = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "ARCHIVE",
          "floors",
          floorId,
          oldRow,
          archivedFloor,
        );

        await client.query("COMMIT");
        res.json(archivedFloor);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.post(
    paths("/floors/:id/restore"),
    asyncRoute(async (req, res) => {
      const floorId = req.params.id;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          `SELECT f.*, b.is_archived AS "buildingArchived", b.name AS "buildingName"
           FROM floors f JOIN buildings b ON b.building_id = f.building_id
           WHERE f.floor_id = $1`,
          [floorId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Floor not found." });
        }
        const oldRow = oldRes.rows[0];
        if (oldRow.buildingArchived) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `Cannot restore floor because its parent building "${oldRow.buildingName}" is archived. Please restore the building first.`,
          });
        }

        const updateRes = await client.query(
          `UPDATE floors
           SET is_archived = false, is_active = true, updated_at = now()
           WHERE floor_id = $1
           RETURNING floor_id AS id, name, is_active AS "isActive", is_archived AS "isArchived"`,
          [floorId],
        );
        const restoredFloor = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "RESTORE",
          "floors",
          floorId,
          oldRow,
          restoredFloor,
        );

        await client.query("COMMIT");
        res.json(restoredFloor);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.delete(
    paths("/floors/:id"),
    asyncRoute(async (req, res) => {
      const floorId = req.params.id;

      // Check dependent rooms
      const roomsRes = await pool.query(
        "SELECT COUNT(*)::int AS count FROM rooms WHERE floor_id = $1",
        [floorId],
      );
      const roomsCount = roomsRes.rows[0].count;
      if (roomsCount > 0) {
        return res.status(400).json({
          error: `Cannot permanently delete floor because it contains ${roomsCount} room(s). Delete the rooms first, or archive this floor instead.`,
        });
      }

      // Check referenced reports
      const reportsRes = await pool.query(
        "SELECT COUNT(*)::int AS count FROM items WHERE floor_id = $1",
        [floorId],
      );
      const reportsCount = reportsRes.rows[0].count;
      if (reportsCount > 0) {
        return res.status(400).json({
          error: `Cannot permanently delete floor because ${reportsCount} report(s) reference it. Please archive this floor to preserve report history.`,
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          "SELECT * FROM floors WHERE floor_id = $1",
          [floorId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Floor not found." });
        }
        const oldRow = oldRes.rows[0];

        await client.query("DELETE FROM floors WHERE floor_id = $1", [floorId]);

        await logAdminAudit(
          client,
          req.user.id,
          "DELETE",
          "floors",
          floorId,
          oldRow,
          null,
        );

        await client.query("COMMIT");
        res.json({ message: "Floor permanently deleted.", id: floorId });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // ==================== ROOMS ====================

  router.get(
    paths("/rooms"),
    asyncRoute(async (req, res) => {
      const values = [];
      const where = [];

      if (req.query.buildingId) {
        values.push(req.query.buildingId);
        where.push(`f.building_id = $${values.length}`);
      }
      if (req.query.floorId) {
        values.push(req.query.floorId);
        where.push(`r.floor_id = $${values.length}`);
      }

      const whereClause = where.length ? `WHERE ${where.join(" AND ")}` : "";

      const result = await pool.query(
        `SELECT r.room_id AS id, r.floor_id AS "floorId", r.name,
                r.room_code AS "roomCode", r.description,
                r.display_order AS "displayOrder", r.is_active AS "isActive",
                r.is_archived AS "isArchived", r.created_at AS "createdAt",
                r.updated_at AS "updatedAt", f.name AS "floorName",
                f.is_archived AS "floorArchived", b.building_id AS "buildingId",
                b.name AS "buildingName", b.is_archived AS "buildingArchived",
                COUNT(i.item_id)::int AS "reportsCount"
         FROM rooms r
         JOIN floors f ON f.floor_id = r.floor_id
         JOIN buildings b ON b.building_id = f.building_id
         LEFT JOIN items i ON i.room_id = r.room_id
         ${whereClause}
         GROUP BY r.room_id, f.name, f.is_archived, b.building_id, b.name, b.is_archived
         ORDER BY r.is_archived ASC, r.display_order ASC, r.name ASC`,
        values,
      );
      res.json(result.rows);
    }),
  );

  router.get(
    paths("/rooms/:id/impact"),
    asyncRoute(async (req, res) => {
      const roomRes = await pool.query(
        `SELECT r.room_id AS id, r.name, f.name AS "floorName", b.name AS "buildingName"
         FROM rooms r
         JOIN floors f ON f.floor_id = r.floor_id
         JOIN buildings b ON b.building_id = f.building_id
         WHERE r.room_id = $1`,
        [req.params.id],
      );
      if (!roomRes.rows.length) {
        return res.status(404).json({ error: "Room not found." });
      }
      const countsRes = await pool.query(
        "SELECT COUNT(*)::int AS \"reportsCount\" FROM items WHERE room_id = $1",
        [req.params.id],
      );
      const counts = countsRes.rows[0];
      res.json({
        room: roomRes.rows[0],
        ...counts,
        canDelete: Number(counts.reportsCount) === 0,
      });
    }),
  );

  router.post(
    paths("/rooms"),
    asyncRoute(async (req, res) => {
      const {
        floorId,
        name,
        roomCode,
        description,
        displayOrder = 0,
        isActive = true,
      } = req.body;
      const cleanName = (name || "").trim();
      if (!floorId) {
        return res.status(400).json({ error: "Floor is required." });
      }
      if (!cleanName) {
        return res.status(400).json({ error: "Room name is required." });
      }

      const fRes = await pool.query(
        `SELECT f.floor_id, f.name, f.is_archived, b.is_archived AS "buildingArchived"
         FROM floors f JOIN buildings b ON b.building_id = f.building_id
         WHERE f.floor_id = $1`,
        [floorId],
      );
      if (!fRes.rows.length) {
        return res.status(404).json({ error: "Floor not found." });
      }
      if (fRes.rows[0].is_archived || fRes.rows[0].buildingArchived) {
        return res.status(400).json({
          error: "Cannot add rooms to an archived floor or building.",
        });
      }

      const dupCheck = await pool.query(
        "SELECT room_id FROM rooms WHERE floor_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2))",
        [floorId, cleanName],
      );
      if (dupCheck.rows.length) {
        return res.status(409).json({
          error: `A room named "${cleanName}" already exists on ${fRes.rows[0].name}.`,
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const insertRes = await client.query(
          `INSERT INTO rooms (floor_id, name, room_code, description, display_order, is_active, is_archived)
           VALUES ($1, $2, $3, $4, $5, $6, false)
           RETURNING room_id AS id, floor_id AS "floorId", name, room_code AS "roomCode",
                     description, display_order AS "displayOrder",
                     is_active AS "isActive", is_archived AS "isArchived",
                     created_at AS "createdAt", updated_at AS "updatedAt"`,
          [
            floorId,
            cleanName,
            roomCode ? roomCode.trim() : null,
            description ? description.trim() : null,
            Number(displayOrder) || 0,
            Boolean(isActive),
          ],
        );
        const newRoom = insertRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "CREATE",
          "rooms",
          newRoom.id,
          null,
          newRoom,
        );

        await client.query("COMMIT");
        res.status(201).json(newRoom);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.put(
    paths("/rooms/:id"),
    asyncRoute(async (req, res) => {
      const roomId = req.params.id;
      const {
        name,
        roomCode,
        description,
        displayOrder = 0,
        isActive = true,
      } = req.body;
      const cleanName = (name || "").trim();
      if (!cleanName) {
        return res.status(400).json({ error: "Room name is required." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          "SELECT * FROM rooms WHERE room_id = $1",
          [roomId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Room not found." });
        }
        const oldRow = oldRes.rows[0];

        const dupCheck = await client.query(
          "SELECT room_id FROM rooms WHERE floor_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND room_id != $3",
          [oldRow.floor_id, cleanName, roomId],
        );
        if (dupCheck.rows.length) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: `Another room named "${cleanName}" already exists on this floor.`,
          });
        }

        const updateRes = await client.query(
          `UPDATE rooms
           SET name = $1, room_code = $2, description = $3, display_order = $4,
               is_active = $5, updated_at = now()
           WHERE room_id = $6
           RETURNING room_id AS id, floor_id AS "floorId", name, room_code AS "roomCode",
                     description, display_order AS "displayOrder",
                     is_active AS "isActive", is_archived AS "isArchived",
                     created_at AS "createdAt", updated_at AS "updatedAt"`,
          [
            cleanName,
            roomCode !== undefined ? (roomCode ? roomCode.trim() : null) : oldRow.room_code,
            description !== undefined ? (description ? description.trim() : null) : oldRow.description,
            Number(displayOrder) || 0,
            Boolean(isActive),
            roomId,
          ],
        );
        const updatedRoom = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "UPDATE",
          "rooms",
          roomId,
          oldRow,
          updatedRoom,
        );

        await client.query("COMMIT");
        res.json(updatedRoom);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.post(
    paths("/rooms/:id/archive"),
    asyncRoute(async (req, res) => {
      const roomId = req.params.id;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          "SELECT * FROM rooms WHERE room_id = $1",
          [roomId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Room not found." });
        }
        const oldRow = oldRes.rows[0];

        const updateRes = await client.query(
          `UPDATE rooms
           SET is_archived = true, is_active = false, updated_at = now()
           WHERE room_id = $1
           RETURNING room_id AS id, name, is_active AS "isActive", is_archived AS "isArchived"`,
          [roomId],
        );
        const archivedRoom = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "ARCHIVE",
          "rooms",
          roomId,
          oldRow,
          archivedRoom,
        );

        await client.query("COMMIT");
        res.json(archivedRoom);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.post(
    paths("/rooms/:id/restore"),
    asyncRoute(async (req, res) => {
      const roomId = req.params.id;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          `SELECT r.*, f.name AS "floorName", f.is_archived AS "floorArchived",
                  b.is_archived AS "buildingArchived"
           FROM rooms r
           JOIN floors f ON f.floor_id = r.floor_id
           JOIN buildings b ON b.building_id = f.building_id
           WHERE r.room_id = $1`,
          [roomId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Room not found." });
        }
        const oldRow = oldRes.rows[0];
        if (oldRow.floorArchived || oldRow.buildingArchived) {
          await client.query("ROLLBACK");
          return res.status(400).json({
            error: `Cannot restore room because its parent floor or building is archived. Restore them first.`,
          });
        }

        const updateRes = await client.query(
          `UPDATE rooms
           SET is_archived = false, is_active = true, updated_at = now()
           WHERE room_id = $1
           RETURNING room_id AS id, name, is_active AS "isActive", is_archived AS "isArchived"`,
          [roomId],
        );
        const restoredRoom = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "RESTORE",
          "rooms",
          roomId,
          oldRow,
          restoredRoom,
        );

        await client.query("COMMIT");
        res.json(restoredRoom);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  router.delete(
    paths("/rooms/:id"),
    asyncRoute(async (req, res) => {
      const roomId = req.params.id;

      // Check referenced reports
      const reportsRes = await pool.query(
        "SELECT COUNT(*)::int AS count FROM items WHERE room_id = $1",
        [roomId],
      );
      const reportsCount = reportsRes.rows[0].count;
      if (reportsCount > 0) {
        return res.status(400).json({
          error: `Cannot permanently delete room because ${reportsCount} report(s) reference it. Please archive this room to preserve report history.`,
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        const oldRes = await client.query(
          "SELECT * FROM rooms WHERE room_id = $1",
          [roomId],
        );
        if (!oldRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Room not found." });
        }
        const oldRow = oldRes.rows[0];

        await client.query("DELETE FROM rooms WHERE room_id = $1", [roomId]);

        await logAdminAudit(
          client,
          req.user.id,
          "DELETE",
          "rooms",
          roomId,
          oldRow,
          null,
        );

        await client.query("COMMIT");
        res.json({ message: "Room permanently deleted.", id: roomId });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // ==================== AUDIT LOGS ====================

  router.get(
    paths("/audit-logs"),
    asyncRoute(async (req, res) => {
      const { table, limit = 50 } = req.query;
      const values = [];
      let whereClause = "";
      if (table) {
        values.push(table);
        whereClause = `WHERE a.table_name = $${values.length}`;
      }
      values.push(Math.min(200, Math.max(1, Number(limit) || 50)));

      const result = await pool.query(
        `SELECT a.audit_id AS id, a.action, a.table_name AS "tableName",
                a.record_id AS "recordId", a.old_data AS "oldData",
                a.new_data AS "newData", a.action_time AS "actionTime",
                u.name AS "userName", u.email AS "userEmail"
         FROM audit_logs a
         LEFT JOIN users u ON u.user_id = a.user_id
         ${whereClause}
         ORDER BY a.action_time DESC
         LIMIT $${values.length}`,
        values,
      );
      res.json(result.rows);
    }),
  );

  return router;
}
