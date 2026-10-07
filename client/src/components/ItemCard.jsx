import React from "react";
import { statusText } from "../constants/statuses.js";

export default function ItemCard({ item, onClaim, onView }) {
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
        <span className={`tag ${item.type}`}>{item.type.toUpperCase()}</span>
        <h3>{item.title}</h3>
        <p>
          {item.building ? `${item.building} · ` : ""}
          {item.location} · {item.floor}
        </p>
        <small>
          {item.date} · {statusText(item.status)}
        </small>
      </div>
      {item.type === "found" &&
        item.eligibleToClaim !== false &&
        !["claimed", "completed"].includes(item.status) && (
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
    </article>
  );
}
