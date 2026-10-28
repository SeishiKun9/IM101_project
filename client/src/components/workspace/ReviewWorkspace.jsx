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
import AuditLogManagement from "./AuditLogManagement.jsx";
import ClaimConversationModal from "../ClaimConversationModal.jsx";
import CompareModal from "./CompareModal.jsx";
import LocationMapManagement from "./LocationMapManagement.jsx";
import ExportDataModal from "./ExportDataModal.jsx";
import UnclaimedItemsManagement from "./UnclaimedItemsManagement.jsx";

export default function ReviewWorkspace({ user, onChanged }) {
  const [queue, setQueue] = useState({
    items: [],
    lost: [],
    claims: [],
    cases: [],
    unclaimed: [],
  });
  const [selected, setSelected] = useState(null);
  const [selectedLost, setSelectedLost] = useState(null);
  const [selectedChatClaimId, setSelectedChatClaimId] = useState(null);
  const [exportModalDataset, setExportModalDataset] = useState(null);
  const [error, setError] = useState("");
  const [activeTab, setActiveTab] = useState("compare"); // "compare" | "claims" | "cases" | "locations" | "accounts" | "system" | "audit"
  const [reviewType, setReviewType] = useState("found"); // "found" | "lost"
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const [refreshing, setRefreshing] = useState(false);

  // Task 17: Bulk actions state
  const [selectedClaimIds, setSelectedClaimIds] = useState([]);
  const [selectedItemIds, setSelectedItemIds] = useState([]);
  const [bulkActionBusy, setBulkActionBusy] = useState(false);
  const [bulkActionNotice, setBulkActionNotice] = useState(null);
  const [bulkRejectModalOpen, setBulkRejectModalOpen] = useState(false);
  const [bulkRejectReason, setBulkRejectReason] = useState(
    "Insufficient proof of ownership provided",
  );

  // Clear selections when switching tabs
  useEffect(() => {
    setSelectedClaimIds([]);
    setSelectedItemIds([]);
    setBulkActionNotice(null);
  }, [activeTab]);

  useEffect(() => {
    if (mobileNavOpen) {
      document.body.style.overflow = "hidden";
    } else {
      document.body.style.overflow = "";
    }
    return () => {
      document.body.style.overflow = "";
    };
  }, [mobileNavOpen]);

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

  // Task 17: Bulk Claims Handlers
  function toggleClaimSelection(claimId) {
    setSelectedClaimIds((prev) =>
      prev.includes(claimId)
        ? prev.filter((id) => id !== claimId)
        : [...prev, claimId],
    );
  }

  function selectAllClaims(filterStatus = null) {
    if (!queue.claims || !queue.claims.length) return;
    const targetClaims = filterStatus
      ? queue.claims.filter((c) => c.status === filterStatus)
      : queue.claims;
    setSelectedClaimIds(targetClaims.map((c) => c.id));
  }

  function clearClaimSelection() {
    setSelectedClaimIds([]);
  }

  async function handleBulkClaimDecision(decision, customReason = "") {
    const pendingSelectedIds = selectedClaimIds.filter((id) => {
      const claim = queue.claims.find((c) => c.id === id);
      return claim && claim.status === "pending";
    });

    if (!pendingSelectedIds.length) {
      setBulkActionNotice({
        type: "error",
        message: `No pending claims selected to ${decision}.`,
      });
      return;
    }

    setBulkActionBusy(true);
    try {
      const res = await apiRequest("/admin/claims/bulk-decision", {
        method: "POST",
        body: JSON.stringify({
          claimIds: pendingSelectedIds,
          decision,
          reason: customReason || "",
        }),
      });

      setBulkActionNotice({
        type: "success",
        message: res.message || `Successfully processed ${res.processedCount} claims.`,
      });
      setSelectedClaimIds([]);
      setBulkRejectModalOpen(false);
      refresh();
      onChanged?.();
    } catch (err) {
      setBulkActionNotice({
        type: "error",
        message: err.message || "Failed to process bulk decision.",
      });
    } finally {
      setBulkActionBusy(false);
    }
  }

  async function handleBulkCollect() {
    const approvedSelectedIds = selectedClaimIds.filter((id) => {
      const claim = queue.claims.find((c) => c.id === id);
      return claim && claim.status === "approved";
    });

    if (!approvedSelectedIds.length) {
      setBulkActionNotice({
        type: "error",
        message: "No approved claims selected for handover.",
      });
      return;
    }

    setBulkActionBusy(true);
    try {
      const res = await apiRequest("/admin/claims/bulk-collect", {
        method: "POST",
        body: JSON.stringify({ claimIds: approvedSelectedIds }),
      });

      setBulkActionNotice({
        type: "success",
        message: res.message || `Successfully completed handover for ${res.processedCount} items.`,
      });
      setSelectedClaimIds([]);
      refresh();
      onChanged?.();
    } catch (err) {
      setBulkActionNotice({
        type: "error",
        message: err.message || "Failed to complete bulk handover.",
      });
    } finally {
      setBulkActionBusy(false);
    }
  }

  // Task 17: Bulk Items Handlers
  function toggleItemSelection(itemId) {
    setSelectedItemIds((prev) =>
      prev.includes(itemId)
        ? prev.filter((id) => id !== itemId)
        : [...prev, itemId],
    );
  }

  function toggleAllCurrentItems() {
    const currentList = reviewType === "found" ? queue.items : queue.lost;
    const allSelected =
      currentList.length > 0 &&
      currentList.every((item) => selectedItemIds.includes(item.id));

    if (allSelected) {
      const currentIds = new Set(currentList.map((item) => item.id));
      setSelectedItemIds((prev) => prev.filter((id) => !currentIds.has(id)));
    } else {
      const newIds = currentList.map((item) => item.id);
      setSelectedItemIds((prev) => Array.from(new Set([...prev, ...newIds])));
    }
  }

  function clearItemSelection() {
    setSelectedItemIds([]);
  }

  async function handleBulkItemStatus(status, notes = "") {
    if (!selectedItemIds.length) return;

    if (status === "closed") {
      const confirmed = window.confirm(
        `Are you sure you want to close/archive ${selectedItemIds.length} selected report(s)?`,
      );
      if (!confirmed) return;
    }

    setBulkActionBusy(true);
    try {
      const res = await apiRequest("/admin/items/bulk-status", {
        method: "POST",
        body: JSON.stringify({
          itemIds: selectedItemIds,
          status,
          notes,
        }),
      });

      setBulkActionNotice({
        type: "success",
        message: res.message || `Successfully updated ${res.processedCount} items.`,
      });
      setSelectedItemIds([]);
      refresh();
      onChanged?.();
    } catch (err) {
      setBulkActionNotice({
        type: "error",
        message: err.message || "Failed to update item statuses.",
      });
    } finally {
      setBulkActionBusy(false);
    }
  }

  function switchReviewType(type) {
    setReviewType(type);
    setSelectedItemIds([]);
    setBulkActionNotice(null);
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

  async function revertStatus(itemId) {
    try {
      await apiRequest(`/reports/${itemId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "reported" }),
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

  async function exportReportsCsv() {
    try {
      const token = localStorage.getItem("campusToken");
      const headers = token ? { Authorization: `Bearer ${token}` } : {};

      const response = await fetch("/api/admin/export/reports-csv", {
        credentials: "same-origin",
        headers,
      });

      if (!response.ok) {
        throw new Error("Could not generate reports CSV export.");
      }

      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `campus-reports-${new Date().toISOString().slice(0, 10)}.csv`;
      document.body.appendChild(link);
      link.click();
      link.remove();
      window.URL.revokeObjectURL(url);
    } catch (err) {
      setError(err.message || "Failed to download reports CSV.");
    }
  }

  const pendingClaimsCount = (queue.claims || []).filter((c) => c.status === "pending").length;
  const approvedClaimsCount = (queue.claims || []).filter((c) => c.status === "approved").length;
  const selectedPendingClaims = (queue.claims || []).filter(
    (c) => selectedClaimIds.includes(c.id) && c.status === "pending",
  );
  const selectedApprovedClaims = (queue.claims || []).filter(
    (c) => selectedClaimIds.includes(c.id) && c.status === "approved",
  );

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
    {
      id: "unclaimed",
      label: "Unclaimed Expiry",
      count: queue.unclaimed?.length || 0,
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
        >
          <circle cx="12" cy="12" r="10" />
          <polyline points="12 6 12 12 16 14" />
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
        label: "Create Accounts",
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
      {
        id: "audit",
        label: "System Audit Logs",
        icon: (
          <svg
            width="18"
            height="18"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
          >
            <path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10z" />
            <path d="m9 12 2 2 4-4" />
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
            onClick={() => setExportModalDataset("items")}
            type="button"
            title="Open Data Export & Reporting Center (CSV / Printable Summary)"
          >
            📥 Export Data / Reports
          </button>
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

        <div
          className={`kpi-card clickable ${activeTab === "unclaimed" ? "active" : ""}`}
          onClick={() => setActiveTab("unclaimed")}
        >
          <span className="kpi-label">Unclaimed Expiry</span>
          <span
            className="kpi-value"
            style={{ color: (queue.unclaimed?.length || 0) > 0 ? "#ea580c" : undefined }}
          >
            {queue.unclaimed?.length || 0}
          </span>
          <span className="kpi-hint">&ge; 30 days in storage</span>
        </div>
      </section>

      {error && (
        <div className="alert-banner alert-danger">
          <strong>Error:</strong> {error}
        </div>
      )}

      {bulkActionNotice && (
        <div
          className={`alert-banner ${bulkActionNotice.type === "error" ? "alert-danger" : "alert-success"}`}
          style={{
            display: "flex",
            justifyContent: "space-between",
            alignItems: "center",
            marginBottom: "16px",
          }}
        >
          <span>{bulkActionNotice.message}</span>
          <button
            type="button"
            className="btn btn-sm"
            onClick={() => setBulkActionNotice(null)}
            style={{
              background: "transparent",
              border: "none",
              color: "inherit",
              fontSize: "18px",
              cursor: "pointer",
              padding: "0 4px",
              lineHeight: 1,
            }}
            title="Dismiss notice"
          >
            ×
          </button>
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
              <div
                className="tab-pill-group"
                style={{
                  marginBottom: "20px",
                  display: "flex",
                  gap: "10px",
                  borderBottom: "1px solid var(--border)",
                  paddingBottom: "12px",
                }}
              >
                <button
                  type="button"
                  className={`btn btn-sm ${
                    reviewType === "found" ? "btn-primary" : "btn-secondary"
                  }`}
                  onClick={() => switchReviewType("found")}
                >
                  Found Reports ({queue.items.length})
                </button>
                <button
                  type="button"
                  className={`btn btn-sm ${
                    reviewType === "lost" ? "btn-primary" : "btn-secondary"
                  }`}
                  onClick={() => switchReviewType("lost")}
                >
                  Lost Reports ({queue.lost.length})
                </button>
              </div>

              {reviewType === "found" ? (
                <>
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
                      {queue.items.length} item
                      {queue.items.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {/* Bulk actions toolbar for found items */}
                  {selectedItemIds.length > 0 && (
                    <div className="bulk-actions-toolbar">
                      <div className="bulk-toolbar-info">
                        <span className="bulk-toolbar-count">
                          <strong>{selectedItemIds.length}</strong> report{selectedItemIds.length === 1 ? "" : "s"} selected
                        </span>
                      </div>
                      <div className="bulk-toolbar-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={bulkActionBusy}
                          onClick={() => handleBulkItemStatus("under_review")}
                        >
                          👁 Mark Under Review ({selectedItemIds.length})
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={bulkActionBusy}
                          onClick={() => handleBulkItemStatus("reported")}
                        >
                          ↺ Reset to Reported ({selectedItemIds.length})
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={bulkActionBusy}
                          onClick={() => handleBulkItemStatus("closed", "Closed via bulk verifier review")}
                        >
                          🔒 Close / Archive ({selectedItemIds.length})
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={bulkActionBusy}
                          onClick={clearItemSelection}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {queue.items.length ? (
                    <div className="table-responsive">
                      <table className="workspace-table">
                        <thead>
                          <tr>
                            <th style={{ width: "42px", textAlign: "center" }}>
                              <input
                                type="checkbox"
                                className="bulk-select-checkbox"
                                checked={
                                  queue.items.length > 0 &&
                                  queue.items.every((item) => selectedItemIds.includes(item.id))
                                }
                                onChange={toggleAllCurrentItems}
                                title="Select/Deselect all found reports"
                                aria-label="Select all found reports"
                              />
                            </th>
                            <th>Item &amp; Category</th>
                            <th>Turned In Location</th>
                            <th>Date Found</th>
                            <th>Status</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {queue.items.map((item) => (
                            <tr key={item.id} className={selectedItemIds.includes(item.id) ? "row-selected" : ""}>
                              <td style={{ textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  className="bulk-select-checkbox"
                                  checked={selectedItemIds.includes(item.id)}
                                  onChange={() => toggleItemSelection(item.id)}
                                  aria-label={`Select ${item.title}`}
                                />
                              </td>
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
                                      const matched = queue.lost.find(
                                        (l) => l.id === item.reviewLostId,
                                      );
                                      setSelectedLost(matched || null);
                                    }}
                                    type="button"
                                  >
                                    Open Comparison
                                  </button>
                                  {item.status === "reported" ? (
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => markUnderReview(item.id)}
                                      type="button"
                                    >
                                      Mark Under Review
                                    </button>
                                  ) : (
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => revertStatus(item.id)}
                                      type="button"
                                      title="Reset item back to reported status"
                                    >
                                      Reset to Reported
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
                </>
              ) : (
                <>
                  <div className="panel-header-row">
                    <div>
                      <h2 className="panel-title">
                        Lost Reports Awaiting Verification
                      </h2>
                      <p className="panel-subtitle">
                        Student-submitted lost reports. Mark them under review while searching for matches or when potential candidates are found.
                      </p>
                    </div>
                    <span className="panel-counter">
                      {queue.lost.length} item
                      {queue.lost.length === 1 ? "" : "s"}
                    </span>
                  </div>

                  {/* Bulk actions toolbar for lost items */}
                  {selectedItemIds.length > 0 && (
                    <div className="bulk-actions-toolbar">
                      <div className="bulk-toolbar-info">
                        <span className="bulk-toolbar-count">
                          <strong>{selectedItemIds.length}</strong> report{selectedItemIds.length === 1 ? "" : "s"} selected
                        </span>
                      </div>
                      <div className="bulk-toolbar-actions">
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={bulkActionBusy}
                          onClick={() => handleBulkItemStatus("under_review")}
                        >
                          👁 Mark Under Review ({selectedItemIds.length})
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={bulkActionBusy}
                          onClick={() => handleBulkItemStatus("reported")}
                        >
                          ↺ Reset to Reported ({selectedItemIds.length})
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={bulkActionBusy}
                          onClick={() => handleBulkItemStatus("closed", "Closed via bulk verifier review")}
                        >
                          🔒 Close / Archive ({selectedItemIds.length})
                        </button>
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          disabled={bulkActionBusy}
                          onClick={clearItemSelection}
                        >
                          Cancel
                        </button>
                      </div>
                    </div>
                  )}

                  {queue.lost.length ? (
                    <div className="table-responsive">
                      <table className="workspace-table">
                        <thead>
                          <tr>
                            <th style={{ width: "42px", textAlign: "center" }}>
                              <input
                                type="checkbox"
                                className="bulk-select-checkbox"
                                checked={
                                  queue.lost.length > 0 &&
                                  queue.lost.every((item) => selectedItemIds.includes(item.id))
                                }
                                onChange={toggleAllCurrentItems}
                                title="Select/Deselect all lost reports"
                                aria-label="Select all lost reports"
                              />
                            </th>
                            <th>Item &amp; Category</th>
                            <th>Last Known Location</th>
                            <th>Date Lost</th>
                            <th>Status</th>
                            <th className="text-right">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {queue.lost.map((item) => (
                            <tr key={item.id} className={selectedItemIds.includes(item.id) ? "row-selected" : ""}>
                              <td style={{ textAlign: "center" }}>
                                <input
                                  type="checkbox"
                                  className="bulk-select-checkbox"
                                  checked={selectedItemIds.includes(item.id)}
                                  onChange={() => toggleItemSelection(item.id)}
                                  aria-label={`Select ${item.title}`}
                                />
                              </td>
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
                                  {item.status === "reported" ? (
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => markUnderReview(item.id)}
                                      type="button"
                                    >
                                      Mark Under Review
                                    </button>
                                  ) : (
                                    <button
                                      className="btn btn-secondary btn-sm"
                                      onClick={() => revertStatus(item.id)}
                                      type="button"
                                      title="Reset lost report back to reported status"
                                    >
                                      Reset to Reported
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
                      <p>No active lost reports currently in review.</p>
                    </div>
                  )}
                </>
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

              {/* Bulk Selection Quick Filter Pills */}
              {queue.claims.length > 0 && (
                <div className="bulk-selection-bar">
                  <div className="bulk-selection-pills">
                    <span className="bulk-selection-label">Select:</span>
                    <button
                      type="button"
                      className="bulk-pill-btn"
                      onClick={() => selectAllClaims()}
                    >
                      All ({queue.claims.length})
                    </button>
                    <button
                      type="button"
                      className="bulk-pill-btn"
                      onClick={() => selectAllClaims("pending")}
                    >
                      All Pending ({pendingClaimsCount})
                    </button>
                    <button
                      type="button"
                      className="bulk-pill-btn"
                      onClick={() => selectAllClaims("approved")}
                    >
                      All Approved ({approvedClaimsCount})
                    </button>
                    {selectedClaimIds.length > 0 && (
                      <button
                        type="button"
                        className="bulk-pill-btn bulk-pill-clear"
                        onClick={clearClaimSelection}
                      >
                        Clear Selection ({selectedClaimIds.length})
                      </button>
                    )}
                  </div>
                </div>
              )}

              {/* Sticky Bulk Actions Toolbar */}
              {selectedClaimIds.length > 0 && (
                <div className="bulk-actions-toolbar">
                  <div className="bulk-toolbar-info">
                    <span className="bulk-toolbar-count">
                      <strong>{selectedClaimIds.length}</strong> claim{selectedClaimIds.length === 1 ? "" : "s"} selected
                    </span>
                    <span className="bulk-toolbar-breakdown">
                      ({selectedPendingClaims.length} pending, {selectedApprovedClaims.length} approved)
                    </span>
                  </div>
                  <div className="bulk-toolbar-actions">
                    {selectedPendingClaims.length > 0 && (
                      <>
                        <button
                          type="button"
                          className="btn btn-primary btn-sm"
                          disabled={bulkActionBusy}
                          onClick={() => handleBulkClaimDecision("approved")}
                          title="Approve all selected pending claims"
                        >
                          ✓ Bulk Approve ({selectedPendingClaims.length})
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          disabled={bulkActionBusy}
                          onClick={() => setBulkRejectModalOpen(true)}
                          title="Reject all selected pending claims"
                        >
                          ✕ Bulk Reject ({selectedPendingClaims.length})
                        </button>
                      </>
                    )}
                    {selectedApprovedClaims.length > 0 && (
                      <button
                        type="button"
                        className="btn btn-accent btn-sm"
                        disabled={bulkActionBusy}
                        onClick={handleBulkCollect}
                        title="Complete physical handover for all selected approved claims"
                      >
                        🤝 Complete Handover ({selectedApprovedClaims.length})
                      </button>
                    )}
                    <button
                      type="button"
                      className="btn btn-secondary btn-sm"
                      disabled={bulkActionBusy}
                      onClick={clearClaimSelection}
                    >
                      Cancel
                    </button>
                  </div>
                </div>
              )}

              {queue.claims.length ? (
                <div className="claims-cards-grid">
                  {queue.claims.map((claim) => (
                    <article
                      className={`claim-card-row ${selectedClaimIds.includes(claim.id) ? "selected" : ""}`}
                      key={claim.id}
                    >
                      <div className="claim-selection-col">
                        <input
                          type="checkbox"
                          className="bulk-select-checkbox"
                          checked={selectedClaimIds.includes(claim.id)}
                          onChange={() => toggleClaimSelection(claim.id)}
                          aria-label={`Select claim #${claim.id}`}
                        />
                      </div>
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
                        <button
                          className="btn btn-secondary btn-sm"
                          onClick={() => setSelectedChatClaimId(claim.id)}
                          type="button"
                          title="Open conversation and review submitted ownership evidence"
                        >
                          💬 Chat &amp; Evidence
                          {claim.messageCount ? ` (${claim.messageCount})` : ""}
                          {claim.proofCount ? ` 📎 ${claim.proofCount}` : ""}
                        </button>
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
                <div style={{ display: "flex", gap: "0.75rem", alignItems: "center" }}>
                  <button
                    className="btn btn-secondary btn-sm"
                    onClick={() => setExportModalDataset("items")}
                    type="button"
                    title="Open Data Export & Reporting Center"
                  >
                    📥 Export Registry CSV
                  </button>
                  <span className="panel-counter">
                    {queue.cases.length} case{queue.cases.length === 1 ? "" : "s"}
                  </span>
                </div>
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
          {activeTab === "unclaimed" && (
            <UnclaimedItemsManagement onActionCompleted={refresh} />
          )}

          {isAdmin && activeTab === "locations" && <LocationMapManagement />}

          {isAdmin && activeTab === "accounts" && <AdminAccountForm />}

          {isAdmin && activeTab === "system" && <AdminManagement />}

          {isAdmin && activeTab === "audit" && <AuditLogManagement />}
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

      {/* Data Export & Reporting Center Modal */}
      {exportModalDataset && (
        <ExportDataModal
          user={user}
          initialDataset={exportModalDataset}
          onClose={() => setExportModalDataset(null)}
        />
      )}

      {/* Claim Conversation & Evidence Modal */}
      {selectedChatClaimId && (
        <ClaimConversationModal
          claimId={selectedChatClaimId}
          onClose={() => setSelectedChatClaimId(null)}
          onClaimUpdated={() => {
            refresh();
            onChanged?.();
          }}
        />
      )}

      {/* Task 17: Bulk Reject Modal */}
      {bulkRejectModalOpen && (
        <div
          className="modal-backdrop"
          onClick={() => !bulkActionBusy && setBulkRejectModalOpen(false)}
        >
          <div
            className="modal-card bulk-reject-modal"
            onClick={(e) => e.stopPropagation()}
            role="dialog"
            aria-modal="true"
            aria-labelledby="bulk-reject-title"
          >
            <div className="modal-header">
              <h3 id="bulk-reject-title">
                Bulk Reject Claims ({selectedPendingClaims.length})
              </h3>
              <button
                type="button"
                className="modal-close"
                onClick={() => !bulkActionBusy && setBulkRejectModalOpen(false)}
              >
                ×
              </button>
            </div>
            <div
              className="modal-body"
              style={{ display: "flex", flexDirection: "column", gap: "14px", marginTop: "12px" }}
            >
              <p style={{ margin: 0, color: "var(--text-muted)", fontSize: "14px", lineHeight: "1.5" }}>
                You are about to reject <strong>{selectedPendingClaims.length}</strong> pending claim
                {selectedPendingClaims.length === 1 ? "" : "s"}. Each claimant will receive an in-app
                notification and an email notification with the reason below.
              </p>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "13px",
                    fontWeight: "600",
                  }}
                >
                  Reason for Rejection:
                </label>
                <textarea
                  rows="3"
                  value={bulkRejectReason}
                  onChange={(e) => setBulkRejectReason(e.target.value)}
                  placeholder="Explain why these claims are being rejected..."
                  style={{ width: "100%", resize: "vertical" }}
                />
              </div>

              <div>
                <label
                  style={{
                    display: "block",
                    marginBottom: "6px",
                    fontSize: "12px",
                    color: "var(--text-muted)",
                    fontWeight: "500",
                  }}
                >
                  Quick preset reasons:
                </label>
                <div style={{ display: "flex", flexWrap: "wrap", gap: "6px" }}>
                  {[
                    "Insufficient proof of ownership provided",
                    "Item description and serial markings do not match",
                    "Claim expired without verification response",
                    "Duplicate claim submission",
                  ].map((preset) => (
                    <button
                      key={preset}
                      type="button"
                      className="btn btn-secondary btn-sm"
                      style={{ fontSize: "12px", padding: "4px 8px" }}
                      onClick={() => setBulkRejectReason(preset)}
                    >
                      {preset}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div
              className="modal-footer"
              style={{
                display: "flex",
                justifyContent: "flex-end",
                gap: "10px",
                marginTop: "20px",
                borderTop: "1px solid var(--border)",
                paddingTop: "14px",
              }}
            >
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                disabled={bulkActionBusy}
                onClick={() => setBulkRejectModalOpen(false)}
              >
                Cancel
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                disabled={bulkActionBusy || !bulkRejectReason.trim()}
                onClick={() => handleBulkClaimDecision("rejected", bulkRejectReason)}
              >
                {bulkActionBusy
                  ? "Rejecting..."
                  : `Confirm Rejection (${selectedPendingClaims.length})`}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
