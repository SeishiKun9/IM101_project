import React from "react";
import { Link } from "react-router-dom";
import ReviewWorkspace from "../components/workspace/ReviewWorkspace.jsx";
import { roleNames } from "../constants/statuses.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function WorkspacePage({
  requiredRole,
  onDataChanged,
  onRequireLogin,
}) {
  const { user } = useAuth();

  if (!user) {
    return (
      <section className="workspace-container">
        <div className="empty-state-card auth-empty-state">
          <div className="empty-state-icon">
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <rect x="3" y="11" width="18" height="11" rx="2" ry="2" />
              <path d="M7 11V7a5 5 0 0 1 10 0v4" />
            </svg>
          </div>
          <h2>Authentication Required</h2>
          <p>
            You must be signed in with a{" "}
            <strong>{roleNames[requiredRole] || requiredRole}</strong> account
            to access this workspace.
          </p>
          <button
            className="btn btn-primary btn-lg"
            onClick={() => onRequireLogin?.()}
            type="button"
          >
            Sign In to Account
          </button>
        </div>
      </section>
    );
  }

  // Admin can access both admin and verifier workspaces, but staff can only access verifier workspace
  const hasAccess =
    user.role === requiredRole ||
    (user.role === "admin" && requiredRole === "staff");

  if (!hasAccess) {
    return (
      <section className="workspace-container">
        <div className="empty-state-card auth-empty-state">
          <div
            className="empty-state-icon"
            style={{ color: "#B91C1C", background: "#FEF2F2" }}
          >
            <svg
              width="48"
              height="48"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.8"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="4.93" y1="4.93" x2="19.07" y2="19.07" />
            </svg>
          </div>
          <h2>Access Restricted</h2>
          <p>
            Your account ({user.name}) is registered as a{" "}
            <strong>{roleNames[user.role] || user.role}</strong> and does not
            have permission to view the{" "}
            <strong>{roleNames[requiredRole] || requiredRole}</strong>{" "}
            workspace.
          </p>
          <Link
            to={
              user.role === "admin"
                ? "/administrator"
                : user.role === "staff"
                  ? "/verifier"
                  : "/"
            }
            className="btn btn-primary"
          >
            Go to Your Authorized Dashboard
          </Link>
        </div>
      </section>
    );
  }

  return <ReviewWorkspace user={user} onChanged={onDataChanged} />;
}
