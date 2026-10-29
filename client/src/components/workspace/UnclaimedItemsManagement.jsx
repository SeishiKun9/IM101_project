import React, { useState, useEffect, useCallback } from "react";
import { apiRequest } from "../../api/client.js";
import { formatLocation } from "../../utils/location.js";

export default function UnclaimedItemsManagement({ onActionCompleted }) {
  const [threshold, setThreshold] = useState(30);
  const [viewMode, setViewMode] = useState("unclaimed"); // "unclaimed" | "history"
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");
  const [data, setData] = useState({
    metrics: { count30: 0, count60: 0, count90: 0, countDisposed: 0 },
    items: [],
  });
  const [historyItems, setHistoryItems] = useState([]);

  // Disposition Action Modal State
  const [activeItem, setActiveItem] = useState(null);
  const [actionType, setActionType] = useState(null); // "donate" | "dispose" | "extend"
  const [actionNotes, setActionNotes] = useState("");
  const [submittingAction, setSubmittingAction] = useState(false);

  const fetchUnclaimed = useCallback(async () => {
    setLoading(true);
    setError("");
    try {
      const res = await apiRequest(`/admin/items/unclaimed?threshold=${threshold}`);
      setData(res || { metrics: {}, items: [] });
    } catch (err) {
      setError(err.message || "Failed to load unclaimed items.");
    } finally {
      setLoading(false);
    }
  }, [threshold]);

  const fetchHistory = useCallback(async () => {
    setLoading(true);
    try {
      const res = await apiRequest("/admin/items/disposition-history");
      setHistoryItems(Array.isArray(res) ? res : []);
    } catch (err) {
      setError(err.message || "Failed to load disposition history.");
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (viewMode === "unclaimed") {
      fetchUnclaimed();
    } else {
      fetchHistory();
    }
  }, [viewMode, fetchUnclaimed, fetchHistory]);

  function handleOpenAction(item, type) {
    setActiveItem(item);
    setActionType(type);
    if (type === "donate") {
      setActionNotes("Donated to HNU Community Outreach & Student Welfare Drive");
    } else if (type === "dispose") {
      setActionNotes("Disposed / Recycled under university sanitation protocol");
    } else {
      setActionNotes("+30 days retention extension granted by CSA staff");
    }
  }

  function handleCloseAction() {
    setActiveItem(null);
    setActionType(null);
    setActionNotes("");
  }

  async function handleSubmitAction(e) {
    e.preventDefault();
    if (!activeItem || !actionType) return;

    setSubmittingAction(true);
    setError("");

    try {
      const res = await apiRequest(`/admin/items/${activeItem.id}/disposition`, {
        method: "POST",
        body: {
          action: actionType,
          notes: actionNotes,
        },
      });

      setSuccessMsg(res.message || "Item disposition recorded successfully.");
      setTimeout(() => setSuccessMsg(""), 5000);
      handleCloseAction();
      fetchUnclaimed();
      onActionCompleted?.();
    } catch (err) {
      setError(err.message || "Failed to process item disposition.");
    } finally {
      setSubmittingAction(false);
    }
  }

  return (
    <section className="workspace-panel unclaimed-items-panel" aria-label="Unclaimed Items Management">
      {/* Panel Header */}
      <div className="panel-header" style={{ marginBottom: "1.25rem" }}>
        <div>
          <div className="panel-badge-tag">STATUTORY CUSTODY MANAGEMENT</div>
          <h2 className="panel-title">Unclaimed Found Items &amp; Expiry Policy</h2>
          <p className="panel-subtitle">
            Holy Name University Lost &amp; Found Policy mandates review of items remaining in CSA custody past the 30, 60, or 90-day retention periods.
          </p>
        </div>

        <div style={{ display: "flex", gap: "0.5rem", alignItems: "center" }}>
          <div className="btn-group">
            <button
              type="button"
              className={`btn btn-sm ${viewMode === "unclaimed" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setViewMode("unclaimed")}
            >
              📦 Unclaimed Queue ({data.items.length})
            </button>
            <button
              type="button"
              className={`btn btn-sm ${viewMode === "history" ? "btn-primary" : "btn-secondary"}`}
              onClick={() => setViewMode("history")}
            >
              📜 Disposition History
            </button>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={viewMode === "unclaimed" ? fetchUnclaimed : fetchHistory}
            disabled={loading}
          >
            ↻ Refresh
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="workspace-kpi-row" style={{ marginBottom: "1.5rem" }}>
        <div
          className={`kpi-card clickable ${threshold === 30 && viewMode === "unclaimed" ? "active" : ""}`}
          onClick={() => {
            setViewMode("unclaimed");
            setThreshold(30);
          }}
        >
          <span className="kpi-label">Retention &ge; 30 Days</span>
          <span className="kpi-value" style={{ color: "#f59e0b" }}>
            {data.metrics.count30 || 0}
          </span>
          <span className="kpi-hint">Initial expiry warning</span>
        </div>

        <div
          className={`kpi-card clickable ${threshold === 60 && viewMode === "unclaimed" ? "active" : ""}`}
          onClick={() => {
            setViewMode("unclaimed");
            setThreshold(60);
          }}
        >
          <span className="kpi-label">Retention &ge; 60 Days</span>
          <span className="kpi-value" style={{ color: "#ea580c" }}>
            {data.metrics.count60 || 0}
          </span>
          <span className="kpi-hint">High priority disposition</span>
        </div>

        <div
          className={`kpi-card clickable ${threshold === 90 && viewMode === "unclaimed" ? "active" : ""}`}
          onClick={() => {
            setViewMode("unclaimed");
            setThreshold(90);
          }}
        >
          <span className="kpi-label">Statutory Limit &ge; 90 Days</span>
          <span className="kpi-value" style={{ color: "#dc2626" }}>
            {data.metrics.count90 || 0}
          </span>
          <span className="kpi-hint">Eligible for donation / disposal</span>
        </div>

        <div
          className={`kpi-card clickable ${viewMode === "history" ? "active" : ""}`}
          onClick={() => setViewMode("history")}
        >
          <span className="kpi-label">Donated &amp; Disposed</span>
          <span className="kpi-value" style={{ color: "#10b981" }}>
            {data.metrics.countDisposed || 0}
          </span>
          <span className="kpi-hint">Completed dispositions</span>
        </div>
      </div>

      {/* Alerts */}
      {error && (
        <div className="alert alert-danger" style={{ marginBottom: "1rem" }}>
          ⚠️ {error}
        </div>
      )}
      {successMsg && (
        <div className="alert alert-success" style={{ marginBottom: "1rem" }}>
          ✓ {successMsg}
        </div>
      )}

      {/* Threshold Filter Bar for Unclaimed View */}
      {viewMode === "unclaimed" && (
        <div
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            padding: "10px 16px",
            background: "var(--surface-alt)",
            borderRadius: "8px",
            marginBottom: "1rem",
            border: "1px solid var(--border)",
          }}
        >
          <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
            <span style={{ fontSize: "12px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
              Filter by Storage Age:
            </span>
            <div className="btn-group">
              <button
                type="button"
                className={`btn btn-sm ${threshold === 30 ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setThreshold(30)}
              >
                30+ Days Old
              </button>
              <button
                type="button"
                className={`btn btn-sm ${threshold === 60 ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setThreshold(60)}
              >
                60+ Days Old
              </button>
              <button
                type="button"
                className={`btn btn-sm ${threshold === 90 ? "btn-primary" : "btn-secondary"}`}
                onClick={() => setThreshold(90)}
              >
                90+ Days Old
              </button>
            </div>
          </div>

          <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
            Showing {data.items.length} unclaimed item{data.items.length === 1 ? "" : "s"}
          </span>
        </div>
      )}

      {/* Table Data */}
      {loading ? (
        <div className="loading-state" style={{ padding: "40px", textAlign: "center" }}>
          <p>Querying custody records...</p>
        </div>
      ) : viewMode === "unclaimed" ? (
        data.items.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px", textAlign: "center" }}>
            <h3>No unclaimed items exceeding {threshold} days</h3>
            <p style={{ color: "var(--text-muted)" }}>
              All found items currently in custody are within the university active retention period.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th style={{ width: "60px" }}>Item</th>
                  <th>Item Details</th>
                  <th>Location Found</th>
                  <th>Date Reported</th>
                  <th>Days Unclaimed</th>
                  <th style={{ textAlign: "right" }}>Disposition Actions</th>
                </tr>
              </thead>
              <tbody>
                {data.items.map((item) => {
                  const days = item.daysUnclaimed || 0;
                  const isCritical = days >= 90;
                  const isHigh = days >= 60;

                  return (
                    <tr key={item.id}>
                      <td>
                        {item.image ? (
                          <img
                            src={item.image}
                            alt={item.title}
                            style={{
                              width: "48px",
                              height: "48px",
                              objectFit: "cover",
                              borderRadius: "6px",
                              border: "1px solid var(--border)",
                            }}
                          />
                        ) : (
                          <div
                            style={{
                              width: "48px",
                              height: "48px",
                              borderRadius: "6px",
                              background: "var(--surface-alt)",
                              border: "1px solid var(--border)",
                              display: "flex",
                              alignItems: "center",
                              justifyContent: "center",
                              fontSize: "20px",
                            }}
                          >
                            📦
                          </div>
                        )}
                      </td>
                      <td>
                        <div style={{ fontWeight: 700, fontSize: "14px" }}>
                          #{item.id} · {item.title}
                        </div>
                        <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                          {item.category || "Uncategorized"} · Finder: {item.finderName || item.reporterName || "Anonymous"}
                        </div>
                        {item.dispositionType === "extended" && (
                          <span
                            className="status-badge status-blue"
                            style={{ marginTop: "4px", display: "inline-block", fontSize: "11px" }}
                          >
                            ⏳ Retention Extended
                          </span>
                        )}
                      </td>
                      <td>
                        <span style={{ fontSize: "13px" }}>{formatLocation(item)}</span>
                      </td>
                      <td>
                        <span style={{ fontSize: "13px" }}>{item.date || "Unknown"}</span>
                      </td>
                      <td>
                        <span
                          className={`status-badge ${
                            isCritical
                              ? "status-red"
                              : isHigh
                                ? "status-amber"
                                : "status-blue"
                          }`}
                          style={{ fontWeight: 700 }}
                        >
                          {days} days in storage
                        </span>
                      </td>
                      <td style={{ textAlign: "right" }}>
                        <div style={{ display: "flex", gap: "6px", justifyContent: "flex-end" }}>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "12px" }}
                            onClick={() => handleOpenAction(item, "extend")}
                            title="Extend retention period by 30 days"
                          >
                            ⏳ Extend
                          </button>
                          <button
                            type="button"
                            className="btn btn-secondary btn-sm"
                            style={{ fontSize: "12px", color: "var(--accent-emerald, #10b981)" }}
                            onClick={() => handleOpenAction(item, "donate")}
                            title="Mark item for university charity donation"
                          >
                            🎁 Donate
                          </button>
                          <button
                            type="button"
                            className="btn btn-danger btn-sm"
                            style={{ fontSize: "12px" }}
                            onClick={() => handleOpenAction(item, "dispose")}
                            title="Mark item for safe university disposal/recycling"
                          >
                            🗑️ Dispose
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )
      ) : (
        /* History View */
        historyItems.length === 0 ? (
          <div className="empty-state" style={{ padding: "40px", textAlign: "center" }}>
            <h3>No disposition records found</h3>
            <p style={{ color: "var(--text-muted)" }}>
              No items have been marked for donation or disposal yet.
            </p>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="workspace-table">
              <thead>
                <tr>
                  <th>Item</th>
                  <th>Disposition Action</th>
                  <th>Date Processed</th>
                  <th>Processed By</th>
                  <th>Documentation Notes</th>
                </tr>
              </thead>
              <tbody>
                {historyItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <div style={{ fontWeight: 700 }}>
                        #{item.id} · {item.title}
                      </div>
                      <div style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {item.category} · {item.building || "Campus Area"}
                      </div>
                    </td>
                    <td>
                      <span
                        className={`status-badge ${
                          item.dispositionType === "donated" ? "status-success" : "status-amber"
                        }`}
                        style={{ textTransform: "uppercase", fontWeight: 700 }}
                      >
                        {item.dispositionType === "donated" ? "🎁 Donated" : "🗑️ Disposed"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "13px" }}>
                        {item.dispositionDate ? new Date(item.dispositionDate).toISOString().slice(0, 10) : "N/A"}
                      </span>
                    </td>
                    <td>
                      <span style={{ fontSize: "13px" }}>{item.dispositionByName || "Authorized Staff"}</span>
                    </td>
                    <td>
                      <span style={{ fontSize: "12px", color: "var(--text-muted)" }}>
                        {item.dispositionNotes || "No notes"}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      )}

      {/* Disposition Action Confirmation Modal */}
      {activeItem && actionType && (
        <div
          className="modal-backdrop modal-overlay"
          role="dialog"
          aria-modal="true"
          onClick={handleCloseAction}
        >
          <div
            className="modal"
            style={{ maxWidth: "520px", width: "95%" }}
            onClick={(e) => e.stopPropagation()}
          >
            <header className="modal-header">
              <div>
                <div className="modal-header-tag">CUSTODY DISPOSITION POLICY</div>
                <h3 className="modal-title" style={{ fontSize: "18px" }}>
                  {actionType === "donate"
                    ? "🎁 Confirm Charity Donation"
                    : actionType === "dispose"
                      ? "🗑️ Confirm Item Disposal / Recycling"
                      : "⏳ Extend Storage Retention"}
                </h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={handleCloseAction}
                aria-label="Close dialog"
              >
                ×
              </button>
            </header>

            <form onSubmit={handleSubmitAction}>
              <div className="modal-body" style={{ padding: "20px" }}>
                <div
                  style={{
                    padding: "12px 16px",
                    borderRadius: "8px",
                    background: "var(--surface-alt)",
                    border: "1px solid var(--border)",
                    marginBottom: "16px",
                  }}
                >
                  <div style={{ fontWeight: 700, fontSize: "14px" }}>
                    #{activeItem.id} · {activeItem.title}
                  </div>
                  <div style={{ fontSize: "12px", color: "var(--text-muted)", marginTop: "2px" }}>
                    Reported on: {activeItem.date} · Storage Duration: <strong>{activeItem.daysUnclaimed} days</strong>
                  </div>
                </div>

                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "14px" }}>
                  {actionType === "donate"
                    ? "This found item will be removed from the active public registry and documented as donated for university social welfare or student charity."
                    : actionType === "dispose"
                      ? "This found item will be archived and safely disposed or recycled according to campus safety and waste regulations."
                      : "Extending retention keeps the item in the active custody registry for an additional period while verifiers attempt to contact the owner."}
                </p>

                <div className="form-group">
                  <label htmlFor="disposition-notes" style={{ display: "block", fontWeight: 700, fontSize: "12px", marginBottom: "4px" }}>
                    Administrative &amp; Documentation Notes *
                  </label>
                  <textarea
                    id="disposition-notes"
                    className="form-control"
                    rows="3"
                    required
                    style={{ width: "100%", padding: "8px 12px", fontSize: "13px", borderRadius: "6px" }}
                    value={actionNotes}
                    onChange={(e) => setActionNotes(e.target.value)}
                    placeholder="Enter recipient charity, disposal method, or extension rationale..."
                  />
                </div>
              </div>

              <footer
                className="modal-footer"
                style={{
                  display: "flex",
                  justifyContent: "flex-end",
                  gap: "8px",
                  padding: "14px 20px",
                  borderTop: "1px solid var(--border)",
                }}
              >
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleCloseAction}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className={`btn btn-sm ${actionType === "dispose" ? "btn-danger" : "btn-primary"}`}
                  disabled={submittingAction}
                >
                  {submittingAction
                    ? "Processing..."
                    : actionType === "donate"
                      ? "Confirm Donation"
                      : actionType === "dispose"
                        ? "Confirm Disposal"
                        : "Apply Extension"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </section>
  );
}

