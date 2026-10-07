import React from "react";
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
  onClaimItem,
  onSelectItem,
}) {
  const typeButtons = ["all", "lost", "found"].map((value) => (
    <button
      key={value}
      className={type === value ? "filter active" : "filter"}
      onClick={() => setType(value)}
      type="button"
    >
      {value === "all"
        ? "All reports"
        : value.charAt(0).toUpperCase() + value.slice(1)}
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
    <>
      <section className="intro">
        <div className="intro-copy">
          <p className="eyebrow">CAMPUS OPERATIONS / 2026</p>
          <h1>
            Find what matters.
            <br />
            <em>Return it right.</em>
          </h1>
          <p className="lede">
            A public, accountable record for every lost item, found report, and
            verified handover across campus.
          </p>
          <button className="primary" onClick={onOpenReport}>
            Report an item
          </button>
        </div>
      </section>

      <section id="browse" className="workspace">
        <div className="section-heading">
          <div>
            <p className="eyebrow">GLOBAL DASHBOARD</p>
            <h2>Public board</h2>
            <p className="lost-counter">Currently lost: {lostCount}</p>
          </div>
          <input
            className="search-input"
            type="search"
            placeholder="Search items"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
          />
        </div>

        <div className="filters">
          {typeButtons}
          <select
            className="status-filter"
            value={status}
            onChange={(event) => setStatus(event.target.value)}
          >
            <option value="all">All statuses</option>
            {statusOptions}
          </select>
        </div>

        <div className="item-grid">
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
            <div className="empty-state">
              No public reports match those filters.
            </div>
          )}
        </div>
      </section>
    </>
  );
}
