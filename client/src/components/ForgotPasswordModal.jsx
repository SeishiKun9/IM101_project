import React, { useState, useEffect } from "react";
import { apiRequest } from "../api/client.js";
import PasswordRequirements from "./PasswordRequirements.jsx";
import { validatePassword, validateSchoolEmail } from "../utils/validation.js";

export default function ForgotPasswordModal({ initialToken = "", onClose, onBack }) {
  const [step, setStep] = useState(initialToken ? "reset" : "request");
  const [email, setEmail] = useState("");
  const [token, setToken] = useState(initialToken || "");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  const [message, setMessage] = useState("");
  const [dispatchStatus, setDispatchStatus] = useState(null);
  const [error, setError] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    if (initialToken) {
      setToken(initialToken);
      setStep("reset");
    }
  }, [initialToken]);

  async function requestReset(event) {
    event.preventDefault();
    setError("");
    setMessage("");
    setDispatchStatus(null);

    const emailVal = validateSchoolEmail(email, { requireSchoolDomain: false });
    if (!emailVal.valid) {
      setError(emailVal.error);
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiRequest("/auth/forgot-password", {
        method: "POST",
        body: JSON.stringify({ email: email.trim().toLowerCase() }),
      });
      setMessage(
        result.message ||
          "Password reset instructions have been dispatched.",
      );
      setDispatchStatus(result);
      if (result.resetToken) {
        setToken(result.resetToken);
      }
      setStep("reset");
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

    if (!token.trim()) {
      setError("Please provide the security reset token from your email.");
      return;
    }

    const passVal = validatePassword(password);
    if (!passVal.valid) {
      setError(passVal.error);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match. Please re-enter your password.");
      return;
    }

    setSubmitting(true);
    try {
      const result = await apiRequest("/auth/reset-password", {
        method: "POST",
        body: JSON.stringify({ token: token.trim(), password }),
      });
      setMessage(result.message || "Password reset successfully! You can sign in now.");
      setResetSuccess(true);
      setToken("");
      setPassword("");
      setConfirmPassword("");
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
          {step === "request"
            ? "Enter your registered campus email to receive a secure password reset token."
            : "Enter the security reset token sent to your email along with your new password."}
        </p>

        {message && (
          <div className="alert-banner alert-success">
            <strong>Notice:</strong> {message}
            {dispatchStatus?.simulated && (
              <p style={{ margin: "8px 0 0", fontSize: "12px", opacity: 0.9 }}>
                💡 <em>Development Mode:</em> SMTP is not configured in <code>.env</code>, so your reset token was auto-filled below and logged to the server terminal. To receive real emails in your personal inbox, add your SMTP credentials (e.g. Gmail App Password) to <code>.env</code>.
              </p>
            )}
            {dispatchStatus?.emailSent && (
              <p style={{ margin: "8px 0 0", fontSize: "12px", opacity: 0.9 }}>
                ✉️ An email was sent to <strong>{email}</strong>. Please check your inbox and spam folder.
              </p>
            )}
          </div>
        )}

        {error && (
          <div className="alert-banner alert-danger">
            <strong>Error:</strong> {error}
          </div>
        )}

        {resetSuccess ? (
          <div style={{ textAlign: "center", padding: "16px 0" }}>
            <p style={{ fontSize: "15px", color: "var(--text-main)", marginBottom: "20px" }}>
              Your account password has been updated. You can now log into your account.
            </p>
            <button
              className="btn btn-primary btn-lg full"
              type="button"
              onClick={onBack}
            >
              Sign In Now →
            </button>
          </div>
        ) : step === "request" ? (
          <form className="auth-form" onSubmit={requestReset} noValidate>
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
              {submitting ? "Sending Request..." : "Email Reset Token"}
            </button>

            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setStep("reset");
                }}
                style={{ fontSize: "13px" }}
              >
                Already have a reset token? Enter it here
              </button>
            </div>
          </form>
        ) : (
          <form className="auth-form" onSubmit={resetPassword} noValidate>
            <div className="form-group">
              <label htmlFor="reset-token">
                Security Reset Token <span className="req">*</span>
              </label>
              <input
                id="reset-token"
                value={token}
                onChange={(event) => setToken(event.target.value)}
                required
                placeholder="Paste the reset token received via email"
              />
              <small style={{ display: "block", marginTop: "4px", color: "var(--text-muted)", fontSize: "11px" }}>
                Check your inbox (and spam folder) for the 64-character token. Tokens expire after 15 minutes.
              </small>
            </div>

            <div className="form-group">
              <label htmlFor="reset-new-password">
                New Password <span className="req">*</span>
              </label>
              <div className="password-input-group">
                <input
                  id="reset-new-password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(event) => setPassword(event.target.value)}
                  required
                  placeholder="Choose a strong new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowPassword(!showPassword)}
                  tabIndex="-1"
                  aria-label={showPassword ? "Hide password" : "Show password"}
                >
                  {showPassword ? "Hide" : "Show"}
                </button>
              </div>
              <PasswordRequirements
                password={password}
                confirmPassword={confirmPassword}
                showMatch={Boolean(confirmPassword)}
              />
            </div>

            <div className="form-group">
              <label htmlFor="reset-confirm-password">
                Confirm New Password <span className="req">*</span>
              </label>
              <div className="password-input-group">
                <input
                  id="reset-confirm-password"
                  type={showConfirmPassword ? "text" : "password"}
                  value={confirmPassword}
                  onChange={(event) => setConfirmPassword(event.target.value)}
                  required
                  placeholder="Re-enter your new password"
                  autoComplete="new-password"
                />
                <button
                  type="button"
                  className="password-toggle-btn"
                  onClick={() => setShowConfirmPassword(!showConfirmPassword)}
                  tabIndex="-1"
                  aria-label={
                    showConfirmPassword ? "Hide password" : "Show password"
                  }
                >
                  {showConfirmPassword ? "Hide" : "Show"}
                </button>
              </div>
            </div>

            <button
              className="btn btn-primary btn-lg full"
              disabled={submitting}
              type="submit"
            >
              {submitting ? "Updating Password..." : "Set New Password"}
            </button>

            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setStep("request");
                }}
                style={{ fontSize: "13px" }}
              >
                ← Request a new reset token by email
              </button>
            </div>
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
