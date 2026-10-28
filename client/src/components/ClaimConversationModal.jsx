import React, { useState, useEffect, useRef } from "react";
import { apiRequest } from "../api/client.js";
import { claimStatusText } from "../constants/statuses.js";
import { useAuth } from "../context/AuthContext.jsx";
import { compressImageFile } from "../utils/imageCompressor.js";

function formatTimestamp(ts) {
  if (!ts) return "";
  const date = new Date(ts);
  const now = new Date();
  const isToday = date.toDateString() === now.toDateString();

  const timeStr = date.toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
  });

  if (isToday) return `Today at ${timeStr}`;

  return `${date.toLocaleDateString([], {
    month: "short",
    day: "numeric",
  })} at ${timeStr}`;
}

const PROOF_TYPES = [
  "Photo of Item in My Possession",
  "Purchase Receipt / Store Invoice",
  "Matching Serial Number / IMEI",
  "Unique Identifying Marks / Scratches",
  "Other Verifiable Evidence",
];

export default function ClaimConversationModal({
  claimId,
  onClose,
  onClaimUpdated,
}) {
  const { user } = useAuth();
  const [activeTab, setActiveTab] = useState("chat"); // 'chat' or 'evidence'

  const [claim, setClaim] = useState(null);
  const [messages, setMessages] = useState([]);
  const [proofs, setProofs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");

  // Chat message state
  const [newMessageText, setNewMessageText] = useState("");
  const [sendingMessage, setSendingMessage] = useState(false);
  const messagesEndRef = useRef(null);

  // New evidence state
  const [showAddEvidence, setShowAddEvidence] = useState(false);
  const [newProofType, setNewProofType] = useState(PROOF_TYPES[0]);
  const [newProofDesc, setNewProofDesc] = useState("");
  const [newProofImage, setNewProofImage] = useState("");
  const [compressingImage, setCompressingImage] = useState(false);
  const [uploadingProof, setUploadingProof] = useState(false);
  const fileInputRef = useRef(null);

  // Lightbox
  const [lightboxImage, setLightboxImage] = useState(null);

  async function fetchMessages(silent = false) {
    try {
      const data = await apiRequest(`/claims/${claimId}/messages`);
      if (data?.claim) setClaim(data.claim);
      setMessages(data?.messages || []);
    } catch (err) {
      if (!silent) setError(err.message || "Failed to load claim discussion.");
    }
  }

  async function fetchProofs() {
    try {
      const data = await apiRequest(`/claims/${claimId}/evidence`);
      setProofs(data?.proofs || []);
    } catch (err) {
      // Ignore background proof fetch errors
    }
  }

  useEffect(() => {
    let isMounted = true;
    setLoading(true);
    setError("");

    Promise.all([fetchMessages(), fetchProofs()]).finally(() => {
      if (isMounted) setLoading(false);
    });

    const interval = setInterval(() => {
      fetchMessages(true);
    }, 8000);

    return () => {
      isMounted = false;
      clearInterval(interval);
    };
  }, [claimId]);

  useEffect(() => {
    if (activeTab === "chat") {
      messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
    }
  }, [messages, activeTab]);

  async function handleSendMessage(e) {
    e.preventDefault();
    const text = newMessageText.trim();
    if (!text || sendingMessage) return;

    setSendingMessage(true);
    try {
      const data = await apiRequest(`/claims/${claimId}/messages`, {
        method: "POST",
        body: JSON.stringify({ message: text }),
      });

      if (data?.message) {
        setMessages((prev) => [...prev, data.message]);
        setNewMessageText("");
        window.dispatchEvent(new CustomEvent("refresh-notifications"));
      }
    } catch (err) {
      setError(err.message || "Failed to send message.");
    } finally {
      setSendingMessage(false);
    }
  }

  async function handleProofFileChange(e) {
    const file = e.target.files?.[0];
    if (!file) return;

    setCompressingImage(true);
    try {
      const result = await compressImageFile(file, {
        maxDimension: 1200,
        quality: 0.8,
      });
      setNewProofImage(result.dataUrl);
    } catch (err) {
      setError(err.message || "Failed to process photo.");
    } finally {
      setCompressingImage(false);
    }
  }

  async function handleAddEvidenceSubmit(e) {
    e.preventDefault();
    if (!newProofDesc.trim() && !newProofImage) {
      setError("Please add a description or photo attachment.");
      return;
    }

    setUploadingProof(true);
    setError("");
    try {
      const data = await apiRequest(`/claims/${claimId}/evidence`, {
        method: "POST",
        body: JSON.stringify({
          proofType: newProofType,
          description: newProofDesc.trim(),
          imageUrl: newProofImage,
        }),
      });

      if (data?.proof) {
        setProofs((prev) => [...prev, data.proof]);
        setNewProofDesc("");
        setNewProofImage("");
        setShowAddEvidence(false);
      }
    } catch (err) {
      setError(err.message || "Failed to attach evidence.");
    } finally {
      setUploadingProof(false);
    }
  }

  const isStaff = user?.role === "staff" || user?.role === "admin";

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="claim-chat-title"
    >
      <section className="modal claim-chat-modal">
        <button
          className="modal-close"
          onClick={onClose}
          type="button"
          aria-label="Close dialog"
        >
          ×
        </button>

        {/* Modal Header */}
        <div className="claim-chat-header">
          <div className="claim-header-badges">
            <span className="claim-id-pill">Claim #{claimId}</span>
            {claim && (
              <span
                className={`status-badge ${
                  claim.status === "approved"
                    ? "status-success"
                    : claim.status === "rejected"
                      ? "status-danger"
                      : "status-amber"
                }`}
              >
                {claimStatusText(claim.status)}
              </span>
            )}
          </div>

          <h2 id="claim-chat-title" className="claim-chat-title">
            {claim?.itemTitle
              ? `Discussion for "${claim.itemTitle}"`
              : `Claim #${claimId} Verification`}
          </h2>

          <div className="claim-parties-meta">
            <span>
              <strong>Claimant:</strong> {claim?.claimantName || "Student"}
            </span>
            {claim?.claimDate && (
              <span>
                • Submitted {new Date(claim.claimDate).toLocaleDateString()}
              </span>
            )}
          </div>
        </div>

        {error && (
          <div className="alert-banner alert-danger">
            <strong>Notice:</strong> {error}
          </div>
        )}

        {/* Tabs: Chat vs Ownership Proofs */}
        <div className="claim-chat-tabs">
          <button
            type="button"
            className={`claim-tab-btn ${activeTab === "chat" ? "active" : ""}`}
            onClick={() => setActiveTab("chat")}
          >
            💬 Discussion Thread
            <span className="claim-tab-count">{messages.length}</span>
          </button>
          <button
            type="button"
            className={`claim-tab-btn ${activeTab === "evidence" ? "active" : ""}`}
            onClick={() => setActiveTab("evidence")}
          >
            📎 Ownership Proofs
            <span className="claim-tab-count">{proofs.length}</span>
          </button>
        </div>

        {/* Tab 1: Chat / Questions (Item 5) */}
        {activeTab === "chat" && (
          <div className="claim-chat-panel">
            <div className="claim-messages-scroll">
              {loading && messages.length === 0 ? (
                <div className="chat-empty-state">
                  <span className="spinner-sm" /> Loading discussion...
                </div>
              ) : messages.length === 0 ? (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon">💬</div>
                  <strong>No messages in this claim thread yet.</strong>
                  <p>
                    {isStaff
                      ? "Ask the claimant follow-up questions about identifying features without sharing personal phone numbers."
                      : "You can ask the campus verifiers questions or provide additional details about your item."}
                  </p>
                </div>
              ) : (
                messages.map((m) => {
                  const isOwn = Number(m.senderId) === Number(user?.id);
                  const isSenderStaff =
                    m.senderRole === "staff" || m.senderRole === "admin";

                  return (
                    <div
                      key={m.id}
                      className={`chat-bubble-row ${isOwn ? "own-bubble" : "peer-bubble"}`}
                    >
                      <div className="chat-bubble-content">
                        <div className="chat-bubble-meta">
                          <span className="chat-sender-name">
                            {isOwn ? "You" : m.senderName}
                          </span>
                          {isSenderStaff && (
                            <span className="chat-staff-badge">
                              CSA Staff
                            </span>
                          )}
                          <span className="chat-timestamp">
                            {formatTimestamp(m.createdAt)}
                          </span>
                        </div>
                        <div className="chat-text">{m.message}</div>
                      </div>
                    </div>
                  );
                })
              )}
              <div ref={messagesEndRef} />
            </div>

            {/* Input bar */}
            <form onSubmit={handleSendMessage} className="claim-chat-input-bar">
              <input
                type="text"
                value={newMessageText}
                onChange={(e) => setNewMessageText(e.target.value)}
                placeholder={
                  isStaff
                    ? "Ask claimant a follow-up question..."
                    : "Reply or provide additional details..."
                }
                disabled={sendingMessage}
                maxLength={2000}
              />
              <button
                type="submit"
                className="btn btn-primary"
                disabled={!newMessageText.trim() || sendingMessage}
              >
                {sendingMessage ? "..." : "Send"}
              </button>
            </form>
          </div>
        )}

        {/* Tab 2: Evidence Upload & Preview (Item 19) */}
        {activeTab === "evidence" && (
          <div className="claim-evidence-panel">
            <div className="evidence-header-action">
              <span className="evidence-header-title">
                Submitted Ownership Proofs ({proofs.length})
              </span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => setShowAddEvidence(!showAddEvidence)}
              >
                {showAddEvidence ? "Cancel Attachment" : "+ Attach Evidence"}
              </button>
            </div>

            {/* Add Evidence Form */}
            {showAddEvidence && (
              <form
                onSubmit={handleAddEvidenceSubmit}
                className="add-evidence-box"
              >
                <h4>Attach Ownership Proof or Receipt</h4>
                <div className="form-group">
                  <label htmlFor="new-proof-type">Proof Type</label>
                  <select
                    id="new-proof-type"
                    value={newProofType}
                    onChange={(e) => setNewProofType(e.target.value)}
                  >
                    {PROOF_TYPES.map((t) => (
                      <option key={t} value={t}>
                        {t}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="form-group">
                  <label htmlFor="new-proof-desc">Proof Description</label>
                  <input
                    id="new-proof-desc"
                    type="text"
                    value={newProofDesc}
                    onChange={(e) => setNewProofDesc(e.target.value)}
                    placeholder="e.g. Serial #, date of purchase, or description of photo"
                  />
                </div>

                <div className="form-group">
                  <label>Photo Attachment (Optional)</label>
                  <input
                    ref={fileInputRef}
                    type="file"
                    accept="image/jpeg,image/png,image/webp"
                    onChange={handleProofFileChange}
                    style={{ display: "none" }}
                  />

                  {newProofImage ? (
                    <div className="evidence-preview-card">
                      <div className="evidence-preview-top">
                        <span className="evidence-attached-tag">
                          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5">
                            <polyline points="20 6 9 17 4 12" />
                          </svg>
                          Photo Attached
                        </span>
                      </div>
                      <div className="evidence-media-wrapper">
                        <img
                          src={newProofImage}
                          alt="Preview"
                          className="evidence-img-display"
                        />
                      </div>
                      <div className="evidence-actions-bar">
                        <button
                          type="button"
                          className="btn btn-secondary btn-sm"
                          onClick={() => fileInputRef.current?.click()}
                        >
                          Change Photo
                        </button>
                        <button
                          type="button"
                          className="btn btn-danger btn-sm"
                          onClick={() => setNewProofImage("")}
                        >
                          Remove Photo
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div
                      className="photo-upload-dropzone evidence-upload-dropzone"
                      onClick={() => fileInputRef.current?.click()}
                      role="button"
                      tabIndex={0}
                      onKeyDown={(e) => {
                        if (e.key === "Enter" || e.key === " ") {
                          fileInputRef.current?.click();
                        }
                      }}
                    >
                      <svg
                        className="upload-icon"
                        width="28"
                        height="28"
                        viewBox="0 0 24 24"
                        fill="none"
                        stroke="currentColor"
                        strokeWidth="1.8"
                      >
                        <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                        <circle cx="8.5" cy="8.5" r="1.5" />
                        <polyline points="21 15 16 10 5 21" />
                      </svg>
                      <span className="upload-title">
                        {compressingImage ? "Optimizing image..." : "Upload Receipt or Photo"}
                      </span>
                      <span className="upload-subtitle">JPG, PNG, WebP up to 10MB</span>
                    </div>
                  )}
                </div>

                <button
                  type="submit"
                  className="btn btn-primary btn-sm"
                  disabled={uploadingProof || compressingImage}
                >
                  {uploadingProof ? "Uploading..." : "Save Evidence"}
                </button>
              </form>
            )}

            {/* Proofs List */}
            <div className="proofs-list-container">
              {proofs.length === 0 ? (
                <div className="chat-empty-state">
                  <div className="chat-empty-icon">📎</div>
                  <strong>No photos or receipts attached yet.</strong>
                  <p>
                    Claimants can attach purchase receipts, serial numbers, or
                    photos to expedite verification.
                  </p>
                </div>
              ) : (
                <div className="proof-cards-grid">
                  {proofs.map((proof) => (
                    <div key={proof.id} className="proof-item-card">
                      <div className="proof-item-top">
                        <span className="proof-type-pill">
                          {proof.proofType}
                        </span>
                        <span className="proof-date-text">
                          {proof.submittedAt
                            ? new Date(proof.submittedAt).toLocaleDateString()
                            : ""}
                        </span>
                      </div>

                      {proof.imageUrl && (
                        <div
                          className="proof-img-container"
                          onClick={() => setLightboxImage(proof.imageUrl)}
                          title="Click to view full size"
                        >
                          <img src={proof.imageUrl} alt={proof.proofType} />
                          <span className="proof-zoom-label">🔍 Zoom</span>
                        </div>
                      )}

                      {proof.description && (
                        <p className="proof-desc-text">{proof.description}</p>
                      )}
                    </div>
                  ))}
                </div>
              )}
            </div>
          </div>
        )}

        {/* Modal Footer */}
        <div className="claim-chat-footer">
          <button
            type="button"
            className="btn btn-secondary"
            onClick={onClose}
          >
            Close
          </button>
        </div>

        {/* Lightbox */}
        {lightboxImage && (
          <div
            className="image-lightbox"
            onClick={() => setLightboxImage(null)}
            role="dialog"
            aria-label="Enlarged evidence photo"
          >
            <button
              className="lightbox-close"
              onClick={() => setLightboxImage(null)}
              type="button"
              aria-label="Close preview"
            >
              ×
            </button>
            <img src={lightboxImage} alt="Enlarged evidence" />
          </div>
        )}
      </section>
    </div>
  );
}
