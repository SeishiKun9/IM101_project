import React, { useState } from "react";
import ItemCard from "../components/ItemCard.jsx";
import { statusText } from "../constants/statuses.js";

export default function DashboardPage({
  items,
  lostCount,
  search,
  setSearch,
  type,
  setType,
  status,
  setStatus,
  user,
  userReports,
  onOpenReport,
  onOpenLostReport,
  onOpenFoundReport,
  onClaimItem,
  onSelectItem,
}) {
  const [selectedCategory, setSelectedCategory] = useState("all");

  // Extract categories dynamically from the loaded items
  const categories = [
    "all",
    ...Array.from(
      new Set(items.map((item) => item.category?.trim()).filter(Boolean)),
    ).sort(),
  ];

  // Filter items locally by category if specified
  const filteredItems = items.filter((item) => {
    if (selectedCategory === "all") return true;
    return (
      item.category?.trim().toLowerCase() === selectedCategory.toLowerCase()
    );
  });

  const typeButtons = [
    { value: "all", label: "All Items" },
    { value: "lost", label: "Lost Items" },
    { value: "found", label: "Found Items" },
  ].map(({ value, label }) => (
    <button
      key={value}
      className={type === value ? "filter-pill active" : "filter-pill"}
      onClick={() => setType(value)}
      type="button"
    >
      {label}
    </button>
  ));

  const statusOptions = [
    "reported",
    "under_review",
    "found",
    "claimed",
    "completed",
  ].map((value) => (
    <option key={value} value={value}>
      {statusText(value)}
    </option>
  ));

  return (
    <div className="dashboard-page">
      {/* Welcoming Hero Section */}
      <section className="hero-banner">
        <div className="hero-content">
          <div className="hero-badge">
            <span className="hero-badge-dot" />
            Official Campus Registry
          </div>
          <h1 className="hero-title">
            Lost something? <br />
            <span>Let&rsquo;s help you find it.</span>
          </h1>
          <p className="hero-subtitle">
            A centralized, verified lost and found system for students, faculty,
            and campus staff. Search verified records or submit a report in
            seconds.
          </p>

          <div className="hero-actions">
            <button
              className="btn btn-primary btn-lg"
              onClick={onOpenLostReport || (() => onOpenReport("lost"))}
              type="button"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <circle cx="11" cy="11" r="8" />
                <line x1="21" y1="21" x2="16.65" y2="16.65" />
              </svg>
              Report Lost Item
            </button>

            <button
              className="btn btn-accent btn-lg"
              onClick={onOpenFoundReport || (() => onOpenReport("found"))}
              type="button"
            >
              <svg
                width="18"
                height="18"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2.2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                <line x1="12" y1="22.08" x2="12" y2="12" />
              </svg>
              Report Found Item
            </button>
          </div>
        </div>

        <div className="hero-stats-card">
          <div className="hero-stat-item">
            <span className="hero-stat-number">{lostCount}</span>
            <span className="hero-stat-label">Currently Lost Items</span>
          </div>
          <div className="hero-stat-divider" />
          <div className="hero-stat-note">
            <span>● Live Verification Active</span>
            <small>All found property is safely turned over to CSA</small>
          </div>
        </div>
      </section>

      {/* Main Browse Section */}
      <section id="browse" className="workspace-container">
        <div className="board-header">
          <div>
            <h2 className="board-title">Public Directory</h2>
            <p className="board-subtitle">
              Browse approved public lost and found reports across all campus
              areas.
            </p>
          </div>
          <div className="items-counter-badge">
            Showing <strong>{filteredItems.length}</strong> matching{" "}
            {filteredItems.length === 1 ? "item" : "items"}
          </div>
        </div>

        {/* Filters and Search Bar */}
        <div className="filter-toolbar">
          <div className="search-box">
            <svg
              className="search-icon"
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
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
            <input
              className="search-input"
              type="search"
              placeholder="Search by title, location, description..."
              value={search}
              onChange={(event) => setSearch(event.target.value)}
            />
            {search && (
              <button
                className="clear-search-btn"
                onClick={() => setSearch("")}
                type="button"
                aria-label="Clear search"
              >
                ×
              </button>
            )}
          </div>

          <div className="filter-controls">
            <div className="type-pills">{typeButtons}</div>

            <div className="select-filters">
              {categories.length > 2 && (
                <select
                  className="toolbar-select"
                  value={selectedCategory}
                  onChange={(e) => setSelectedCategory(e.target.value)}
                  aria-label="Filter by category"
                >
                  <option value="all">All categories</option>
                  {categories
                    .filter((c) => c !== "all")
                    .map((cat) => (
                      <option key={cat} value={cat}>
                        Category: {cat}
                      </option>
                    ))}
                </select>
              )}

              <select
                className="toolbar-select"
                value={status}
                onChange={(event) => setStatus(event.target.value)}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                {statusOptions}
              </select>
            </div>
          </div>
        </div>

        {/* Item Cards Grid */}
        <div className="item-grid">
          {filteredItems.length ? (
            filteredItems.map((item) => {
              const cardItem = {
                ...item,
                eligibleToClaim:
                  item.type !== "found" ||
                  !user ||
                  userReports.some(
                    (report) => report.id === item.matchedLostId,
                  ),
              };
              return (
                <ItemCard
                  key={item.id}
                  item={cardItem}
                  onClaim={onClaimItem}
                  onView={onSelectItem}
                />
              );
            })
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
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="8" y1="11" x2="14" y2="11" />
                </svg>
              </div>
              <h3>No matching items found</h3>
              <p>
                {search ||
                type !== "all" ||
                status !== "all" ||
                selectedCategory !== "all"
                  ? "Try adjusting your search terms or clearing filters to see more results."
                  : "There are currently no public items reported in the registry."}
              </p>
              {(search ||
                type !== "all" ||
                status !== "all" ||
                selectedCategory !== "all") && (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => {
                    setSearch("");
                    setType("all");
                    setStatus("all");
                    setSelectedCategory("all");
                  }}
                >
                  Reset all filters
                </button>
              )}
            </div>
          )}
        </div>
      </section>
    </div>
  );
}
