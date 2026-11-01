import React, { useState } from "react";
import ReportCard from "../components/ReportCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function MyReportsPage({
  reports,
  onClaimItem,
  onSelectItem,
  onOpenReport,
  onRequireLogin,
}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("all"); // "all" | "lost" | "found"

  if (!user) {
    return (
      <section className="workspace-container">
        <div className="empty-state-card auth-empty-state">
          <div className="empty-state-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2>Authentication Required</h2>
          <p>
            Please sign in to view your submitted reports, track matched items,
            and monitor claim verifications.
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => onRequireLogin?.()}
            type="button"
          >
            Sign in to Your Account
          </button>
        </div>
      </section>
    );
  }

  const lostReports = reports.filter((r) => r.type === "lost");
  const foundReports = reports.filter((r) => r.type === "found");

  const displayedReports =
    activeTab === "lost"
      ? lostReports
      : activeTab === "found"
        ? foundReports
        : reports;

  return (
    <section id="my-reports" className="workspace-container">
      {/* Page Header with Action Buttons */}
      <div className="page-header-row">
        <div>
          <span className="eyebrow-tag">ACCOUNT ACTIVITY</span>
          <h1 className="page-main-title">My Reports &amp; Claims</h1>
          <p className="page-subtitle">
            Manage your campus lost and found submissions, monitor verifier
            matches, and view claim collection steps.
          </p>
        </div>

        <div className="page-header-actions">
          <button
            className="btn btn-primary"
            onClick={() => onOpenReport("lost")}
            type="button"
          >
            + Report Lost Item
          </button>
          <button
            className="btn btn-accent"
            onClick={() => onOpenReport("found")}
            type="button"
          >
            + Report Found Item
          </button>
        </div>
      </div>

      {/* Tabs and Summary Counters */}
      <div className="tabs-container">
        <div className="filter-tabs">
          <button
            className={`tab-btn ${activeTab === "all" ? "active" : ""}`}
            onClick={() => setActiveTab("all")}
            type="button"
          >
            All Reports ({reports.length})
          </button>
          <button
            className={`tab-btn ${activeTab === "lost" ? "active" : ""}`}
            onClick={() => setActiveTab("lost")}
            type="button"
          >
            Lost Items ({lostReports.length})
          </button>
          <button
            className={`tab-btn ${activeTab === "found" ? "active" : ""}`}
            onClick={() => setActiveTab("found")}
            type="button"
          >
            Found Submissions ({foundReports.length})
          </button>
        </div>

        <div className="active-count-label">
          Showing <strong>{displayedReports.length}</strong> record
          {displayedReports.length === 1 ? "" : "s"}
        </div>
      </div>

      {/* Reports List */}
      <div className="reports-stack">
        {displayedReports.length ? (
          displayedReports.map((item) => (
            <ReportCard
              key={item.id}
              item={item}
              privateView={true}
              onClaim={onClaimItem}
              onView={onSelectItem}
            />
          ))
        ) : (
          <div className="empty-state-card">
            <div className="empty-state-icon">
              <svg
                width="40"
                height="40"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.5"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" />
                <polyline points="14 2 14 8 20 8" />
                <line x1="16" y1="13" x2="8" y2="13" />
                <line x1="16" y1="17" x2="8" y2="17" />
                <polyline points="10 9 9 9 8 9" />
              </svg>
            </div>
            <h3>
              {activeTab === "all"
                ? "No reports filed yet"
                : activeTab === "lost"
                  ? "No lost items reported yet"
                  : "No found items reported yet"}
            </h3>
            <p>
              When you submit an item report or request a claim, it will appear
              here with live verification tracking.
            </p>
            <div className="empty-actions">
              <button
                className="btn btn-primary"
                onClick={() => onOpenReport("lost")}
                type="button"
              >
                Report a Lost Item
              </button>
              <button
                className="btn btn-secondary"
                onClick={() => onOpenReport("found")}
                type="button"
              >
                Report a Found Item
              </button>
            </div>
          </div>
        )}
      </div>
    </section>
  );
}
