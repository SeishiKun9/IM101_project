import React, { useState } from "react";
import { useAuth } from "../context/AuthContext.jsx";

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

  async function submit(event) {
    event.preventDefault();
    setBusy(true);
    setError("");
    const form = Object.fromEntries(new FormData(event.currentTarget));
    const payload = { ...form, accountType };

    try {
      let savedUser;
      if (mode === "signup") {
        savedUser = await register(payload);
      } else {
        savedUser = await login(payload);
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
              setError("");
            }}
            type="button"
          >
            Sign In
          </button>
          <button
            className={`auth-tab ${mode === "signup" ? "active" : ""}`}
            onClick={() => {
              setMode("signup");
              setError("");
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

        <form className="auth-form" onSubmit={submit}>
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
              autoComplete="email"
              placeholder="name@school.edu"
            />
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
            <input
              id="auth-password"
              name="password"
              type="password"
              minLength={6}
              required
              autoComplete={
                mode === "signup" ? "new-password" : "current-password"
              }
              placeholder="••••••••"
            />
          </div>

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
