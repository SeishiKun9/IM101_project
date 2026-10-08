import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logAdminAudit } from "../services/audit.js";
import { validateAndSaveImage } from "../services/image.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../../../uploads/maps");

export function createAdminMapsRouter({
  pool,
  asyncRoute,
  requireDatabase,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.use(requireDatabase);
  router.use(requireAuth);
  router.use(requireRole("admin"));

  // List all campus maps including inactive and archived versions
  router.get(
    ["/", "/api/admin/maps"],
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT m.map_id AS id, m.name, m.description, m.image_path AS "imageUrl",
                m.version_number AS version, m.file_size AS "fileSize",
                m.mime_type AS "mimeType", m.is_active AS "isActive",
                m.is_archived AS "isArchived",
                CASE
                  WHEN m.is_active THEN 'active'
                  WHEN m.is_archived THEN 'archived'
                  ELSE 'inactive'
                END AS status,
                m.created_at AS "uploadedAt",
                m.created_at AS "createdAt",
                u.name AS "uploadedByName",
                COUNT(i.item_id)::int AS "reportsCount"
         FROM campus_maps m
         LEFT JOIN users u ON u.user_id = m.uploaded_by
         LEFT JOIN items i ON i.map_id = m.map_id
         GROUP BY m.map_id, u.name
         ORDER BY m.version_number DESC`,
      );
      res.json(result.rows);
    }),
  );

  // Upload new map or replacement map version
  router.post(
    ["/", "/upload", "/api/admin/maps", "/api/admin/maps/upload"],
    asyncRoute(async (req, res) => {
      const {
        name,
        description,
        image,
        activateImmediately = true,
      } = req.body;

      const cleanName = (name || "").trim();
      if (!cleanName) {
        return res.status(400).json({ error: "Map name is required." });
      }

      let savedFile;
      try {
        savedFile = validateAndSaveImage(image, uploadsDir, "campus-map");
      } catch (validationErr) {
        return res.status(400).json({ error: validationErr.message });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const verRes = await client.query(
          "SELECT COALESCE(MAX(version_number), 0) + 1 AS \"nextVersion\" FROM campus_maps",
        );
        const nextVersion = verRes.rows[0].nextVersion;

        const shouldActivate = Boolean(activateImmediately);
        if (shouldActivate) {
          // Deactivate all previous maps atomically in the transaction
          await client.query("UPDATE campus_maps SET is_active = false");
        }

        const insertRes = await client.query(
          `INSERT INTO campus_maps (name, description, image_path, version_number, file_size, mime_type, is_active, is_archived, uploaded_by)
           VALUES ($1, $2, $3, $4, $5, $6, $7, false, $8)
           RETURNING map_id AS id, name, description, image_path AS "imageUrl",
                     version_number AS version, file_size AS "fileSize",
                     mime_type AS "mimeType", is_active AS "isActive",
                     is_archived AS "isArchived", created_at AS "uploadedAt"`,
          [
            cleanName,
            description ? description.trim() : null,
            savedFile.relativePath,
            nextVersion,
            savedFile.fileSize,
            savedFile.mimeType,
            shouldActivate,
            req.user.id,
          ],
        );
        const newMap = insertRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "CREATE",
          "campus_maps",
          newMap.id,
          null,
          newMap,
        );

        await client.query("COMMIT");
        res.status(201).json(newMap);
      } catch (err) {
        await client.query("ROLLBACK");
        // Clean up uploaded file if database insert failed
        try {
          const fullPath = path.join(uploadsDir, savedFile.filename);
          if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
        } catch (_) {}
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // Update map version metadata (name, description, optionally replacement image)
  router.put(
    ["/:id", "/api/admin/maps/:id"],
    asyncRoute(async (req, res) => {
      const mapId = req.params.id;
      const { name, description, image } = req.body;

      const cleanName = (name || "").trim();
      if (!cleanName) {
        return res.status(400).json({ error: "Map name is required." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const targetRes = await client.query(
          "SELECT * FROM campus_maps WHERE map_id = $1",
          [mapId],
        );
        if (!targetRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Campus map not found." });
        }
        const oldRow = targetRes.rows[0];

        let imagePath = oldRow.image_path;
        let fileSize = oldRow.file_size;
        let mimeType = oldRow.mime_type;

        if (image && typeof image === "string" && image.startsWith("data:")) {
          const savedFile = validateAndSaveImage(image, uploadsDir, "campus-map");
          imagePath = savedFile.relativePath;
          fileSize = savedFile.fileSize;
          mimeType = savedFile.mimeType;
        }

        const updateRes = await client.query(
          `UPDATE campus_maps
           SET name = $1, description = $2, image_path = $3, file_size = $4, mime_type = $5, updated_at = now()
           WHERE map_id = $6
           RETURNING map_id AS id, name, description, image_path AS "imageUrl",
                     version_number AS version, file_size AS "fileSize",
                     mime_type AS "mimeType", is_active AS "isActive",
                     is_archived AS "isArchived", created_at AS "createdAt", updated_at AS "updatedAt"`,
          [
            cleanName,
            description ? description.trim() : null,
            imagePath,
            fileSize,
            mimeType,
            mapId,
          ],
        );
        const updatedMap = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "UPDATE",
          "campus_maps",
          mapId,
          oldRow,
          updatedMap,
        );

        await client.query("COMMIT");
        res.json(updatedMap);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // Activate a map version (transactionally sets all others to inactive)
  router.post(
    ["/:id/activate", "/api/admin/maps/:id/activate"],
    asyncRoute(async (req, res) => {
      const mapId = req.params.id;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const targetRes = await client.query(
          "SELECT * FROM campus_maps WHERE map_id = $1",
          [mapId],
        );
        if (!targetRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Campus map not found." });
        }
        const oldRow = targetRes.rows[0];

        // Deactivate all other maps
        await client.query("UPDATE campus_maps SET is_active = false");

        // Activate the selected map
        const updateRes = await client.query(
          `UPDATE campus_maps
           SET is_active = true, is_archived = false, updated_at = now()
           WHERE map_id = $1
           RETURNING map_id AS id, name, version_number AS version, is_active AS "isActive", is_archived AS "isArchived"`,
          [mapId],
        );
        const updatedMap = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "ACTIVATE",
          "campus_maps",
          mapId,
          oldRow,
          updatedMap,
        );

        await client.query("COMMIT");
        res.json(updatedMap);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // Archive / deactivate a map version
  router.post(
    ["/:id/archive", "/api/admin/maps/:id/archive"],
    asyncRoute(async (req, res) => {
      const mapId = req.params.id;
      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const targetRes = await client.query(
          "SELECT * FROM campus_maps WHERE map_id = $1",
          [mapId],
        );
        if (!targetRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "Campus map not found." });
        }
        const oldRow = targetRes.rows[0];

        const updateRes = await client.query(
          `UPDATE campus_maps
           SET is_archived = true, is_active = false, updated_at = now()
           WHERE map_id = $1
           RETURNING map_id AS id, name, version_number AS version, is_active AS "isActive", is_archived AS "isArchived"`,
          [mapId],
        );
        const updatedMap = updateRes.rows[0];

        await logAdminAudit(
          client,
          req.user.id,
          "ARCHIVE",
          "campus_maps",
          mapId,
          oldRow,
          updatedMap,
        );

        await client.query("COMMIT");
        res.json(updatedMap);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // Permanently delete map version (only if safe: not active and 0 reports reference it)
  router.delete(
    ["/:id", "/api/admin/maps/:id"],
    asyncRoute(async (req, res) => {
      const mapId = req.params.id;

      const targetRes = await pool.query(
        "SELECT * FROM campus_maps WHERE map_id = $1",
        [mapId],
      );
      if (!targetRes.rows.length) {
        return res.status(404).json({ error: "Campus map not found." });
      }
      const targetMap = targetRes.rows[0];

      if (targetMap.is_active) {
        return res.status(400).json({
          error:
            "Cannot permanently delete the currently active campus map. Please activate another map first or deactivate it.",
        });
      }

      const reportsRes = await pool.query(
        "SELECT COUNT(*)::int AS count FROM items WHERE map_id = $1",
        [mapId],
      );
      const reportsCount = reportsRes.rows[0].count;
      if (reportsCount > 0) {
        return res.status(400).json({
          error: `Cannot permanently delete this map version because it is referenced by ${reportsCount} existing report(s) with map pins. Please archive it instead to preserve pin alignment on historical reports.`,
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        await client.query("DELETE FROM campus_maps WHERE map_id = $1", [
          mapId,
        ]);

        await logAdminAudit(
          client,
          req.user.id,
          "DELETE",
          "campus_maps",
          mapId,
          targetMap,
          null,
        );

        await client.query("COMMIT");

        // Clean up file if custom upload in /uploads/maps
        try {
          if (
            targetMap.image_path &&
            targetMap.image_path.startsWith("/uploads/maps/")
          ) {
            const filename = path.basename(targetMap.image_path);
            const fullPath = path.join(uploadsDir, filename);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          }
        } catch (_) {}

        res.json({ message: "Map version permanently deleted.", id: mapId });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  return router;
}
