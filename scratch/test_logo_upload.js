import "dotenv/config";

async function testLogoUpload() {
  // 1. Login as admin allen
  const loginRes = await fetch("http://127.0.0.1:3000/api/auth/login", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email: "allen", password: "june62006" }),
  });
  const { token } = await loginRes.json();

  // 2. Base64 SVG sample
  const base64Svg = "data:image/svg+xml;base64," + Buffer.from('<svg xmlns="http://www.w3.org/2000/svg" width="100" height="100"><circle cx="50" cy="50" r="40" fill="green"/></svg>').toString("base64");

  // 3. Upload new logo with file data
  const updateRes = await fetch("http://127.0.0.1:3000/api/admin/logo", {
    method: "PUT",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${token}`,
    },
    body: JSON.stringify({
      name: "Holy Name University Seal",
      image: base64Svg,
      alt_text: "University Official Coat of Arms",
    }),
  });
  console.log("Upload status:", updateRes.status);
  const updateData = await updateRes.json();
  console.log("Updated logo:", updateData.logo);

  // 4. Verify in audit_logs
  const auditRes = await fetch("http://127.0.0.1:3000/api/admin/audit-logs?entity_type=campus_logo&limit=1", {
    headers: { Authorization: `Bearer ${token}` },
  });
  const auditData = await auditRes.json();
  console.log("Latest campus_logo audit log:", auditData.logs?.[0]);
}

testLogoUpload().catch(console.error);
