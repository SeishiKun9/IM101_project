import React, { useState, useEffect } from "react";
import { apiRequest } from "../../api/client.js";
import { useAuth } from "../../context/AuthContext.jsx";
import ThemeSelector from "../ThemeSelector.jsx";

export default function PrivacyPreferences({ onPreferencesUpdated }) {
  const { user, setUser } = useAuth();

  const [defaultAnonymous, setDefaultAnonymous] = useState(
    user?.defaultAnonymous ?? false,
  );
  const [defaultHidePhone, setDefaultHidePhone] = useState(
    user?.defaultHidePhone ?? true,
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    if (user) {
      setDefaultAnonymous(user.defaultAnonymous ?? false);
      setDefaultHidePhone(user.defaultHidePhone ?? true);
    }
  }, [user]);

  const originalAnon = user?.defaultAnonymous ?? false;
  const originalHidePhone = user?.defaultHidePhone ?? true;
  const isDirty =
    defaultAnonymous !== originalAnon || defaultHidePhone !== originalHidePhone;

  function handleCancel() {
    setDefaultAnonymous(originalAnon);
    setDefaultHidePhone(originalHidePhone);
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
      const updated = await apiRequest("/profile/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          defaultAnonymous,
          defaultHidePhone,
        }),
      });

      if (setUser) {
        setUser((prev) => (prev ? { ...prev, ...updated } : prev));
      }
      if (onPreferencesUpdated) {
        onPreferencesUpdated(updated);
      }
      setSuccessMessage("Privacy preferences saved successfully.");
    } catch (err) {
      setError(err.message || "Failed to update preferences.");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="profile-preferences-stack">
      {/* 1. Privacy Defaults Card */}
      <div className="profile-section-card">
        <div className="profile-section-header">
          <div>
            <h3>Report Privacy Defaults</h3>
            <p className="profile-section-desc">
              Set default visibility settings applied automatically whenever you create a new report. You can still adjust these values on individual reports before submission.
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
          <div className="preferences-checkbox-list">
            <label className={`pref-checkbox-card ${defaultAnonymous ? "checked" : ""}`}>
              <input
                type="checkbox"
                checked={defaultAnonymous}
                onChange={(e) => {
                  setDefaultAnonymous(e.target.checked);
                  setSuccessMessage("");
                }}
                disabled={saving}
              />
              <div className="pref-checkbox-content">
                <strong>Hide my name on new reports</strong>
                <p>
                  Your name will display as "Anonymous" on public lost &amp; found listings. Campus verifiers and administrators retain access to coordinate verified handovers.
                </p>
              </div>
            </label>

            <label className={`pref-checkbox-card ${defaultHidePhone ? "checked" : ""}`}>
              <input
                type="checkbox"
                checked={defaultHidePhone}
                onChange={(e) => {
                  setDefaultHidePhone(e.target.checked);
                  setSuccessMessage("");
                }}
                disabled={saving}
              />
              <div className="pref-checkbox-content">
                <strong>Hide my phone number on new reports</strong>
                <p>
                  Keeps your contact number hidden from general student listings. Only authorized staff verifiers can view it when managing claims.
                </p>
              </div>
            </label>
          </div>

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
              {saving ? "Saving Preferences..." : "Save Privacy Defaults"}
            </button>
          </div>
        </form>
      </div>

      {/* 2. Appearance Card */}
      <div className="profile-section-card">
        <div className="profile-section-header">
          <div>
            <h3>Appearance &amp; Theme</h3>
            <p className="profile-section-desc">
              Choose your preferred color theme. Changes apply immediately and stay synchronized across all your devices when signed in.
            </p>
          </div>
        </div>

        <ThemeSelector variant="cards" />
      </div>
    </div>
  );
}
