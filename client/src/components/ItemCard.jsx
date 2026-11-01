import React from "react";
import { statusText } from "../constants/statuses.js";
import { formatLocation } from "../utils/location.js";

export default function ItemCard({ item, onClaim, onView }) {
  const isClosed = ["claimed", "completed"].includes(item.status);
  const isFound = item.status === "found";
  const isUnderReview = item.status === "under_review";

  let statusClass = "status-neutral";
  if (isClosed) {
    statusClass = "status-success";
  } else if (isFound) {
    statusClass = "status-amber";
  } else if (isUnderReview) {
    statusClass = "status-blue";
  }

  return (
    <article
      className={`item-card ${item.type} clickable`}
      onClick={() => onView(item)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(item);
        }
      }}
      aria-label={`View details for ${item.title}`}
    >
      {/* Consistent photo aspect ratio cover */}
      <div className="item-card-media">
        {item.image ? (
          <img
            className="item-card-image"
            src={item.image}
            alt={item.title}
            loading="lazy"
          />
        ) : (
          <div
            className={`item-card-placeholder ${item.type}`}
            aria-hidden="true"
          >
            <svg
              className="placeholder-icon"
              width="36"
              height="36"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              {item.type === "lost" ? (
                <>
                  <circle cx="11" cy="11" r="8" />
                  <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  <line x1="11" y1="8" x2="11" y2="12" />
                  <line x1="11" y1="14" x2="11.01" y2="14" />
                </>
              ) : (
                <>
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                  <polyline points="3.27 6.96 12 12.01 20.73 6.96" />
                  <line x1="12" y1="22.08" x2="12" y2="12" />
                </>
              )}
            </svg>
            <span className="placeholder-text">
              {item.type === "lost" ? "Lost property" : "Found property"}
            </span>
          </div>
        )}

        <div className="item-card-floating-badges">
          <span className={`tag-badge tag-${item.type}`}>
            {item.type === "lost" ? "LOST" : "FOUND"}
          </span>
          <span className={`status-badge ${statusClass}`}>
            {statusText(item.status)}
          </span>
        </div>
      </div>

      {/* Item Body Content */}
      <div className="item-card-body">
        {item.category && (
          <span className="item-category-tag">{item.category}</span>
        )}

        <h3 className="item-card-title" title={item.title}>
          {item.title}
        </h3>

        <div className="item-card-meta">
          <div className="meta-line location" title={formatLocation(item)}>
            <svg
              className="meta-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
              <circle cx="12" cy="10" r="3" />
            </svg>
            <span className="meta-text">{formatLocation(item)}</span>
          </div>

          <div className="meta-line date">
            <svg
              className="meta-icon"
              width="14"
              height="14"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
              <line x1="16" y1="2" x2="16" y2="6" />
              <line x1="8" y1="2" x2="8" y2="6" />
              <line x1="3" y1="10" x2="21" y2="10" />
            </svg>
            <span className="meta-text">{item.date}</span>
          </div>
        </div>
      </div>

      {/* Card Actions */}
      <div className="item-card-actions">
        {item.type === "found" &&
          item.eligibleToClaim !== false &&
          !isClosed && (
            <button
              className="btn btn-primary btn-sm flex-1"
              onClick={(event) => {
                event.stopPropagation();
                onClaim(item);
              }}
              type="button"
            >
              Request item
            </button>
          )}
        <button
          className="btn btn-secondary btn-sm flex-1"
          onClick={(event) => {
            event.stopPropagation();
            onView(item);
          }}
          type="button"
        >
          View details
        </button>
      </div>
    </article>
  );
}
