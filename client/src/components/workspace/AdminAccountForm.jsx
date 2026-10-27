import React, { useState } from "react";
import { apiRequest } from "../../api/client.js";
import {
  validateName,
  validateSchoolEmail,
  validatePassword,
} from "../../utils/validation.js";

export default function AdminAccountForm() {
  const [verifierMessage, setVerifierMessage] = useState("");
  const [verifierError, setVerifierError] = useState("");
  const [verifierSubmitting, setVerifierSubmitting] = useState(false);

  const [adminMessage, setAdminMessage] = useState("");
  const [adminError, setAdminError] = useState("");
  const [adminSubmitting, setAdminSubmitting] = useState(false);

  async function submitVerifier(event) {
    event.preventDefault();
    setVerifierMessage("");
    setVerifierError("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    const nameVal = validateName(data.name);
    if (!nameVal.valid) {
      setVerifierError(nameVal.error);
      return;
    }

    const emailVal = validateSchoolEmail(data.email, { requireSchoolDomain: false });
    if (!emailVal.valid) {
      setVerifierError(emailVal.error);
      return;
    }

    const passVal = validatePassword(data.password);
    if (!passVal.valid) {
      setVerifierError(passVal.error);
      return;
    }

    setVerifierSubmitting(true);
    try {
      await apiRequest("/admin/accounts", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          name: nameVal.formatted,
          email: emailVal.formatted,
          role: "staff",
        }),
      });
      form.reset();
      setVerifierMessage(`Verifier / CSA staff account for "${nameVal.formatted}" was created successfully.`);
    } catch (requestError) {
      setVerifierError(requestError.message);
    } finally {
      setVerifierSubmitting(false);
    }
  }

  async function submitAdmin(event) {
    event.preventDefault();
    setAdminMessage("");
    setAdminError("");
    const form = event.currentTarget;
    const data = Object.fromEntries(new FormData(form));

    const nameVal = validateName(data.name);
    if (!nameVal.valid) {
      setAdminError(nameVal.error);
      return;
    }

    const emailVal = validateSchoolEmail(data.email, { requireSchoolDomain: true });
    if (!emailVal.valid) {
      setAdminError(emailVal.error);
      return;
    }

    const passVal = validatePassword(data.password);
    if (!passVal.valid) {
      setAdminError(passVal.error);
      return;
    }

    if (!data.setupToken || !data.setupToken.trim()) {
      setAdminError("Administrator setup authorization token is required.");
      return;
    }

    setAdminSubmitting(true);
    try {
      await apiRequest("/admin/accounts", {
        method: "POST",
        body: JSON.stringify({
          ...data,
          name: nameVal.formatted,
          email: emailVal.formatted,
          role: "admin",
        }),
      });
      form.reset();
      setAdminMessage(`Administrator account for "${nameVal.formatted}" was created successfully with full privileges.`);
    } catch (requestError) {
      setAdminError(requestError.message);
    } finally {
      setAdminSubmitting(false);
    }
  }

  return (
    <div className="admin-account-container" style={{ display: "flex", flexDirection: "column", gap: "24px" }}>
      {/* 1. PROVISION VERIFIER / CSA STAFF ACCOUNT */}
      <section className="workspace-panel admin-account-panel">
        <div className="panel-header-row">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  background: "var(--status-blue-bg)",
                  color: "var(--status-blue-text)",
                  border: "1px solid var(--status-blue-border)",
                }}
              >
                Staff Credentials
              </span>
              <h2 className="panel-title" style={{ margin: 0 }}>
                Provision Verifier / CSA Staff Account
              </h2>
            </div>
            <p className="panel-subtitle">
              Create verified credentials for designated campus authority and lost &amp; found desk personnel.
            </p>
          </div>
        </div>

        {verifierMessage && (
          <div className="alert-banner alert-success">
            <strong>Success:</strong> {verifierMessage}
          </div>
        )}

        {verifierError && (
          <div className="alert-banner alert-danger">
            <strong>Error:</strong> {verifierError}
          </div>
        )}

        <form className="admin-account-form" onSubmit={submitVerifier}>
          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="staff-name">
                Staff Full Name <span className="req">*</span>
              </label>
              <input
                id="staff-name"
                name="name"
                placeholder="e.g. Officer John Doe"
                required
              />
            </div>

            <div className="form-group flex-1">
              <label htmlFor="staff-email">
                Campus Email Address <span className="req">*</span>
              </label>
              <input
                id="staff-email"
                name="email"
                type="email"
                placeholder="csa.staff@school.edu"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="staff-password">
                Temporary Password <span className="req">*</span>
              </label>
              <input
                id="staff-password"
                name="password"
                type="password"
                minLength={8}
                placeholder="Minimum 8 chars (upper, lower, digit, symbol)"
                required
              />
              <span className="field-hint">
                Staff temporary password. Must be at least 8 characters with uppercase, lowercase, number, and special symbol.
              </span>
            </div>
          </div>

          <div className="form-actions-row">
            <button
              className="btn btn-primary"
              disabled={verifierSubmitting}
              type="submit"
            >
              {verifierSubmitting ? "Creating Verifier..." : "Create Verifier Account"}
            </button>
          </div>
        </form>
      </section>

      {/* 2. PROVISION ADMINISTRATOR ACCOUNT (BELOW CREATE VERIFIER) */}
      <section className="workspace-panel admin-account-panel">
        <div className="panel-header-row">
          <div>
            <div style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "4px" }}>
              <span
                style={{
                  display: "inline-block",
                  padding: "3px 8px",
                  borderRadius: "4px",
                  fontSize: "11px",
                  fontWeight: 700,
                  textTransform: "uppercase",
                  background: "var(--status-amber-bg)",
                  color: "var(--status-amber-text)",
                  border: "1px solid var(--status-amber-border)",
                }}
              >
                Elevated Role
              </span>
              <h2 className="panel-title" style={{ margin: 0 }}>
                Provision Administrator Account
              </h2>
            </div>
            <p className="panel-subtitle">
              Create university administrative credentials with full privileges over account management, branding, reports, and PostgreSQL audit logging.
            </p>
          </div>
        </div>

        {adminMessage && (
          <div className="alert-banner alert-success">
            <strong>Success:</strong> {adminMessage}
          </div>
        )}

        {adminError && (
          <div className="alert-banner alert-danger">
            <strong>Error:</strong> {adminError}
          </div>
        )}

        <form className="admin-account-form" onSubmit={submitAdmin}>
          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="admin-name">
                Administrator Full Name <span className="req">*</span>
              </label>
              <input
                id="admin-name"
                name="name"
                placeholder="e.g. Dean Alex Mercer"
                required
              />
            </div>

            <div className="form-group flex-1">
              <label htmlFor="admin-email">
                Campus Institutional Email (.edu / .edu.ph) <span className="req">*</span>
              </label>
              <input
                id="admin-email"
                name="email"
                type="email"
                placeholder="admin.mercer@school.edu.ph"
                required
              />
            </div>
          </div>

          <div className="form-row">
            <div className="form-group flex-1">
              <label htmlFor="admin-password">
                Temporary Password <span className="req">*</span>
              </label>
              <input
                id="admin-password"
                name="password"
                type="password"
                minLength={8}
                placeholder="Minimum 8 chars (upper, lower, digit, symbol)"
                required
              />
              <span className="field-hint">
                Administrator password. Must be at least 8 characters with uppercase, lowercase, number, and special symbol.
              </span>
            </div>

            <div className="form-group flex-1">
              <label htmlFor="admin-setup-token">
                Administrator Setup Token <span className="req">*</span>
              </label>
              <input
                id="admin-setup-token"
                name="setupToken"
                type="password"
                required
                autoComplete="off"
                placeholder="Enter setup authorization token"
              />
              <span className="field-hint">
                Authorized key supplied during system deployment (ADMIN_SETUP_TOKEN).
              </span>
            </div>
          </div>

          <div className="form-actions-row">
            <button
              className="btn btn-primary"
              disabled={adminSubmitting}
              type="submit"
              style={{
                backgroundColor: "var(--primary-hover, #14532d)",
                boxShadow: "0 2px 6px rgba(22, 101, 52, 0.25)",
              }}
            >
              {adminSubmitting ? "Creating Administrator..." : "Create Administrator Account"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
