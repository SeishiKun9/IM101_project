import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import { statusText } from "../../constants/statuses.js";
import { useAuth } from "../../context/AuthContext.jsx";
import EditAccountModal from "./EditAccountModal.jsx";

export default function AdminManagement() {
  const { user: currentUser } = useAuth();
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [studentSearch, setStudentSearch] = useState("");
  const [reportSearch, setReportSearch] = useState("");
  const [editingUser, setEditingUser] = useState(null);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const [nextUsers, nextItems] = await Promise.all([
        apiRequest("/admin/users"),
        apiRequest("/admin/items"),
      ]);
      setUsers(nextUsers);
      setItems(nextItems);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function removeUser(user) {
    const roleLabel =
      user.role === "staff"
        ? "verifier"
        : user.role === "admin"
        ? "administrator"
        : "user";
    if (
      !window.confirm(
        `Are you sure you want to remove ${roleLabel} account "${user.name}" (${user.email})?`,
      )
    )
      return;
    try {
      await apiRequest(`/admin/users/${user.id}`, { method: "DELETE" });
      setMessage(`${user.name} (${roleLabel}) account was successfully removed.`);
      refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function removeItem(item) {
    if (
      !window.confirm(
        `Are you sure you want to permanently remove report "${item.title}"?`,
      )
    )
      return;
    try {
      await apiRequest(`/admin/items/${item.id}`, { method: "DELETE" });
      setMessage(`Report "${item.title}" was removed.`);
      refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const staffUsers = users.filter((u) => u.role === "staff");
  const studentUsers = users.filter(
    (u) => u.role === "student" || (!["staff", "admin"].includes(u.role)),
  );
  const adminUsers = users.filter((u) => u.role === "admin");

  const filteredStudents = studentUsers.filter((u) => {
    if (!studentSearch.trim()) return true;
    const q = studentSearch.toLowerCase();
    return (
      u.name?.toLowerCase().includes(q) ||
      u.email?.toLowerCase().includes(q)
    );
  });

  const filteredItems = items.filter((item) => {
    if (!reportSearch.trim()) return true;
    const q = reportSearch.toLowerCase();
    return (
      item.title?.toLowerCase().includes(q) ||
      statusText(item.status)?.toLowerCase().includes(q) ||
      item.category?.toLowerCase().includes(q) ||
      item.location?.toLowerCase().includes(q) ||
      item.building?.toLowerCase().includes(q)
    );
  });

  return (
    <section className="workspace-panel admin-management-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="panel-title">System Records &amp; Account Control</h2>
          <p className="panel-subtitle">
            Supervise active verifiers, student users, administrators, and manage published reports across the database.
          </p>
        </div>
      </div>

      {message && (
        <div className="alert-banner alert-success">
          <strong>Notice:</strong> {message}
        </div>
      )}

      {error && (
        <div className="alert-banner alert-danger">
          <strong>Error:</strong> {error}
        </div>
      )}

      <div className="admin-split-columns">
        {/* Column 1: Account Control (Verifiers, Users Below, and Admins) */}
        <div style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
          {/* Category 1: Active Verifiers */}
          <div className="admin-subpanel">
            <div className="subpanel-header">
              <div>
                <h3>Active Verifier Accounts</h3>
                <span className="table-subtext">Auxiliary lost &amp; found desk staff</span>
              </div>
              <span className="count-pill">{staffUsers.length} staff</span>
            </div>

            {staffUsers.length ? (
              <div className="table-responsive">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>Name &amp; Email</th>
                      <th style={{ width: "95px" }}>Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {staffUsers.map((u) => {
                      const isSelf =
                        currentUser &&
                        (String(currentUser.id) === String(u.id) ||
                          String(currentUser.user_id) === String(u.id));
                      return (
                        <tr key={u.id}>
                          <td>
                            <strong>{u.name}</strong>
                            <small className="table-subtext">{u.email}</small>
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background:
                                  u.isActive !== false
                                    ? "rgba(16, 185, 129, 0.12)"
                                    : "rgba(239, 68, 68, 0.12)",
                                color: u.isActive !== false ? "#059669" : "#dc2626",
                                border: `1px solid ${
                                  u.isActive !== false
                                    ? "rgba(16, 185, 129, 0.3)"
                                    : "rgba(239, 68, 68, 0.3)"
                                }`,
                              }}
                            >
                              {u.isActive !== false ? "Active" : "Deactivated"}
                            </span>
                          </td>
                          <td className="text-right">
                            <div
                              style={{
                                display: "inline-flex",
                                gap: "6px",
                                alignItems: "center",
                                justifyContent: "flex-end",
                              }}
                            >
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setEditingUser(u)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => removeUser(u)}
                                disabled={isSelf}
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-subpanel-state">
                <p>No auxiliary verifier accounts registered.</p>
              </div>
            )}
          </div>

          {/* Category 2: Registered Users / Students (Below Verifiers) */}
          <div className="admin-subpanel">
            <div className="subpanel-header">
              <div>
                <h3>Registered Student &amp; User Accounts</h3>
                <span className="table-subtext">Campus reporters and claim filers</span>
              </div>
              <span className="count-pill">{studentUsers.length} users</span>
            </div>

            {studentUsers.length > 2 && (
              <div
                style={{
                  padding: "8px 14px",
                  borderBottom: "1px solid var(--border)",
                  background: "var(--surface-alt)",
                }}
              >
                <input
                  type="text"
                  placeholder="Filter users by name or email..."
                  value={studentSearch}
                  onChange={(e) => setStudentSearch(e.target.value)}
                  className="form-input"
                  style={{
                    fontSize: "12px",
                    padding: "6px 10px",
                    width: "100%",
                    borderRadius: "4px",
                    border: "1px solid var(--border)",
                  }}
                />
              </div>
            )}

            {studentUsers.length ? (
              <div
                className="table-responsive"
                style={{ maxHeight: "300px", overflowY: "auto" }}
              >
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>Name &amp; Email</th>
                      <th style={{ width: "80px" }}>Role</th>
                      <th style={{ width: "95px" }}>Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {filteredStudents.length ? (
                      filteredStudents.map((u) => {
                        const isSelf =
                          currentUser &&
                          (String(currentUser.id) === String(u.id) ||
                            String(currentUser.user_id) === String(u.id));
                        return (
                          <tr key={u.id}>
                            <td>
                              <strong>{u.name}</strong>
                              <small className="table-subtext">{u.email}</small>
                            </td>
                            <td>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: 600,
                                  textTransform: "capitalize",
                                  background: "var(--status-neutral-bg, #f1f5f2)",
                                  color: "var(--status-neutral-text, #475549)",
                                  border: "1px solid var(--status-neutral-border, #d8e2d9)",
                                }}
                              >
                                {u.role || "student"}
                              </span>
                            </td>
                            <td>
                              <span
                                style={{
                                  display: "inline-block",
                                  padding: "2px 6px",
                                  borderRadius: "4px",
                                  fontSize: "11px",
                                  fontWeight: 700,
                                  background:
                                    u.isActive !== false
                                      ? "rgba(16, 185, 129, 0.12)"
                                      : "rgba(239, 68, 68, 0.12)",
                                  color: u.isActive !== false ? "#059669" : "#dc2626",
                                  border: `1px solid ${
                                    u.isActive !== false
                                      ? "rgba(16, 185, 129, 0.3)"
                                      : "rgba(239, 68, 68, 0.3)"
                                  }`,
                                }}
                              >
                                {u.isActive !== false ? "Active" : "Deactivated"}
                              </span>
                            </td>
                            <td className="text-right">
                              <div
                                style={{
                                  display: "inline-flex",
                                  gap: "6px",
                                  alignItems: "center",
                                  justifyContent: "flex-end",
                                }}
                              >
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => setEditingUser(u)}
                                  type="button"
                                >
                                  Edit
                                </button>
                                <button
                                  className="btn btn-danger btn-sm"
                                  onClick={() => removeUser(u)}
                                  disabled={isSelf}
                                  type="button"
                                >
                                  Remove
                                </button>
                              </div>
                            </td>
                          </tr>
                        );
                      })
                    ) : (
                      <tr>
                        <td
                          colSpan={4}
                          style={{
                            textAlign: "center",
                            color: "var(--text-muted)",
                            padding: "16px",
                          }}
                        >
                          No users match "{studentSearch}".
                        </td>
                      </tr>
                    )}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-subpanel-state">
                <p>No registered student accounts in the database.</p>
              </div>
            )}
          </div>

          {/* Category 3: Administrator Accounts */}
          <div className="admin-subpanel">
            <div className="subpanel-header">
              <div>
                <h3>Administrator Accounts</h3>
                <span className="table-subtext">Full system access &amp; governance</span>
              </div>
              <span className="count-pill">
                {adminUsers.length} admin{adminUsers.length === 1 ? "" : "s"}
              </span>
            </div>

            {adminUsers.length ? (
              <div className="table-responsive">
                <table className="workspace-table">
                  <thead>
                    <tr>
                      <th>Name &amp; Email</th>
                      <th style={{ width: "95px" }}>Status</th>
                      <th className="text-right">Action</th>
                    </tr>
                  </thead>
                  <tbody>
                    {adminUsers.map((u) => {
                      const isSelf =
                        currentUser &&
                        (String(currentUser.id) === String(u.id) ||
                          String(currentUser.user_id) === String(u.id));
                      return (
                        <tr key={u.id}>
                          <td>
                            <div
                              style={{
                                display: "flex",
                                alignItems: "center",
                                gap: "6px",
                              }}
                            >
                              <strong>{u.name}</strong>
                              {isSelf && (
                                <span
                                  style={{
                                    fontSize: "10px",
                                    fontWeight: 700,
                                    textTransform: "uppercase",
                                    padding: "2px 6px",
                                    borderRadius: "4px",
                                    background: "var(--primary-light)",
                                    color: "var(--primary)",
                                    border: "1px solid var(--border)",
                                  }}
                                >
                                  You
                                </span>
                              )}
                            </div>
                            <small className="table-subtext">{u.email}</small>
                          </td>
                          <td>
                            <span
                              style={{
                                display: "inline-block",
                                padding: "2px 6px",
                                borderRadius: "4px",
                                fontSize: "11px",
                                fontWeight: 700,
                                background:
                                  u.isActive !== false
                                    ? "rgba(16, 185, 129, 0.12)"
                                    : "rgba(239, 68, 68, 0.12)",
                                color: u.isActive !== false ? "#059669" : "#dc2626",
                                border: `1px solid ${
                                  u.isActive !== false
                                    ? "rgba(16, 185, 129, 0.3)"
                                    : "rgba(239, 68, 68, 0.3)"
                                }`,
                              }}
                            >
                              {u.isActive !== false ? "Active" : "Deactivated"}
                            </span>
                          </td>
                          <td className="text-right">
                            <div
                              style={{
                                display: "inline-flex",
                                gap: "6px",
                                alignItems: "center",
                                justifyContent: "flex-end",
                              }}
                            >
                              <button
                                className="btn btn-secondary btn-sm"
                                onClick={() => setEditingUser(u)}
                                type="button"
                              >
                                Edit
                              </button>
                              <button
                                className="btn btn-danger btn-sm"
                                onClick={() => removeUser(u)}
                                disabled={isSelf}
                                style={{
                                  opacity: isSelf ? 0.5 : 1,
                                  cursor: isSelf ? "not-allowed" : "pointer",
                                }}
                                title={
                                  isSelf
                                    ? "You cannot remove your own administrator account"
                                    : undefined
                                }
                                type="button"
                              >
                                Remove
                              </button>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="empty-subpanel-state">
                <p>No administrator accounts found.</p>
              </div>
            )}
          </div>
        </div>

        {/* Column 2: System Reports (Scrollable with Search Filter) */}
        <div className="admin-subpanel">
          <div className="subpanel-header">
            <div>
              <h3>Registered Reports</h3>
              <span className="table-subtext">Active &amp; published lost/found cases</span>
            </div>
            <span className="count-pill">{items.length} records</span>
          </div>

          {/* Search Filter for Reports */}
          <div
            style={{
              padding: "8px 14px",
              borderBottom: "1px solid var(--border)",
              background: "var(--surface-alt)",
            }}
          >
            <input
              type="text"
              placeholder="Search reports by title, status, category, location..."
              value={reportSearch}
              onChange={(e) => setReportSearch(e.target.value)}
              className="form-input"
              style={{
                fontSize: "12px",
                padding: "6px 10px",
                width: "100%",
                borderRadius: "4px",
                border: "1px solid var(--border)",
              }}
            />
          </div>

          {items.length ? (
            <div
              className="table-responsive"
              style={{
                maxHeight: "540px",
                overflowY: "auto",
              }}
            >
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Item &amp; Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredItems.length ? (
                    filteredItems.map((item) => (
                      <tr key={item.id}>
                        <td>
                          <strong>{item.title}</strong>
                          <small className="table-subtext">
                            Status: {statusText(item.status)}
                            {item.category ? ` · ${item.category}` : ""}
                            {item.building ? ` · ${item.building}` : ""}
                          </small>
                        </td>
                        <td className="text-right">
                          <button
                            className="btn btn-danger btn-sm"
                            onClick={() => removeItem(item)}
                            type="button"
                          >
                            Remove
                          </button>
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td
                        colSpan={2}
                        style={{
                          textAlign: "center",
                          color: "var(--text-muted)",
                          padding: "20px",
                          fontSize: "13px",
                        }}
                      >
                        No reports match "{reportSearch}".
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-subpanel-state">
              <p>No reports currently stored in the database.</p>
            </div>
          )}
        </div>
      </div>

      {editingUser && (
        <EditAccountModal
          user={editingUser}
          currentUser={currentUser}
          onClose={() => setEditingUser(null)}
          onUpdated={(updated) => {
            setUsers((prev) =>
              prev.map((item) =>
                String(item.id) === String(updated.id)
                  ? { ...item, ...updated }
                  : item
              )
            );
            setEditingUser((prev) => (prev ? { ...prev, ...updated } : null));
            setMessage(`Account "${updated.name}" updated successfully.`);
          }}
          onRemoved={(userId) => {
            setUsers((prev) => prev.filter((item) => String(item.id) !== String(userId)));
            setMessage("User account removed successfully.");
          }}
        />
      )}
    </section>
  );
}
