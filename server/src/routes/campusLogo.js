// ==============================================================================
// Campus Logo & Branding Routes
// Public endpoint to retrieve current logo, and protected admin endpoint to update.
// ==============================================================================

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logUpdate, logFailure, setAuditContext } from "../services/audit.js";
import { validateAndSaveImage } from "../services/image.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = process.env.VERCEL
  ? path.join("/tmp", "uploads", "logo")
  : path.resolve(__dirname, "../../../uploads/logo");

export function createCampusLogoRouter({
  pool,
  asyncRoute,
  requireDatabase,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  // Public: Get current active campus logo
  router.get(
    "/logo",
    requireDatabase,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT logo_id AS id, logo_name AS name, image_path AS "imageUrl",
                file_size AS "fileSize", mime_type AS "mimeType",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM campus_logo
         ORDER BY logo_id ASC
         LIMIT 1`,
      );

      const row = result.rows[0];
      const logoData = row
        ? {
            id: row.id,
            logo_id: row.id,
            name: row.name,
            imageUrl: row.imageUrl,
            image_url: row.imageUrl,
            fileSize: row.fileSize,
            mimeType: row.mimeType,
            updatedAt: row.updatedAt,
          }
        : {
            id: 1,
            logo_id: 1,
            name: "Campus Main Logo",
            imageUrl: "/assets/img/campus-logo.svg",
            image_url: "/assets/img/campus-logo.svg",
          };

      res.json({ logo: logoData, ...logoData });
    }),
  );

  // Admin: Update campus logo
  router.put(
    "/admin/logo",
    requireDatabase,
    requireAuth,
    requireRole("admin"),
    asyncRoute(async (req, res) => {
      const image = (req.body.image || req.body.image_url || "").trim();
      const name = (req.body.name || "").trim();

      if (!image || !name) {
        await logFailure(pool, {
          actor: req.user,
          action: "UPDATE",
          entityType: "campus_logo",
          entityId: "1",
          description: "Admin failed to update campus logo: Valid name and image are required",
          error: new Error("Valid name and image are required"),
          req,
        });
        return res.status(400).json({ error: "A valid logo name and image reference are required." });
      }

      const cleanName = name;

      let savedFile = null;
      let imagePath = image;
      let fileSize = null;
      let mimeType = null;

      // If data URL, validate and store file
      if (image.startsWith("data:")) {
        try {
          savedFile = validateAndSaveImage(image, uploadsDir, "campus-logo");
          imagePath = savedFile.relativePath;
          fileSize = savedFile.fileSize;
          mimeType = savedFile.mimeType;
        } catch (validationErr) {
          // Log failed attempt as per requirement Section 8
          await logFailure(pool, {
            actor: req.user,
            action: "UPDATE",
            entityType: "campus_logo",
            entityId: "1",
            description: `Admin failed to update campus logo: ${validationErr.message}`,
            error: validationErr,
            req,
          });
          return res.status(400).json({ error: validationErr.message });
        }
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");
        await setAuditContext(client, req.user, req);

        const prevRes = await client.query(
          "SELECT * FROM campus_logo WHERE logo_id = 1 FOR UPDATE",
        );
        const prev = prevRes.rows[0] || {
          logo_id: 1,
          logo_name: "Campus Main Logo",
          image_path: "/assets/img/campus-logo.svg",
        };

        const updateRes = await client.query(
          `INSERT INTO campus_logo (logo_id, logo_name, image_path, file_size, mime_type, updated_by, updated_at)
           VALUES (1, $1, $2, $3, $4, $5, now())
           ON CONFLICT (logo_id) DO UPDATE SET
             logo_name = EXCLUDED.logo_name,
             image_path = EXCLUDED.image_path,
             file_size = EXCLUDED.file_size,
             mime_type = EXCLUDED.mime_type,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
           RETURNING logo_id AS id, logo_name AS name, image_path AS "imageUrl",
                     file_size AS "fileSize", mime_type AS "mimeType", updated_at AS "updatedAt"`,
          [cleanName, imagePath, fileSize, mimeType, req.user.id],
        );
        const updatedLogo = updateRes.rows[0];

        // Audit the logo change transactionally
        await logUpdate(client, {
          actor: req.user,
          entityType: "campus_logo",
          entityId: updatedLogo.id,
          description: "Admin changed the campus logo",
          oldValues: {
            logoId: prev.logo_id,
            name: prev.logo_name,
            imagePath: prev.image_path,
          },
          newValues: {
            logoId: updatedLogo.id,
            name: updatedLogo.name,
            imagePath: updatedLogo.imageUrl,
          },
          req,
        });

        await client.query("COMMIT");
        const formattedRes = {
          id: updatedLogo.id,
          logo_id: updatedLogo.id,
          name: updatedLogo.name,
          imageUrl: updatedLogo.imageUrl,
          image_url: updatedLogo.imageUrl,
          updatedAt: updatedLogo.updatedAt,
        };
        res.json({ logo: formattedRes, ...formattedRes });
      } catch (err) {
        await client.query("ROLLBACK");

        // Clean up uploaded file if database update failed
        if (savedFile) {
          try {
            const fullPath = path.join(uploadsDir, savedFile.filename);
            if (fs.existsSync(fullPath)) fs.unlinkSync(fullPath);
          } catch (_) {}
        }

        // Log failed attempt
        await logFailure(pool, {
          actor: req.user,
          action: "UPDATE",
          entityType: "campus_logo",
          entityId: "1",
          description: `Database transaction error updating campus logo: ${err.message}`,
          error: err,
          req,
        });

        throw err;
      } finally {
        client.release();
      }
    }),
  );

  return router;
}
