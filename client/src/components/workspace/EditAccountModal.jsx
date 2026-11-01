import React, { useState } from "react";
import { apiRequest } from "../../api/client.js";

export default function EditAccountModal({
  user,
  currentUser,
  onClose,
  onUpdated,
  onRemoved,
}) {
  const isSelf =
    currentUser &&
    (String(currentUser.id) === String(user.id) ||
      String(currentUser.user_id) === String(user.id));

  const [name, setName] = useState(user.name || "");
  const [email, setEmail] = useState(user.email || "");
  const [isActive, setIsActive] = useState(user.isActive !== false);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");

  const roleLabel =
    user.role === "staff"
      ? "Verifier"
      : user.role === "admin"
      ? "Administrator"
      : "Student / User";

  async function handleSaveDetails(e) {
    e.preventDefault();
    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const updated = await apiRequest(`/admin/users/${user.id}`, {
        method: "PUT",
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          isActive,
        }),
      });

      setSuccess("Account information updated successfully.");
      onUpdated?.(updated);
    } catch (err) {
      setError(err.message || "Failed to update account.");
    } finally {
      setLoading(false);
    }
  }

  async function handleToggleStatus() {
    if (isSelf && isActive) {
      setError("You cannot deactivate your own administrator account.");
      return;
    }

    const nextState = !isActive;
    const actionWord = nextState ? "reactivate" : "deactivate";
    const confirmed = window.confirm(
      `Are you sure you want to ${actionWord} the account for "${user.name}" (${user.email})?`
    );
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      const updated = await apiRequest(`/admin/users/${user.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({ isActive: nextState }),
      });

      setIsActive(nextState);
      setSuccess(`Account has been successfully ${nextState ? "reactivated" : "deactivated"}.`);
      onUpdated?.(updated);
    } catch (err) {
      setError(err.message || `Failed to ${actionWord} account.`);
    } finally {
      setLoading(false);
    }
  }

  async function handleRemove() {
    if (isSelf) {
      setError("You cannot remove your own administrator account.");
      return;
    }

    const confirmed = window.confirm(
      `Permanently remove the account for "${user.name}" (${user.email})? This action cannot be undone unless recovered via audit logs.`
    );
    if (!confirmed) return;

    setError("");
    setSuccess("");
    setLoading(true);

    try {
      await apiRequest(`/admin/users/${user.id}`, {
        method: "DELETE",
      });
      onRemoved?.(user.id);
      onClose();
    } catch (err) {
      setError(err.message || "Failed to remove account.");
      setLoading(false);
    }
  }

  return (
    <div className="modal-backdrop" onClick={onClose} role="dialog" aria-modal="true">
      <div
        className="modal-card"
        onClick={(e) => e.stopPropagation()}
        style={{ maxWidth: "560px", width: "100%" }}
      >
        <div className="modal-header">
          <div>
            <h2 className="modal-title">Edit Account: {user.name}</h2>
            <div style={{ display: "flex", gap: "8px", alignItems: "center", marginTop: "4px" }}>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  padding: "2px 7px",
                  borderRadius: "4px",
                  background:
                    user.role === "admin"
                      ? "var(--primary-light)"
                      : user.role === "staff"
                      ? "var(--status-blue-bg, #eff6ff)"
                      : "var(--status-neutral-bg, #f1f5f2)",
                  color:
                    user.role === "admin"
                      ? "var(--primary)"
                      : user.role === "staff"
                      ? "var(--status-blue-text, #1d4ed8)"
                      : "var(--status-neutral-text, #475549)",
                  border: "1px solid var(--border)",
                }}
              >
                {roleLabel}
              </span>
              <span
                style={{
                  fontSize: "11px",
                  fontWeight: 700,
                  padding: "2px 7px",
                  borderRadius: "4px",
                  background: isActive ? "rgba(16, 185, 129, 0.12)" : "rgba(239, 68, 68, 0.12)",
                  color: isActive ? "#059669" : "#dc2626",
                  border: `1px solid ${isActive ? "rgba(16, 185, 129, 0.3)" : "rgba(239, 68, 68, 0.3)"}`,
                }}
              >
                {isActive ? "● Active" : "○ Deactivated"}
              </span>
              {isSelf && (
                <span
                  style={{
                    fontSize: "10px",
                    fontWeight: 700,
                    textTransform: "uppercase",
                    padding: "2px 6px",
                    borderRadius: "4px",
                    background: "var(--accent-light, #fef3c7)",
                    color: "var(--accent, #d97706)",
                    border: "1px solid var(--accent-border, #fde68a)",
                  }}
                >
                  Your Account
                </span>
              )}
            </div>
          </div>
          <button className="modal-close" onClick={onClose} type="button" aria-label="Close modal">
            &times;
          </button>
        </div>

        <div className="modal-body" style={{ display: "flex", flexDirection: "column", gap: "20px" }}>
          {error && (
            <div className="alert-banner alert-danger">
              <strong>Error:</strong> {error}
            </div>
          )}

          {success && (
            <div className="alert-banner alert-success">
              <strong>Success:</strong> {success}
            </div>
          )}

          {/* Form Section */}
          <form onSubmit={handleSaveDetails} style={{ display: "flex", flexDirection: "column", gap: "14px" }}>
            <div className="form-group">
              <label className="form-label" htmlFor="edit-account-name">
                Full Name
              </label>
              <input
                id="edit-account-name"
                className="form-input"
                type="text"
                required
                value={name}
                onChange={(e) => setName(e.target.value)}
                placeholder="Enter member's full name"
                disabled={loading}
              />
            </div>

            <div className="form-group">
              <label className="form-label" htmlFor="edit-account-email">
                Institutional Email Address
              </label>
              <input
                id="edit-account-email"
                className="form-input"
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="username@school.edu or .edu.ph"
                disabled={loading}
              />
              <span className="field-hint">Must end with .edu or .edu.ph</span>
            </div>

            <div style={{ display: "flex", justifyContent: "flex-end", marginTop: "4px" }}>
              <button className="btn btn-primary btn-sm" type="submit" disabled={loading}>
                {loading ? "Saving..." : "Save Account Info"}
              </button>
            </div>
          </form>

          {/* Account Status Control Section */}
          <div
            style={{
              padding: "16px",
              background: "var(--surface-alt, #fbfdfb)",
              border: "1px solid var(--border)",
              borderRadius: "8px",
              display: "flex",
              flexDirection: "column",
              gap: "10px",
            }}
          >
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <strong style={{ fontSize: "14px", color: "var(--text-main)" }}>Account Access Status</strong>
                <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                  {isActive
                    ? "Active accounts can sign in, post reports, and submit claims."
                    : "Deactivated accounts cannot sign in. Existing reports and claims are preserved."}
                </p>
              </div>

              <button
                type="button"
                onClick={handleToggleStatus}
                disabled={loading || (isSelf && isActive)}
                className={`btn btn-sm ${isActive ? "btn-secondary" : "btn-primary"}`}
                style={{
                  whiteSpace: "nowrap",
                  ...(isActive
                    ? { color: "#dc2626", borderColor: "#fca5a5" }
                    : { background: "#059669", borderColor: "#047857", color: "#ffffff" }),
                }}
                title={isSelf && isActive ? "You cannot deactivate your own account" : undefined}
              >
                {isActive ? "Deactivate Account" : "Reactivate Account"}
              </button>
            </div>
            {isSelf && isActive && (
              <span style={{ fontSize: "11px", color: "var(--text-muted)", fontStyle: "italic" }}>
                Notice: Self-deactivation is disabled for safety.
              </span>
            )}
          </div>

          {/* Danger Zone: Permanently Remove Account */}
          <div
            style={{
              padding: "16px",
              border: "1px dashed rgba(239, 68, 68, 0.4)",
              borderRadius: "8px",
              background: "rgba(239, 68, 68, 0.03)",
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              gap: "12px",
            }}
          >
            <div>
              <strong style={{ fontSize: "13px", color: "#b91c1c" }}>Permanently Remove Account</strong>
              <p style={{ margin: "2px 0 0 0", fontSize: "12px", color: "var(--text-muted)" }}>
                Purges account record. Will be logged in audit ledger where it can be recovered.
              </p>
            </div>
            <button
              className="btn btn-danger btn-sm"
              type="button"
              onClick={handleRemove}
              disabled={loading || isSelf}
              style={{ whiteSpace: "nowrap" }}
              title={isSelf ? "You cannot remove your own account" : undefined}
            >
              Remove
            </button>
          </div>
        </div>

        <div className="modal-footer">
          <button className="btn btn-secondary" onClick={onClose} type="button" disabled={loading}>
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
