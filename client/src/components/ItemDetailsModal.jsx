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

  const displayName = showPrivate
    ? item.privateReporterName || item.reporterName
    : item.reporterName;

  const isClosed = ["claimed", "completed"].includes(item.status);
  const isFound = item.status === "found";

  const claimTargetId = item.type === "lost" ? item.matchedFoundId : item.id;
  const canClaim =
    item.status === "found" && claimTargetId && item.eligibleToClaim !== false;

  async function handlePrivacySubmit(event) {
    event.preventDefault();
    try {
      await apiRequest(`/items/${item.id}/privacy`, {
        method: "PATCH",
        body: JSON.stringify({ isAnonymous, hidePhone }),
      });
      setPrivacyMessage("Privacy preferences saved.");
    } catch (requestError) {
      setPrivacyMessage(requestError.message);
    }
  }

  const hasMapCoordinates =
    item.mapX !== null &&
    item.mapY !== null &&
    item.mapX !== undefined &&
    item.mapY !== undefined;

  return (
    <div className="modal-backdrop">
      <section className="modal detail-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <div
          style={{
            display: "flex",
            gap: "8px",
            alignItems: "center",
            marginBottom: "8px",
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
        <h2>{item.title}</h2>
        {statusMessage(item.status) && (
          <div className="detail-note" style={{ margin: "10px 0 16px" }}>
            {statusMessage(item.status)}
          </div>
        )}

        {item.image && (
          <img
            className="detail-photo clickable"
            src={item.image}
            alt={item.title}
            onClick={() => setEnlarged(true)}
          />
        )}

        <dl className="detail-fields">
          <dt>Category</dt>
          <dd>{item.category || "Not specified"}</dd>

          <dt>Description</dt>
          <dd>{item.description}</dd>

          <dt>{item.type === "lost" ? "Date lost" : "Date found"}</dt>
          <dd>{item.date}</dd>

          <dt>Location</dt>
          <dd>{formatLocation(item)}</dd>

          <dt>Status</dt>
          <dd>{statusText(item.status)}</dd>

          <dt>{item.type === "lost" ? "Reporter" : "Finder"}</dt>
          <dd>{displayName || "Private"}</dd>

          {showPrivate && item.contactPhone && (
            <>
              <dt>Phone</dt>
              <dd>{item.contactPhone}</dd>
            </>
          )}
        </dl>

        {showPrivate && (
          <form className="privacy-form" onSubmit={handlePrivacySubmit}>
            <strong>Privacy preferences</strong>
            <label className="privacy-checkbox">
              <input
                type="checkbox"
                checked={isAnonymous}
                onChange={(event) => setIsAnonymous(event.target.checked)}
              />
              Remain anonymous on the public dashboard
            </label>
            <label className="privacy-checkbox">
              <input
                type="checkbox"
                checked={hidePhone}
                onChange={(event) => setHidePhone(event.target.checked)}
              />
              Hide my phone number from other users
            </label>
            <button className="secondary compact">
              Save privacy preferences
            </button>
            {privacyMessage && (
              <small className="review-status">{privacyMessage}</small>
            )}
          </form>
        )}

        {hasMapCoordinates ? (
          <div className="detail-map">
            <img
              src={item.mapImageUrl || "/assets/images/campus-map.jpg"}
              alt="Reported campus location"
            />
            <span
              className="detail-map-pin"
              style={{
                left: `${normalizeCoord(item.mapX)}%`,
                top: `${normalizeCoord(item.mapY)}%`,
              }}
            >
              ●
            </span>
          </div>
        ) : (
          <p className="detail-note">
            Reported location: {formatLocation(item)}. No exact map pin was
            saved.
          </p>
        )}

        {canClaim && (
          <button
            className="primary full"
            onClick={() => onClaim({ ...item, id: claimTargetId })}
          >
            Request claim
          </button>
        )}

        {enlarged && (
          <div className="image-lightbox" onClick={() => setEnlarged(false)}>
            <img src={item.image} alt={item.title} />
          </div>
        )}
      </section>
    </div>
  );
}
