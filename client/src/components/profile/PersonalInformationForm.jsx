import React, { useState, useEffect } from "react";
import { apiRequest } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import { roleNames } from "../../constants/statuses.js";

export default function PersonalInformationForm({ onProfileUpdated }) {
  const { user, setUser } = useAuth();

  const [name, setName] = useState(user?.name || "");
  const [contactNumber, setContactNumber] = useState(user?.contactNumber || "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (user) {
      setName(user.name || "");
      setContactNumber(user.contactNumber || "");
    }
  }, [user]);

  const originalName = user?.name || "";
  const originalContact = user?.contactNumber || "";
  const isDirty =
    name.trim() !== originalName.trim() ||
    contactNumber.trim() !== originalContact.trim();

  function handleCancel() {
    setName(originalName);
    setContactNumber(originalContact);
    setError("");
    setSuccessMessage("");
  }

  async function handleSubmit(e) {
    e.preventDefault();
    if (!isDirty) return;

    setError("");
    setSuccessMessage("");
    setSaving(true);

    try {
      const updated = await apiRequest("/profile", {
        method: "PATCH",
        body: JSON.stringify({
          name: name.trim(),
          contactNumber: contactNumber.trim() || null,
        }),
      });

      // Update auth context immediately
      if (setUser) {
        setUser((prev) => (prev ? { ...prev, ...updated } : prev));
      }
      if (onProfileUpdated) {
        onProfileUpdated(updated);
      }
      setSuccessMessage("Personal information updated successfully.");
    } catch (err) {
      setError(err.message || "Failed to save profile changes.");
    } finally {
      setSaving(false);
    }
  }

  const roleLabel = roleNames[user?.role] || user?.role || "Student";

  return (
    <div className="profile-section-card">
      <div className="profile-section-header">
        <div>
          <h3>Personal Information</h3>
          <p className="profile-section-desc">
            Manage your campus profile details and optional contact number.
          </p>
        </div>
      </div>

      {error && (
        <div className="alert-banner alert-danger" style={{ marginBottom: "16px" }}>
          <strong>Error:</strong> {error}
        </div>
      )}

      {successMessage && (
        <div className="alert-banner alert-success" style={{ marginBottom: "16px" }}>
          {successMessage}
        </div>
      )}

      <form onSubmit={handleSubmit} className="profile-form">
        <div className="profile-form-grid">
          {/* Full Name (Editable) */}
          <div className="form-group">
            <label htmlFor="profile-name">
              Full Name <span className="req">*</span>
            </label>
            <input
              id="profile-name"
              type="text"
              required
              value={name}
              onChange={(e) => {
                setName(e.target.value);
                setSuccessMessage("");
              }}
              placeholder="e.g. Maria Teresa Santos"
              maxLength={120}
              disabled={saving}
            />
            <span className="field-hint">
              Used when submitting item reports and claiming property.
            </span>
          </div>

          {/* School Email (Read-Only) */}
          <div className="form-group">
            <label htmlFor="profile-email">
              School Email Address <span className="read-only-tag">(Institutional)</span>
            </label>
            <input
              id="profile-email"
              type="email"
              value={user?.email || ""}
              readOnly
              disabled
              className="input-read-only"
            />
            <span className="field-hint">
              Official campus email is tied to institutional verification and cannot be changed.
            </span>
          </div>

          {/* Contact Number (Editable, Optional) */}
          <div className="form-group">
            <label htmlFor="profile-contact">
              Contact Number <span className="opt">(Optional)</span>
            </label>
            <input
              id="profile-contact"
              type="tel"
              value={contactNumber}
              onChange={(e) => {
                setContactNumber(e.target.value);
                setSuccessMessage("");
              }}
              placeholder="e.g. 09171234567 or +639171234567"
              disabled={saving}
            />
            <span className="field-hint">
              Used to reach you for handovers and claims. Accepts common Philippine formats (09... or +63...). Clear to remove.
            </span>
          </div>

          {/* Account Role (Read-Only) */}
          <div className="form-group">
            <label htmlFor="profile-role">
              Account Role <span className="read-only-tag">(Assigned)</span>
            </label>
            <div className="profile-role-display">
              <span className={`user-role-badge ${user?.role}`}>
                {roleLabel}
              </span>
              <span className="profile-role-desc">
                {user?.role === "admin"
                  ? "Full operational control over campus locations, maps, and system accounts."
                  : user?.role === "staff"
                    ? "Authorized verifier with report matching and claim review privileges."
                    : "Standard campus member with report filing and item claiming access."}
              </span>
            </div>
          </div>
        </div>

        {/* Action Buttons */}
        <div className="profile-actions-bar">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={handleCancel}
            disabled={!isDirty || saving}
          >
            Cancel
          </button>
          <button
            type="submit"
            className="btn btn-primary"
            disabled={!isDirty || saving}
          >
            {saving ? "Saving Changes..." : "Save Changes"}
          </button>
        </div>
      </form>
    </div>
  );
}
