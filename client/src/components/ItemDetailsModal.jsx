import React, { useState } from "react";
import { apiRequest } from "../api/client.js";
import { statusMessage, statusText } from "../constants/statuses.js";
import { formatLocation, normalizeCoord } from "../utils/location.js";

export default function ItemDetailsModal({
  item,
  onClose,
  onClaim,
  showPrivate = false,
}) {
  const [enlarged, setEnlarged] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(Boolean(item.isAnonymous));
  const [hidePhone, setHidePhone] = useState(item.hidePhone !== false);
  const [privacyMessage, setPrivacyMessage] = useState("");
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  const displayName = showPrivate
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

  const claimTargetId = item.type === "lost" ? item.matchedFoundId : item.id;
  const canClaim =
    item.status === "found" && claimTargetId && item.eligibleToClaim !== false;

  async function handlePrivacySubmit(event) {
    event.preventDefault();
    setSavingPrivacy(true);
    setPrivacyMessage("");
    try {
      await apiRequest(`/items/${item.id}/privacy`, {
        method: "PATCH",
        body: JSON.stringify({ isAnonymous, hidePhone }),
      });
      setPrivacyMessage("Privacy preferences saved successfully.");
    } catch (requestError) {
      setPrivacyMessage(requestError.message);
    } finally {
      setSavingPrivacy(false);
    }
  }

  const hasMapCoordinates =
    item.mapX !== null &&
    item.mapY !== null &&
    item.mapX !== undefined &&
    item.mapY !== undefined;

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <section className="modal detail-modal">
        <button
          className="modal-close"
          onClick={onClose}
          type="button"
          aria-label="Close details dialog"
        >
          ×
        </button>

        {/* Header Badges & Title */}
        <div className="modal-header-badges">
          <span className={`tag-badge tag-${item.type}`}>
            {item.type === "lost" ? "LOST REPORT" : "FOUND REPORT"}
          </span>
          <span className={`status-badge ${statusClass}`}>
            {statusText(item.status)}
          </span>
        </div>

        <h2 id="modal-title" className="detail-modal-title">
          {item.title}
        </h2>

        {statusMessage(item.status) && (
          <div
            className={`detail-notice-banner ${
              isFound
                ? "notice-amber"
                : isClosed
                  ? "notice-success"
                  : "notice-info"
            }`}
          >
            <div className="notice-icon">
              {isFound ? "★" : isClosed ? "✓" : "ℹ"}
            </div>
            <div className="notice-content">
              <strong>Status Update:</strong>
              <p>{statusMessage(item.status)}</p>
            </div>
          </div>
        )}

        {/* Media Preview */}
        {item.image && (
          <div className="detail-photo-wrapper">
            <img
              className="detail-photo clickable"
              src={item.image}
              alt={item.title}
              onClick={() => setEnlarged(true)}
              title="Click to view full size"
            />
            <span className="photo-zoom-hint">Click image to enlarge</span>
          </div>
        )}

        {/* Grouped Details Section */}
        <div className="detail-sections">
          <div className="detail-section">
            <h3 className="section-title">Item Overview</h3>
            <dl className="detail-grid-list">
              <div className="detail-grid-item">
                <dt>Category</dt>
                <dd>{item.category || "Uncategorized"}</dd>
              </div>

              <div className="detail-grid-item">
                <dt>{item.type === "lost" ? "Date lost" : "Date found"}</dt>
                <dd>{item.date}</dd>
              </div>

              <div className="detail-grid-item">
                <dt>Current Status</dt>
                <dd>{statusText(item.status)}</dd>
              </div>

              <div className="detail-grid-item">
                <dt>{item.type === "lost" ? "Reporter" : "Finder"}</dt>
                <dd>{displayName || "Anonymous / Restricted"}</dd>
              </div>

              {showPrivate && item.contactPhone && (
                <div className="detail-grid-item">
                  <dt>Contact Phone</dt>
                  <dd>{item.contactPhone}</dd>
                </div>
              )}
            </dl>

            <div className="description-block">
              <strong>Detailed Description:</strong>
              <p>{item.description}</p>
            </div>
          </div>

          {/* Location Group */}
          <div className="detail-section">
            <h3 className="section-title">Campus Location</h3>
            <p className="location-summary-text">
              <svg
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
                <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                <circle cx="12" cy="10" r="3" />
              </svg>
              <strong>{formatLocation(item)}</strong>
            </p>

            {hasMapCoordinates ? (
              <div className="detail-map-container">
                <div className="detail-map">
                  <img
                    src={item.mapImageUrl || "/assets/images/campus-map.jpg"}
                    alt="Reported campus location on map"
                  />
                  <span
                    className="detail-map-pin"
                    style={{
                      left: `${normalizeCoord(item.mapX)}%`,
                      top: `${normalizeCoord(item.mapY)}%`,
                    }}
                    title={`Pinned location (${item.mapX}%, ${item.mapY}%)`}
                    aria-label="Location pin"
                  >
                    ●
                  </span>
                </div>
                <small className="map-caption">
                  Exact location pinned during report submission.
                </small>
              </div>
            ) : (
              <div className="detail-map-unavailable">
                <span>No exact campus map pin saved for this record.</span>
              </div>
            )}
          </div>

          {/* Privacy Controls (Only for owner's private view) */}
          {showPrivate && (
            <div className="detail-section privacy-section">
              <h3 className="section-title">Privacy Settings</h3>
              <form className="privacy-form" onSubmit={handlePrivacySubmit}>
                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={isAnonymous}
                    onChange={(event) => setIsAnonymous(event.target.checked)}
                  />
                  <span>Remain anonymous on public dashboard</span>
                </label>

                <label className="checkbox-control">
                  <input
                    type="checkbox"
                    checked={hidePhone}
                    onChange={(event) => setHidePhone(event.target.checked)}
                  />
                  <span>Hide my phone number from other campus users</span>
                </label>

                <div className="privacy-actions">
                  <button
                    className="btn btn-secondary btn-sm"
                    type="submit"
                    disabled={savingPrivacy}
                  >
                    {savingPrivacy ? "Saving..." : "Update privacy settings"}
                  </button>
                  {privacyMessage && (
                    <span className="privacy-status-text">
                      {privacyMessage}
                    </span>
                  )}
                </div>
              </form>
            </div>
          )}
        </div>

        {/* Modal Bottom Sticky Actions */}
        <div className="modal-bottom-actions">
          {canClaim && (
            <button
              className="btn btn-primary"
              onClick={() => onClaim({ ...item, id: claimTargetId })}
              type="button"
            >
              Request Claim / arrange CSA handover
            </button>
          )}

          <button className="btn btn-secondary" onClick={onClose} type="button">
            Close
          </button>
        </div>

        {/* Image Full-Size Lightbox */}
        {enlarged && (
          <div
            className="image-lightbox"
            onClick={() => setEnlarged(false)}
            role="dialog"
            aria-label="Enlarged photo preview"
          >
            <button
              className="lightbox-close"
              onClick={() => setEnlarged(false)}
              type="button"
              aria-label="Close preview"
            >
              ×
            </button>
            <img src={item.image} alt={item.title} />
          </div>
        )}
      </section>
    </div>
  );
}
