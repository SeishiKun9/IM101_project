import React, { useEffect, useState, useMemo } from "react";
import { apiRequest } from "../../api/client.js";

export default function AuditDetailModal({ log, logs = [], onSelectLog, onClose }) {
  const [activeTab, setActiveTab] = useState("visual"); // "visual" | "snapshots" | "raw"
  const [copyNotice, setCopyNotice] = useState("");
  const [detailedLog, setDetailedLog] = useState(log);

  useEffect(() => {
    setDetailedLog(log);
    if (!log?.id) return;
    let active = true;
    apiRequest(`/admin/audit-logs/${log.id}`)
      .then((fullData) => {
        if (active && fullData && fullData.id) {
          setDetailedLog((prev) => ({ ...prev, ...fullData }));
        }
      })
      .catch((err) => {
        console.warn("Could not fetch extra audit log detail:", err.message);
      });
    return () => {
      active = false;
    };
  }, [log?.id]);

  const currentLog = detailedLog || log;

  const currentIndex = useMemo(() => {
    if (!currentLog || !logs.length) return -1;
    return logs.findIndex((item) => String(item.id) === String(currentLog.id));
  }, [currentLog, logs]);

  const hasPrev = currentIndex > 0;
  const hasNext = currentIndex >= 0 && currentIndex < logs.length - 1;

  useEffect(() => {
    function handleKeyDown(event) {
      if (event.key === "Escape") {
        onClose();
      } else if (event.key === "ArrowLeft" && hasPrev && onSelectLog) {
        onSelectLog(logs[currentIndex - 1]);
      } else if (event.key === "ArrowRight" && hasNext && onSelectLog) {
        onSelectLog(logs[currentIndex + 1]);
      }
    }
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose, onSelectLog, logs, currentIndex, hasPrev, hasNext]);

  if (!currentLog) return null;


  function safeParseJson(val) {
    if (!val) return null;
    if (typeof val === "object") return val;
    if (typeof val === "string") {
      try {
        const parsed = JSON.parse(val);
        if (typeof parsed === "object" && parsed !== null) return parsed;
      } catch {
        return { raw: val };
      }
    }
    return { value: val };
  }

  const oldValues = safeParseJson(currentLog.oldValues || currentLog.old_values);
  const newValues = safeParseJson(currentLog.newValues || currentLog.new_values);
  const changedFieldsRaw = currentLog.changedFields || currentLog.changed_fields || [];
  const status = (currentLog.status || "SUCCESS").toUpperCase();
  const action = (currentLog.action || "OPERATION").toUpperCase();



  // Normalize changed fields to an array of string keys
  const changedFieldKeys = useMemo(() => {
    if (Array.isArray(changedFieldsRaw)) return changedFieldsRaw;
    if (typeof changedFieldsRaw === "object" && changedFieldsRaw !== null) {
      return Object.keys(changedFieldsRaw);
    }
    return [];
  }, [changedFieldsRaw]);

  // Compute key-by-key comparison table for visual tab
  const fieldDiffs = useMemo(() => {
    const keys = new Set([
      ...Object.keys(oldValues || {}),
      ...Object.keys(newValues || {}),
    ]);

    const rows = [];
    keys.forEach((key) => {
      const oldVal = oldValues?.[key];
      const newVal = newValues?.[key];
      const hasOld = oldValues && key in oldValues;
      const hasNew = newValues && key in newValues;

      let changeType = "unchanged";
      if (!hasOld && hasNew) changeType = "added";
      else if (hasOld && !hasNew) changeType = "removed";
      else if (JSON.stringify(oldVal) !== JSON.stringify(newVal)) changeType = "modified";

      rows.push({
        key,
        oldVal: hasOld ? oldVal : undefined,
        newVal: hasNew ? newVal : undefined,
        changeType,
      });
    });

    // Sort by modified/added/removed first, then alphabetical
    return rows.sort((a, b) => {
      const score = (t) => (t === "modified" ? 3 : t === "added" ? 2 : t === "removed" ? 1 : 0);
      return score(b.changeType) - score(a.changeType) || a.key.localeCompare(b.key);
    });
  }, [oldValues, newValues]);

  function copyToClipboard(text, label) {
    navigator.clipboard.writeText(text);
    setCopyNotice(label);
    setTimeout(() => setCopyNotice(""), 2000);
  }

  function getActionBadgeClass(act) {
    switch (act) {
      case "CREATE":
        return "audit-badge-create";
      case "UPDATE":
        return "audit-badge-update";
      case "DELETE":
        return "audit-badge-delete";
      case "APPROVE":
        return "audit-badge-approve";
      case "REJECT":
        return "audit-badge-reject";
      case "LOGIN":
      case "LOGOUT":
        return "audit-badge-auth";
      default:
        return "audit-badge-default";
    }
  }

  function getRoleBadgeClass(role) {
    switch (role?.toLowerCase()) {
      case "admin":
        return "role-badge-admin";
      case "staff":
      case "verifier":
        return "role-badge-verifier";
      case "student":
        return "role-badge-student";
      default:
        return "role-badge-system";
    }
  }

  function getEntityIcon(type) {
    switch (type) {
      case "campus_logo":
        return "🏫";
      case "campus_map":
      case "campus_maps":
        return "🗺️";
      case "items":
      case "lost_item":
      case "found_item":
        return "🎒";
      case "claim":
      case "claims":
        return "🤝";
      case "users":
      case "user":
        return "👤";
      case "auth":
      case "session":
        return "🔐";
      case "buildings":
      case "floors":
      case "rooms":
      case "locations":
        return "🏢";
      default:
        return "📦";
    }
  }

  function formatValue(val) {
    if (val === undefined) return <span className="diff-val-none">—</span>;
    if (val === null) return <span className="diff-val-null">null</span>;
    if (typeof val === "boolean") return <span className="diff-val-bool">{String(val)}</span>;
    if (typeof val === "object") return <code className="diff-val-json">{JSON.stringify(val)}</code>;
    return String(val);
  }

  return (
    <div
      className="modal-backdrop modal-overlay"
      role="dialog"
      aria-modal="true"
      aria-labelledby="audit-modal-title"
      onClick={onClose}
    >
      <div
        className="modal audit-detail-modal"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header with Title and Record Navigator */}
        <header className="modal-header audit-modal-header">
          <div className="audit-modal-title-group">
            <span className={`audit-badge ${getActionBadgeClass(action)}`}>
              {action}
            </span>
            <span
              className={`status-pill ${
                status === "SUCCESS" ? "status-success" : "status-danger"
              }`}
            >
              {status}
            </span>
            <h2 id="audit-modal-title" className="modal-title">
              Audit Inspector #{currentLog.id}
            </h2>
          </div>

          <div className="audit-modal-nav-actions">
            {onSelectLog && logs.length > 1 && (
              <div className="audit-record-stepper">
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => onSelectLog(logs[currentIndex - 1])}
                  disabled={!hasPrev}
                  type="button"
                  title="Previous record (Left Arrow)"
                >
                  ◀ Prev
                </button>
                <span className="audit-record-counter">
                  {currentIndex + 1} / {logs.length}
                </span>
                <button
                  className="btn btn-secondary btn-xs"
                  onClick={() => onSelectLog(logs[currentIndex + 1])}
                  disabled={!hasNext}
                  type="button"
                  title="Next record (Right Arrow)"
                >
                  Next ▶
                </button>
              </div>
            )}
            <button
              className="modal-close"
              onClick={onClose}
              type="button"
              aria-label="Close audit details"
            >
              ×
            </button>
          </div>
        </header>

        <div className="modal-body audit-modal-body">
          {/* Metadata Cards Grid */}
          <div className="audit-meta-grid">
            <div className="audit-meta-card">
              <span className="audit-meta-label">Actor</span>
              <div className="audit-meta-actor">
                <strong className="actor-username">
                  {currentLog.actorUsername || currentLog.actor_username || "system"}
                </strong>
                <span
                  className={`audit-role-pill ${getRoleBadgeClass(
                    currentLog.actorRole || currentLog.actor_role,
                  )}`}
                >
                  {currentLog.actorRole || currentLog.actor_role || "system"}
                </span>
              </div>
              <small className="audit-meta-sub">
                User ID: {currentLog.actorUserId ?? currentLog.actor_user_id ?? "N/A (System)"}
              </small>
            </div>

            <div className="audit-meta-card">
              <span className="audit-meta-label">Resource Target</span>
              <div className="audit-target-entity">
                <span className="entity-type-tag">
                  {getEntityIcon(currentLog.entityType || currentLog.entity_type)}{" "}
                  {currentLog.entityType || currentLog.entity_type}
                </span>
                <strong className="entity-id-tag">
                  #{currentLog.entityId ?? currentLog.entity_id ?? "N/A"}
                </strong>
              </div>
              <small className="audit-meta-sub">
                Record ID: {currentLog.entityId ?? currentLog.entity_id ?? "N/A"}
              </small>
            </div>

            <div className="audit-meta-card">
              <span className="audit-meta-label">Timestamp</span>
              <div className="audit-meta-time">
                {new Date(currentLog.createdAt || currentLog.created_at).toLocaleTimeString([], {
                  hour: "2-digit",
                  minute: "2-digit",
                  second: "2-digit",
                })}
              </div>
              <small className="audit-meta-sub">
                {new Date(currentLog.createdAt || currentLog.created_at).toLocaleString()}
              </small>
            </div>

            <div className="audit-meta-card">
              <span className="audit-meta-label">Client Network Context</span>
              <div className="audit-client-info">
                <span>🌐 {currentLog.ipAddress || currentLog.ip_address || "127.0.0.1"}</span>
              </div>
              <small
                className="audit-meta-sub text-truncate"
                title={currentLog.userAgent || currentLog.user_agent || "Direct / Server Client"}
              >
                {currentLog.userAgent || currentLog.user_agent || "Direct Server / DB Trigger"}
              </small>
            </div>
          </div>

          {/* Description Box */}
          <div className="audit-description-box">
            <span className="audit-meta-label">Event Description</span>
            <p className="audit-description-text">{currentLog.description}</p>
          </div>

          {/* Modified Field Badges */}
          {changedFieldKeys.length > 0 && (
            <div className="audit-changed-fields-box">
              <span className="audit-meta-label">Changed Properties:</span>
              <div className="changed-fields-tags">
                {changedFieldKeys.map((field) => (
                  <span className="changed-field-pill" key={field}>
                    ✦ {field}
                  </span>
                ))}
              </div>
            </div>
          )}

          {/* Inspection View Tabs */}
          <div className="audit-tabs-container">
            <div className="audit-nav-tabs">
              <button
                className={`audit-tab-btn ${activeTab === "visual" ? "active" : ""}`}
                onClick={() => setActiveTab("visual")}
                type="button"
              >
                🔍 Visual Field Diff ({fieldDiffs.filter((d) => d.changeType !== "unchanged").length} modified)
              </button>
              <button
                className={`audit-tab-btn ${activeTab === "snapshots" ? "active" : ""}`}
                onClick={() => setActiveTab("snapshots")}
                type="button"
              >
                📜 Side-by-Side Snapshots
              </button>
              <button
                className={`audit-tab-btn ${activeTab === "raw" ? "active" : ""}`}
                onClick={() => setActiveTab("raw")}
                type="button"
              >
                📋 Raw Event JSON
              </button>
            </div>

            <div className="audit-tab-toolbar">
              {copyNotice && <span className="copy-notice-badge">✓ {copyNotice}</span>}
              <button
                className="btn btn-secondary btn-xs"
                onClick={() =>
                  copyToClipboard(
                    JSON.stringify(
                      {
                        id: log.id,
                        action,
                        actor: log.actorUsername || log.actor_username,
                        role: log.actorRole || log.actor_role,
                        entityType: log.entityType || log.entity_type,
                        entityId: log.entityId || log.entity_id,
                        description: log.description,
                        oldValues,
                        newValues,
                      },
                      null,
                      2
                    ),
                    "Full Audit Event Copied!"
                  )
                }
                type="button"
              >
                Copy JSON
              </button>
            </div>
          </div>

          {/* TAB 1: Visual Field Diff Table */}
          {activeTab === "visual" && (
            <div className="audit-diff-view">
              {fieldDiffs.length === 0 ? (
                <div className="snapshot-empty-hint">
                  No state values recorded for this operational event.
                </div>
              ) : (
                <div className="diff-table-wrapper">
                  <table className="diff-table">
                    <thead>
                      <tr>
                        <th style={{ width: "25%" }}>Field / Property</th>
                        <th style={{ width: "35%" }}>Prior Value (Before)</th>
                        <th style={{ width: "35%" }}>New Value (After)</th>
                        <th style={{ width: "10%" }}>Change</th>
                      </tr>
                    </thead>
                    <tbody>
                      {fieldDiffs.map(({ key, oldVal, newVal, changeType }) => (
                        <tr
                          key={key}
                          className={`diff-row diff-row-${changeType}`}
                        >
                          <td className="diff-cell-key">
                            <code>{key}</code>
                          </td>
                          <td className={`diff-cell-val ${changeType === "removed" || changeType === "modified" ? "diff-old-changed" : ""}`}>
                            {formatValue(oldVal)}
                          </td>
                          <td className={`diff-cell-val ${changeType === "added" || changeType === "modified" ? "diff-new-changed" : ""}`}>
                            {formatValue(newVal)}
                          </td>
                          <td className="diff-cell-type">
                            <span className={`diff-type-badge diff-type-${changeType}`}>
                              {changeType === "modified" ? "Updated" : changeType === "added" ? "Added" : changeType === "removed" ? "Removed" : "Same"}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          )}

          {/* TAB 2: Side-by-Side JSON Snapshots */}
          {activeTab === "snapshots" && (
            <div className="audit-snapshots-container">
              <div className="audit-snapshot-card">
                <div className="snapshot-header snapshot-header-old">
                  <span className="snapshot-title">Previous State (Before)</span>
                  <div className="snapshot-header-actions">
                    {oldValues ? (
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => copyToClipboard(JSON.stringify(oldValues, null, 2), "Old Values Copied!")}
                        type="button"
                      >
                        Copy
                      </button>
                    ) : null}
                    <span className={`snapshot-status ${oldValues ? "" : "muted"}`}>
                      {oldValues ? "Captured" : "None (New)"}
                    </span>
                  </div>
                </div>
                <div className="snapshot-content">
                  {oldValues ? (
                    <pre className="audit-code-block">
                      {JSON.stringify(oldValues, null, 2)}
                    </pre>
                  ) : (
                    <div className="snapshot-empty-hint">
                      No prior state existed before this operation.
                    </div>
                  )}
                </div>
              </div>

              <div className="audit-snapshot-card">
                <div className="snapshot-header snapshot-header-new">
                  <span className="snapshot-title">Resulting State (After)</span>
                  <div className="snapshot-header-actions">
                    {newValues ? (
                      <button
                        className="btn btn-secondary btn-xs"
                        onClick={() => copyToClipboard(JSON.stringify(newValues, null, 2), "New Values Copied!")}
                        type="button"
                      >
                        Copy
                      </button>
                    ) : null}
                    <span className={`snapshot-status ${newValues ? "" : "muted"}`}>
                      {newValues ? "Recorded" : "None (Deleted)"}
                    </span>
                  </div>
                </div>
                <div className="snapshot-content">
                  {newValues ? (
                    <pre className="audit-code-block">
                      {JSON.stringify(newValues, null, 2)}
                    </pre>
                  ) : (
                    <div className="snapshot-empty-hint">
                      Resource was permanently deleted or produced no new state.
                    </div>
                  )}
                </div>
              </div>
            </div>
          )}

          {/* TAB 3: Complete Raw Event JSON */}
          {activeTab === "raw" && (
            <div className="audit-raw-card">
              <div className="snapshot-content">
                <pre className="audit-code-block">
                  {JSON.stringify(currentLog, null, 2)}
                </pre>
              </div>
            </div>
          )}
        </div>

        <footer className="modal-footer audit-modal-footer">
          <div className="modal-footer-hint">
            <kbd>Esc</kbd> to close &nbsp;·&nbsp; <kbd>◀</kbd> <kbd>▶</kbd> to navigate records
          </div>
          <button className="btn btn-primary" onClick={onClose} type="button">
            Done
          </button>
        </footer>
      </div>
    </div>
  );
}
