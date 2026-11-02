// ==============================================================================
// Campus Logo & Branding Routes
// Public endpoint to retrieve current logo, binary image stream, and protected admin endpoint to update.
// Persists logo data inside PostgreSQL so it survives Render container restarts.
// ==============================================================================

import express from "express";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { logUpdate, logFailure, setAuditContext } from "../services/audit.js";
import { validateAndSaveImage } from "../services/image.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.resolve(__dirname, "../../../uploads/logo");

/**
 * Ensure disk directory exists and lazily re-create image file if missing from disk.
 */
function ensureDiskFile(relativePath, dataUrl) {
  try {
    if (!fs.existsSync(uploadsDir)) {
      fs.mkdirSync(uploadsDir, { recursive: true });
    }
    if (relativePath && dataUrl && dataUrl.startsWith("data:")) {
      const filename = path.basename(relativePath);
      const fullPath = path.join(uploadsDir, filename);
      if (!fs.existsSync(fullPath)) {
        const base64Data = dataUrl.split(",")[1];
        if (base64Data) {
          fs.writeFileSync(fullPath, Buffer.from(base64Data, "base64"));
        }
      }
    }
  } catch (err) {
    console.warn("Notice: could not sync logo to disk cache:", err.message);
  }
}

export function createCampusLogoRouter({
  pool,
  asyncRoute,
  requireDatabase,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  // Public: Stream binary campus logo image directly from database
  router.get(
    "/logo/image",
    requireDatabase,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT image_data, image_path, mime_type, updated_at
         FROM campus_logo
         ORDER BY logo_id ASC
         LIMIT 1`,
      );
      const row = result.rows[0];

      if (row?.image_data && row.image_data.startsWith("data:")) {
        const parts = row.image_data.split(",");
        const mimeMatch = parts[0].match(/:(.*?);/);
        const mime = (mimeMatch && mimeMatch[1]) || row.mime_type || "image/png";
        const buffer = Buffer.from(parts[1], "base64");

        res.set("Content-Type", mime);
        res.set("Cache-Control", "public, max-age=86400, stale-while-revalidate=604800");
        return res.send(buffer);
      }

      if (row?.image_path) {
        return res.redirect(row.image_path);
      }

      return res.redirect("/assets/img/campus-logo.svg");
    }),
  );

  // Public: Get current active campus logo metadata and persistent image reference
  router.get(
    "/logo",
    requireDatabase,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT logo_id AS id, logo_name AS name, image_path AS "imagePath",
                image_data AS "imageData", file_size AS "fileSize", mime_type AS "mimeType",
                created_at AS "createdAt", updated_at AS "updatedAt"
         FROM campus_logo
         ORDER BY logo_id ASC
         LIMIT 1`,
      );

      const row = result.rows[0];
      if (row) {
        // Lazily ensure disk cache file exists
        if (row.imageData && row.imagePath) {
          ensureDiskFile(row.imagePath, row.imageData);
        }

        // Persistent image URL: prefer data URL directly (or /api/campus/logo/image)
        const persistentUrl = row.imageData || row.imagePath || "/assets/img/campus-logo.svg";

        const logoData = {
          id: row.id,
          logo_id: row.id,
          name: row.name,
          imageUrl: persistentUrl,
          image_url: persistentUrl,
          fileSize: row.fileSize,
          mimeType: row.mimeType,
          updatedAt: row.updatedAt,
        };

        return res.json({ logo: logoData, ...logoData });
      }

      const defaultData = {
        id: 1,
        logo_id: 1,
        name: "Campus Main Logo",
        imageUrl: "/assets/img/campus-logo.svg",
        image_url: "/assets/img/campus-logo.svg",
      };

      res.json({ logo: defaultData, ...defaultData });
    }),
  );

  // Admin: Update campus logo and persist in PostgreSQL
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
      let imageData = null;
      let fileSize = null;
      let mimeType = null;

      // If data URL, validate and store file locally while persisting base64 in database
      if (image.startsWith("data:")) {
        try {
          imageData = image; // Keep full base64 data URL for PostgreSQL persistence
          savedFile = validateAndSaveImage(image, uploadsDir, "campus-logo");
          imagePath = savedFile.relativePath;
          fileSize = savedFile.fileSize;
          mimeType = savedFile.mimeType;
        } catch (validationErr) {
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
          `INSERT INTO campus_logo (logo_id, logo_name, image_path, image_data, file_size, mime_type, updated_by, updated_at)
           VALUES (1, $1, $2, $3, $4, $5, $6, now())
           ON CONFLICT (logo_id) DO UPDATE SET
             logo_name = EXCLUDED.logo_name,
             image_path = EXCLUDED.image_path,
             image_data = COALESCE(EXCLUDED.image_data, campus_logo.image_data),
             file_size = EXCLUDED.file_size,
             mime_type = EXCLUDED.mime_type,
             updated_by = EXCLUDED.updated_by,
             updated_at = now()
           RETURNING logo_id AS id, logo_name AS name, image_path AS "imagePath",
                     image_data AS "imageData", file_size AS "fileSize", mime_type AS "mimeType",
                     updated_at AS "updatedAt"`,
          [cleanName, imagePath, imageData, fileSize, mimeType, req.user.id],
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
            imagePath: updatedLogo.imagePath,
          },
          req,
        });

        await client.query("COMMIT");

        const persistentUrl = updatedLogo.imageData || updatedLogo.imagePath;
        const formattedRes = {
          id: updatedLogo.id,
          logo_id: updatedLogo.id,
          name: updatedLogo.name,
          imageUrl: persistentUrl,
          image_url: persistentUrl,
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
