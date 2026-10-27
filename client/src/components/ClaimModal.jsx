import React, { useState, useRef } from "react";
import { apiRequest } from "../api/client.js";
import { compressImageFile } from "../utils/imageCompressor.js";

const PROOF_TYPES = [
  "Photo of Item in My Possession",
  "Purchase Receipt / Store Invoice",
  "Matching Serial Number / IMEI",
  "Unique Identifying Marks / Scratches",
  "Other Verifiable Evidence",
];

export default function ClaimModal({ item, onClose, onSubmitted }) {
  const [proofType, setProofType] = useState(PROOF_TYPES[0]);
  const [description, setDescription] = useState("");
  const [initialMessage, setInitialMessage] = useState("");
  const [imagePreview, setImagePreview] = useState("");
  const [compressing, setCompressing] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState("");
  const fileInputRef = useRef(null);

  async function handleFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setError("");
    setCompressing(true);
    try {
      const result = await compressImageFile(file, {
        maxDimension: 1200,
        quality: 0.8,
      });
      setImagePreview(result.dataUrl);
    } catch (err) {
      setError(err.message || "Failed to process the uploaded photo.");
    } finally {
      setCompressing(false);
    }
  }

  function handleRemoveImage() {
    setImagePreview("");
    if (fileInputRef.current) {
      fileInputRef.current.value = "";
    }
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError("");
    setSubmitting(true);

    try {
      const result = await apiRequest(`/items/${item.id}/claims`, {
        method: "POST",
        body: JSON.stringify({
          proofType,
          description: description.trim(),
          imageUrl: imagePreview,
          initialMessage: initialMessage.trim(),
        }),
      });

      if (onSubmitted) {
        onSubmitted(result);
      }
      onClose();
    } catch (err) {
      setError(err.message || "Failed to submit claim request.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-modal-title"
    >
      <section className="modal claim-modal">
        <button
          className="modal-close"
          onClick={onClose}
          type="button"
          aria-label="Close claim dialog"
        >
          ×
        </button>

        <div className="modal-header-tag">CLAIM &amp; OWNERSHIP VERIFICATION</div>
        <h2 id="claim-modal-title" className="auth-modal-title">
          Request Claim for "{item.title}"
        </h2>
        <p className="modal-intro">
          Provide ownership evidence or identifying details below so campus verifiers can confirm the item belongs to you before CSA pickup.
        </p>

        {error && (
          <div className="alert-banner alert-danger">
            <strong>Error:</strong> {error}
          </div>
        )}

        <form onSubmit={handleSubmit} className="claim-form">
          <div className="form-group">
            <label htmlFor="claim-proof-type">
              Proof Type <span className="req">*</span>
            </label>
            <select
              id="claim-proof-type"
              value={proofType}
              onChange={(e) => setProofType(e.target.value)}
              required
            >
              {PROOF_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>

          <div className="form-group">
            <label htmlFor="claim-description">
              Evidence Details / Identifying Marks
            </label>
            <textarea
              id="claim-description"
              rows="3"
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Describe unique features, contents, serial numbers, password patterns, or stickers that prove this item is yours..."
            />
            <small className="form-hint">
              Be specific. Verifiers will check these details against the physical item at CSA.
            </small>
          </div>

          {/* Photo / Receipt Attachment (Item 19) */}
          <div className="form-group">
            <label>
              Photo Attachment (Receipt, Photo of Item, or ID)
            </label>
            
            <div className="evidence-upload-zone">
              <input
                ref={fileInputRef}
                type="file"
                id="claim-evidence-file"
                accept="image/jpeg,image/png,image/webp"
                onChange={handleFileChange}
                style={{ display: "none" }}
              />

              {imagePreview ? (
                <div className="evidence-preview-box">
                  <img
                    src={imagePreview}
                    alt="Uploaded proof preview"
                    className="evidence-img-preview"
                  />
                  <div className="evidence-preview-actions">
                    <button
                      type="button"
                      className="btn btn-secondary btn-xs"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      Change Photo
                    </button>
                    <button
                      type="button"
                      className="btn btn-danger btn-xs"
                      onClick={handleRemoveImage}
                    >
                      Remove
                    </button>
                  </div>
                </div>
              ) : (
                <button
                  type="button"
                  className="upload-drop-btn"
                  onClick={() => fileInputRef.current?.click()}
                  disabled={compressing}
                >
                  <svg
                    width="24"
                    height="24"
                    viewBox="0 0 24 24"
                    fill="none"
                    stroke="currentColor"
                    strokeWidth="2"
                    strokeLinecap="round"
                    strokeLinejoin="round"
                    aria-hidden="true"
                  >
                    <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                    <circle cx="8.5" cy="8.5" r="1.5" />
                    <polyline points="21 15 16 10 5 21" />
                  </svg>
                  <span>
                    {compressing
                      ? "Optimizing photo..."
                      : "Upload Photo or Receipt (Optional)"}
                  </span>
                  <small>Supports JPEG, PNG, WebP</small>
                </button>
              )}
            </div>
          </div>

          {/* Initial Message to Verifier (Item 5) */}
          <div className="form-group">
            <label htmlFor="claim-initial-message">
              Initial Note to Verifier (Optional)
            </label>
            <input
              id="claim-initial-message"
              type="text"
              value={initialMessage}
              onChange={(e) => setInitialMessage(e.target.value)}
              placeholder="e.g. When can I come in to verify and collect this?"
            />
          </div>

          <div className="modal-actions-bar">
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onClose}
              disabled={submitting}
            >
              Cancel
            </button>
            <button
              className="btn btn-primary"
              type="submit"
              disabled={submitting || compressing}
            >
              {submitting ? "Submitting Claim..." : "Submit Claim Request"}
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
