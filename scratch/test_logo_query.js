import "dotenv/config";
import pg from "pg";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });
const client = await pool.connect();

try {
  await client.query("BEGIN");
  // Test set_config
  await client.query("SELECT set_config('audit.skip_trigger', 'true', true)");
  await client.query("SELECT set_config('audit.actor_user_id', $1, true)", ["1"]);
  await client.query("SELECT set_config('audit.actor_username', $1, true)", ["allen"]);
  await client.query("SELECT set_config('audit.actor_role', $1, true)", ["admin"]);

  // Now execute an insert
  const res = await client.query(
    `INSERT INTO audit_logs (
      actor_user_id, actor_username, actor_role, action, status, entity_type, entity_id, description, created_at,
      user_id, table_name, record_id, action_time
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, now(),
      $1, $6, $9, now()
    ) RETURNING id`,
    [1, "allen", "admin", "UPDATE", "SUCCESS", "campus_logo", "1", "Test desc", 1]
  );
  console.log("Audit log insert succeeded! ID:", res.rows[0].id);
  await client.query("COMMIT");
} catch (e) {
  console.error("Error:", e);
  await client.query("ROLLBACK");
} finally {
  client.release();
  await pool.end();
}
