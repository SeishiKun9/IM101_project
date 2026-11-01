import React from "react";
import {
  claimStatusText,
  statusMessage,
  statusText,
} from "../constants/statuses.js";
import { formatLocation } from "../utils/location.js";

export default function ReportCard({
  item,
  onView,
  onClaim,
  privateView = false,
}) {
  const displayName = privateView
    ? item.privateReporterName || item.reporterName
    : item.reporterName;

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

  // Workflow steps for visual progress using actual application states
  const lostSteps = [
    { key: "reported", label: "Reported" },
    { key: "under_review", label: "Under Review" },
    { key: "found", label: "Found" },
    { key: "claimed", label: "Claim Approved" },
    { key: "completed", label: "Collected" },
  ];

  const foundSteps = [
    { key: "reported", label: "Reported" },
    { key: "under_review", label: "Under Review" },
    { key: "completed", label: "Handed Over" },
  ];

  const currentSteps = item.type === "lost" ? lostSteps : foundSteps;
  const currentStepIndex = currentSteps.findIndex((s) => s.key === item.status);

  return (
    <article
      className={`client-report-card ${item.type}`}
      onClick={() => onView(item)}
      tabIndex={0}
      onKeyDown={(e) => {
        if (e.key === "Enter" || e.key === " ") {
          e.preventDefault();
          onView(item);
        }
      }}
    >
      <div className="client-report-top">
        <div className="client-report-media">
          {item.image ? (
            <img
              className="client-report-img"
              src={item.image}
              alt={item.title}
              loading="lazy"
            />
          ) : (
            <div className={`client-report-placeholder ${item.type}`}>
              <svg
                width="28"
                height="28"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="1.6"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                {item.type === "lost" ? (
                  <>
                    <circle cx="11" cy="11" r="8" />
                    <line x1="21" y1="21" x2="16.65" y2="16.65" />
                  </>
                ) : (
                  <path d="M21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73l7 4a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16z" />
                )}
              </svg>
            </div>
          )}
        </div>

        <div className="client-report-details">
          <div className="report-badges-row">
            <span className={`tag-badge tag-${item.type}`}>
              {item.type === "lost" ? "LOST REPORT" : "FOUND REPORT"}
            </span>
            <span className={`status-badge ${statusClass}`}>
              {statusText(item.status)}
            </span>
            {item.category && (
              <span className="item-category-tag">{item.category}</span>
            )}
          </div>

          <h3 className="client-report-title">{item.title}</h3>

          <p className="client-report-desc">{item.description}</p>

          <div className="client-report-meta">
            <span className="meta-item">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              {formatLocation(item)}
            </span>

            <span className="meta-item">
              <svg
                width="14"
                height="14"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
              >
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              {item.date}
            </span>

            {displayName && (
              <span className="meta-item">
                <svg
                  width="14"
                  height="14"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                >
                  <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                  <circle cx="12" cy="7" r="4" />
                </svg>
                Reported by {displayName}
              </span>
            )}
          </div>
        </div>

        <div className="client-report-actions">
          {item.type === "lost" &&
            item.status === "found" &&
            item.matchedFoundId && (
              <button
                className="btn btn-primary btn-sm full"
                onClick={(event) => {
                  event.stopPropagation();
                  onClaim({ ...item, id: item.matchedFoundId });
                }}
                type="button"
              >
                Request Claim
              </button>
            )}

          <button
            className="btn btn-secondary btn-sm full"
            onClick={(event) => {
              event.stopPropagation();
              onView(item);
            }}
            type="button"
          >
            View Details
          </button>
        </div>
      </div>

      {/* Progress Workflow Bar using real application statuses */}
      <div className="workflow-stepper" aria-label="Report progress">
        {currentSteps.map((step, idx) => {
          const isPassed = currentStepIndex >= 0 && idx < currentStepIndex;
          const isCurrent = currentStepIndex === idx;
          return (
            <div
              key={step.key}
              className={`stepper-step ${
                isCurrent ? "current" : isPassed ? "completed" : "pending"
              }`}
            >
              <div className="step-indicator">{isPassed ? "✓" : idx + 1}</div>
              <span className="step-label">{step.label}</span>
            </div>
          );
        })}
      </div>

      {/* Status Notice Notes & Claim info */}
      {isFound && (
        <div className="client-report-note notice-amber">
          <strong>Action Needed:</strong> {statusMessage("found")}
        </div>
      )}

      {isClosed && (
        <div className="client-report-note notice-success">
          <strong>Outcome:</strong> {statusMessage("completed")}
        </div>
      )}

      {item.type === "found" && item.status === "reported" && (
        <div className="client-report-note notice-info">
          This submission is pending CSA / Verifier confirmation.
        </div>
      )}

      {(item.claims || []).map((claim) => (
        <div
          key={claim.id}
          className={`client-report-note ${
            claim.status === "approved"
              ? "notice-success"
              : claim.status === "rejected"
                ? "notice-danger"
                : "notice-amber"
          }`}
        >
          <strong>
            Claim #{claim.id} ({claimStatusText(claim.status)}):
          </strong>{" "}
          {claim.status === "approved"
            ? "Your claim has been approved! Please proceed to CSA for ownership verification and item collection."
            : claim.rejectionReason
              ? `Note: ${claim.rejectionReason}`
              : "Review in progress by CSA staff."}
        </div>
      ))}
    </article>
  );
}
