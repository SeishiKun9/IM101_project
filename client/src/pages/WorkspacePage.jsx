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
      <section className="workspace-band">
        <p className="eyebrow">RESTRICTED ACCESS</p>
        <h2>Sign in required</h2>
        <div className="empty-state">
          <p>
            You must be signed in with a{" "}
            <strong>{roleNames[requiredRole] || requiredRole}</strong> account
            to access this workspace.
          </p>
          <button
            className="primary"
            style={{ marginTop: "1rem" }}
            onClick={() => onRequireLogin?.()}
          >
            Sign in
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
      <section className="workspace-band">
        <p className="eyebrow">ACCESS DENIED</p>
        <h2>Unauthorized workspace</h2>
        <div className="empty-state">
          <p>
            Your account ({user.name}) is registered as a{" "}
            <strong>{roleNames[user.role] || user.role}</strong> and cannot
            access the{" "}
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
            className="primary button"
            style={{
              display: "inline-block",
              marginTop: "1rem",
              padding: "10px 18px",
              background: "var(--green)",
              color: "#fff",
              textDecoration: "none",
              borderRadius: "4px",
            }}
          >
            Go to your workspace
          </Link>
        </div>
      </section>
    );
  }

  return <ReviewWorkspace user={user} onChanged={onDataChanged} />;
}
