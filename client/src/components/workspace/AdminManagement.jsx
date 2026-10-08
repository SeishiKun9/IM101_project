import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import { statusText } from "../../constants/statuses.js";

export default function AdminManagement() {
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
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
    if (
      !window.confirm(
        `Are you sure you want to remove verifier account "${user.name}"?`,
      )
    )
      return;
    try {
      await apiRequest(`/admin/users/${user.id}`, { method: "DELETE" });
      setMessage(`Verifier account "${user.name}" was successfully removed.`);
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

  return (
    <section className="workspace-panel admin-management-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="panel-title">System Records &amp; Account Control</h2>
          <p className="panel-subtitle">
            Supervise active verifier staff accounts and manage published
            reports across the database.
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
        {/* Column 1: Staff Accounts */}
        <div className="admin-subpanel">
          <div className="subpanel-header">
            <h3>Active Verifier Accounts</h3>
            <span className="count-pill">{staffUsers.length} staff</span>
          </div>

          {staffUsers.length ? (
            <div className="table-responsive">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Name &amp; Email</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {staffUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <small className="table-subtext">{u.email}</small>
                      </td>
                      <td className="text-right">
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => removeUser(u)}
                          type="button"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-subpanel-state">
              <p>No auxiliary verifier accounts registered.</p>
            </div>
          )}
        </div>

        {/* Column 2: System Reports */}
        <div className="admin-subpanel">
          <div className="subpanel-header">
            <h3>Registered Reports</h3>
            <span className="count-pill">{items.length} records</span>
          </div>

          {items.length ? (
            <div className="table-responsive">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Item &amp; Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.title}</strong>
                        <small className="table-subtext">
                          Status: {statusText(item.status)}
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
                  ))}
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
    </section>
  );
}
