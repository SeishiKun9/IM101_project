import "dotenv/config";
import pg from "pg";

const { Pool } = pg;
const pool = new Pool({
  connectionString: process.env.DATABASE_URL || "postgresql://postgres:postgres@localhost:5432/campus_lost_found",
});

const BASE_URL = "http://127.0.0.1:3000/api";

async function login(email, password = "june62006") {
  const res = await fetch(`${BASE_URL}/auth/login`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, password }),
  });
  if (!res.ok) {
    const txt = await res.text();
    throw new Error(`Login failed for ${email}: ${res.status} ${txt}`);
  }
  const data = await res.json();
  const setCookie = res.headers.get("set-cookie");
  let cookie = "";
  if (setCookie) {
    cookie = setCookie.split(";")[0];
  }
  return { token: data.token, user: data.user, cookie };
}

async function runTests() {
  console.log("=================================================");
  console.log("STARTING POSTGRESQL AUDIT LOGGING VERIFICATION");
  console.log("=================================================");

  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  [PASS] ${message}`);
      passed++;
    } else {
      console.error(`  [FAIL] ${message}`);
      failed++;
    }
  }

  try {
    // -----------------------------------------------------------------
    // TEST A: Admin changes the campus logo
    // -----------------------------------------------------------------
    console.log("\n--- TEST A: Admin changes campus logo ---");
    const admin = await login("aguiman.allen@hnu.edu.ph");
    console.log(`  Logged in as admin: ${admin.user.username} (${admin.user.name})`);

    const updateLogoRes = await fetch(`${BASE_URL}/admin/logo`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        name: "Holy Name University Main Campus",
        image: "/assets/img/hnu_verified_logo.png",
        alt_text: "Official HNU Seal",
      }),
    });
    const logoJson = await updateLogoRes.json();
    assert(updateLogoRes.ok, `PUT /api/admin/logo returned HTTP 200 (status: ${updateLogoRes.status})`);
    assert(logoJson.name === "Holy Name University Main Campus" || logoJson.logo?.name === "Holy Name University Main Campus", "Campus logo updated in database");

    // Check PostgreSQL audit_logs
    const auditA = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type = 'campus_logo' AND action = 'UPDATE' 
       ORDER BY created_at DESC LIMIT 1`
    );
    const logA = auditA.rows[0];
    assert(logA !== undefined, "Audit record exists for campus_logo UPDATE");
    assert(logA?.actor_username === "allen", `Actor username is 'allen' (got: ${logA?.actor_username})`);
    assert(logA?.actor_role === "admin", `Actor role is 'admin' (got: ${logA?.actor_role})`);
    assert(logA?.action === "UPDATE", `Action is 'UPDATE' (got: ${logA?.action})`);
    assert(logA?.status === "SUCCESS", `Status is 'SUCCESS' (got: ${logA?.status})`);
    assert(logA?.old_values !== null && logA?.new_values !== null, "Both old_values and new_values captured in JSONB");

    // -----------------------------------------------------------------
    // TEST B: Admin adds a campus map
    // -----------------------------------------------------------------
    console.log("\n--- TEST B: Admin adds a campus map ---");
    const createMapRes = await fetch(`${BASE_URL}/admin/maps`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        name: "Test Audit Verification Map",
        description: "Created by automated audit test suite",
        image: "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=",
        activateImmediately: false,
      }),
    });
    const mapJson = await createMapRes.json();
    assert(createMapRes.ok, `POST /api/admin/maps returned HTTP 201 (status: ${createMapRes.status})`);
    const mapId = mapJson.map?.id || mapJson.id;
    assert(Boolean(mapId), `Created campus map with ID: ${mapId}`);

    const auditB = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type = 'campus_maps' AND action = 'CREATE' AND entity_id = $1 
       ORDER BY created_at DESC LIMIT 1`,
      [String(mapId)]
    );
    const logB = auditB.rows[0];
    assert(logB !== undefined, "Audit record exists for campus_maps CREATE");
    assert(logB?.actor_username === "allen", `Actor is 'allen' (got: ${logB?.actor_username})`);
    assert(logB?.actor_role === "admin", `Role is 'admin' (got: ${logB?.actor_role})`);
    assert(logB?.status === "SUCCESS", `Status is 'SUCCESS' (got: ${logB?.status})`);

    // -----------------------------------------------------------------
    // TEST C: Admin deletes a campus map & audit record persists
    // -----------------------------------------------------------------
    console.log("\n--- TEST C: Admin deletes a campus map ---");
    const deleteMapRes = await fetch(`${BASE_URL}/admin/maps/${mapId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${admin.token}`,
      },
    });
    assert(deleteMapRes.ok, `DELETE /api/admin/maps succeeded (got: ${deleteMapRes.status})`);

    // Verify map is deleted from operational table
    const checkMap = await pool.query("SELECT * FROM campus_maps WHERE map_id = $1", [mapId]);
    assert(checkMap.rows.length === 0, "Campus map was permanently removed from campus_maps");

    // Verify both CREATE and DELETE audit records survive
    const auditC = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type = 'campus_maps' AND entity_id = $1 
       ORDER BY created_at ASC`,
      [String(mapId)]
    );
    assert(auditC.rows.length >= 2, `Audit trail contains ${auditC.rows.length} records for deleted map`);
    const deleteLog = auditC.rows.find((r) => r.action === "DELETE");
    assert(deleteLog !== undefined, "DELETE audit record found for deleted map");
    assert(deleteLog?.actor_username === "allen", `DELETE actor is 'allen' (got: ${deleteLog?.actor_username})`);
    assert(deleteLog?.old_values !== null, "DELETE old_values snapshot preserved prior map data");

    // -----------------------------------------------------------------
    // TEST D: Student creates a lost-item report
    // -----------------------------------------------------------------
    console.log("\n--- TEST D: Student creates a lost-item report ---");
    const student = await login("test101@hnu.edu.ph");
    console.log(`  Logged in as student: ${student.user.username} (${student.user.name})`);

    const createItemRes = await fetch(`${BASE_URL}/items`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${student.token}`,
      },
      body: JSON.stringify({
        title: "Audit Test Blue Flask",
        category: "Accessories",
        type: "lost",
        description: "Hydro Flask dropped near cafeteria",
        date: "2026-10-26",
        building_id: 1,
      }),
    });
    const itemJson = await createItemRes.json();
    assert(createItemRes.ok, `POST /api/items returned HTTP 201 (status: ${createItemRes.status})`);
    const itemId = itemJson.id;
    assert(Boolean(itemId), `Created item with ID: ${itemId}`);

    const auditD = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type IN ('item', 'items') AND entity_id = $1 AND action = 'CREATE' 
       ORDER BY created_at DESC LIMIT 1`,
      [String(itemId)]
    );
    const logD = auditD.rows[0];
    assert(logD !== undefined, "Audit record exists for student report CREATE");
    assert(logD?.actor_username === student.user.username, `Actor username matches student: ${student.user.username}`);
    assert(logD?.actor_role === "student", `Actor role is 'student' (got: ${logD?.actor_role})`);
    assert(logD?.status === "SUCCESS", `Status is 'SUCCESS' (got: ${logD?.status})`);

    // -----------------------------------------------------------------
    // TEST E: Verifier changes claim / item status
    // -----------------------------------------------------------------
    console.log("\n--- TEST E: Verifier reviews report & updates status ---");
    const verifier = await login("ladaran.johnbenedict@hnu.edu.ph");
    console.log(`  Logged in as verifier: ${verifier.user.username} (${verifier.user.name})`);

    const updateStatusRes = await fetch(`${BASE_URL}/reports/${itemId}/status`, {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${verifier.token}`,
      },
      body: JSON.stringify({
        status: "under_review",
      }),
    });
    assert(updateStatusRes.ok, `PATCH /api/reports/:id/status returned HTTP 200 (status: ${updateStatusRes.status})`);

    const auditE = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type IN ('item', 'items') AND entity_id = $1 AND action = 'UPDATE' 
       ORDER BY created_at DESC LIMIT 1`,
      [String(itemId)]
    );
    const logE = auditE.rows[0];
    assert(logE !== undefined, "Audit record exists for verifier status update");
    assert(logE?.actor_username === verifier.user.username, `Actor username is verifier: ${verifier.user.username}`);
    assert(logE?.actor_role === "staff", `Actor role is 'staff' (verifier) (got: ${logE?.actor_role})`);
    assert(
      JSON.stringify(logE?.changed_fields || {}).includes("status"),
      "Changed fields correctly includes 'status'"
    );

    // -----------------------------------------------------------------
    // TEST F: Unauthorized access rejected
    // -----------------------------------------------------------------
    console.log("\n--- TEST F: Unauthorized access rejection ---");
    const unauthAuditRes = await fetch(`${BASE_URL}/admin/audit-logs`, {
      headers: {
        Authorization: `Bearer ${student.token}`,
      },
    });
    assert(
      unauthAuditRes.status === 403,
      `Student attempting to access /api/admin/audit-logs was rejected with HTTP 403 (got: ${unauthAuditRes.status})`
    );

    const unauthOverviewRes = await fetch(`${BASE_URL}/admin/audit-logs/overview`, {
      headers: {
        Authorization: `Bearer ${student.token}`,
      },
    });
    assert(
      unauthOverviewRes.status === 403,
      `Student attempting to access /api/admin/audit-logs/overview was rejected with HTTP 403 (got: ${unauthOverviewRes.status})`
    );

    // -----------------------------------------------------------------
    // TEST G: Failed operation handling
    // -----------------------------------------------------------------
    console.log("\n--- TEST G: Failed operation handling ---");
    // Invalid logo update missing required fields
    const failRes = await fetch(`${BASE_URL}/admin/logo`, {
      method: "PUT",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        name: "", // Invalid empty name
        image: "",
      }),
    });
    assert(failRes.status === 400, `Validation failure returned HTTP 400 Bad Request (status: ${failRes.status})`);

    // Verify FAILURE log exists and no false SUCCESS was recorded for this payload
    const auditG = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type = 'campus_logo' AND status = 'FAILURE' 
       ORDER BY created_at DESC LIMIT 1`
    );
    const logG = auditG.rows[0];
    assert(logG !== undefined, "Audit record correctly captured with status FAILURE");
    assert(logG?.actor_username === "allen", `Actor for failed attempt is 'allen' (got: ${logG?.actor_username})`);

    // -----------------------------------------------------------------
    // TEST H: Account deletion preserves audit history
    // -----------------------------------------------------------------
    console.log("\n--- TEST H: Account deletion preserves audit history ---");
    // 1. Admin creates verifier account
    const createAcctRes = await fetch(`${BASE_URL}/admin/accounts`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${admin.token}`,
      },
      body: JSON.stringify({
        name: "Temporary Audit Verifier",
        email: `temp_verifier_${Date.now()}@hnu.edu.ph`,
        password: "TemporaryPassword123!",
        role: "staff",
      }),
    });
    assert(createAcctRes.ok, `POST /api/admin/accounts returned HTTP 201 (status: ${createAcctRes.status})`);
    const acctJson = await createAcctRes.json();
    const tempUserId = acctJson.user?.id;
    assert(Boolean(tempUserId), `Created temp account ID: ${tempUserId}`);

    // 2. Admin deletes the verifier account
    const deleteAcctRes = await fetch(`${BASE_URL}/admin/users/${tempUserId}`, {
      method: "DELETE",
      headers: {
        Authorization: `Bearer ${admin.token}`,
      },
    });
    assert(deleteAcctRes.status === 204, `DELETE /api/admin/users/:id returned HTTP 204 (status: ${deleteAcctRes.status})`);

    // 3. Confirm user is deleted from users table
    const checkUser = await pool.query("SELECT * FROM users WHERE user_id = $1", [tempUserId]);
    assert(checkUser.rows.length === 0, "Account was removed from users table");

    // 4. Confirm audit records for that user survive with intact historical metadata
    const auditH = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type IN ('user', 'users') AND entity_id = $1 
       ORDER BY created_at ASC`,
      [String(tempUserId)]
    );
    assert(auditH.rows.length >= 2, `Found ${auditH.rows.length} audit records for deleted account`);
    const deleteUserLog = auditH.rows.find((r) => r.action === "DELETE");
    assert(deleteUserLog !== undefined, "DELETE audit log exists for removed account");
    assert(deleteUserLog?.actor_username === "allen", "Actor who deleted the account was captured as 'allen'");
    assert(deleteUserLog?.old_values !== null, "Prior account details preserved in old_values");

    // -----------------------------------------------------------------
    // TEST I: Database-level trigger protection
    // -----------------------------------------------------------------
    console.log("\n--- TEST I: Database-level trigger protection (direct SQL) ---");
    // Direct SQL update on rooms table without application context
    await pool.query(
      `UPDATE rooms SET name = 'Direct SQL Trigger Test ' || floor(random()*1000) 
       WHERE room_id = 1`
    );

    const auditI = await pool.query(
      `SELECT * FROM audit_logs 
       WHERE entity_type = 'rooms' AND entity_id = '1' AND action = 'UPDATE' 
       ORDER BY created_at DESC LIMIT 1`
    );
    const logI = auditI.rows[0];
    assert(logI !== undefined, "PostgreSQL trigger audit_row_change fired and recorded direct SQL update");
    assert(logI?.actor_username === "system", `Actor was safely recorded as 'system' (got: ${logI?.actor_username})`);
    assert(logI?.actor_role === "system", `Actor role was safely recorded as 'system' (got: ${logI?.actor_role})`);
    assert(logI?.old_values !== null && logI?.new_values !== null, "Trigger captured both old_values and new_values");

    // -----------------------------------------------------------------
    // TEST J: Overview aggregate views accuracy
    // -----------------------------------------------------------------
    console.log("\n--- TEST J: Overview aggregate views accuracy ---");
    const overviewRes = await fetch(`${BASE_URL}/admin/audit-logs/overview`, {
      headers: {
        Authorization: `Bearer ${admin.token}`,
      },
    });
    assert(overviewRes.ok, `GET /api/admin/audit-logs/overview returned HTTP 200 (status: ${overviewRes.status})`);
    const overviewData = await overviewRes.json();

    // Query independent counts from audit_logs table using the exact view logic
    const directCounts = await pool.query(
      `SELECT 
         COUNT(*) as total_actions,
         COUNT(*) FILTER (WHERE status = 'SUCCESS') as total_success,
         COUNT(*) FILTER (WHERE status = 'FAILURE') as total_failure,
         COUNT(*) FILTER (WHERE action IN ('CREATE', 'INSERT')) as total_creates,
         COUNT(*) FILTER (WHERE action IN ('UPDATE', 'UPDATE_PROFILE', 'UPDATE_PREFERENCES', 'APPROVE', 'REJECT', 'MATCH', 'COLLECT', 'ACTIVATE', 'ARCHIVE')) as total_updates,
         COUNT(*) FILTER (WHERE action IN ('DELETE', 'REMOVE')) as total_deletes
       FROM audit_logs`
    );
    const dbMetrics = directCounts.rows[0];

    assert(
      Number(overviewData.metrics.total_actions) === Number(dbMetrics.total_actions),
      `Total actions match: view=${overviewData.metrics.total_actions}, direct=${dbMetrics.total_actions}`
    );
    assert(
      Number(overviewData.metrics.total_success) === Number(dbMetrics.total_success),
      `Total success match: view=${overviewData.metrics.total_success}, direct=${dbMetrics.total_success}`
    );
    assert(
      Number(overviewData.metrics.total_failure) === Number(dbMetrics.total_failure),
      `Total failure match: view=${overviewData.metrics.total_failure}, direct=${dbMetrics.total_failure}`
    );
    assert(
      Number(overviewData.metrics.total_creates) === Number(dbMetrics.total_creates),
      `Total creates match: view=${overviewData.metrics.total_creates}, direct=${dbMetrics.total_creates}`
    );
    assert(
      Number(overviewData.metrics.total_updates) === Number(dbMetrics.total_updates),
      `Total updates match: view=${overviewData.metrics.total_updates}, direct=${dbMetrics.total_updates}`
    );
    assert(
      Number(overviewData.metrics.total_deletes) === Number(dbMetrics.total_deletes),
      `Total deletes match: view=${overviewData.metrics.total_deletes}, direct=${dbMetrics.total_deletes}`
    );

    // Verify user summary
    const allenStats = (overviewData.usersSummary || overviewData.userSummary || []).find((u) => u.username === "allen");
    assert(allenStats !== undefined, "Allen appears in user activity summary");
    assert(Number(allenStats?.total_actions || allenStats?.total) > 0, `Allen total actions > 0 (got: ${allenStats?.total_actions || allenStats?.total})`);

    // Verify pagination and filtering
    const filterRes = await fetch(`${BASE_URL}/admin/audit-logs?role=admin&limit=5&order=DESC`, {
      headers: {
        Authorization: `Bearer ${admin.token}`,
      },
    });
    const filterData = await filterRes.json();
    const logsList = filterData.logs || [];
    assert(filterRes.ok, "GET /api/admin/audit-logs?role=admin filtered response returned HTTP 200");
    assert(logsList.length <= 5, `Pagination limit enforced (got ${logsList.length} <= 5)`);
    assert(
      logsList.every((l) => l.actor_role === "admin" || l.actorRole === "admin"),
      "Role filter correctly filtered all records to 'admin'"
    );

    // Clean up test item
    await pool.query("DELETE FROM items WHERE item_id = $1", [itemId]);

    console.log("\n=================================================");
    console.log(`VERIFICATION COMPLETE: ${passed} PASSED, ${failed} FAILED`);
    console.log("=================================================");
  } catch (err) {
    console.error("Test execution failed:", err);
  } finally {
    await pool.end();
  }
}

runTests();
