import React, { useState, useEffect } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";
import { roleNames } from "../constants/statuses.js";
import { getInitials } from "../components/UserMenu.jsx";
import PersonalInformationForm from "../components/profile/PersonalInformationForm.jsx";
import ChangePasswordForm from "../components/profile/ChangePasswordForm.jsx";
import PrivacyPreferences from "../components/profile/PrivacyPreferences.jsx";

export default function ProfilePage({ onRequireLogin }) {
  const { user, loading } = useAuth();
  const navigate = useNavigate();
  const [activeTab, setActiveTab] = useState("personal"); // "personal" | "security" | "preferences"
  const [toastMessage, setToastMessage] = useState("");

  useEffect(() => {
    if (!loading && !user) {
      if (onRequireLogin) onRequireLogin();
    }
  }, [user, loading, onRequireLogin]);

  if (loading) {
    return (
      <div className="profile-page-shell">
        <div className="container" style={{ padding: "40px 16px", textAlign: "center" }}>
          <div className="loading-spinner" />
          <p style={{ marginTop: "16px", color: "var(--text-secondary)" }}>
            Loading your campus profile...
          </p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="profile-page-shell">
        <div className="container" style={{ padding: "60px 16px", textAlign: "center" }}>
          <div className="empty-state-card">
            <h3>Please Sign In</h3>
            <p style={{ color: "var(--text-secondary)", marginBottom: "20px" }}>
              You need to be signed in to view and manage your campus profile.
            </p>
            <button
              type="button"
              className="btn btn-primary"
              onClick={() => onRequireLogin && onRequireLogin()}
            >
              Sign In to Continue
            </button>
          </div>
        </div>
      </div>
    );
  }

  const roleLabel = roleNames[user.role] || user.role;
  const initials = getInitials(user.name);
  const memberSince = user.createdAt
    ? new Date(user.createdAt).toLocaleDateString(undefined, {
        year: "numeric",
        month: "long",
        day: "numeric",
      })
    : "Active Member";

  return (
    <div className="profile-page-shell">
      <div className="container profile-page-container">
        {/* Profile Hero Header Card */}
        <section className="profile-hero-card">
          <div className="profile-hero-content">
            <div className="profile-avatar-circle" aria-hidden="true">
              {initials}
            </div>
            <div className="profile-hero-text">
              <div className="profile-hero-title-row">
                <h2>{user.name}</h2>
                <span className={`user-role-badge ${user.role}`}>
                  {roleLabel}
                </span>
              </div>
              <p className="profile-hero-email">{user.email}</p>
              <div className="profile-hero-meta">
                <span>Member since {memberSince}</span>
                {user.contactNumber && (
                  <>
                    <span className="dot-divider">•</span>
                    <span>Contact: {user.contactNumber}</span>
                  </>
                )}
              </div>
            </div>
          </div>
        </section>

        {/* Tab Navigation Navigation Bar */}
        <div className="profile-tabs-nav" role="tablist" aria-label="Profile Sections">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "personal"}
            className={`profile-tab-btn ${activeTab === "personal" ? "active" : ""}`}
            onClick={() => setActiveTab("personal")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
              <circle cx="12" cy="7" r="4" />
            </svg>
            <span>Personal Information</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "security"}
            className={`profile-tab-btn ${activeTab === "security" ? "active" : ""}`}
            onClick={() => setActiveTab("security")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
            <span>Account Security</span>
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === "preferences"}
            className={`profile-tab-btn ${activeTab === "preferences" ? "active" : ""}`}
            onClick={() => setActiveTab("preferences")}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <circle cx="12" cy="12" r="3" />
              <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
            </svg>
            <span>Preferences &amp; Theme</span>
          </button>
        </div>

        {/* Tab Content Display */}
        <div className="profile-tab-content" role="tabpanel">
          {activeTab === "personal" && (
            <PersonalInformationForm
              onProfileUpdated={(updated) => {
                setToastMessage("Profile updated successfully.");
              }}
            />
          )}

          {activeTab === "security" && (
            <ChangePasswordForm
              onPasswordChanged={() => {
                // Return to login after password change session invalidation
                if (onRequireLogin) onRequireLogin();
              }}
            />
          )}

          {activeTab === "preferences" && (
            <PrivacyPreferences
              onPreferencesUpdated={() => {
                setToastMessage("Preferences saved successfully.");
              }}
            />
          )}
        </div>
      </div>
    </div>
  );
}
