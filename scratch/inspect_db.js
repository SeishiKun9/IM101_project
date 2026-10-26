import "dotenv/config";
import pg from "pg";
const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

async function inspect() {
  const auditCols = await pool.query(
    "SELECT column_name, data_type, is_nullable FROM information_schema.columns WHERE table_name = 'audit_logs' ORDER BY ordinal_position"
  );
  console.log("Updated audit_logs columns:", auditCols.rows.map(c => `${c.column_name} (${c.data_type})`));

  const overview = await pool.query("SELECT * FROM v_audit_activity_overview");
  console.log("v_audit_activity_overview:", overview.rows[0]);

  const usersSummary = await pool.query("SELECT * FROM v_audit_user_summary LIMIT 5");
  console.log("v_audit_user_summary sample:", usersSummary.rows);

  const logo = await pool.query("SELECT * FROM campus_logo");
  console.log("campus_logo:", logo.rows);

  const users = await pool.query("SELECT user_id, username, name, email, role FROM users LIMIT 5");
  console.log("users with username:", users.rows);

  await pool.end();
}

inspect().catch(console.error);
