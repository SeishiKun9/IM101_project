import React, { useState } from "react";
import { apiRequest } from "../api/client.js";

export default function ForgotPasswordModal({ onClose, onBack }) {
  const [email, setEmail] = useState("");
  const [token, setToken] = useState("");
  const [password, setPassword] = useState("");
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function requestReset(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const result = await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email }),
      });
      setMessage(result.message);
      if (result.resetToken) setToken(result.resetToken);
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setSubmitting(true);
    try {
      const result = await apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token, password }),
      });
      setMessage(result.message);
      setToken("");
      setPassword("");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="forgot-modal-title"
    >
      <section className="modal auth-modal">
        <button
          className="modal-close"
          onClick={onClose}
          type="button"
          aria-label="Close recovery dialog"
        >
          ×
        </button>

        <div className="modal-header-tag">ACCOUNT RECOVERY</div>
        <h2 id="forgot-modal-title" className="auth-modal-title">
          Reset Your Password
        </h2>
        <p className="modal-intro">
          Enter your registered school email to obtain a security reset token
          for your Client, Verifier, or Administrator account.
        </p>

        {message && (
          <div className="alert-banner alert-success">
            <strong>Notice:</strong> {message}
          </div>
        )}

        {error && (
          <div className="alert-banner alert-danger">
            <strong>Error:</strong> {error}
          </div>
        )}

        {!token ? (
          <form className="auth-form" onSubmit={requestReset}>
            <div className="form-group">
              <label htmlFor="recovery-email">
                Campus Email <span className="req">*</span>
              </label>
              <input
                id="recovery-email"
                type="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                required
                placeholder="name@school.edu"
              />
            </div>

            <button
              className="btn btn-primary btn-lg full"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Sending Request..." : "Request Reset Token"}
            </button>
          </form>
        ) : (
          <form className="auth-form" onSubmit={resetPassword}>
            <div className="form-group">
              <label htmlFor="reset-token">
                Security Reset Token <span className="req">*</span>
              </label>
              <input
                id="reset-token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
                placeholder="Enter reset token provided"
              />
            </div>

            <div className="form-group">
              <label htmlFor="reset-new-password">
                New Password <span className="req">*</span>
              </label>
              <input
                id="reset-new-password"
                type="password"
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
                placeholder="Minimum 6 characters"
              />
            </div>

            <button
              className="btn btn-primary btn-lg full"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Updating Password..." : "Set New Password"}
            </button>
          </form>
        )}

        <div className="modal-footer-nav">
          <button className="link-btn" type="button" onClick={onBack}>
            ← Back to Sign In
          </button>
        </div>
      </section>
    </div>
  );
}
