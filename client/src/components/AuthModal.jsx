import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";
import PasswordRequirements from "./PasswordRequirements.jsx";
import {
  validateName,
  validateSchoolEmail,
  validatePassword,
} from "../utils/validation.js";

export default function AuthModal({
  mode = "signin",
  setMode,
  onClose,
  onSuccess,
  onForgot,
}) {
  const { login, register, verify2FALogin } = useAuth();
  const [twoFactorChallenge, setTwoFactorChallenge] = useState(null);
  const [totpCode, setTotpCode] = useState("");
  const [useBackupCode, setUseBackupCode] = useState(false);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const [accountType, setAccountType] = useState("client");

  // Form states
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [setupToken, setSetupToken] = useState("");

  // Visibility toggles
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);

  function resetForm() {
    setError("");
    setPassword("");
    setConfirmPassword("");
    setSetupToken("");
  }

  async function submit(event) {
    event.preventDefault();
    setError("");

    if (mode === "signup") {
      // 1. Validate full name
      const nameVal = validateName(name);
      if (!nameVal.valid) {
        setError(nameVal.error);
        return;
      }

      // 2. Validate institutional email
      const emailVal = validateSchoolEmail(email, { requireSchoolDomain: true });
      if (!emailVal.valid) {
        setError(emailVal.error);
        return;
      }

      // 3. Validate password complexity
      const passVal = validatePassword(password);
      if (!passVal.valid) {
        setError(passVal.error);
        return;
      }

      // 4. Validate password confirmation
      if (password !== confirmPassword) {
        setError("Passwords do not match. Please re-enter your password.");
        return;
      }

      // 5. Validate admin setup token
      if (accountType === "admin" && !setupToken.trim()) {
        setError("Administrator setup authorization token is required.");
        return;
      }
    } else {
      if (!email.trim() || !password) {
        setError("Please enter your campus email and password.");
        return;
      }
    }

    setBusy(true);
    const payload = {
      name: name.trim(),
      email: email.trim().toLowerCase(),
      password,
      accountType,
      setupToken: setupToken.trim(),
    };

    try {
      let savedUser;
      if (mode === "signup") {
        savedUser = await register(payload);
        onSuccess(savedUser);
      } else {
        const loginRes = await login({ email: email.trim(), password });
        if (loginRes?.requires2FA) {
          setTwoFactorChallenge(loginRes);
          setTotpCode("");
          setError("");
          return;
        }
        savedUser = loginRes;
        onSuccess(savedUser);
      }
    } catch (requestError) {
      setError(requestError.message);
    } finally {
      setBusy(false);
    }
  }

  async function handle2FASubmit(event) {
    event.preventDefault();
    if (!totpCode.trim()) {
      setError(useBackupCode ? "Please enter an 8-character backup recovery code." : "Please enter the 6-digit code from your authenticator app.");
      return;
    }

    setBusy(true);
    setError("");
    try {
      const savedUser = await verify2FALogin({
        tempToken: twoFactorChallenge.tempToken,
        code: totpCode.trim(),
      });
      onSuccess(savedUser);
    } catch (err) {
      setError(err.message || "Invalid two-factor authentication code.");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="auth-modal-title"
    >
      <section className="modal auth-modal">
        <button
          className="modal-close"
          onClick={onClose}
          type="button"
          aria-label="Close authentication dialog"
        >
          ×
        </button>

        {twoFactorChallenge ? (
          <>
            <div className="modal-header-tag">SECURITY VERIFICATION</div>
            <h2 id="auth-modal-title" className="auth-modal-title">
              Two-Factor Authentication
            </h2>
            <p className="modal-intro">
              Enter the security code for <strong>{twoFactorChallenge.email}</strong>.
            </p>

            {error && (
              <div className="alert-banner alert-danger">
                <strong>Authentication notice:</strong> {error}
              </div>
            )}

            <form className="auth-form" onSubmit={handle2FASubmit} noValidate>
              <div className="form-group" style={{ marginBottom: "16px" }}>
                <label htmlFor="totp-code-input" style={{ display: "block", marginBottom: "6px", fontWeight: 700 }}>
                  {useBackupCode ? "Emergency Backup Code *" : "6-Digit Authenticator Code *"}
                </label>
                <input
                  id="totp-code-input"
                  type="text"
                  autoFocus
                  required
                  className="form-control"
                  style={{
                    fontSize: useBackupCode ? "16px" : "24px",
                    letterSpacing: useBackupCode ? "2px" : "6px",
                    textAlign: "center",
                    fontWeight: 700,
                    padding: "10px",
                    width: "100%",
                    background: "var(--surface)",
                    border: "1px solid var(--border)",
                    color: "var(--text-main)",
                    borderRadius: "var(--radius-sm)",
                  }}
                  maxLength={useBackupCode ? 10 : 8}
                  placeholder={useBackupCode ? "XXXX-XXXX" : "000000"}
                  value={totpCode}
                  onChange={(e) => setTotpCode(e.target.value)}
                />
              </div>

              <div style={{ marginBottom: "16px", textAlign: "right" }}>
                <button
                  type="button"
                  className="link-button"
                  style={{ fontSize: "12.5px", color: "var(--primary)", background: "none", border: "none", cursor: "pointer", textDecoration: "underline" }}
                  onClick={() => {
                    setUseBackupCode(!useBackupCode);
                    setTotpCode("");
                    setError("");
                  }}
                >
                  {useBackupCode ? "← Use 6-digit authenticator code instead" : "Lost phone? Use a backup code"}
                </button>
              </div>

              <button
                className="btn btn-primary btn-lg full"
                disabled={busy}
                type="submit"
                style={{ width: "100%", marginBottom: "10px" }}
              >
                {busy ? "Verifying..." : "Verify & Sign In"}
              </button>

              <button
                type="button"
                className="btn btn-secondary full"
                style={{ width: "100%" }}
                onClick={() => {
                  setTwoFactorChallenge(null);
                  setTotpCode("");
                  setError("");
                }}
              >
                Cancel &amp; Back to Sign In
              </button>
            </form>
          </>
        ) : (
          <>
            <div className="modal-header-tag">CAMPUS ACCESS</div>
            <h2 id="auth-modal-title" className="auth-modal-title">
              {mode === "signup" ? "Create Campus Account" : "Sign in to Continue"}
            </h2>
            <p className="modal-intro">
              Access your personal lost and found dashboard, register items, or
              verify handover records.
            </p>

            {/* Tab switch */}
            <div className="auth-tabs">
          <button
            className={`auth-tab ${mode === "signin" ? "active" : ""}`}
            onClick={() => {
              setMode("signin");
              resetForm();
            }}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => {
              setMode("signup");
              resetForm();
            }}
            type="button"
          >
            Register Account
          </button>
        </div>

        {error && (
          <div className="alert-banner alert-danger">
            <strong>Authentication notice:</strong> {error}
          </div>
        )}

        <form className="auth-form" onSubmit={submit} noValidate>
          {mode === "signup" && (
            <>
              <div className="form-group">
                <label htmlFor="reg-name">
                  Full Name <span className="req">*</span>
                </label>
                <input
                  id="reg-name"
                  name="name"
                  required
                  value={name}
                  onChange={(e) => setName(e.target.value)}
                  placeholder="e.g. Maria Santos"
                  autoComplete="name"
                />
              </div>

              <div className="form-group">
                <label htmlFor="reg-type">Account Role</label>
                <select
                  id="reg-type"
                  name="accountType"
                  value={accountType}
                  onChange={(event) => setAccountType(event.target.value)}
                >
                  <option value="client">Client (Student / Faculty)</option>
                  <option value="admin">Administrator (Requires Token)</option>
                </select>
              </div>

              {accountType === "admin" && (
                <div className="form-group">
                  <label htmlFor="reg-token">
                    Administrator Setup Token <span className="req">*</span>
                  </label>
                  <input
                    id="reg-token"
                    name="setupToken"
                    type="password"
                    required
                    value={setupToken}
                    onChange={(e) => setSetupToken(e.target.value)}
                    autoComplete="off"
                    placeholder="Enter setup authorization token"
                  />
                  <span className="field-hint">
                    Authorized key supplied during system deployment.
                  </span>
                </div>
              )}
            </>
          )}

          <div className="form-group">
            <label htmlFor="auth-email">
              Campus Email <span className="req">*</span>
            </label>
            <input
              id="auth-email"
              name="email"
              type="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              autoComplete="email"
              placeholder={
                mode === "signup"
                  ? "student@school.edu.ph"
                  : "name@school.edu.ph or username"
              }
            />
            {mode === "signup" && (
              <span className="field-hint">
                Must be your institutional school email (.edu or .edu.ph).
              </span>
            )}
          </div>

          <div className="form-group">
            <div className="label-with-action">
              <label htmlFor="auth-password">
                Password <span className="req">*</span>
              </label>
              {mode === "signin" && (
                <button type="button" className="link-btn" onClick={onForgot}>
                  Forgot password?
                </button>
              )}
            </div>

            <div className="password-input-group">
              <input
                id="auth-password"
                name="password"
                type={showPassword ? "text" : "password"}
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                autoComplete={
                  mode === "signup" ? "new-password" : "current-password"
                }
                placeholder="••••••••"
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

            {mode === "signup" && (
              <PasswordRequirements
                password={password}
                confirmPassword={confirmPassword}
                showMatch={Boolean(confirmPassword)}
              />
            )}
          </div>

          {mode === "signup" && (
            <div className="form-group">
              <label htmlFor="reg-confirm-password">
                Confirm Password <span className="req">*</span>
              </label>
              <div className="password-input-group">
                <input
                  id="reg-confirm-password"
                  name="confirmPassword"
                  type={showConfirmPassword ? "text" : "password"}
                  required
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  autoComplete="new-password"
                  placeholder="Repeat your password"
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
          )}

          <button
            className="btn btn-primary btn-lg full"
            disabled={busy}
            type="submit"
          >
            {busy
              ? mode === "signup"
                ? "Creating account..."
                : "Signing in..."
              : mode === "signup"
                ? "Register Account"
                : "Sign In"}
          </button>
        </form>
          </>
        )}
      </section>
    </div>
  );
}
