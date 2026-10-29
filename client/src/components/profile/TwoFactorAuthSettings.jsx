import React, { useState, useEffect } from "react";
import { apiRequest } from "../../api/client.js";

export default function TwoFactorAuthSettings() {
  const [status, setStatus] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [successMsg, setSuccessMsg] = useState("");

  // Setup state
  const [settingUp, setSettingUp] = useState(false);
  const [setupData, setSetupData] = useState(null);
  const [confirmCode, setConfirmCode] = useState("");
  const [confirmBusy, setConfirmBusy] = useState(false);
  const [copiedKey, setCopiedKey] = useState(false);
  const [copiedCodes, setCopiedCodes] = useState(false);

  // Disable state
  const [showDisableModal, setShowDisableModal] = useState(false);
  const [disablePassword, setDisablePassword] = useState("");
  const [disableCode, setDisableCode] = useState("");
  const [disableBusy, setDisableBusy] = useState(false);
  const [disableError, setDisableError] = useState("");

  // Regenerate codes state
  const [regenCodes, setRegenCodes] = useState(null);
  const [regenBusy, setRegenBusy] = useState(false);

  async function fetchStatus() {
    setLoading(true);
    setError("");
    try {
      const data = await apiRequest("/auth/2fa/status");
      setStatus(data);
    } catch (err) {
      setError(err.message || "Failed to load Two-Factor Authentication status.");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    fetchStatus();
  }, []);

  async function handleStartSetup() {
    setError("");
    setSuccessMsg("");
    setConfirmBusy(true);
    try {
      const data = await apiRequest("/auth/2fa/setup", { method: "POST" });
      setSetupData(data);
      setSettingUp(true);
      setConfirmCode("");
    } catch (err) {
      setError(err.message || "Failed to initiate Two-Factor Authentication setup.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleConfirmSetup(e) {
    e.preventDefault();
    if (!confirmCode.trim()) {
      setError("Please enter the 6-digit verification code from your authenticator app.");
      return;
    }

    setConfirmBusy(true);
    setError("");
    try {
      const res = await apiRequest("/auth/2fa/confirm", {
        method: "POST",
        body: JSON.stringify({ code: confirmCode.trim() }),
      });
      setSuccessMsg(res.message || "Two-Factor Authentication is now active!");
      setSettingUp(false);
      setSetupData(null);
      await fetchStatus();
    } catch (err) {
      setError(err.message || "Invalid verification code.");
    } finally {
      setConfirmBusy(false);
    }
  }

  async function handleDisable2FA(e) {
    e.preventDefault();
    if (!disablePassword) {
      setDisableError("Please enter your account password to confirm.");
      return;
    }

    setDisableBusy(true);
    setDisableError("");
    try {
      const res = await apiRequest("/auth/2fa/disable", {
        method: "POST",
        body: JSON.stringify({
          password: disablePassword,
          code: disableCode.trim() || undefined,
        }),
      });
      setSuccessMsg(res.message || "Two-Factor Authentication disabled.");
      setShowDisableModal(false);
      setDisablePassword("");
      setDisableCode("");
      await fetchStatus();
    } catch (err) {
      setDisableError(err.message || "Failed to disable Two-Factor Authentication.");
    } finally {
      setDisableBusy(false);
    }
  }

  async function handleRegenerateBackupCodes() {
    if (!window.confirm("Generating new backup codes will invalidate any existing unused codes. Are you sure?")) {
      return;
    }

    setRegenBusy(true);
    setError("");
    try {
      const res = await apiRequest("/auth/2fa/regenerate-backup-codes", {
        method: "POST",
        body: JSON.stringify({}),
      });
      setRegenCodes(res.backupCodes);
      setSuccessMsg("Fresh backup recovery codes generated.");
      await fetchStatus();
    } catch (err) {
      setError(err.message || "Failed to regenerate backup recovery codes.");
    } finally {
      setRegenBusy(false);
    }
  }

  function handleCopyKey() {
    if (!setupData?.secret) return;
    navigator.clipboard.writeText(setupData.secret);
    setCopiedKey(true);
    setTimeout(() => setCopiedKey(false), 2500);
  }

  function handleCopyCodes(codes) {
    if (!Array.isArray(codes) || codes.length === 0) return;
    navigator.clipboard.writeText(codes.join("\n"));
    setCopiedCodes(true);
    setTimeout(() => setCopiedCodes(false), 2500);
  }

  if (loading) {
    return (
      <div className="profile-section-card" style={{ padding: "24px", textAlign: "center" }}>
        <div className="loading-spinner" />
        <p style={{ marginTop: "12px", color: "var(--text-muted)", fontSize: "13px" }}>
          Checking Two-Factor Authentication status...
        </p>
      </div>
    );
  }

  return (
    <div className="profile-section-card two-factor-settings-card" style={{ marginTop: "24px" }}>
      <div className="section-card-header" style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: "16px" }}>
        <div>
          <h3 style={{ margin: 0, fontSize: "16px", color: "var(--text-main)", display: "flex", alignItems: "center", gap: "8px" }}>
            <span>🔐</span> Two-Factor Authentication (2FA)
          </h3>
          <p style={{ margin: "4px 0 0 0", fontSize: "13px", color: "var(--text-muted)" }}>
            Protect your campus account with Google Authenticator, Microsoft Authenticator, or 1Password.
          </p>
        </div>

        {status?.enabled ? (
          <span className="badge badge-success" style={{ background: "rgba(22, 163, 74, 0.15)", color: "#16a34a", padding: "4px 10px", borderRadius: "9999px", fontSize: "12px", fontWeight: 700, border: "1px solid rgba(22, 163, 74, 0.3)" }}>
            ✓ Active &amp; Protected
          </span>
        ) : (
          <span className="badge badge-neutral" style={{ background: "rgba(100, 112, 103, 0.15)", color: "var(--text-muted)", padding: "4px 10px", borderRadius: "9999px", fontSize: "12px", fontWeight: 600 }}>
            Not Enabled
          </span>
        )}
      </div>

      {error && (
        <div className="alert alert-danger" style={{ marginBottom: "16px" }}>
          ⚠️ {error}
        </div>
      )}

      {successMsg && (
        <div className="alert alert-success" style={{ marginBottom: "16px" }}>
          ✓ {successMsg}
        </div>
      )}

      {/* CASE 1: 2FA NOT ENABLED */}
      {!status?.enabled && !settingUp && (
        <div className="two-factor-intro-box" style={{ background: "var(--surface-alt)", padding: "16px 20px", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <p style={{ margin: "0 0 14px 0", fontSize: "13.5px", lineHeight: "1.5", color: "var(--text-main)" }}>
            Two-Factor Authentication adds an extra layer of defense to your university account. When enabled, signing in requires both your password and a dynamic 6-digit verification code generated by your smartphone authenticator app.
          </p>
          <button
            type="button"
            className="btn btn-primary"
            onClick={handleStartSetup}
            disabled={confirmBusy}
          >
            {confirmBusy ? "Generating Secret..." : "Set Up Two-Factor Authentication"}
          </button>
        </div>
      )}

      {/* CASE 2: IN THE MIDDLE OF SETUP */}
      {settingUp && setupData && (
        <div className="two-factor-setup-flow" style={{ background: "var(--surface-alt)", padding: "20px", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <h4 style={{ margin: "0 0 12px 0", fontSize: "15px", color: "var(--text-main)" }}>
            Step 1: Scan QR Code with Your Authenticator App
          </h4>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 16px 0" }}>
            Open <strong>Google Authenticator</strong>, <strong>Microsoft Authenticator</strong>, or your password manager on your phone, tap <em>Add Account (+)</em>, and scan the QR code below:
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "24px", alignItems: "center", marginBottom: "20px" }}>
            {setupData.qrCode && (
              <div style={{ background: "#ffffff", padding: "10px", borderRadius: "8px", display: "inline-block", boxShadow: "0 2px 8px rgba(0,0,0,0.15)" }}>
                <img
                  src={setupData.qrCode}
                  alt="2FA QR Code"
                  style={{ width: "160px", height: "160px", display: "block" }}
                />
              </div>
            )}

            <div style={{ flex: "1 1 240px" }}>
              <div style={{ fontSize: "12px", color: "var(--text-muted)", marginBottom: "4px" }}>
                Can't scan the QR code? Enter this secret key manually:
              </div>
              <div style={{ display: "flex", gap: "8px", alignItems: "center" }}>
                <code style={{ background: "var(--surface)", padding: "6px 10px", borderRadius: "6px", border: "1px solid var(--border)", fontSize: "13px", letterSpacing: "1px", color: "var(--text-main)", userSelect: "all" }}>
                  {setupData.secret}
                </code>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={handleCopyKey}
                >
                  {copiedKey ? "Copied!" : "Copy Key"}
                </button>
              </div>
            </div>
          </div>

          <h4 style={{ margin: "20px 0 8px 0", fontSize: "15px", color: "var(--text-main)" }}>
            Step 2: Save Emergency Backup Recovery Codes
          </h4>
          <p style={{ fontSize: "12.5px", color: "var(--text-muted)", margin: "0 0 12px 0" }}>
            If you lose access to your phone or authenticator app, each of these one-time codes can be used once to sign in. Save them in a secure password manager or private note.
          </p>

          <div style={{ background: "var(--surface)", padding: "12px 16px", borderRadius: "8px", border: "1px solid var(--border)", marginBottom: "12px" }}>
            <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "8px" }}>
              {setupData.backupCodes?.map((code, idx) => (
                <code key={idx} style={{ fontSize: "12.5px", fontWeight: 700, letterSpacing: "0.5px", color: "var(--text-main)" }}>
                  {code}
                </code>
              ))}
            </div>
          </div>

          <button
            type="button"
            className="btn btn-secondary btn-sm"
            onClick={() => handleCopyCodes(setupData.backupCodes)}
            style={{ marginBottom: "20px" }}
          >
            {copiedCodes ? "Codes Copied!" : "📋 Copy All 8 Backup Codes"}
          </button>

          <h4 style={{ margin: "0 0 8px 0", fontSize: "15px", color: "var(--text-main)" }}>
            Step 3: Confirm Setup
          </h4>
          <p style={{ fontSize: "13px", color: "var(--text-muted)", margin: "0 0 12px 0" }}>
            Enter the 6-digit code currently displayed in your authenticator app to verify activation:
          </p>

          <form onSubmit={handleConfirmSetup} style={{ display: "flex", flexWrap: "wrap", gap: "10px", alignItems: "center" }}>
            <input
              type="text"
              autoFocus
              required
              maxLength={6}
              placeholder="000000"
              className="form-control"
              style={{ width: "160px", fontSize: "18px", letterSpacing: "4px", textAlign: "center", fontWeight: 700, padding: "8px" }}
              value={confirmCode}
              onChange={(e) => setConfirmCode(e.target.value.replace(/\D/g, ""))}
            />

            <button
              type="submit"
              className="btn btn-primary"
              disabled={confirmBusy}
            >
              {confirmBusy ? "Activating..." : "Confirm & Enable 2FA"}
            </button>

            <button
              type="button"
              className="btn btn-secondary"
              onClick={() => {
                setSettingUp(false);
                setSetupData(null);
                setError("");
              }}
            >
              Cancel
            </button>
          </form>
        </div>
      )}

      {/* CASE 3: 2FA IS ACTIVE */}
      {status?.enabled && (
        <div className="two-factor-active-box" style={{ background: "var(--surface-alt)", padding: "16px 20px", borderRadius: "8px", border: "1px solid var(--border)" }}>
          <p style={{ margin: "0 0 10px 0", fontSize: "13.5px", color: "var(--text-main)" }}>
            Your account is secured with Google Authenticator. Whenever you sign in, you will be prompted for your 6-digit one-time code.
          </p>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "16px", alignItems: "center", fontSize: "12px", color: "var(--text-muted)", marginBottom: "16px" }}>
            {status.confirmedAt && (
              <span>Activated on: {new Date(status.confirmedAt).toLocaleDateString(undefined, { year: "numeric", month: "short", day: "numeric" })}</span>
            )}
            <span>Remaining recovery codes: <strong>{status.remainingBackupCodes}</strong></span>
          </div>

          {regenCodes && (
            <div style={{ background: "var(--surface)", padding: "14px", borderRadius: "8px", border: "1px solid var(--border)", marginBottom: "16px" }}>
              <div style={{ fontWeight: 700, fontSize: "13px", color: "var(--text-main)", marginBottom: "6px" }}>
                New Backup Recovery Codes (Old codes are now void):
              </div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(110px, 1fr))", gap: "8px", marginBottom: "10px" }}>
                {regenCodes.map((code, idx) => (
                  <code key={idx} style={{ fontSize: "12.5px", fontWeight: 700, color: "var(--text-main)" }}>
                    {code}
                  </code>
                ))}
              </div>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => handleCopyCodes(regenCodes)}
              >
                {copiedCodes ? "Codes Copied!" : "📋 Copy All Codes"}
              </button>
            </div>
          )}

          <div style={{ display: "flex", flexWrap: "wrap", gap: "10px" }}>
            <button
              type="button"
              className="btn btn-secondary btn-sm"
              onClick={handleRegenerateBackupCodes}
              disabled={regenBusy}
            >
              {regenBusy ? "Regenerating..." : "Regenerate Backup Codes"}
            </button>

            <button
              type="button"
              className="btn btn-danger btn-sm"
              onClick={() => {
                setShowDisableModal(true);
                setDisableError("");
                setDisablePassword("");
                setDisableCode("");
              }}
            >
              Disable Two-Factor Authentication
            </button>
          </div>
        </div>
      )}

      {/* Disable 2FA Modal */}
      {showDisableModal && (
        <div className="modal-backdrop" role="dialog" aria-modal="true">
          <div className="modal" style={{ maxWidth: "440px", width: "90%" }}>
            <header className="modal-header">
              <div>
                <div className="modal-header-tag">SECURITY VERIFICATION</div>
                <h3 className="modal-title" style={{ fontSize: "18px" }}>
                  Disable Two-Factor Authentication
                </h3>
              </div>
              <button
                type="button"
                className="modal-close"
                onClick={() => setShowDisableModal(false)}
              >
                ×
              </button>
            </header>

            <form onSubmit={handleDisable2FA}>
              <div className="modal-body" style={{ padding: "16px 20px" }}>
                <p style={{ fontSize: "13px", color: "var(--text-muted)", marginBottom: "14px" }}>
                  To turn off Two-Factor Authentication, please confirm your current account password.
                </p>

                {disableError && (
                  <div className="alert alert-danger" style={{ marginBottom: "12px", fontSize: "12px" }}>
                    ⚠️ {disableError}
                  </div>
                )}

                <div className="form-group" style={{ marginBottom: "14px" }}>
                  <label htmlFor="disable-password" style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                    Account Password *
                  </label>
                  <input
                    id="disable-password"
                    type="password"
                    required
                    autoFocus
                    className="form-control"
                    placeholder="Enter your current password"
                    value={disablePassword}
                    onChange={(e) => setDisablePassword(e.target.value)}
                  />
                </div>

                <div className="form-group" style={{ marginBottom: "8px" }}>
                  <label htmlFor="disable-code" style={{ display: "block", fontSize: "12px", fontWeight: 700, marginBottom: "4px" }}>
                    Authenticator or Backup Code (Optional)
                  </label>
                  <input
                    id="disable-code"
                    type="text"
                    maxLength={10}
                    className="form-control"
                    placeholder="Current 6-digit code or backup code"
                    value={disableCode}
                    onChange={(e) => setDisableCode(e.target.value)}
                  />
                </div>
              </div>

              <footer className="modal-footer" style={{ display: "flex", justifyContent: "flex-end", gap: "8px", padding: "12px 20px" }}>
                <button
                  type="button"
                  className="btn btn-secondary btn-sm"
                  onClick={() => setShowDisableModal(false)}
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="btn btn-danger btn-sm"
                  disabled={disableBusy}
                >
                  {disableBusy ? "Disabling..." : "Confirm & Disable 2FA"}
                </button>
              </footer>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
