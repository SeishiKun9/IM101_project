import React from "react";
import { statusText } from "../constants/statuses.js";

export default function ItemCard({ item, onClaim, onView }) {
  const isClosed = ["claimed", "completed"].includes(item.status);
  const isFound = item.status === "found";

  return (
    <article className="item-card clickable" onClick={() => onView(item)}>
      {item.image ? (
        <img className="item-thumb" src={item.image} alt={item.title} />
      ) : (
        <div className="item-icon green">
          {item.type === "lost" ? "L" : "F"}
        </div>
      )}
      <div className="item-copy">
        <div
          style={{
            display: "flex",
            gap: "6px",
            alignItems: "center",
            flexWrap: "wrap",
          }}
        >
          <span className={`tag ${item.type}`}>
            {item.type === "lost" ? "LOST" : "FOUND"}
          </span>
          <span
            className={`status ${isClosed ? "complete" : isFound ? "found---verification-pending" : ""}`}
            style={{ fontSize: "9px", padding: "4px 6px" }}
          >
            {statusText(item.status)}
          </span>
        </div>

        <h3>{item.title}</h3>
        <p>
          {item.building ? `${item.building} · ` : ""}
          {item.location} · {item.floor}
        </p>
        <small>
          {item.date} · {statusText(item.status)}
        </small>
      </div>
      <div
        className="item-card-actions"
        style={{
          display: "flex",
          flexDirection: "column",
          gap: "8px",
          alignItems: "flex-end",
          justifyContent: "center",
        }}
      >
        {item.type === "found" &&
          item.eligibleToClaim !== false &&
          !isClosed && (
            <button
              className="secondary compact"
              onClick={(event) => {
                event.stopPropagation();
                onClaim(item);
              }}
            >
              Request this item
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
