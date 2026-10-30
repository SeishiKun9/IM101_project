import React, { useState, useEffect } from "react";
import { apiRequest } from "../api/client.js";
import PasswordRequirements from "./PasswordRequirements.jsx";
import { validatePassword, validateSchoolEmail } from "../utils/validation.js";

export default function ForgotPasswordModal({ initialToken = "", onClose, onBack }) {
  // Steps: "request" (enter email) | "token" (enter token) | "change_password" (actual change password)
  const [step, setStep] = useState(initialToken ? "token" : "request");
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
  const [verifying, setVerifying] = useState(false);
  const [tokenVerified, setTokenVerified] = useState(false);
  const [maskedEmail, setMaskedEmail] = useState("");
  const [resetSuccess, setResetSuccess] = useState(false);

  useEffect(() => {
    if (initialToken) {
      const cleanToken = initialToken.trim();
      setToken(cleanToken);
      setStep("token");
      setVerifying(true);
      setError("");

      apiRequest("/auth/verify-reset-token", {
        method: "POST",
        body: JSON.stringify({ token: cleanToken }),
      })
        .then((result) => {
          setTokenVerified(true);
          if (result.maskedEmail) setMaskedEmail(result.maskedEmail);
          setMessage("Security reset token verified. Please enter your new password below.");
          setStep("change_password");
        })
        .catch((err) => {
          setTokenVerified(false);
          setError(err.message || "That reset token is invalid or expired.");
          setStep("token");
        })
        .finally(() => {
          setVerifying(false);
        });
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
      setStep("token");
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setSubmitting(false);
    }
  }

  async function handleVerifyToken(event) {
    if (event) event.preventDefault();
    setError("");
    setMessage("");

    const cleanToken = token.trim();
    if (!cleanToken) {
      setError("Please enter the security reset token from your email.");
      return;
    }

    setVerifying(true);
    try {
      const payload = { token: cleanToken };
      if (email.trim()) {
        payload.email = email.trim().toLowerCase();
      }
      const result = await apiRequest("/auth/verify-reset-token", {
        method: "POST",
        body: JSON.stringify(payload),
      });

      setTokenVerified(true);
      if (result.maskedEmail) {
        setMaskedEmail(result.maskedEmail);
      }
      setMessage("✓ Security token matched and verified! Please enter your new password below.");
      setStep("change_password");
    } catch (verifyError) {
      setTokenVerified(false);
      setError(verifyError.message || "That reset token is invalid or expired.");
    } finally {
      setVerifying(false);
    }
  }

  async function resetPassword(event) {
    event.preventDefault();
    setError("");
    setMessage("");

    if (!token.trim()) {
      setError("Please provide the security reset token from your email.");
      setStep("token");
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

  // Determine modal header tag & title based on step
  let headerTag = "ACCOUNT RECOVERY";
  let modalTitle = "Reset Your Password";
  let modalIntro = "Enter your registered campus email to receive a secure password reset token.";

  if (step === "token") {
    headerTag = "STEP 1 OF 2: VERIFY TOKEN";
    modalTitle = "Enter Reset Token";
    modalIntro = "Enter the security reset token sent to your email. Once matched, you will proceed to change your password.";
  } else if (step === "change_password") {
    headerTag = "STEP 2 OF 2: CHANGE PASSWORD";
    modalTitle = "Change Your Password";
    modalIntro = "Your token was matched and verified. Enter your new password below.";
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

        <div className="modal-header-tag">{headerTag}</div>
        <h2 id="forgot-modal-title" className="auth-modal-title">
          {modalTitle}
        </h2>
        <p className="modal-intro">{modalIntro}</p>

        {/* Step indicator for Token and Change Password steps */}
        {!resetSuccess && (step === "token" || step === "change_password") && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              gap: "12px",
              marginBottom: "20px",
              padding: "8px 14px",
              background: "rgba(0, 0, 0, 0.03)",
              borderRadius: "10px",
            }}
          >
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: step === "token" ? 700 : 500,
                color: step === "token" ? "var(--primary)" : tokenVerified ? "var(--accent-emerald, #16a34a)" : "var(--text-muted)",
              }}
            >
              <span
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: tokenVerified ? "var(--accent-emerald, #16a34a)" : step === "token" ? "var(--primary)" : "var(--border)",
                  color: "#ffffff",
                }}
              >
                {tokenVerified ? "✓" : "1"}
              </span>
              <span>1. Enter Token</span>
            </div>

            <span style={{ color: "var(--border)", fontSize: "14px" }}>→</span>

            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: "6px",
                fontSize: "12px",
                fontWeight: step === "change_password" ? 700 : 500,
                color: step === "change_password" ? "var(--primary)" : "var(--text-muted)",
              }}
            >
              <span
                style={{
                  width: "20px",
                  height: "20px",
                  borderRadius: "50%",
                  display: "inline-flex",
                  alignItems: "center",
                  justifyContent: "center",
                  fontSize: "11px",
                  fontWeight: 700,
                  background: step === "change_password" ? "var(--primary)" : "var(--border)",
                  color: step === "change_password" ? "#ffffff" : "var(--text-muted)",
                }}
              >
                2
              </span>
              <span>2. Change Password</span>
            </div>
          </div>
        )}

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
              Your account password has been updated. You can now log into your account with your new password.
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
                  setStep("token");
                }}
                style={{ fontSize: "13px" }}
              >
                Already have a reset token? Enter it here
              </button>
            </div>
          </form>
        ) : step === "token" ? (
          <form className="auth-form" onSubmit={handleVerifyToken} noValidate>
            {dispatchStatus?.simulated && dispatchStatus?.resetToken && (
              <div
                style={{
                  background: "rgba(34, 197, 94, 0.1)",
                  border: "1px solid rgba(34, 197, 94, 0.3)",
                  borderRadius: "8px",
                  padding: "12px",
                  marginBottom: "16px",
                  fontSize: "12px",
                }}
              >
                <div
                  style={{
                    display: "flex",
                    justifyContent: "space-between",
                    alignItems: "center",
                    marginBottom: "8px",
                  }}
                >
                  <span style={{ fontWeight: 600, color: "var(--accent-emerald)" }}>
                    🛠️ Local Test Token (SMTP not set in .env):
                  </span>
                  <button
                    type="button"
                    className="btn btn-sm btn-primary"
                    style={{ padding: "4px 10px", fontSize: "11px" }}
                    onClick={() => {
                      setToken(dispatchStatus.resetToken);
                      navigator.clipboard?.writeText(dispatchStatus.resetToken);
                    }}
                  >
                    Auto-Fill Token
                  </button>
                </div>
                <code
                  style={{
                    display: "block",
                    padding: "6px 8px",
                    background: "rgba(0, 0, 0, 0.25)",
                    borderRadius: "4px",
                    wordBreak: "break-all",
                    color: "var(--text-main)",
                    fontSize: "11px",
                    userSelect: "all",
                  }}
                >
                  {dispatchStatus.resetToken}
                </code>
              </div>
            )}

            <div className="form-group">
              <label htmlFor="reset-token">
                Security Reset Token <span className="req">*</span>
              </label>
              <input
                id="reset-token"
                value={token}
                onChange={(event) => {
                  setToken(event.target.value);
                  setError("");
                }}
                required
                placeholder="Paste the reset token received via email"
                autoFocus
              />
              <small style={{ display: "block", marginTop: "4px", color: "var(--text-muted)", fontSize: "11px" }}>
                Check your inbox (and spam folder) for the 64-character token. Tokens expire after 15 minutes.
              </small>
            </div>

            <button
              className="btn btn-primary btn-lg full"
              disabled={verifying || !token.trim()}
              type="submit"
            >
              {verifying ? "Verifying Token..." : "Verify Token & Proceed →"}
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
        ) : (
          /* step === "change_password" - The actual change password section */
          <form className="auth-form" onSubmit={resetPassword} noValidate>
            {/* Verified token indicator */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "space-between",
                padding: "10px 14px",
                background: "rgba(34, 197, 94, 0.1)",
                border: "1px solid rgba(34, 197, 94, 0.3)",
                borderRadius: "8px",
                marginBottom: "18px",
                fontSize: "12px",
              }}
            >
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <span style={{ color: "var(--accent-emerald, #16a34a)", fontWeight: 700, fontSize: "14px" }}>✓</span>
                <span style={{ color: "var(--text-main)", fontWeight: 600 }}>
                  Reset Token Matched &amp; Verified {maskedEmail ? `(${maskedEmail})` : ""}
                </span>
              </div>
              <button
                type="button"
                className="link-btn"
                style={{ fontSize: "11px", color: "var(--text-muted)" }}
                onClick={() => {
                  setTokenVerified(false);
                  setStep("token");
                  setMessage("");
                  setError("");
                }}
              >
                Change Token
              </button>
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
                  autoFocus
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
              {submitting ? "Updating Password..." : "Change Password"}
            </button>

            <div style={{ textAlign: "center", marginTop: "12px" }}>
              <button
                type="button"
                className="link-btn"
                onClick={() => {
                  setError("");
                  setMessage("");
                  setStep("token");
                }}
                style={{ fontSize: "13px" }}
              >
                ← Back to token verification
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
