import "dotenv/config";
import pg from "pg";
import crypto from "node:crypto";

const pool = new pg.Pool({ connectionString: process.env.DATABASE_URL });

function verifyPassword(password, stored) {
  const [, salt, expected] = String(stored).split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(Buffer.from(actual, "hex"), Buffer.from(expected, "hex"));
}

async function check() {
  const res = await pool.query("SELECT user_id, email, password_hash FROM users");
  for (const u of res.rows) {
    if (verifyPassword("june62006", u.password_hash)) {
      console.log(`User ${u.user_id} (${u.email}) uses june62006`);
    }
  }
  await pool.end();
}
check().catch(console.error);
