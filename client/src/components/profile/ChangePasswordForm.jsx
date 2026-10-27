import React, { useState } from "react";
import { apiRequest } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import PasswordRequirements from "../PasswordRequirements.jsx";
import { validatePassword } from "../../utils/validation.js";

export default function ChangePasswordForm({ onPasswordChanged }) {
  const { logout } = useAuth();

  const [currentPassword, setCurrentPassword] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successNotice, setSuccessNotice] = useState(false);

  // Visibility toggles
  const [showCurrent, setShowCurrent] = useState(false);
  const [showNew, setShowNew] = useState(false);
  const [showConfirm, setShowConfirm] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");

    if (!currentPassword) {
      setError("Please enter your current password.");
      return;
    }

    const passVal = validatePassword(newPassword, {
      isChange: true,
      currentPassword,
    });
    if (!passVal.valid) {
      setError(passVal.error);
      return;
    }

    if (newPassword !== confirmPassword) {
      setError("New password and confirmation password do not match.");
      return;
    }

    setSaving(true);

    try {
      await apiRequest("/profile/change-password", {
        method: "POST",
        body: JSON.stringify({
          currentPassword,
          newPassword,
          confirmPassword,
        }),
      });

      // Show confirmation and trigger sign-out
      setSuccessNotice(true);
      setCurrentPassword("");
      setNewPassword("");
      setConfirmPassword("");

      // Perform client logout after short delay or let user acknowledge
      setTimeout(async () => {
        await logout();
        if (onPasswordChanged) onPasswordChanged();
      }, 2500);
    } catch (err) {
      setError(err.message || "Failed to change password. Please check your inputs.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-section-card">
      <div className="profile-section-header">
        <div>
          <h3>Account Security</h3>
          <p className="profile-section-desc">
            Update your account password. For security, changing your password will invalidate active sessions across all devices.
          </p>
        </div>
      </div>

      {successNotice && (
        <div className="alert-banner alert-success" style={{ marginBottom: "16px" }}>
          <strong>Password changed successfully!</strong> Your existing sessions have been signed out for security. Redirecting you to sign in with your new password...
        </div>
      )}

      {error && (
        <div className="alert-banner alert-danger" style={{ marginBottom: "16px" }}>
          <strong>Security Notice:</strong> {error}
        </div>
      )}

      <form onSubmit={handleSubmit} className="profile-form" noValidate>
        <div className="profile-form-grid">
          {/* Current Password */}
          <div className="form-group">
            <label htmlFor="current-password">
              Current Password <span className="req">*</span>
            </label>
            <div className="password-input-group">
              <input
                id="current-password"
                type={showCurrent ? "text" : "password"}
                required
                value={currentPassword}
                onChange={(e) => setCurrentPassword(e.target.value)}
                placeholder="Enter your existing password"
                disabled={saving || successNotice}
                autoComplete="current-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowCurrent(!showCurrent)}
                tabIndex="-1"
                aria-label={showCurrent ? "Hide password" : "Show password"}
              >
                {showCurrent ? "Hide" : "Show"}
              </button>
            </div>
          </div>

          <div className="form-group-empty" />

          {/* New Password */}
          <div className="form-group">
            <label htmlFor="new-password">
              New Password <span className="req">*</span>
            </label>
            <div className="password-input-group">
              <input
                id="new-password"
                type={showNew ? "text" : "password"}
                required
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="Choose a strong new password"
                disabled={saving || successNotice}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowNew(!showNew)}
                tabIndex="-1"
                aria-label={showNew ? "Hide password" : "Show password"}
              >
                {showNew ? "Hide" : "Show"}
              </button>
            </div>
            <PasswordRequirements
              password={newPassword}
              confirmPassword={confirmPassword}
              showMatch={Boolean(confirmPassword)}
            />
          </div>

          {/* Confirm New Password */}
          <div className="form-group">
            <label htmlFor="confirm-new-password">
              Confirm New Password <span className="req">*</span>
            </label>
            <div className="password-input-group">
              <input
                id="confirm-new-password"
                type={showConfirm ? "text" : "password"}
                required
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="Re-enter your new password"
                disabled={saving || successNotice}
                autoComplete="new-password"
              />
              <button
                type="button"
                className="password-toggle-btn"
                onClick={() => setShowConfirm(!showConfirm)}
                tabIndex="-1"
                aria-label={showConfirm ? "Hide password" : "Show password"}
              >
                {showConfirm ? "Hide" : "Show"}
              </button>
            </div>
            <span className="field-hint">
              Must match the new password above exactly.
            </span>
          </div>
        </div>

        <div className="profile-actions-bar">
          <button
            type="submit"
            className="btn btn-primary"
            disabled={
              saving ||
              successNotice ||
              !currentPassword ||
              !newPassword ||
              !confirmPassword
            }
          >
            {saving ? "Updating Password..." : "Update Password"}
          </button>
        </div>
      </form>
    </div>
  );
}
