import React, { useEffect, useState, useRef } from "react";
import { apiRequest } from "../../api/client.js";
import LogoCropModal from "./LogoCropModal.jsx";

export default function CampusLogoBranding() {
  const [logo, setLogo] = useState(null);
  const [logoName, setLogoName] = useState("");
  const [logoUrl, setLogoUrl] = useState("");
  const [logoAlt, setLogoAlt] = useState("");
  const [selectedFileName, setSelectedFileName] = useState("");
  const [rawImageForCrop, setRawImageForCrop] = useState(null);
  const [croppedDataUrl, setCroppedDataUrl] = useState(null);
  const [cropModalOpen, setCropModalOpen] = useState(false);
  const [previewLoadError, setPreviewLoadError] = useState(false);
  const [logoSaving, setLogoSaving] = useState(false);
  const [message, setMessage] = useState("");
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  async function loadLogo() {
    try {
      const res = await apiRequest("/campus/logo").catch(() => ({ logo: null }));
      if (res?.logo) {
        setLogo(res.logo);
        setLogoName(res.logo.name || "");
        setLogoUrl(res.logo.image_url || res.logo.imageUrl || "");
        setLogoAlt(res.logo.alt_text || "");
      }
    } catch (err) {
      setError(err.message || "Failed to load campus logo");
    }
  }

  useEffect(() => {
    loadLogo();
  }, []);

  function handleFileChange(event) {
    const file = event.target.files?.[0];
    if (!file) return;

    if (file.size > 10 * 1024 * 1024) {
      setError("Selected logo file exceeds 10 MB limit.");
      event.target.value = "";
      return;
    }

    const validTypes = ["image/jpeg", "image/png", "image/webp", "image/svg+xml"];
    const hasValidExt = /\.(jpe?g|png|webp|svg)$/i.test(file.name);
    if (!validTypes.includes(file.type) && !hasValidExt) {
      setError("Please choose a valid image file (PNG, JPG, WebP, or SVG).");
      event.target.value = "";
      return;
    }

    setError("");
    setMessage("");
    setSelectedFileName(file.name);

    if (!logoName || logoName === "Campus Logo" || logoName === "Campus Main Logo") {
      const suggested = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setLogoName(suggested);
    }

    const reader = new FileReader();
    reader.onload = () => {
      setRawImageForCrop(reader.result);
      setCropModalOpen(true);
    };
    reader.onerror = () => {
      setError("Failed to read image file from your device.");
    };
    reader.readAsDataURL(file);

    event.target.value = "";
  }

  function handleCropConfirm(croppedResultDataUrl) {
    setCroppedDataUrl(croppedResultDataUrl);
    setLogoUrl(croppedResultDataUrl);
    setPreviewLoadError(false);
    setCropModalOpen(false);
    setMessage(
      'Logo successfully cropped! Click "Save Campus Logo" below to persist changes to the database and audit logs.',
    );

    window.dispatchEvent(
      new CustomEvent("campus-logo-changed", {
        detail: {
          name: logoName,
          image_url: croppedResultDataUrl,
          imageUrl: croppedResultDataUrl,
          updatedAt: new Date().toISOString(),
        },
      }),
    );
  }

  async function handleUpdateLogo(event) {
    event.preventDefault();
    setLogoSaving(true);
    setMessage("");
    setError("");
    try {
      const imagePayload = croppedDataUrl || logoUrl;
      if (!imagePayload) {
        throw new Error("Please select and crop a logo image file before saving.");
      }

      const res = await apiRequest("/admin/logo", {
        method: "PUT",
        body: JSON.stringify({
          name: logoName,
          image: imagePayload,
          image_url: imagePayload,
          alt_text: logoAlt,
        }),
      });
      setLogo(res.logo);
      if (res.logo?.imageUrl || res.logo?.image_url) {
        setLogoUrl(res.logo.imageUrl || res.logo.image_url);
        setPreviewLoadError(false);
      }
      setCroppedDataUrl(null);
      setSelectedFileName("");
      setMessage(
        "Campus logo and branding successfully updated and logged in PostgreSQL audit trail!",
      );
      window.dispatchEvent(
        new CustomEvent("campus-logo-changed", { detail: res.logo }),
      );
    } catch (err) {
      setError(err.message || "Failed to update campus logo");
    } finally {
      setLogoSaving(false);
    }
  }

  return (
    <div className="tab-content" style={{ marginTop: "16px" }}>
      <div className="admin-subpanel" style={{ padding: "20px" }}>
        <div className="subpanel-header" style={{ marginBottom: "16px", padding: "0 0 14px", borderBottom: "1px solid var(--border)" }}>
          <div>
            <h3 style={{ fontSize: "17px", fontWeight: 700, margin: 0 }}>
              Campus Identity &amp; Logo Branding
            </h3>
            <p className="table-subtext" style={{ margin: "4px 0 0" }}>
              Configure the active university emblem rendered in the application header. Changes are recorded in the PostgreSQL audit log.
            </p>
          </div>
          <span className="count-pill">Logo ID #{logo?.logo_id || 1}</span>
        </div>

        {message && (
          <div className="alert-banner alert-success" style={{ marginBottom: "16px" }}>
            <strong>Notice:</strong> {message}
          </div>
        )}

        {error && (
          <div className="alert-banner alert-danger" style={{ marginBottom: "16px" }}>
            <strong>Error:</strong> {error}
          </div>
        )}

        <form onSubmit={handleUpdateLogo} className="admin-logo-form">
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "1fr 260px",
              gap: "28px",
              alignItems: "start",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Single File Picker */}
              <div className="form-group" style={{ marginBottom: "4px" }}>
                <label
                  className="form-label"
                  htmlFor="campus-logo-file-picker"
                  style={{ fontWeight: 700, marginBottom: "6px", display: "block" }}
                >
                  Choose School Logo File:
                </label>
                <input
                  id="campus-logo-file-picker"
                  ref={fileInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/webp,image/svg+xml,.png,.jpg,.jpeg,.webp,.svg"
                  onChange={handleFileChange}
                  className="form-input"
                  style={{
                    cursor: "pointer",
                    padding: "8px 12px",
                    background: "var(--surface, #ffffff)",
                    border: "1px solid var(--border)",
                    borderRadius: "6px",
                    width: "100%",
                    fontSize: "13px",
                  }}
                />
                <small className="table-subtext" style={{ marginTop: "4px", display: "block" }}>
                  Select an image (PNG, JPG, SVG, or WebP). Selecting a file opens the crop &amp; edit window before saving.
                </small>

                {croppedDataUrl && (
                  <div
                    style={{
                      marginTop: "10px",
                      display: "flex",
                      alignItems: "center",
                      gap: "8px",
                      background: "rgba(16, 185, 129, 0.1)",
                      padding: "10px 14px",
                      borderRadius: "6px",
                      border: "1px solid rgba(16, 185, 129, 0.3)",
                    }}
                  >
                    <span style={{ color: "#059669", fontWeight: 700 }}>✓ Cropped &amp; Ready:</span>
                    <strong style={{ fontSize: "13px", color: "var(--text-main)" }}>
                      {selectedFileName || "Edited Emblem"}
                    </strong>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => setCropModalOpen(true)}
                      style={{ marginLeft: "auto", display: "inline-flex", alignItems: "center", gap: "4px" }}
                    >
                      ✏️ Edit / Re-crop
                    </button>
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => {
                        setCroppedDataUrl(null);
                        setSelectedFileName("");
                        setLogoUrl(logo?.image_url || logo?.imageUrl || "/assets/img/campus-logo.svg");
                      }}
                    >
                      Clear
                    </button>
                  </div>
                )}
              </div>

              <div>
                <label className="form-label" htmlFor="logo-name-input">
                  Emblem Title / Institutional Identifier:
                </label>
                <input
                  id="logo-name-input"
                  type="text"
                  className="form-input"
                  required
                  placeholder="e.g. Holy Name University Official Seal"
                  value={logoName}
                  onChange={(e) => setLogoName(e.target.value)}
                />
              </div>

              <div>
                <label className="form-label" htmlFor="logo-url-input">
                  Logo Asset Reference (URL or uploaded file path):
                </label>
                <input
                  id="logo-url-input"
                  type="text"
                  className="form-input"
                  placeholder="/uploads/logo/campus-logo.png or /assets/img/campus-logo.svg"
                  value={logoUrl}
                  onChange={(e) => setLogoUrl(e.target.value)}
                />
                <small className="table-subtext">
                  Automatically populated with the cropped logo or enter an existing image path.
                </small>
              </div>

              <div>
                <label className="form-label" htmlFor="logo-alt-input">
                  Accessibility Alt Text:
                </label>
                <input
                  id="logo-alt-input"
                  type="text"
                  className="form-input"
                  placeholder="e.g. Holy Name University Seal"
                  value={logoAlt}
                  onChange={(e) => setLogoAlt(e.target.value)}
                />
              </div>

              <div style={{ marginTop: "6px" }}>
                <button
                  type="submit"
                  className="btn btn-primary btn-lg"
                  disabled={logoSaving}
                  style={{ display: "inline-flex", alignItems: "center", gap: "8px", fontWeight: 600 }}
                >
                  {logoSaving ? "Saving to Database..." : "💾 Save Campus Logo"}
                </button>
              </div>
            </div>

            {/* Logo Active Preview Box */}
            <div
              style={{
                background: "var(--surface-alt, #f8fafc)",
                border: "1px solid var(--border)",
                borderRadius: "var(--radius-md, 8px)",
                padding: "20px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "12px",
              }}
            >
              <span className="audit-meta-label" style={{ fontSize: "11px", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", color: "var(--text-muted)" }}>
                Active Emblem Preview
              </span>
              <div
                style={{
                  width: "130px",
                  height: "130px",
                  borderRadius: "50%",
                  border: "2px dashed var(--primary, #166534)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  background: "var(--surface, #ffffff)",
                  boxShadow: "0 2px 10px rgba(0, 0, 0, 0.06)",
                }}
              >
                {logoUrl && !previewLoadError ? (
                  <img
                    key={logoUrl}
                    src={logoUrl}
                    alt={logoAlt || "Campus logo preview"}
                    style={{ width: "100%", height: "100%", objectFit: "contain", display: "block" }}
                    onLoad={() => setPreviewLoadError(false)}
                    onError={() => setPreviewLoadError(true)}
                  />
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: "4px" }}>
                    <span style={{ fontSize: "36px" }}>🏛️</span>
                    <small style={{ fontSize: "10px", color: "var(--text-muted)" }}>Preview</small>
                  </div>
                )}
              </div>
              <strong style={{ fontSize: "14px", color: "var(--text-main)", marginTop: "4px" }}>
                {logoName || "Campus Logo"}
              </strong>
              <small style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Target: campus_logo #1
              </small>
            </div>
          </div>
        </form>

        {cropModalOpen && rawImageForCrop && (
          <LogoCropModal
            imageSrc={rawImageForCrop}
            onConfirm={handleCropConfirm}
            onClose={() => setCropModalOpen(false)}
          />
        )}
      </div>
    </div>
  );
}
