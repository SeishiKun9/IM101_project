import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import { statusText } from "../../constants/statuses.js";

export default function AdminManagement() {
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
  const [message, setMessage] = useState("");

  async function refresh() {
    try {
      const [nextUsers, nextItems] = await Promise.all([
        apiRequest("/admin/users"),
        apiRequest("/admin/items"),
      ]);
      setUsers(nextUsers);
      setItems(nextItems);
    } catch (requestError) {
      setMessage(requestError.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function removeUser(user) {
    if (!window.confirm(`Remove verifier account ${user.name}?`)) return;
    try {
      await apiRequest(`/admin/users/${user.id}`, { method: "DELETE" });
      setMessage(`${user.name} was removed.`);
      refresh();
    } catch (requestError) {
      setMessage(requestError.message);
    }
  }

  async function removeItem(item) {
    if (!window.confirm(`Remove report ${item.title}?`)) return;
    try {
      await apiRequest(`/admin/items/${item.id}`, { method: "DELETE" });
      setMessage(`${item.title} was removed.`);
      refresh();
    } catch (requestError) {
      setMessage(requestError.message);
    }
  }

  return (
    <section className="admin-management">
      <h3>System management</h3>
      {message && <p className="form-error">{message}</p>}

      <div className="management-columns">
        <div>
          <h4>Verifier accounts</h4>
          {users
            .filter((user) => user.role === "staff")
            .map((user) => (
              <div className="management-row" key={user.id}>
                <span>
                  {user.name} · {user.email}
                </span>
                <button
                  className="danger compact"
                  onClick={() => removeUser(user)}
                >
                  Remove
                </button>
              </div>
            ))}
        </div>

        <div>
          <h4>Reports</h4>
          {items.map((item) => (
            <div className="management-row" key={item.id}>
              <span>
                {item.title} · {statusText(item.status)}
              </span>
              <button
                className="danger compact"
                onClick={() => removeItem(item)}
              >
                Remove
              </button>
            </div>
          ))}
        </div>
      </div>
    </section>
  );
}
