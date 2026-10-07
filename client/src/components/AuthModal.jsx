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
    <div className="modal-backdrop">
      <section className="modal auth-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">CAMPUS ACCESS</p>
        <h2>
          {mode === "signup" ? "Create an account" : "Sign in to continue"}
        </h2>
        <p className="modal-intro">
          Client accounts can report items and track claims. Privileged access
          is verified by the server.
        </p>

        <div className="auth-tabs">
          <button
            className={mode === "signin" ? "auth-tab active" : "auth-tab"}
            onClick={() => setMode("signin")}
            type="button"
          >
            Sign in
          </button>
          <button
            className={mode === "signup" ? "auth-tab active" : "auth-tab"}
            onClick={() => setMode("signup")}
            type="button"
          >
            Create account
          </button>
        </div>

        <form className="auth-form" onSubmit={submit}>
          {mode === "signup" && (
            <>
              <label>
                Full name
                <input name="name" required />
              </label>

              <label>
                Account type
                <select
                  name="accountType"
                  value={accountType}
                  onChange={(event) => setAccountType(event.target.value)}
                >
                  <option value="client">Client</option>
                  <option value="admin">Administrator</option>
                </select>
              </label>

              {accountType === "admin" && (
                <label>
                  Administrator setup authorization
                  <input
                    name="setupToken"
                    type="password"
                    required
                    autoComplete="off"
                  />
                  <small>
                    Use the authorization supplied by your system administrator.
                  </small>
                </label>
              )}
            </>
          )}

          <label>
            School email
            <input name="email" type="email" required />
          </label>

          <label>
            Password
            <input name="password" type="password" minLength={6} required />
          </label>

          {error && <p className="auth-error">{error}</p>}

          <button className="primary full" disabled={busy}>
            {busy
              ? "Working..."
              : mode === "signup"
                ? "Create account"
                : "Sign in"}
          </button>

          {mode === "signin" && (
            <button className="text-button" type="button" onClick={onForgot}>
              Forgot password?
            </button>
          )}
        </form>
      </section>
    </div>
  );
}
