import React, { useCallback, useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import AuditDetailModal from "./AuditDetailModal.jsx";

export default function AuditLogManagement() {
  const [logs, setLogs] = useState([]);
  const [pagination, setPagination] = useState({
    page: 1,
    limit: 25,
    total: 0,
    totalPages: 1,
  });
  const [overview, setOverview] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [selectedLog, setSelectedLog] = useState(null);
  const [showOverviewDetails, setShowOverviewDetails] = useState(false);

  // Filter state
  const [search, setSearch] = useState("");
  const [roleFilter, setRoleFilter] = useState("");
  const [actionFilter, setActionFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");
  const [entityFilter, setEntityFilter] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [sortOrder, setSortOrder] = useState("DESC");
  const [recoveringId, setRecoveringId] = useState(null);
  const [notice, setNotice] = useState("");

  const fetchOverview = useCallback(async () => {
    try {
      const data = await apiRequest("/admin/audit-logs/overview");
      setOverview(data);
    } catch (err) {
      console.warn("Could not load audit overview stats:", err.message);
    }
  }, []);

  const fetchLogs = useCallback(async (page = 1) => {
    setLoading(true);
    setError("");
    try {
      const queryParams = new URLSearchParams();
      queryParams.set("page", String(page));
      queryParams.set("limit", String(pagination.limit));
      queryParams.set("order", sortOrder);

      if (search.trim()) queryParams.set("search", search.trim());
      if (roleFilter) queryParams.set("role", roleFilter);
      if (actionFilter) queryParams.set("action", actionFilter);
      if (statusFilter) queryParams.set("status", statusFilter);
      if (entityFilter) queryParams.set("entity_type", entityFilter);
      if (startDate) queryParams.set("start_date", startDate);
      if (endDate) queryParams.set("end_date", endDate);

      const response = await apiRequest(`/admin/audit-logs?${queryParams.toString()}`);
      if (Array.isArray(response)) {
        setLogs(response);
        setPagination({
          page: 1,
          limit: response.length || 25,
          total: response.length,
          totalPages: 1,
        });
      } else {
        setLogs(response?.logs || []);
        setPagination(
          response?.pagination || { page: 1, limit: 25, total: 0, totalPages: 1 },
        );
      }
    } catch (err) {
      setError(err.message || "Failed to load audit logs");
    } finally {
      setLoading(false);
    }
  }, [pagination.limit, sortOrder, search, roleFilter, actionFilter, statusFilter, entityFilter, startDate, endDate]);

  useEffect(() => {
    fetchOverview();
    fetchLogs(1);
  }, [fetchOverview, fetchLogs]);

  function handleFilterSubmit(e) {
    e.preventDefault();
    fetchLogs(1);
  }

  function handleResetFilters() {
    setSearch("");
    setRoleFilter("");
    setActionFilter("");
    setStatusFilter("");
    setEntityFilter("");
    setStartDate("");
    setEndDate("");
    setSortOrder("DESC");
  }

  async function exportCsv() {
    try {
      const queryParams = new URLSearchParams();
      if (search.trim()) queryParams.set("search", search.trim());
      if (roleFilter) queryParams.set("role", roleFilter);
      if (actionFilter) queryParams.set("action", actionFilter);
      if (statusFilter) queryParams.set("status", statusFilter);
      if (entityFilter) queryParams.set("entity_type", entityFilter);
      if (startDate) queryParams.set("start_date", startDate);
      if (endDate) queryParams.set("end_date", endDate);

      const token = localStorage.getItem("campusToken");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await fetch(`/api/admin/audit-logs/export/csv?${queryParams.toString()}`, {
        credentials: "same-origin",
        headers,
      });

      if (!response.ok) {
        throw new Error("Could not generate CSV export.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message);
    }
  }

  async function handleRecover(log) {
    if (!log) return;
    const entity = log.entity_type || log.entityType || "record";
    const id = log.entity_id || log.entityId || "";
    const confirmed = window.confirm(
      `Are you sure you want to recover deleted ${entity}${id ? ` #${id}` : ""}? This will restore the record back into the database from its audit snapshot.`
    );
    if (!confirmed) return;

    setRecoveringId(log.id);
    setError("");
    setNotice("");
    try {
      const res = await apiRequest(`/admin/audit-logs/${log.id}/recover`, {
        method: "POST",
      });
      setNotice(res.message || "Record successfully recovered!");
      await fetchOverview();
      await fetchLogs(pagination.page);
    } catch (err) {
      setError(err.message || "Failed to recover deleted record.");
    } finally {
      setRecoveringId(null);
    }
  }

  function getActionBadgeClass(act) {
    switch (act?.toUpperCase()) {
      case "CREATE":
      case "RESTORE":
        return "audit-badge-create";
      case "UPDATE":
      case "REACTIVATE":
      case "DEACTIVATE":
        return "audit-badge-update";
      case "DELETE":
      case "REMOVE":
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

  const metrics = overview?.metrics || {
    total_actions: 0,
    total_success: 0,
    total_failure: 0,
    total_creates: 0,
    total_updates: 0,
    total_deletes: 0,
    active_users_count: 0,
  };

  return (
    <section className="workspace-panel audit-management-panel" aria-label="System Audit Logs">
      {/* Panel Top Header */}
      <div className="panel-header-row">
        <div>
          <div className="audit-header-badge">
            <span className="audit-shield-icon" aria-hidden="true">🛡️</span>
            <span>Immutable Security &amp; Activity Ledger</span>
          </div>
          <h2 className="panel-title">System Audit Logs &amp; Activity History</h2>
          <p className="panel-subtitle">
            Centralized PostgreSQL record of operational actions across administrators, verifiers, students, and system database triggers.
          </p>
        </div>
        <div className="audit-header-actions">
          <button
            className="btn btn-secondary btn-sm"
            onClick={exportCsv}
            type="button"
            title="Download full matching audit ledger as CSV"
          >
            📥 Export CSV
          </button>
          <button
            className="btn btn-secondary btn-sm"
            onClick={() => setShowOverviewDetails((prev) => !prev)}
            type="button"
          >
            {showOverviewDetails ? "Hide Analytics Summary" : "📊 Activity Analytics"}
          </button>
          <button
            className="btn btn-primary btn-sm"
            onClick={() => {
              fetchOverview();
              fetchLogs(pagination.page);
            }}
            disabled={loading}
            type="button"
          >
            {loading ? "Refreshing..." : "↻ Refresh Ledger"}
          </button>
        </div>
      </div>

      {/* KPI Overview Cards */}
      <div className="audit-kpi-grid">
        <div className="audit-kpi-card">
          <span className="audit-kpi-label">Total Logged Actions</span>
          <span className="audit-kpi-value">{metrics.total_actions}</span>
          <span className="audit-kpi-hint">Source: v_audit_activity_overview</span>
        </div>

        <div className="audit-kpi-card">
          <span className="audit-kpi-label">Successful Operations</span>
          <span className="audit-kpi-value text-success">{metrics.total_success}</span>
          <span className="audit-kpi-hint">Committed transactions</span>
        </div>

        <div className="audit-kpi-card">
          <span className="audit-kpi-label">Failed Attempts</span>
          <span className="audit-kpi-value text-danger">{metrics.total_failure}</span>
          <span className="audit-kpi-hint">Rejected / aborted mutations</span>
        </div>

        <div className="audit-kpi-card">
          <span className="audit-kpi-label">Records Created</span>
          <span className="audit-kpi-value text-info">{metrics.total_creates}</span>
          <span className="audit-kpi-hint">Items, maps, accounts</span>
        </div>

        <div className="audit-kpi-card">
          <span className="audit-kpi-label">Records Updated</span>
          <span className="audit-kpi-value text-warning">{metrics.total_updates}</span>
          <span className="audit-kpi-hint">Statuses, logos, profiles</span>
        </div>

        <div className="audit-kpi-card">
          <span className="audit-kpi-label">Records Deleted</span>
          <span className="audit-kpi-value text-danger">{metrics.total_deletes}</span>
          <span className="audit-kpi-hint">Historical trail preserved</span>
        </div>
      </div>

      {/* Analytics Breakdown Accordion (Overview Views) */}
      {showOverviewDetails && overview && (
        <div className="audit-analytics-panel">
          <div className="audit-analytics-grid">
            {/* User Activity Summary */}
            <div className="analytics-card">
              <h3 className="analytics-card-title">Top Active Users</h3>
              <p className="analytics-card-sub">Ranked by volume of database operations</p>
              <div className="table-responsive">
                <table className="analytics-mini-table">
                  <thead>
                    <tr>
                      <th>User</th>
                      <th>Role</th>
                      <th>Creates</th>
                      <th>Updates</th>
                      <th>Deletes</th>
                      <th>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(overview.usersSummary || []).slice(0, 6).map((u) => (
                      <tr key={u.username}>
                        <td><strong>{u.username}</strong></td>
                        <td>
                          <span className={`audit-role-pill ${getRoleBadgeClass(u.role)}`}>
                            {u.role}
                          </span>
                        </td>
                        <td>{u.creates}</td>
                        <td>{u.updates}</td>
                        <td>{u.deletes}</td>
                        <td><strong>{u.total_actions}</strong></td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </div>

            {/* Role & Entity Breakdown */}
            <div className="analytics-card">
              <h3 className="analytics-card-title">Role Distribution</h3>
              <div className="role-distribution-list">
                {(overview.rolesSummary || []).map((r) => (
                  <div className="role-distribution-row" key={r.role}>
                    <div className="role-distribution-meta">
                      <span className={`audit-role-pill ${getRoleBadgeClass(r.role)}`}>
                        {r.role}
                      </span>
                      <span className="role-distinct-users">{r.distinct_actors} distinct users</span>
                    </div>
                    <div className="role-distribution-bar-track">
                      <div
                        className="role-distribution-bar-fill"
                        style={{
                          width: `${Math.min(
                            100,
                            Math.round(
                              (Number(r.total_actions) /
                                Math.max(1, Number(metrics.total_actions))) *
                                100
                            )
                          )}%`,
                        }}
                      />
                    </div>
                    <span className="role-distribution-count">{r.total_actions} ops</span>
                  </div>
                ))}
              </div>

              <h4 className="analytics-sub-title">Resources Affected</h4>
              <div className="entity-tags-cloud">
                {(overview.entitiesSummary || []).slice(0, 8).map((e) => (
                  <span className="entity-summary-pill" key={e.entity_type}>
                    {e.entity_type}: <strong>{e.total_actions}</strong>
                  </span>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Filter and Search Bar */}
      <form className="audit-filter-bar" onSubmit={handleFilterSubmit}>
        <div className="audit-filter-row">
          <div className="audit-search-field">
            <span className="audit-search-icon">🔍</span>
            <input
              type="text"
              className="audit-input"
              placeholder="Search by username, description, or entity ID..."
              value={search}
              onChange={(e) => setSearch(e.target.value)}
            />
          </div>

          <div className="audit-select-field">
            <select
              className="audit-select"
              value={roleFilter}
              onChange={(e) => setRoleFilter(e.target.value)}
              aria-label="Filter by actor role"
            >
              <option value="">All Roles</option>
              <option value="admin">Administrator</option>
              <option value="staff">Verifier / Staff</option>
              <option value="student">Student</option>
              <option value="system">System / Trigger</option>
            </select>
          </div>

          <div className="audit-select-field">
            <select
              className="audit-select"
              value={actionFilter}
              onChange={(e) => setActionFilter(e.target.value)}
              aria-label="Filter by action"
            >
              <option value="">All Actions</option>
              <option value="CREATE">CREATE</option>
              <option value="UPDATE">UPDATE</option>
              <option value="DELETE">DELETE</option>
              <option value="APPROVE">APPROVE</option>
              <option value="REJECT">REJECT</option>
              <option value="LOGIN">LOGIN</option>
              <option value="LOGOUT">LOGOUT</option>
            </select>
          </div>

          <div className="audit-select-field">
            <select
              className="audit-select"
              value={statusFilter}
              onChange={(e) => setStatusFilter(e.target.value)}
              aria-label="Filter by status"
            >
              <option value="">All Statuses</option>
              <option value="SUCCESS">SUCCESS</option>
              <option value="FAILURE">FAILURE</option>
            </select>
          </div>

          <div className="audit-select-field">
            <select
              className="audit-select"
              value={entityFilter}
              onChange={(e) => setEntityFilter(e.target.value)}
              aria-label="Filter by entity type"
            >
              <option value="">All Entities</option>
              <option value="campus_logo">Campus Logo</option>
              <option value="campus_map">Campus Map</option>
              <option value="item">Lost &amp; Found Item</option>
              <option value="claim">Claim</option>
              <option value="user">User Account</option>
              <option value="building">Building</option>
              <option value="floor">Floor</option>
              <option value="room">Room</option>
              <option value="session">Session / Auth</option>
            </select>
          </div>
        </div>

        <div className="audit-filter-row audit-filter-subrow">
          <div className="audit-date-group">
            <label className="audit-filter-label" htmlFor="audit-start-date">From:</label>
            <input
              id="audit-start-date"
              type="date"
              className="audit-date-input"
              value={startDate}
              onChange={(e) => setStartDate(e.target.value)}
            />
          </div>

          <div className="audit-date-group">
            <label className="audit-filter-label" htmlFor="audit-end-date">To:</label>
            <input
              id="audit-end-date"
              type="date"
              className="audit-date-input"
              value={endDate}
              onChange={(e) => setEndDate(e.target.value)}
            />
          </div>

          <div className="audit-date-group">
            <label className="audit-filter-label" htmlFor="audit-sort-order">Sort:</label>
            <select
              id="audit-sort-order"
              className="audit-select audit-sort-select"
              value={sortOrder}
              onChange={(e) => setSortOrder(e.target.value)}
            >
              <option value="DESC">Newest First</option>
              <option value="ASC">Oldest First</option>
            </select>
          </div>

          <div className="audit-filter-btn-group">
            <button className="btn btn-primary btn-sm" type="submit">
              Apply Filters
            </button>
            <button
              className="btn btn-secondary btn-sm"
              type="button"
              onClick={handleResetFilters}
            >
              Clear
            </button>
          </div>
        </div>
      </form>

      {/* Status Notice */}
      {notice && (
        <div className="alert-banner alert-success">
          <strong>Notice:</strong> {notice}
        </div>
      )}

      {/* Error Notice */}
      {error && (
        <div className="alert-banner alert-danger">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Main Audit Table */}
      <div className="audit-table-wrapper">
        {loading ? (
          <div className="audit-loading-container">
            <div className="loading-spinner" />
            <p>Querying PostgreSQL audit ledger...</p>
          </div>
        ) : logs.length === 0 ? (
          <div className="empty-panel-state">
            <p>No audit records found matching your selected filters.</p>
            <button
              className="btn btn-secondary btn-sm"
              onClick={handleResetFilters}
              type="button"
            >
              Reset Filters
            </button>
          </div>
        ) : (
          <div className="table-responsive">
            <table className="workspace-table audit-table">
              <thead>
                <tr>
                  <th>Timestamp</th>
                  <th>Actor</th>
                  <th>Action &amp; Status</th>
                  <th>Target Entity</th>
                  <th>Description</th>
                  <th className="text-right">Inspection</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => {
                  const status = (log.status || "SUCCESS").toUpperCase();
                  const action = (log.action || "OPERATION").toUpperCase();
                  return (
                    <tr
                      key={log.id}
                      className="audit-row audit-row-clickable"
                      onClick={() => setSelectedLog(log)}
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          e.preventDefault();
                          setSelectedLog(log);
                        }
                      }}
                      title="Click anywhere to inspect this audit record"
                    >
                      <td className="audit-cell-time">
                        <span className="audit-time-main">
                          {new Date(log.created_at || log.createdAt).toLocaleTimeString([], {
                            hour: "2-digit",
                            minute: "2-digit",
                            second: "2-digit",
                          })}
                        </span>
                        <small className="audit-date-sub">
                          {new Date(log.created_at || log.createdAt).toLocaleDateString()}
                        </small>
                      </td>

                      <td className="audit-cell-actor">
                        <strong className="actor-name">
                          {log.actor_username || log.actorUsername || "system"}
                        </strong>
                        <span
                          className={`audit-role-pill ${getRoleBadgeClass(
                            log.actor_role || log.actorRole
                          )}`}
                        >
                          {log.actor_role || log.actorRole || "system"}
                        </span>
                      </td>

                      <td className="audit-cell-action">
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
                      </td>

                      <td className="audit-cell-entity">
                        <span className="entity-tag">{log.entity_type || log.entityType}</span>
                        {(log.entity_id || log.entityId) && (
                          <span className="entity-id-badge">#{log.entity_id || log.entityId}</span>
                        )}
                      </td>

                      <td className="audit-cell-desc">
                        <span className="desc-text" title={log.description}>
                          {log.description}
                        </span>
                        {(log.changed_fields || log.changedFields) && (
                          <small className="changed-fields-preview">
                            ✦ {Array.isArray(log.changed_fields || log.changedFields)
                              ? (log.changed_fields || log.changedFields).slice(0, 3).join(", ")
                              : Object.keys(log.changed_fields || log.changedFields).slice(0, 3).join(", ")}
                          </small>
                        )}
                      </td>

                      <td className="text-right audit-cell-tools">
                        <div
                          style={{
                            display: "inline-flex",
                            gap: "6px",
                            alignItems: "center",
                            justifyContent: "flex-end",
                          }}
                        >
                          <button
                            className="btn btn-secondary btn-sm audit-inspect-btn"
                            onClick={(e) => {
                              e.stopPropagation();
                              setSelectedLog(log);
                            }}
                            type="button"
                            title="Inspect JSON snapshots and changes"
                          >
                            🔍 Inspect
                          </button>
                          {(action === "DELETE" || action === "REMOVE") && (
                            <button
                              className="btn btn-sm audit-recover-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleRecover(log);
                              }}
                              disabled={recoveringId === log.id}
                              type="button"
                              title="Recover this deleted record into the active database"
                              style={{
                                background: "#d97706",
                                borderColor: "#b45309",
                                color: "#ffffff",
                                fontWeight: 600,
                                fontSize: "12px",
                                padding: "5px 10px",
                                borderRadius: "4px",
                                cursor: recoveringId === log.id ? "not-allowed" : "pointer",
                              }}
                            >
                              {recoveringId === log.id ? "↺..." : "↺ Recover"}
                            </button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Server-Side Pagination Bar */}
      <div className="audit-pagination-bar">
        <div className="audit-pagination-info">
          Showing <strong>{logs.length}</strong> of <strong>{pagination.total}</strong> recorded activities (Page {pagination.page} of {pagination.totalPages || 1})
        </div>

        <div className="audit-pagination-controls">
          <label className="pagination-limit-label" htmlFor="audit-page-size">
            Per page:
            <select
              id="audit-page-size"
              className="pagination-limit-select"
              value={pagination.limit}
              onChange={(e) => {
                const newLimit = Number(e.target.value);
                setPagination((prev) => ({ ...prev, limit: newLimit }));
              }}
            >
              <option value="10">10</option>
              <option value="25">25</option>
              <option value="50">50</option>
              <option value="100">100</option>
            </select>
          </label>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchLogs(pagination.page - 1)}
            disabled={pagination.page <= 1 || loading}
            type="button"
          >
            ← Previous
          </button>

          <span className="pagination-current-page">
            {pagination.page} / {pagination.totalPages || 1}
          </span>

          <button
            className="btn btn-secondary btn-sm"
            onClick={() => fetchLogs(pagination.page + 1)}
            disabled={pagination.page >= pagination.totalPages || loading}
            type="button"
          >
            Next →
          </button>
        </div>
      </div>

      {/* Inspect Detail Modal */}
      {selectedLog && (
        <AuditDetailModal
          log={selectedLog}
          logs={logs}
          onSelectLog={setSelectedLog}
          onClose={() => setSelectedLog(null)}
          onRecover={async () => {
            setSelectedLog(null);
            setNotice("Record successfully recovered from audit snapshot.");
            await fetchOverview();
            await fetchLogs(pagination.page);
          }}
        />
      )}
    </section>
  );
}
