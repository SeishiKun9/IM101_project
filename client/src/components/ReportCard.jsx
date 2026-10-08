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

  return (
    <article
      className={`report-card ${item.type}`}
      onClick={() => onView(item)}
    >
      {item.image ? (
        <img className="report-card-image" src={item.image} alt={item.title} />
      ) : (
        <div className="report-card-placeholder">
          {item.type === "lost" ? "LOST" : "FOUND"}
        </div>
      )}
      <div className="report-card-content">
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span className={`tag ${item.type}`}>
            {item.type === "lost" ? "LOST REPORT" : "FOUND REPORT"}
          </span>
          <span
            className={`status ${isClosed ? "complete" : isFound ? "found---verification-pending" : ""}`}
          >
            {statusText(item.status)}
          </span>
        </div>

        <h3>{item.title}</h3>
        <p className="report-card-description">{item.description}</p>
        <p>{formatLocation(item)}</p>
        <small>
          {item.date} · Status: <strong>{statusText(item.status)}</strong>
        </small>
        {displayName && <small>Reported by {displayName}</small>}

        {isFound && (
          <div className="detail-note" style={{ margin: "10px 0" }}>
            {statusMessage("found")}
          </div>
        )}

        {isClosed && (
          <div
            className="detail-note"
            style={{
              margin: "10px 0",
              background: "#e2f0ea",
              color: "#1f6a58",
            }}
          >
            {statusMessage("completed")}
          </div>
        )}

        {item.type === "found" && item.status === "reported" && (
          <small className="review-status">Pending verifier review</small>
        )}

        {(item.claims || []).map((claim) => (
          <small key={claim.id} className="review-status">
            {claim.status === "approved"
              ? "Your claim has been approved. Please proceed to CSA for ownership verification and item collection."
              : claimStatusText(claim.status) +
                (claim.rejectionReason ? ` · ${claim.rejectionReason}` : "")}
          </small>
        ))}
      </div>

      <div
        className="report-card-actions"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        {item.type === "lost" &&
          item.status === "found" &&
          item.matchedFoundId && (
            <button
              className="primary compact"
              onClick={(event) => {
                event.stopPropagation();
                onClaim({ ...item, id: item.matchedFoundId });
              }}
            >
              Request claim
            </button>
          )}

        <button
          className="secondary compact"
          onClick={(event) => {
            event.stopPropagation();
            onView(item);
          }}
        >
          View details
        </button>
      </div>
    </article>
  );
}
