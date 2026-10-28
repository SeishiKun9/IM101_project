import React, { useEffect, useState } from "react";
import { apiRequest } from "../api/client.js";
import ItemCard from "../components/ItemCard.jsx";
import { statusText } from "../constants/statuses.js";

function getPageNumbers(currentPage, totalPages) {
  if (totalPages <= 7) {
    return Array.from({ length: totalPages }, (_, i) => i + 1);
  }
  if (currentPage <= 4) {
    return [1, 2, 3, 4, 5, "...", totalPages];
  }
  if (currentPage >= totalPages - 3) {
    return [
      1,
      "...",
      totalPages - 4,
      totalPages - 3,
      totalPages - 2,
      totalPages - 1,
      totalPages,
    ];
  }
  return [
    1,
    "...",
    currentPage - 1,
    currentPage,
    currentPage + 1,
    "...",
    totalPages,
  ];
}

export default function DashboardPage({
  items = [],
  lostCount = 0,
  search = "",
  setSearch,
  type = "all",
  setType,
  status = "all",
  setStatus,
  category = "all",
  setCategory,
  dateFrom = "",
  setDateFrom,
  dateTo = "",
  setDateTo,
  sort = "newest",
  setSort,
  onResetFilters,
  page = 1,
  setPage,
  limit = 12,
  setLimit,
  pagination = {
    total: 0,
    page: 1,
    limit: 12,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  },
  loading = false,
  user,
  userReports = [],
  onOpenReport,
  onOpenLostReport,
  onOpenFoundReport,
  onClaimItem,
  onSelectItem,
}) {
  const [dbCategories, setDbCategories] = useState([]);

  useEffect(() => {
    apiRequest("/categories")
      .then((data) => {
        if (Array.isArray(data)) {
          setDbCategories(data.map((c) => c.name));
        }
      })
      .catch(() => {});
  }, []);

  // Merge database categories with any from currently loaded items
  const categories = [
    "all",
    ...Array.from(
      new Set([
        ...dbCategories,
        ...items.map((item) => item.category?.trim()).filter(Boolean),
      ]),
    ).sort((a, b) => a.localeCompare(b)),
  ];

  const typeButtons = [
    { value: "all", label: "All Items" },
    { value: "lost", label: "Lost Items" },
    { value: "found", label: "Found Items" },
  ].map(({ value, label }) => (
    <button
      key={value}
      className={type === value ? "filter-pill active" : "filter-pill"}
      onClick={() => setType?.(value)}
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

  const hasActiveFilters = Boolean(
    (search && search.trim()) ||
      type !== "all" ||
      status !== "all" ||
      category !== "all" ||
      dateFrom ||
      dateTo ||
      sort !== "newest",
  );

  const totalItems = pagination.total || items.length;
  const totalPages = pagination.totalPages || 1;
  const startItem = totalItems === 0 ? 0 : (page - 1) * limit + 1;
  const endItem = Math.min(page * limit, totalItems);

  const pageNumbers = getPageNumbers(page, totalPages);

  function handlePageChange(newPage) {
    if (newPage < 1 || newPage > totalPages || newPage === page) return;
    setPage?.(newPage);
    document.getElementById("browse")?.scrollIntoView({ behavior: "smooth" });
  }

  function handleLimitChange(newLimit) {
    setLimit?.(newLimit);
    setPage?.(1);
    document.getElementById("browse")?.scrollIntoView({ behavior: "smooth" });
  }

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
              onClick={onOpenLostReport || (() => onOpenReport?.("lost"))}
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
              onClick={onOpenFoundReport || (() => onOpenReport?.("found"))}
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
            Showing <strong>{startItem}-{endItem}</strong> of{" "}
            <strong>{totalItems}</strong> matching {totalItems === 1 ? "item" : "items"}
            {totalPages > 1 && (
              <span style={{ opacity: 0.85, marginLeft: 6 }}>
                (Page {page} of {totalPages})
              </span>
            )}
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
              placeholder="Search by keywords, title, location, category..."
              value={search}
              onChange={(event) => setSearch?.(event.target.value)}
            />
            {search && (
              <button
                className="clear-search-btn"
                onClick={() => setSearch?.("")}
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
              {/* Category Filter */}
              <select
                className="toolbar-select"
                value={category}
                onChange={(e) => setCategory?.(e.target.value)}
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

              {/* Status Filter */}
              <select
                className="toolbar-select"
                value={status}
                onChange={(event) => setStatus?.(event.target.value)}
                aria-label="Filter by status"
              >
                <option value="all">All statuses</option>
                {statusOptions}
              </select>

              {/* Sort Order Selector */}
              <select
                className="toolbar-select"
                value={sort}
                onChange={(e) => setSort?.(e.target.value)}
                aria-label="Sort reports"
              >
                <option value="newest">Sort: Newest First</option>
                <option value="oldest">Sort: Oldest First</option>
                <option value="title_asc">Sort: Title (A-Z)</option>
                <option value="title_desc">Sort: Title (Z-A)</option>
              </select>

              {/* Date Range Picker */}
              <div className="date-filter-group" title="Filter by date reported">
                <span className="date-filter-label">Reported:</span>
                <input
                  type="date"
                  className="toolbar-date-input"
                  value={dateFrom}
                  onChange={(e) => setDateFrom?.(e.target.value)}
                  title="From date"
                  aria-label="From date"
                />
                <span className="date-sep">to</span>
                <input
                  type="date"
                  className="toolbar-date-input"
                  value={dateTo}
                  onChange={(e) => setDateTo?.(e.target.value)}
                  title="To date"
                  aria-label="To date"
                />
                {(dateFrom || dateTo) && (
                  <button
                    type="button"
                    className="clear-date-btn"
                    onClick={() => {
                      setDateFrom?.("");
                      setDateTo?.("");
                    }}
                    title="Clear date range"
                  >
                    ×
                  </button>
                )}
              </div>
            </div>
          </div>

          {/* Active Filter Chips */}
          {hasActiveFilters && (
            <div className="active-filters-bar">
              <span className="active-filters-label">Active Filters:</span>

              {search && search.trim() && (
                <span className="filter-chip">
                  Keyword: <strong>"{search.trim()}"</strong>
                  <button
                    type="button"
                    className="filter-chip-remove"
                    onClick={() => setSearch?.("")}
                    title="Remove keyword filter"
                  >
                    ×
                  </button>
                </span>
              )}

              {type !== "all" && (
                <span className="filter-chip">
                  Type: <strong>{type === "lost" ? "Lost" : "Found"}</strong>
                  <button
                    type="button"
                    className="filter-chip-remove"
                    onClick={() => setType?.("all")}
                    title="Remove type filter"
                  >
                    ×
                  </button>
                </span>
              )}

              {category !== "all" && (
                <span className="filter-chip">
                  Category: <strong>{category}</strong>
                  <button
                    type="button"
                    className="filter-chip-remove"
                    onClick={() => setCategory?.("all")}
                    title="Remove category filter"
                  >
                    ×
                  </button>
                </span>
              )}

              {status !== "all" && (
                <span className="filter-chip">
                  Status: <strong>{statusText(status)}</strong>
                  <button
                    type="button"
                    className="filter-chip-remove"
                    onClick={() => setStatus?.("all")}
                    title="Remove status filter"
                  >
                    ×
                  </button>
                </span>
              )}

              {(dateFrom || dateTo) && (
                <span className="filter-chip">
                  Date:{" "}
                  <strong>
                    {dateFrom || "Any"} to {dateTo || "Today"}
                  </strong>
                  <button
                    type="button"
                    className="filter-chip-remove"
                    onClick={() => {
                      setDateFrom?.("");
                      setDateTo?.("");
                    }}
                    title="Remove date filter"
                  >
                    ×
                  </button>
                </span>
              )}

              {sort !== "newest" && (
                <span className="filter-chip">
                  Sort:{" "}
                  <strong>
                    {sort === "oldest"
                      ? "Oldest"
                      : sort === "title_asc"
                        ? "A-Z"
                        : "Z-A"}
                  </strong>
                  <button
                    type="button"
                    className="filter-chip-remove"
                    onClick={() => setSort?.("newest")}
                    title="Reset sort to newest"
                  >
                    ×
                  </button>
                </span>
              )}

              <button
                type="button"
                className="reset-all-filters-btn"
                onClick={() => onResetFilters?.()}
              >
                Reset All Filters
              </button>
            </div>
          )}
        </div>

        {/* Item Cards Grid */}
        <div className={`item-grid ${loading ? "opacity-loading" : ""}`}>
          {items.length ? (
            items.map((item) => {
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
                {hasActiveFilters
                  ? "Try adjusting your search terms, widening your date range, or clearing filters to see more results."
                  : "There are currently no public items reported in the registry."}
              </p>
              {hasActiveFilters && (
                <button
                  className="btn btn-secondary"
                  type="button"
                  onClick={() => onResetFilters?.()}
                >
                  Reset all filters
                </button>
              )}
            </div>
          )}
        </div>

        {/* Pagination Bar (Item 6) */}
        {totalItems > 0 && (
          <div className="pagination-wrapper">
            <div className="pagination-info">
              Showing <strong>{startItem}</strong> - <strong>{endItem}</strong> of{" "}
              <strong>{totalItems}</strong> items
            </div>

            <div className="pagination-nav">
              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(page - 1)}
                disabled={!pagination.hasPrev || loading}
                aria-label="Previous page"
              >
                ‹ Prev
              </button>

              {pageNumbers.map((p, idx) =>
                p === "..." ? (
                  <span key={`dots-${idx}`} className="pagination-ellipsis">
                    …
                  </span>
                ) : (
                  <button
                    key={p}
                    type="button"
                    className={`pagination-btn ${p === page ? "active" : ""}`}
                    onClick={() => handlePageChange(p)}
                    disabled={loading}
                  >
                    {p}
                  </button>
                ),
              )}

              <button
                type="button"
                className="pagination-btn"
                onClick={() => handlePageChange(page + 1)}
                disabled={!pagination.hasNext || loading}
                aria-label="Next page"
              >
                Next ›
              </button>
            </div>

            <div className="pagination-per-page">
              <span>Show</span>
              <select
                className="toolbar-select limit-select"
                value={limit}
                onChange={(e) => handleLimitChange(Number(e.target.value))}
                aria-label="Items per page"
              >
                <option value={12}>12 / page</option>
                <option value={24}>24 / page</option>
                <option value={48}>48 / page</option>
              </select>
            </div>
          </div>
        )}
      </section>
    </div>
  );
}
