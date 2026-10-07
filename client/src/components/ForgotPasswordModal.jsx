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
    <div className="modal-backdrop">
      <section className="modal auth-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">ACCOUNT RECOVERY</p>
        <h2>Forgot password</h2>
        <p className="modal-intro">
          Request a time-limited reset token for any Client, Verifier, or
          Administrator account.
        </p>

        <form className="auth-form" onSubmit={requestReset}>
          <label>
            Account email
            <input
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <button className="primary full" disabled={submitting}>
            {submitting ? "Requesting..." : "Request reset"}
          </button>
        </form>

        {message && <p className="auth-note">{message}</p>}

        {token && (
          <form className="auth-form reset-form" onSubmit={resetPassword}>
            <label>
              Reset token
              <input
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
              />
            </label>
            <label>
              New password
              <input
                type="password"
                minLength={6}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                required
              />
            </label>
            <button className="primary full" disabled={submitting}>
              {submitting ? "Resetting..." : "Reset password"}
            </button>
          </form>
        )}

        {error && <p className="auth-error">{error}</p>}

        <button className="text-button" type="button" onClick={onBack}>
          Back to sign in
        </button>
      </section>
    </div>
  );
}
