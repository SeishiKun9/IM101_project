import express from "express";

export function createMapsRouter({ pool, asyncRoute, requireDatabase }) {
  const router = express.Router();

  // Public / Authenticated: Get currently active campus map
  router.get(
    ["/active", "/api/maps/active"],
    requireDatabase,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT map_id AS id, name, description, image_path AS "imageUrl",
                version_number AS version, file_size AS "fileSize",
                mime_type AS "mimeType", created_at AS "uploadedAt"
         FROM campus_maps
         WHERE is_active = true AND is_archived = false
         LIMIT 1`,
      );

      if (!result.rows.length) {
        return res.json(null);
      }

      res.json(result.rows[0]);
    }),
  );

  // Public / Authenticated: Get a specific map version (for historical report inspection)
  router.get(
    ["/:id", "/api/maps/:id"],
    requireDatabase,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT map_id AS id, name, description, image_path AS "imageUrl",
                version_number AS version, file_size AS "fileSize",
                mime_type AS "mimeType", is_active AS "isActive",
                is_archived AS "isArchived", created_at AS "uploadedAt"
         FROM campus_maps
         WHERE map_id = $1`,
        [req.params.id],
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "Campus map not found." });
      }

      res.json(result.rows[0]);
    }),
  );

  return router;
}
