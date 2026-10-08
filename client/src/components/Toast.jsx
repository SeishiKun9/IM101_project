import React, { useEffect } from "react";

export default function Toast({ message, onClose }) {
  useEffect(() => {
    if (!message) return;
    const timer = setTimeout(() => {
      onClose?.();
    }, 4500);
    return () => clearTimeout(timer);
  }, [message, onClose]);

  if (!message) return null;

  return (
    <div className="toast-notification" role="alert" onClick={onClose}>
      <span className="toast-icon">✓</span>
      <span className="toast-message">{message}</span>
      <button
        className="toast-dismiss"
        onClick={(e) => {
          e.stopPropagation();
          onClose?.();
        }}
        type="button"
        aria-label="Dismiss notification"
      >
        ×
      </button>
    </div>
  );
}
