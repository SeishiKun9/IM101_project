import React from "react";
import { checkPasswordCriteria } from "../utils/validation.js";

export default function PasswordRequirements({
  password = "",
  confirmPassword = null,
  showMatch = false,
}) {
  const criteria = checkPasswordCriteria(password);
  const passwordsMatch =
    confirmPassword !== null &&
    confirmPassword !== "" &&
    password === confirmPassword;

  // Don't show if user hasn't typed anything yet
  if (!password && !confirmPassword) {
    return (
      <div className="password-hint-text">
        Use 8+ characters with uppercase, lowercase, numbers & symbols.
      </div>
    );
  }

  return (
    <div className="password-feedback-panel" aria-live="polite">
      {/* Strength Bar */}
      <div className="password-meter-wrap">
        <div className="password-meter-bar-bg">
          <div
            className={`password-meter-bar strength-${criteria.strength}`}
            style={{ width: `${criteria.scorePercent}%` }}
          />
        </div>
        <span className={`password-meter-label strength-${criteria.strength}`}>
          {criteria.strengthLabel}
        </span>
      </div>

      {/* Requirement Checklist */}
      <ul className="password-checklist">
        {criteria.criteriaList.map((item) => (
          <li
            key={item.key}
            className={`password-req-item ${item.met ? "is-met" : "is-unmet"}`}
          >
            <span className="req-icon" aria-hidden="true">
              {item.met ? "✓" : "○"}
            </span>
            <span className="req-text">{item.label}</span>
          </li>
        ))}

        {showMatch && confirmPassword !== null && (
          <li
            className={`password-req-item ${
              passwordsMatch ? "is-met" : confirmPassword ? "is-unmet" : "is-pending"
            }`}
          >
            <span className="req-icon" aria-hidden="true">
              {passwordsMatch ? "✓" : "○"}
            </span>
            <span className="req-text">
              {passwordsMatch
                ? "Passwords match"
                : confirmPassword
                ? "Passwords do not match"
                : "Repeat password to confirm"}
            </span>
          </li>
        )}
      </ul>
    </div>
  );
}
