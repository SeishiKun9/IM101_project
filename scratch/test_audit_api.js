import "dotenv/config";

async function testAuditEndpoint() {
  // 1. Login as admin allen
  const loginRes = await fetch("http://localhost:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      email: "allen",
      password: "june62006",
    }),
  });

  const loginData = await loginRes.json();
  console.log("Login response status:", loginRes.status);
  if (!loginData.token) {
    console.error("Login failed:", loginData);
    return;
  }

  const token = loginData.token;
  console.log("Got token for user:", loginData.user.username, "role:", loginData.user.role);

  // 2. Fetch /api/admin/audit-logs/overview
  const ovRes = await fetch("http://localhost:3000/api/admin/audit-logs/overview", {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("Overview status:", ovRes.status);
  const ovData = await ovRes.json();
  console.log("Overview response:", ovData);

  // 3. Fetch /api/admin/audit-logs
  const logsRes = await fetch("http://localhost:3000/api/admin/audit-logs?page=1&limit=5", {
    headers: { Authorization: `Bearer ${token}` },
  });
  console.log("Logs status:", logsRes.status);
  const logsData = await logsRes.json();
  console.log("Logs data sample:", JSON.stringify(logsData).slice(0, 300));
}

testAuditEndpoint();
