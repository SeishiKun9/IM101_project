import React, { useState, useEffect } from "react";

export default function ExportDataModal({
  onClose,
  user,
  initialDataset = "items",
}) {
  const [dataset, setDataset] = useState(initialDataset);
  const [datePreset, setDatePreset] = useState("all");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");

  // Items dataset filters
  const [itemType, setItemType] = useState("all");
  const [itemStatus, setItemStatus] = useState("all");

  // Claims dataset filters
  const [claimStatus, setClaimStatus] = useState("all");

  // Audit logs dataset filters
  const [auditAction, setAuditAction] = useState("all");

  const [downloading, setDownloading] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = user?.role === "admin";

  // Handle date preset changes
  useEffect(() => {
    const today = new Date().toISOString().slice(0, 10);
    if (datePreset === "all") {
      setStartDate("");
      setEndDate("");
    } else if (datePreset === "today") {
      setStartDate(today);
      setEndDate(today);
    } else if (datePreset === "7days") {
      const d = new Date();
      d.setDate(d.getDate() - 7);
      setStartDate(d.toISOString().slice(0, 10));
      setEndDate(today);
    } else if (datePreset === "30days") {
      const d = new Date();
      d.setDate(d.getDate() - 30);
      setStartDate(d.toISOString().slice(0, 10));
      setEndDate(today);
    } else if (datePreset === "thisMonth") {
      const now = new Date();
      const firstDay = new Date(now.getFullYear(), now.getMonth(), 1);
      setStartDate(firstDay.toISOString().slice(0, 10));
      setEndDate(today);
    }
  }, [datePreset]);

  // Handle keyboard ESC to close
  useEffect(() => {
    function onKeyDown(e) {
      if (e.key === "Escape") onClose();
    }
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  function buildExportUrl() {
    const params = new URLSearchParams();

    if (startDate) {
      params.set("startDate", startDate);
      params.set("start_date", startDate);
    }
    if (endDate) {
      params.set("endDate", endDate);
      params.set("end_date", endDate);
    }

    if (dataset === "items") {
      if (itemType !== "all") params.set("type", itemType);
      if (itemStatus !== "all") params.set("status", itemStatus);
      return `/api/admin/export/reports-csv?${params.toString()}`;
    }

    if (dataset === "claims") {
      if (claimStatus !== "all") params.set("status", claimStatus);
      return `/api/admin/export/claims-csv?${params.toString()}`;
    }

    if (dataset === "audit") {
      if (auditAction !== "all") params.set("action", auditAction);
      params.set("export", "true");
      return `/api/admin/audit-logs/export/csv?${params.toString()}`;
    }

    return "";
  }

  async function handleDownloadCsv() {
    setError("");
    setDownloading(true);

    try {
      const token = localStorage.getItem("campusToken");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};
      const url = buildExportUrl();

      const response = await fetch(url, {
        credentials: "same-origin",
        headers,
      });

      if (!response.ok) {
        let errDetail = "Could not export CSV data.";
        try {
          const json = await response.json();
          if (json?.error) {
            // Show a friendly message instead of raw PostgreSQL internals
            const raw = json.error;
            if (raw.includes('cast') || raw.includes('timestamp') || raw.includes('integer')) {
              errDetail = 'Export filter error: invalid date format. Please use the date picker to select a valid date range.';
            } else if (raw.includes('permission') || raw.includes('denied')) {
              errDetail = 'You do not have permission to export this dataset.';
            } else {
              errDetail = raw;
            }
          }
        } catch {}
        throw new Error(errDetail);
      }

      const blob = await response.blob();
      const blobUrl = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = blobUrl;

      const dateStr = new Date().toISOString().slice(0, 10);
      let filename = `campus-${dataset}-export-${dateStr}.csv`;
      if (dataset === "items") filename = `campus-reports-registry-${dateStr}.csv`;
      if (dataset === "claims") filename = `campus-claims-handovers-${dateStr}.csv`;
      if (dataset === "audit") filename = `campus-audit-ledger-${dateStr}.csv`;

      link.download = filename;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(blobUrl);
    } catch (err) {
      setError(err.message || "Failed to download export file.");
    } finally {
      setDownloading(false);
    }
  }

  function handlePrintSummary() {
    const filterLabels = [];
    if (startDate && endDate) {
      filterLabels.push(`Date Range: ${startDate} to ${endDate}`);
    } else if (startDate) {
      filterLabels.push(`From: ${startDate}`);
    } else if (endDate) {
      filterLabels.push(`To: ${endDate}`);
    } else {
      filterLabels.push("Date Range: All Time");
    }

    if (dataset === "items") {
      if (itemType !== "all") filterLabels.push(`Type: ${itemType.toUpperCase()}`);
      if (itemStatus !== "all") filterLabels.push(`Status: ${itemStatus.toUpperCase()}`);
    } else if (dataset === "claims") {
      if (claimStatus !== "all") filterLabels.push(`Claim Status: ${claimStatus.toUpperCase()}`);
    } else if (dataset === "audit") {
      if (auditAction !== "all") filterLabels.push(`Action: ${auditAction}`);
    }

    const printWin = window.open("", "_blank");
    if (!printWin) {
      setError("Please allow popups to open the printable report summary.");
      return;
    }

    const titleMap = {
      items: "Lost & Found Items Registry Report",
      claims: "Claims & Handover Verification Report",
      audit: "PostgreSQL Security & Activity Audit Ledger",
    };

    const docTitle = titleMap[dataset] || "Campus Registry Export";
    const generatedDate = new Date().toLocaleString("en-US", {
      dateStyle: "full",
      timeStyle: "medium",
    });

    const htmlContent = `
      <!DOCTYPE html>
      <html lang="en">
      <head>
        <meta charset="utf-8" />
        <title>${docTitle} - Holy Name University</title>
        <style>
          @page { size: A4 portrait; margin: 18mm; }
          body { font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif; color: #1e293b; margin: 0; padding: 24px; font-size: 13px; line-height: 1.5; }
          .header { border-bottom: 2px solid #0f172a; padding-bottom: 14px; margin-bottom: 20px; display: flex; justify-content: space-between; align-items: flex-start; }
          .inst-name { font-size: 18px; font-weight: 800; color: #0f172a; text-transform: uppercase; letter-spacing: 0.05em; }
          .sub-name { font-size: 12px; color: #64748b; margin-top: 2px; }
          .report-title { font-size: 20px; font-weight: 700; margin: 16px 0 6px 0; color: #0f172a; }
          .filter-chips { display: flex; flex-wrap: wrap; gap: 8px; margin: 12px 0 20px 0; }
          .chip { background: #f1f5f9; border: 1px solid #cbd5e1; padding: 4px 10px; border-radius: 4px; font-size: 11px; font-weight: 600; color: #334155; }
          .meta-box { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 12px 16px; margin-bottom: 24px; font-size: 12px; }
          .meta-grid { display: grid; grid-template-columns: repeat(3, 1fr); gap: 12px; }
          .meta-item strong { display: block; color: #64748b; font-size: 10px; text-transform: uppercase; letter-spacing: 0.05em; margin-bottom: 2px; }
          .notice { font-size: 12px; color: #475569; font-style: italic; margin-top: 24px; padding-top: 12px; border-top: 1px dashed #cbd5e1; }
          .sign-area { display: flex; justify-content: space-between; margin-top: 50px; page-break-inside: avoid; }
          .sign-line { width: 220px; border-top: 1px solid #334155; text-align: center; padding-top: 6px; font-size: 11px; }
          @media print {
            .no-print { display: none !important; }
            body { padding: 0; }
          }
        </style>
      </head>
      <body>
        <div class="header">
          <div>
            <div class="inst-name">Holy Name University</div>
            <div class="sub-name">Campus Lost & Found Management System · Center for Student Affairs</div>
          </div>
          <div style="text-align: right;">
            <button class="no-print" onclick="window.print()" style="padding: 6px 14px; background: #059669; color: white; border: none; border-radius: 4px; font-weight: 600; cursor: pointer; margin-bottom: 6px;">🖨️ Print / Save as PDF</button>
            <div style="font-size: 11px; color: #64748b;">Generated: ${generatedDate}</div>
          </div>
        </div>

        <h1 class="report-title">${docTitle}</h1>

        <div class="meta-box">
          <div class="meta-grid">
            <div class="meta-item">
              <strong>Generated By</strong>
              ${user?.name || "Campus Staff"} (${user?.role?.toUpperCase() || "STAFF"})
            </div>
            <div class="meta-item">
              <strong>Institutional Account</strong>
              ${user?.email || "staff@hnu.edu.ph"}
            </div>
            <div class="meta-item">
              <strong>Dataset Category</strong>
              ${dataset.toUpperCase()} RECORDS
            </div>
          </div>
        </div>

        <div>
          <strong style="font-size: 11px; text-transform: uppercase; letter-spacing: 0.05em; color: #64748b;">Active Export Scope &amp; Filters:</strong>
          <div class="filter-chips">
            ${filterLabels.map((l) => `<span class="chip">${l}</span>`).join("")}
          </div>
        </div>

        <p style="color: #334155; font-size: 13px; line-height: 1.6;">
          This official export summary was compiled from the University PostgreSQL database registry for internal auditing, accreditation documentation, and administrative record-keeping. Complete row-level datasets including timestamps, claim notes, and audit snapshots are included in the corresponding CSV export archive.
        </p>

        <div class="sign-area">
          <div class="sign-line">
            Verified / Prepared by<br />
            <strong>${user?.name || "Authorized Staff"}</strong>
          </div>
          <div class="sign-line">
            Center for Student Affairs / Security<br />
            <strong>Office Head / Administrator</strong>
          </div>
        </div>

        <div class="notice">
          Confidential Document · Holy Name University Campus Security &amp; Records Management. Unauthorized redistribution is strictly prohibited.
        </div>
      </body>
      </html>
    `;

    printWin.document.open();
    printWin.document.write(htmlContent);
    printWin.document.close();
  }

  return (
    <div
      className="modal-backdrop modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="export-modal-title"
      onClick={onClose}
    >
      <div
        className="modal export-data-modal"
        style={{
          maxWidth: "620px",
          width: "95%",
          display: "flex",
          flexDirection: "column",
          maxHeight: "90vh",
          overflow: "hidden",
        }}
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <header className="modal-header">
          <div>
            <div className="modal-header-tag">REPORTING &amp; DATA EXPORTS</div>
            <h2 id="export-modal-title" className="modal-title">
              Data Export &amp; Reporting Center
            </h2>
            <p className="modal-subtitle" style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
              Download filtered spreadsheet archives (CSV) or generate printable summary reports.
            </p>
          </div>
          <button
            className="modal-close"
            type="button"
            onClick={onClose}
            aria-label="Close export dialog"
          >
            ×
          </button>
        </header>

        {error && (
          <div
            className="alert alert-danger"
            style={{ margin: "14px 20px 0 20px", padding: "10px 14px", borderRadius: "8px" }}
          >
            ⚠️ {error}
          </div>
        )}

        <div className="modal-body" style={{ padding: "20px", overflowY: "auto", flex: "1 1 auto" }}>
          {/* 1. Dataset Selection Cards */}
          <div className="form-group" style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: "8px", fontSize: "13px" }}>
              Select Dataset to Export *
            </label>
            <div style={{ display: "grid", gridTemplateColumns: isAdmin ? "repeat(3, 1fr)" : "repeat(2, 1fr)", gap: "10px" }}>
              <button
                type="button"
                className={`kpi-card ${dataset === "items" ? "active" : ""}`}
                style={{
                  textAlign: "left",
                  padding: "12px",
                  cursor: "pointer",
                  borderRadius: "8px",
                  border: dataset === "items" ? "2px solid var(--primary, #10b981)" : "1px solid var(--border)",
                  background: dataset === "items" ? "rgba(16, 185, 129, 0.12)" : "var(--surface)",
                  color: "var(--text-main)",
                }}
                onClick={() => setDataset("items")}
              >
                <div style={{ fontSize: "16px", marginBottom: "4px" }}>📦</div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-main)" }}>Items Registry</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Lost &amp; found reports</div>
              </button>

              <button
                type="button"
                className={`kpi-card ${dataset === "claims" ? "active" : ""}`}
                style={{
                  textAlign: "left",
                  padding: "12px",
                  cursor: "pointer",
                  borderRadius: "8px",
                  border: dataset === "claims" ? "2px solid var(--primary, #10b981)" : "1px solid var(--border)",
                  background: dataset === "claims" ? "rgba(16, 185, 129, 0.12)" : "var(--surface)",
                  color: "var(--text-main)",
                }}
                onClick={() => setDataset("claims")}
              >
                <div style={{ fontSize: "16px", marginBottom: "4px" }}>📋</div>
                <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-main)" }}>Claims &amp; Handovers</div>
                <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>Ownership verifications</div>
              </button>

              {isAdmin && (
                <button
                  type="button"
                  className={`kpi-card ${dataset === "audit" ? "active" : ""}`}
                  style={{
                    textAlign: "left",
                    padding: "12px",
                    cursor: "pointer",
                    borderRadius: "8px",
                    border: dataset === "audit" ? "2px solid var(--primary, #10b981)" : "1px solid var(--border)",
                    background: dataset === "audit" ? "rgba(16, 185, 129, 0.12)" : "var(--surface)",
                    color: "var(--text-main)",
                  }}
                  onClick={() => setDataset("audit")}
                >
                  <div style={{ fontSize: "16px", marginBottom: "4px" }}>🛡️</div>
                  <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-main)" }}>Audit Ledger</div>
                  <div style={{ fontSize: "11px", color: "var(--text-muted)" }}>PostgreSQL activity logs</div>
                </button>
              )}
            </div>
          </div>

          {/* 2. Date Range Filter */}
          <div className="form-group" style={{ marginBottom: "18px" }}>
            <label style={{ display: "block", fontWeight: 700, marginBottom: "8px", fontSize: "13px" }}>
              Date Range Scope
            </label>
            <div style={{ display: "flex", flexWrap: "wrap", gap: "6px", marginBottom: "10px" }}>
              {[
                { id: "all", label: "All Time" },
                { id: "today", label: "Today" },
                { id: "7days", label: "Last 7 Days" },
                { id: "30days", label: "Last 30 Days" },
                { id: "thisMonth", label: "This Month" },
                { id: "custom", label: "Custom Range" },
              ].map((preset) => (
                <button
                  key={preset.id}
                  type="button"
                  className={`btn btn-sm ${datePreset === preset.id ? "btn-primary" : "btn-secondary"}`}
                  style={{ fontSize: "12px", padding: "4px 10px" }}
                  onClick={() => setDatePreset(preset.id)}
                >
                  {preset.label}
                </button>
              ))}
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px" }}>
              <div>
                <label htmlFor="export-start-date" style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  Start Date (From)
                </label>
                <input
                  id="export-start-date"
                  type="date"
                  className="form-control"
                  style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-main)" }}
                  value={startDate}
                  onChange={(e) => {
                    setStartDate(e.target.value);
                    setDatePreset("custom");
                  }}
                />
              </div>

              <div>
                <label htmlFor="export-end-date" style={{ display: "block", fontSize: "11px", color: "var(--text-muted)", marginBottom: "3px" }}>
                  End Date (To)
                </label>
                <input
                  id="export-end-date"
                  type="date"
                  className="form-control"
                  style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-main)" }}
                  value={endDate}
                  onChange={(e) => {
                    setEndDate(e.target.value);
                    setDatePreset("custom");
                  }}
                />
              </div>
            </div>
          </div>

          {/* 3. Dataset-Specific Filter Controls */}
          {dataset === "items" && (
            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "12px", marginBottom: "18px" }}>
              <div>
                <label htmlFor="export-item-type" style={{ display: "block", fontWeight: 700, fontSize: "12px", marginBottom: "4px" }}>
                  Item Report Type
                </label>
                <select
                  id="export-item-type"
                  className="form-control"
                  style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-main)" }}
                  value={itemType}
                  onChange={(e) => setItemType(e.target.value)}
                >
                  <option value="all">All Types (Lost &amp; Found)</option>
                  <option value="lost">Lost Reports Only</option>
                  <option value="found">Found Submissions Only</option>
                </select>
              </div>

              <div>
                <label htmlFor="export-item-status" style={{ display: "block", fontWeight: 700, fontSize: "12px", marginBottom: "4px" }}>
                  Report Status
                </label>
                <select
                  id="export-item-status"
                  className="form-control"
                  style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-main)" }}
                  value={itemStatus}
                  onChange={(e) => setItemStatus(e.target.value)}
                >
                  <option value="all">All Statuses</option>
                  <option value="reported">Reported / Open</option>
                  <option value="under_review">Under Review / Matched</option>
                  <option value="found">Found / Ready</option>
                  <option value="claimed">Claimed</option>
                  <option value="handed_over">Handed Over / Resolved</option>
                  <option value="closed">Closed / Archived</option>
                </select>
              </div>
            </div>
          )}

          {dataset === "claims" && (
            <div style={{ marginBottom: "18px" }}>
              <label htmlFor="export-claim-status" style={{ display: "block", fontWeight: 700, fontSize: "12px", marginBottom: "4px" }}>
                Claim Lifecycle Status
              </label>
              <select
                id="export-claim-status"
                className="form-control"
                style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-main)" }}
                value={claimStatus}
                onChange={(e) => setClaimStatus(e.target.value)}
              >
                <option value="all">All Claims (Any status)</option>
                <option value="pending">Pending Verifier Review</option>
                <option value="approved">Approved (Awaiting Collection)</option>
                <option value="claimed">Claimed (Handover Complete)</option>
                <option value="rejected">Rejected Claims</option>
              </select>
            </div>
          )}

          {dataset === "audit" && (
            <div style={{ marginBottom: "18px" }}>
              <label htmlFor="export-audit-action" style={{ display: "block", fontWeight: 700, fontSize: "12px", marginBottom: "4px" }}>
                Audit Action Filter
              </label>
              <select
                id="export-audit-action"
                className="form-control"
                style={{ width: "100%", padding: "7px 10px", fontSize: "13px", borderRadius: "6px", border: "1px solid var(--border)", background: "var(--surface)", color: "var(--text-main)" }}
                value={auditAction}
                onChange={(e) => setAuditAction(e.target.value)}
              >
                <option value="all">All Operational Actions</option>
                <option value="CREATE">CREATE (New reports, accounts, claims)</option>
                <option value="UPDATE">UPDATE (Status changes, edits, profile updates)</option>
                <option value="DELETE">DELETE (Record removals)</option>
                <option value="AUTH">AUTH (Logins, password resets, tokens)</option>
                <option value="SYSTEM">SYSTEM (Automated database maintenance)</option>
              </select>
            </div>
          )}
        </div>

        {/* Modal Footer */}
        <footer
          className="modal-footer"
          style={{
            display: "flex",
            flexWrap: "wrap",
            justifyContent: "space-between",
            alignItems: "center",
            gap: "10px",
            padding: "14px 20px",
            borderTop: "1px solid var(--border)",
            background: "var(--surface-alt)",
            flexShrink: 0,
          }}
        >
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Cancel
          </button>

          <div style={{ display: "flex", gap: "8px", flexWrap: "wrap" }}>
            <button
              type="button"
              className="btn btn-secondary"
              onClick={handlePrintSummary}
              title="Open printable summary view with institutional header"
            >
              🖨️ Printable Summary
            </button>

            <button
              type="button"
              className="btn btn-primary"
              onClick={handleDownloadCsv}
              disabled={downloading}
            >
              {downloading ? "Generating..." : "📥 Download CSV Spreadsheet"}
            </button>
          </div>
        </footer>
      </div>
    </div>
  );
}

