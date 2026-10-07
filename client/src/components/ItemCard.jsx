import React from "react";
import { statusText } from "../constants/statuses.js";

export default function ItemCard({ item, onClaim, onView }) {
  const isClosed = ["claimed", "completed"].includes(item.status);
  const isFound = item.status === "found";

  return (
    <article
      className={`item-card ${item.type} clickable`}
      onClick={() => onView(item)}
    >
      <div className="item-card-header">
        {item.image ? (
          <img className="item-thumb" src={item.image} alt={item.title} />
        ) : (
          <div
            className={`item-icon ${item.type === "lost" ? "gold" : "green"}`}
          >
            {item.type === "lost" ? "L" : "F"}
          </div>
        )}
        <div className="item-card-badges">
          <span className={`tag ${item.type}`}>
            {item.type === "lost" ? "LOST" : "FOUND"}
          </span>
          <span
            className={`status ${isClosed ? "complete" : isFound ? "found---verification-pending" : ""}`}
          >
            {statusText(item.status)}
          </span>
        </div>
      </div>

      <div className="item-copy">
        <h3>{item.title}</h3>
        <p className="item-location">
          {item.building ? `${item.building} · ` : ""}
          {item.location} · {item.floor}
        </p>
        <small className="item-date">
          {item.date} · {statusText(item.status)}
        </small>
      </div>

      <div className="item-card-actions">
        {item.type === "found" &&
          item.eligibleToClaim !== false &&
          !isClosed && (
            <button
              className="primary compact"
              onClick={(event) => {
                event.stopPropagation();
                onClaim(item);
              }}
            >
              Request item
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
