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
  const { login, register } = useAuth();
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
      } else {
        savedUser = await login({ email: email.trim(), password });
      }
      onSuccess(savedUser);
    } catch (requestError) {
      setError(requestError.message);
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
      </section>
    </div>
  );
}
