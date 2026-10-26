import React, { useEffect, useState, useRef } from "react";
import { apiRequest } from "../../api/client.js";
import { statusText } from "../../constants/statuses.js";
import LogoCropModal from "./LogoCropModal.jsx";

export default function AdminManagement() {
  const [users, setUsers] = useState([]);
  const [items, setItems] = useState([]);
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

  async function refresh() {
    try {
      const [nextUsers, nextItems, logoRes] = await Promise.all([
        apiRequest("/admin/users"),
        apiRequest("/admin/items"),
        apiRequest("/campus/logo").catch(() => ({ logo: null })),
      ]);
      setUsers(nextUsers);
      setItems(nextItems);
      if (logoRes?.logo) {
        setLogo(logoRes.logo);
        setLogoName(logoRes.logo.name || "");
        setLogoUrl(logoRes.logo.image_url || logoRes.logo.imageUrl || "");
        setLogoAlt(logoRes.logo.alt_text || "");
      }
      setError("");
    } catch (requestError) {
      setError(requestError.message);
    }
  }

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

    // Auto-fill emblem title if empty or default
    if (!logoName || logoName === "Campus Logo" || logoName === "Campus Main Logo") {
      const suggested = file.name
        .replace(/\.[^/.]+$/, "")
        .replace(/[-_]/g, " ")
        .replace(/\b\w/g, (c) => c.toUpperCase());
      setLogoName(suggested);
    }

    // Read the selected file to open the crop/edit modal immediately
    const reader = new FileReader();
    reader.onload = () => {
      setRawImageForCrop(reader.result);
      setCropModalOpen(true);
    };
    reader.onerror = () => {
      setError("Failed to read image file from your device.");
    };
    reader.readAsDataURL(file);

    // Reset input so choosing the same file again triggers onChange
    event.target.value = "";
  }

  function handleCropConfirm(croppedResultDataUrl) {
    setCroppedDataUrl(croppedResultDataUrl);
    setLogoUrl(croppedResultDataUrl);
    setPreviewLoadError(false);
    setCropModalOpen(false);
    setMessage("Logo successfully cropped! Click \"Save Campus Logo\" below to persist changes to the database and audit logs.");

    // Immediately dispatch event so the top-left header logo reflects the cropped preview right away!
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
      setMessage("Campus logo and branding successfully updated and logged in PostgreSQL audit trail!");
      window.dispatchEvent(new CustomEvent("campus-logo-changed", { detail: res.logo }));
    } catch (err) {
      setError(err.message || "Failed to update campus logo");
    } finally {
      setLogoSaving(false);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function removeUser(user) {
    if (
      !window.confirm(
        `Are you sure you want to remove verifier account "${user.name}"?`,
      )
    )
      return;
    try {
      await apiRequest(`/admin/users/${user.id}`, { method: "DELETE" });
      setMessage(`Verifier account "${user.name}" was successfully removed.`);
      refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function removeItem(item) {
    if (
      !window.confirm(
        `Are you sure you want to permanently remove report "${item.title}"?`,
      )
    )
      return;
    try {
      await apiRequest(`/admin/items/${item.id}`, { method: "DELETE" });
      setMessage(`Report "${item.title}" was removed.`);
      refresh();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const staffUsers = users.filter((u) => u.role === "staff");

  return (
    <section className="workspace-panel admin-management-panel">
      <div className="panel-header-row">
        <div>
          <h2 className="panel-title">System Records &amp; Account Control</h2>
          <p className="panel-subtitle">
            Supervise active verifier staff accounts and manage published
            reports across the database.
          </p>
        </div>
      </div>

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

      <div className="admin-split-columns">
        {/* Column 1: Staff Accounts */}
        <div className="admin-subpanel">
          <div className="subpanel-header">
            <h3>Active Verifier Accounts</h3>
            <span className="count-pill">{staffUsers.length} staff</span>
          </div>

          {staffUsers.length ? (
            <div className="table-responsive">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Name &amp; Email</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {staffUsers.map((u) => (
                    <tr key={u.id}>
                      <td>
                        <strong>{u.name}</strong>
                        <small className="table-subtext">{u.email}</small>
                      </td>
                      <td className="text-right">
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => removeUser(u)}
                          type="button"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-subpanel-state">
              <p>No auxiliary verifier accounts registered.</p>
            </div>
          )}
        </div>

        {/* Column 2: System Reports */}
        <div className="admin-subpanel">
          <div className="subpanel-header">
            <h3>Registered Reports</h3>
            <span className="count-pill">{items.length} records</span>
          </div>

          {items.length ? (
            <div className="table-responsive">
              <table className="workspace-table">
                <thead>
                  <tr>
                    <th>Item &amp; Status</th>
                    <th className="text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {items.map((item) => (
                    <tr key={item.id}>
                      <td>
                        <strong>{item.title}</strong>
                        <small className="table-subtext">
                          Status: {statusText(item.status)}
                        </small>
                      </td>
                      <td className="text-right">
                        <button
                          className="btn btn-danger btn-sm"
                          onClick={() => removeItem(item)}
                          type="button"
                        >
                          Remove
                        </button>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          ) : (
            <div className="empty-subpanel-state">
              <p>No reports currently stored in the database.</p>
            </div>
          )}
        </div>
      </div>

      {/* Campus Logo & Institution Identity Branding Panel */}
      <div className="admin-subpanel" style={{ marginTop: "24px" }}>
        <div className="subpanel-header">
          <div>
            <h3>Campus Identity &amp; Logo Branding</h3>
            <p className="table-subtext" style={{ margin: "4px 0 0" }}>
              Configure the active campus emblem rendered in the application header. Changes are recorded in the PostgreSQL audit log.
            </p>
          </div>
          <span className="count-pill">ID #{logo?.logo_id || 1}</span>
        </div>

        <form onSubmit={handleUpdateLogo} className="admin-logo-form" style={{ padding: "16px 0 0" }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 240px", gap: "24px", alignItems: "start" }}>
            <div style={{ display: "flex", flexDirection: "column", gap: "16px" }}>
              {/* Only 1 Single Choose Logo File Input */}
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

                {/* Status pill showing cropped image ready */}
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

              <div style={{ marginTop: "4px" }}>
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
                padding: "16px",
                textAlign: "center",
                display: "flex",
                flexDirection: "column",
                alignItems: "center",
                gap: "10px",
              }}
            >
              <span className="audit-meta-label">Active Preview</span>
              <div
                style={{
                  width: "120px",
                  height: "120px",
                  borderRadius: "50%",
                  border: "2px dashed var(--primary, #2563eb)",
                  display: "flex",
                  alignItems: "center",
                  justifyContent: "center",
                  overflow: "hidden",
                  background: "var(--surface, #ffffff)",
                  boxShadow: "0 2px 8px rgba(0, 0, 0, 0.05)",
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
                    <span style={{ fontSize: "32px" }}>🏛️</span>
                    <small style={{ fontSize: "10px", color: "var(--text-muted)" }}>Preview</small>
                  </div>
                )}
              </div>
              <strong style={{ fontSize: "13px", color: "var(--text-main)", marginTop: "4px" }}>
                {logoName || "Campus Logo"}
              </strong>
              <small style={{ fontSize: "11px", color: "var(--text-muted)" }}>
                Audit Target: campus_logo #1
              </small>
            </div>
          </div>
        </form>

        {/* Interactive Logo Crop & Edit Modal */}
        {cropModalOpen && rawImageForCrop && (
          <LogoCropModal
            imageSrc={rawImageForCrop}
            onConfirm={handleCropConfirm}
            onClose={() => setCropModalOpen(false)}
          />
        )}
      </div>
    </section>
  );
}
