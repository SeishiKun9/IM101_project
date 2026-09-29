import "dotenv/config";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production"
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

app.use(express.json());
app.use(express.static(path.join(__dirname, "../../client")));

function requireDatabase(req, res, next) {
  if (!pool)
    return res.status(503).json({
      error:
        "Database is not configured. Copy .env.example to .env and add a cloud PostgreSQL URL.",
    });
  next();
}

app.get("/api/health", async (req, res) => {
  if (!pool) return res.json({ status: "ok", database: "not configured" });
  try {
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  } catch (error) {
    res.status(503).json({ status: "degraded", database: error.message });
  }
});

app.get("/api/items", requireDatabase, async (req, res) => {
  const search = `%${String(req.query.search || "").trim()}%`;
  const result = await pool.query(
    `SELECT i.item_id, i.item_type, i.title, i.description, i.date_reported,
            i.status, c.category_name, l.location_name
       FROM items i
       JOIN categories c ON c.category_id = i.category_id
       JOIN locations l ON l.location_id = i.location_id
      WHERE i.status IN ('reported', 'under_review')
        AND (i.title ILIKE $1 OR i.description ILIKE $1)
      ORDER BY i.created_at DESC LIMIT 50`,
    [search],
  );
  res.json(result.rows);
});

app.post("/api/items", requireDatabase, async (req, res) => {
  const {
    reporterId,
    categoryId,
    locationId,
    itemType,
    title,
    description,
    dateReported,
  } = req.body;
  if (
    !reporterId ||
    !categoryId ||
    !locationId ||
    !itemType ||
    !title ||
    !description ||
    !dateReported
  ) {
    return res.status(400).json({ error: "All report fields are required." });
  }
  const result = await pool.query(
    `INSERT INTO items (reporter_id, category_id, location_id, item_type, title, description, date_reported)
     VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING item_id`,
    [
      reporterId,
      categoryId,
      locationId,
      itemType,
      title,
      description,
      dateReported,
    ],
  );
  res.status(201).json(result.rows[0]);
});

app.get("*", (req, res) =>
  res.sendFile(path.join(__dirname, "../../client/index.html")),
);
app.listen(port, () =>
  console.log(`Campus Lost & Found running at http://localhost:${port}`),
);
