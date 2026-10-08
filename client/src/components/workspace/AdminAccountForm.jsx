import React, { useState } from "react";
import { apiRequest } from "../../api/client.js";

export default function AdminAccountForm() {
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function submit(event) {
    event.preventDefault();
    setMessage("");
    setError("");
    setSubmitting(true);
    const form = event.currentTarget;
    try {
      await apiRequest("/admin/accounts", {
        method: "POST",
        body: JSON.stringify(Object.fromEntries(new FormData(form))),
      });
      form.reset();
      setMessage("Verifier / CSA account created successfully.");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <section className="workspace-panel admin-account-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="panel-title">
            Provision Verifier / CSA Staff Account
          </h2>
          <p className="panel-subtitle">
            Create verified credentials for designated campus authority and lost
            &amp; found desk personnel.
          </p>
        </div>
      </div>

      {message && (
        <div className="alert-banner alert-success">
          <strong>Success:</strong> {message}
        </div>
      )}

      {error && (
        <div className="alert-banner alert-danger">
          <strong>Error:</strong> {error}
        </div>
      )}

      <form className="admin-account-form" onSubmit={submit}>
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
              minLength={6}
              placeholder="Minimum 6 characters"
              required
            />
            <span className="field-hint">
              Staff will use this password to sign in to the Verifier workspace.
            </span>
          </div>
        </div>

        <input type="hidden" name="role" value="staff" />

        <div className="form-actions-row">
          <button
            className="btn btn-primary"
            disabled={submitting}
            type="submit"
          >
            {submitting ? "Creating Account..." : "Create Verifier Account"}
          </button>
        </div>
      </form>
    </section>
  );
}
