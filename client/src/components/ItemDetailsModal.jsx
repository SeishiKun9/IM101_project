import React, { useState, useEffect } from "react";
import { apiRequest } from "../api/client.js";
import { statusMessage, statusText } from "../constants/statuses.js";
import { formatLocation, normalizeCoord } from "../utils/location.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function ItemDetailsModal({
  item: initialItem,
  onClose,
  onClaim,
  showPrivate = false,
  onSelectSimilar,
}) {
  const { user } = useAuth();
  const [item, setItem] = useState(initialItem);
  const [similarItems, setSimilarItems] = useState([]);
  const [loadingSimilar, setLoadingSimilar] = useState(false);
  const [enlarged, setEnlarged] = useState(false);
  const [isAnonymous, setIsAnonymous] = useState(Boolean(initialItem?.isAnonymous));
  const [hidePhone, setHidePhone] = useState(initialItem?.hidePhone !== false);
  const [privacyMessage, setPrivacyMessage] = useState("");
  const [savingPrivacy, setSavingPrivacy] = useState(false);

  useEffect(() => {
    setItem(initialItem);
  }, [initialItem]);

  useEffect(() => {
    setIsAnonymous(Boolean(item?.isAnonymous));
    setHidePhone(item?.hidePhone !== false);
    setPrivacyMessage("");
  }, [item]);

  useEffect(() => {
    let isMounted = true;
    if (!item?.id) return;
    setLoadingSimilar(true);
    apiRequest(`/items/${item.id}/similar`)
      .then((data) => {
        if (isMounted) {
          setSimilarItems(Array.isArray(data) ? data : []);
        }
      })
      .catch(() => {
        if (isMounted) setSimilarItems([]);
      })
      .finally(() => {
        if (isMounted) setLoadingSimilar(false);
      });

    return () => {
      isMounted = false;
    };
  }, [item?.id]);

  async function handleSelectSimilar(similar) {
    const candidateItem = similar.item || similar;
    if (onSelectSimilar) {
      onSelectSimilar(candidateItem);
    }
    setItem(candidateItem);
    if (candidateItem?.id) {
      try {
        const fullItem = await apiRequest(`/items/${candidateItem.id}`);
        if (fullItem && fullItem.id) {
          setItem(fullItem);
        }
      } catch (err) {
        // Retain candidateItem fallback
      }
    }
  }

  const displayName = showPrivate
    ? item.privateReporterName || item.reporterName
    : item.reporterName;

  const hasApprovedClaim = (item.claims || []).some(
    (c) => c.status === "approved" || c.status === "claimed",
  );
  const effectiveStatus =
    item.status === "found" && hasApprovedClaim ? "claimed" : item.status;

  const isCompleted = ["completed", "closed", "returned"].includes(effectiveStatus);
  const isClaimApproved = effectiveStatus === "claimed";
  const isFound = effectiveStatus === "found";
  const isUnderReview = effectiveStatus === "under_review";

  let statusClass = "status-neutral";
  if (isCompleted) {
    statusClass = "status-success";
  } else if (isClaimApproved) {
    statusClass = "status-blue";
  } else if (isFound) {
    statusClass = "status-amber";
  } else if (isUnderReview) {
    statusClass = "status-blue";
  }

  const isReporter = Boolean(
    showPrivate ||
      (user &&
        (item.reporterId === user.id ||
          item.reporterEmail === user.email ||
          item.isOwner)),
  );

  let canClaim = false;
  let claimTargetId = null;

  if (!isClosed && item.eligibleToClaim !== false) {
    if (item.type === "lost") {
      // For a lost report, only the user who lost it can claim once a matched found item is identified
      if (isReporter && item.status === "found" && item.matchedFoundId) {
        canClaim = true;
        claimTargetId = item.matchedFoundId;
      }
    } else if (item.type === "found") {
      // For a found report, the founder/finder can NEVER claim it.
      // Only another user (non-reporter) browsing public found reports can request a claim.
      if (!isReporter) {
        canClaim = true;
        claimTargetId = item.id;
      }
    }
  }

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

        {/* Navigation back to original report if viewing a candidate comparison */}
        {initialItem && item.id !== initialItem.id && (
          <div style={{ marginBottom: "0.75rem" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={() => {
                setItem(initialItem);
                if (onSelectSimilar) {
                  onSelectSimilar(initialItem);
                }
              }}
            >
              ← Back to my report
            </button>
          </div>
        )}

        {/* Header Badges & Title */}
        <div className="modal-header-badges">
          <span className={`tag-badge tag-${item.type}`}>
            {item.type === "lost" ? "LOST REPORT" : "FOUND REPORT"}
          </span>
          <span className={`status-badge ${statusClass}`}>
            {statusText(effectiveStatus)}
          </span>
        </div>

        <h2 id="modal-title" className="detail-modal-title">
          {item.title}
        </h2>

        {statusMessage(effectiveStatus, item.type) && (
          <div
            className={`detail-notice-banner ${
              isCompleted
                ? "notice-success"
                : isClaimApproved
                  ? "notice-success"
                  : isFound
                    ? (item.type === "found" ? "notice-info" : "notice-amber")
                    : "notice-info"
            }`}
          >
            <div className="notice-icon">
              {isCompleted || isClaimApproved ? "✓" : isFound ? "★" : "ℹ"}
            </div>
            <div className="notice-content">
              <strong>Status Update:</strong>
              <p>{statusMessage(effectiveStatus, item.type)}</p>
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

          {/* Similar Items & Potential Matches (Item 12) */}
          <div className="detail-section similar-matches-section">
            <div className="similar-section-header">
              <h3 className="section-title">
                <svg
                  width="18"
                  height="18"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="2.2"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  className="sparkle-icon"
                  aria-hidden="true"
                >
                  <circle cx="12" cy="12" r="10" />
                  <polygon points="12 8 8 12 12 16 16 12 12 8" />
                </svg>
                <span>Potential Matches & Similar Reports</span>
              </h3>
              {similarItems.length > 0 && (
                <span className="match-count-pill">
                  {similarItems.length} candidate{similarItems.length > 1 ? "s" : ""}
                </span>
              )}
            </div>

            {loadingSimilar ? (
              <div className="similar-loading">
                <span className="similar-spinner">⌛</span> Checking database for potential matches...
              </div>
            ) : similarItems.length > 0 ? (
              <div className="similar-cards-grid">
                {similarItems.map((similar) => (
                  <div
                    key={similar.id}
                    className="similar-card"
                    onClick={() => handleSelectSimilar(similar)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleSelectSimilar(similar);
                      }
                    }}
                  >
                    <div className="similar-card-top">
                      <span className={`tag-badge tag-${similar.type}`}>
                        {similar.type === "lost" ? "LOST" : "FOUND"}
                      </span>
                      <span className={`match-score-badge score-${similar.confidence || "medium"}`}>
                        {similar.score}% Match
                      </span>
                    </div>

                    <h4 className="similar-card-title">{similar.title}</h4>

                    <div className="similar-card-meta">
                      <span>{similar.building || similar.location || "Campus Area"}</span>
                      {similar.date && (
                        <>
                          <span>•</span>
                          <span>{similar.date}</span>
                        </>
                      )}
                    </div>

                    {similar.reasons && similar.reasons.length > 0 && (
                      <div className="similar-reasons-list">
                        {similar.reasons.slice(0, 2).map((reason, idx) => (
                          <span key={idx} className="match-reason-tag">
                            ✓ {reason}
                          </span>
                        ))}
                      </div>
                    )}

                    <div className="similar-card-action">
                      <span className="view-link-text">Compare / View Report →</span>
                    </div>
                  </div>
                ))}
              </div>
            ) : (
              <div className="similar-empty-note">
                <p>
                  No high-probability match candidates found yet in active reports.
                  The system will automatically alert you when a matching report is submitted.
                </p>
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
