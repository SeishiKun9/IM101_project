import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import {
  claimStatusText,
  roleNames,
  statusText,
} from "../../constants/statuses.js";
import { formatLocation } from "../../utils/location.js";
import AdminAccountForm from "./AdminAccountForm.jsx";
import AdminManagement from "./AdminManagement.jsx";
import CompareModal from "./CompareModal.jsx";
import LocationMapManagement from "./LocationMapManagement.jsx";

export default function ReviewWorkspace({ user, onChanged }) {
  const [queue, setQueue] = useState({
    items: [],
    lost: [],
    claims: [],
    cases: [],
  });
  const [selected, setSelected] = useState(null);
  const [selectedLost, setSelectedLost] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("compare"); // "compare" | "claims" | "cases" | "locations" | "accounts" | "system"
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  async function refresh() {
    setRefreshing(true);
    try {
      const data = await apiRequest("/review/queue");
      setQueue(data);
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setRefreshing(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleMatch(event) {
    event.preventDefault();
    try {
      await apiRequest(`/reports/${selected.id}/match`, {
        method: "POST",
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      setSelected(null);
      setSelectedLost(null);
      refresh();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function decide(claimId, decision) {
    const reason =
      decision === "rejected"
        ? window.prompt("Reason for rejection") || "No reason provided"
        : "";
    try {
      await apiRequest(`/claims/${claimId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, reason }),
      });
      refresh();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function collect(claimId) {
    try {
      await apiRequest(`/claims/${claimId}/collect`, { method: "POST" });
      refresh();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function markUnderReview(itemId) {
    try {
      await apiRequest(`/reports/${itemId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "under_review" }),
      });
      refresh();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function reviewSelectedMatch(status) {
    if (!selectedLost || !selected) return;
    try {
      await apiRequest(`/reports/${selected.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          lostId: selectedLost.id,
        }),
      });
      setSelected(null);
      setSelectedLost(null);
      refresh();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const roleTitle = roleNames[user?.role] || "Staff";
  const isAdmin = user?.role === "admin";

  const navItems = [
    {
      id: "compare",
      label: "Compare Reports",
      count: queue.items.length,
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M16 3h5v5M4 20L21 3M21 16v5h-5M15 15l6 6M4 4l5 5" />
        </svg>
      ),
    },
    {
      id: "claims",
      label: "Claims & Handover",
      count: queue.claims.length,
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M22 11.08V12a10 10 0 1 1-5.93-9.14" />
          <polyline points="22 4 12 14.01 9 11.01" />
        </svg>
      ),
    },
    {
      id: "cases",
      label: "Resolved Cases",
      count: queue.cases.length,
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
        </svg>
      ),
    },
  ];

  if (isAdmin) {
    navItems.push(
      {
        id: "locations",
        label: "Locations & Maps",
        icon: (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <polygon points="1 6 1 22 8 18 16 22 23 18 23 2 16 6 8 2 1 6" />
            <line x1="8" y1="2" x2="8" y2="18" />
            <line x1="16" y1="6" x2="16" y2="22" />
          </svg>
        ),
      },
      {
        id: "accounts",
        label: "Create Verifier",
        icon: (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M16 21v-2a4 4 0 0 0-4-4H5a4 4 0 0 0-4 4v2" />
            <circle cx="8.5" cy="7.5" r="4" />
            <line x1="20" y1="8" x2="20" y2="14" />
            <line x1="23" y1="11" x2="17" y2="11" />
          </svg>
        ),
      },
      {
        id: "system",
        label: "System Management",
        icon: (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <circle cx="12" cy="12" r="3" />
            <path d="M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1 0 2.83 2 2 0 0 1-2.83 0l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-2 2 2 2 0 0 1-2-2v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83 0 2 2 0 0 1 0-2.83l.06-.06a1.65 1.65 0 0 0 .33-1.82 1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1-2-2 2 2 0 0 1 2-2h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 0-2.83 2 2 0 0 1 2.83 0l.06.06a1.65 1.65 0 0 0 1.82.33H9a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 2-2 2 2 0 0 1 2 2v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 0 2 2 0 0 1 0 2.83l-.06.06a1.65 1.65 0 0 0-.33 1.82V9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 2 2 2 2 0 0 1-2 2h-.09a1.65 1.65 0 0 0-1.51 1z" />
          </svg>
        ),
      },
    );
  }

  return (
    <div className="workspace-layout">
      {/* Workspace Top Bar */}
      <header className="workspace-topbar">
        <div className="workspace-topbar-left">
          <button
            className="workspace-mobile-toggle"
            onClick={() => setMobileNavOpen((prev) => !prev)}
            type="button"
            aria-label="Toggle workspace menu"
          >
            <span className="hamburger-line" />
            <span className="hamburger-line" />
            <span className="hamburger-line" />
          </button>

          <div>
            <div className="workspace-role-pill">
              <span className="role-dot" />
              {roleTitle} Workspace
            </div>
            <h1 className="workspace-page-title">
              {isAdmin
                ? "Administrator Operations"
                : "Verifier Review & Handover"}
            </h1>
          </div>
        </div>

        <div className="workspace-topbar-right">
          <div className="user-identity">
            <span className="user-name">{user?.name}</span>
            <span className="user-email">{user?.email}</span>
          </div>
          <button
            className="btn btn-secondary btn-sm"
            onClick={refresh}
            disabled={refreshing}
            type="button"
          >
            {refreshing ? "Refreshing..." : "↻ Refresh Data"}
          </button>
        </div>
      </header>

      {/* Summary KPI Cards Row */}
      <section className="workspace-kpi-row" aria-label="Operational Metrics">
        <div
          className={`kpi-card clickable ${activeTab === "compare" ? "active" : ""}`}
          onClick={() => setActiveTab("compare")}
        >
          <span className="kpi-label">Found Reports to Review</span>
          <span className="kpi-value">{queue.items.length}</span>
          <span className="kpi-hint">Awaiting candidate comparison</span>
        </div>

        <div className="kpi-card" onClick={() => setActiveTab("compare")}>
          <span className="kpi-label">Lost Reports Queue</span>
          <span className="kpi-value">{queue.lost.length}</span>
          <span className="kpi-hint">Available for matching</span>
        </div>

        <div
          className={`kpi-card clickable ${activeTab === "claims" ? "active" : ""}`}
          onClick={() => setActiveTab("claims")}
        >
          <span className="kpi-label">Pending / Active Claims</span>
          <span className="kpi-value">{queue.claims.length}</span>
          <span className="kpi-hint">Claims requiring CSA action</span>
        </div>

        <div
          className={`kpi-card clickable ${activeTab === "cases" ? "active" : ""}`}
          onClick={() => setActiveTab("cases")}
        >
          <span className="kpi-label">Resolved Cases</span>
          <span className="kpi-value">{queue.cases.length}</span>
          <span className="kpi-hint">Completed handovers</span>
        </div>
      </section>

      {error && (
        <div className="alert-banner alert-danger">
          <strong>Error:</strong> {error}
        </div>
      )}

      {/* Main Split: Sidebar + Content */}
      <div className="workspace-main-split">
        {/* Sidebar Nav */}
        <aside
          className={`workspace-sidebar ${mobileNavOpen ? "open" : ""}`}
          aria-label="Workspace Navigation"
        >
          <div className="sidebar-header-mobile">
            <span>Workspace Navigation</span>
            <button
              className="modal-close"
              onClick={() => setMobileNavOpen(false)}
              type="button"
            >
              ×
            </button>
          </div>

          <nav className="workspace-nav-list">
            {navItems.map((item) => (
              <button
                key={item.id}
                className={`workspace-nav-item ${activeTab === item.id ? "active" : ""}`}
                onClick={() => {
                  setActiveTab(item.id);
                  setMobileNavOpen(false);
                }}
                type="button"
              >
                <span className="nav-item-icon">{item.icon}</span>
                <span className="nav-item-label">{item.label}</span>
                {item.count !== undefined && item.count > 0 && (
                  <span className="nav-item-badge">{item.count}</span>
                )}
              </button>
            ))}
          </nav>
        </aside>

        {mobileNavOpen && (
          <div
            className="sidebar-backdrop"
            onClick={() => setMobileNavOpen(false)}
          />
        )}

        {/* Workspace Dynamic Content Body */}
        <main className="workspace-content-body">
          {/* TAB 1: COMPARE & REVIEW */}
          {activeTab === "compare" && (
            <section className="workspace-panel">
              <div className="panel-header-row">
                <div>
                  <h2 className="panel-title">
                    Found Reports Awaiting Verification
                  </h2>
                  <p className="panel-subtitle">
                    Examine newly turned-in items, mark them under review, or
                    open comparison to link them with matching lost reports.
                  </p>
                </div>
                <span className="panel-counter">
                  {queue.items.length} item{queue.items.length === 1 ? "" : "s"}
                </span>
              </div>

              {queue.items.length ? (
                <div className="table-responsive">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Item &amp; Category</th>
                        <th>Turned In Location</th>
                        <th>Date Found</th>
                        <th>Status</th>
                        <th className="text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.items.map((item) => (
                        <tr key={item.id}>
                          <td>
                            <strong>{item.title}</strong>
                            <small className="table-subtext">
                              {item.category || "Uncategorized"}
                            </small>
                          </td>
                          <td>{formatLocation(item)}</td>
                          <td>{item.date}</td>
                          <td>
                            <span
                              className={`status-badge ${
                                item.status === "under_review"
                                  ? "status-blue"
                                  : "status-neutral"
                              }`}
                            >
                              {statusText(item.status)}
                            </span>
                          </td>
                          <td className="text-right">
                            <div className="action-button-group justify-end">
                              <button
                                className="btn btn-primary btn-sm"
                                onClick={() => {
                                  setSelected(item);
                                  setSelectedLost(null);
                                }}
                                type="button"
                              >
                                Open Comparison
                              </button>
                              {item.status === "reported" && (
                                <button
                                  className="btn btn-secondary btn-sm"
                                  onClick={() => markUnderReview(item.id)}
                                  type="button"
                                >
                                  Mark Under Review
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-panel-state">
                  <p>
                    All found reports have been reviewed or matched. Great work!
                  </p>
                </div>
              )}
            </section>
          )}

          {/* TAB 2: CLAIMS & HANDOVER */}
          {activeTab === "claims" && (
            <section className="workspace-panel">
              <div className="panel-header-row">
                <div>
                  <h2 className="panel-title">
                    Claim Review &amp; Physical Handover
                  </h2>
                  <p className="panel-subtitle">
                    Verify claimant identity, approve authentic claims, or
                    finalize physical item return to complete cases.
                  </p>
                </div>
                <span className="panel-counter">
                  {queue.claims.length} claim
                  {queue.claims.length === 1 ? "" : "s"}
                </span>
              </div>

              {queue.claims.length ? (
                <div className="claims-cards-grid">
                  {queue.claims.map((claim) => (
                    <article className="claim-card-row" key={claim.id}>
                      <div className="claim-main-info">
                        <div className="claim-header-line">
                          <span className="claim-id-pill">
                            Claim #{claim.id}
                          </span>
                          <span
                            className={`status-badge ${
                              claim.status === "approved"
                                ? "status-success"
                                : claim.status === "rejected"
                                  ? "status-danger"
                                  : "status-amber"
                            }`}
                          >
                            {claimStatusText(claim.status)}
                          </span>
                        </div>

                        <div className="claim-claimant-info">
                          <strong>Claimant: {claim.claimant}</strong>
                          {claim.finderPhone && (
                            <small>Finder contact: {claim.finderPhone}</small>
                          )}
                          {claim.rejectionReason && (
                            <small className="rejection-text">
                              Reason: {claim.rejectionReason}
                            </small>
                          )}
                        </div>
                      </div>

                      <div className="claim-actions-group">
                        {claim.status === "pending" ? (
                          <>
                            <button
                              className="btn btn-primary btn-sm"
                              onClick={() => decide(claim.id, "approved")}
                              type="button"
                            >
                              Approve Claim
                            </button>
                            <button
                              className="btn btn-danger btn-sm"
                              onClick={() => decide(claim.id, "rejected")}
                              type="button"
                            >
                              Reject Claim
                            </button>
                          </>
                        ) : claim.status === "approved" ? (
                          <button
                            className="btn btn-accent btn-sm"
                            onClick={() => collect(claim.id)}
                            type="button"
                          >
                            Mark as Complete &amp; Hand Over
                          </button>
                        ) : null}
                      </div>
                    </article>
                  ))}
                </div>
              ) : (
                <div className="empty-panel-state">
                  <p>No claims pending review or collection at this time.</p>
                </div>
              )}
            </section>
          )}

          {/* TAB 3: RESOLVED CASES */}
          {activeTab === "cases" && (
            <section className="workspace-panel">
              <div className="panel-header-row">
                <div>
                  <h2 className="panel-title">
                    Completed &amp; Resolved Records
                  </h2>
                  <p className="panel-subtitle">
                    Historical log of all successfully matched and collected
                    items across campus.
                  </p>
                </div>
                <span className="panel-counter">
                  {queue.cases.length} case{queue.cases.length === 1 ? "" : "s"}
                </span>
              </div>

              {queue.cases.length ? (
                <div className="table-responsive">
                  <table className="workspace-table">
                    <thead>
                      <tr>
                        <th>Item Identity</th>
                        <th>Reporter &amp; Finder</th>
                        <th>Location Found</th>
                        <th>Status</th>
                      </tr>
                    </thead>
                    <tbody>
                      {queue.cases.map((caseItem) => (
                        <tr key={`case-${caseItem.id}`}>
                          <td>
                            <strong>
                              {caseItem.lostTitle
                                ? `Lost: "${caseItem.lostTitle}" ↔ Found: "${caseItem.title}"`
                                : caseItem.title}
                            </strong>
                          </td>
                          <td>
                            <span className="table-subtext">
                              {caseItem.lostReporterName
                                ? `Owner: ${caseItem.lostReporterName}`
                                : ""}
                              {caseItem.finderName
                                ? ` · Finder: ${caseItem.finderName}`
                                : ""}
                            </span>
                          </td>
                          <td>{caseItem.foundLocation || "Campus"}</td>
                          <td>
                            <span className="status-badge status-success">
                              {statusText(caseItem.status)}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              ) : (
                <div className="empty-panel-state">
                  <p>No resolved cases recorded yet.</p>
                </div>
              )}
            </section>
          )}

          {/* ADMIN-SPECIFIC TABS */}
          {isAdmin && activeTab === "locations" && <LocationMapManagement />}

          {isAdmin && activeTab === "accounts" && <AdminAccountForm />}

          {isAdmin && activeTab === "system" && <AdminManagement />}
        </main>
      </div>

      {/* Compare Modal */}
      {selected && (
        <CompareModal
          selected={selected}
          selectedLost={selectedLost}
          setSelectedLost={setSelectedLost}
          queueLost={queue.lost}
          onClose={() => {
            setSelected(null);
            setSelectedLost(null);
          }}
          onMatch={handleMatch}
          onReviewStatus={reviewSelectedMatch}
        />
      )}
    </div>
  );
}
