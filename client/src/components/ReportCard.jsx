import React from "react";
import { claimStatusText, statusText } from "../constants/statuses.js";

export default function ReportCard({
  item,
  onView,
  onClaim,
  privateView = false,
}) {
  const displayName = privateView
    ? item.privateReporterName || item.reporterName
    : item.reporterName;

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
        <span className={`tag ${item.type}`}>{item.type.toUpperCase()}</span>
        <h3>{item.title}</h3>
        <p className="report-card-description">{item.description}</p>
        <p>
          {item.building ? `${item.building} · ` : ""}
          {item.location} · {item.floor}
        </p>
        <small>
          {item.date} · {statusText(item.status)}
        </small>
        {displayName && <small>Reported by {displayName}</small>}
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
    </article>
  );
}
