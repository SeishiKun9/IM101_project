import React, { useMemo } from "react";
import { formatLocation, normalizeCoord } from "../../utils/location.js";
import { calculateMatchScore } from "../../utils/matchScorer.js";

export default function CompareModal({
  selected,
  selectedLost,
  setSelectedLost,
  queueLost = [],
  onClose,
  onMatch,
  onReviewStatus,
}) {
  if (!selected) return null;

  const scoredCandidates = useMemo(() => {
    if (!selected || !queueLost.length) return [];
    return queueLost
      .map((lost) => ({
        lost,
        match: calculateMatchScore(lost, selected),
      }))
      .sort((a, b) => b.match.score - a.match.score);
  }, [selected, queueLost]);

  const currentMatch = useMemo(() => {
    if (!selectedLost || !selected) return null;
    return calculateMatchScore(selectedLost, selected);
  }, [selectedLost, selected]);

  function renderReportSide(report, label, type) {
    return (
      <div className={`comparison-card comparison-${type}`}>
        <div className="comparison-card-header">
          <span className={`tag-badge tag-${type}`}>{label}</span>
          {report && <span className="comparison-id">ID #{report.id}</span>}
        </div>

        {report ? (
          <div className="comparison-card-body">
            {report.image ? (
              <div className="comparison-image-container">
                <img
                  className="comparison-photo"
                  src={report.image}
                  alt={report.title}
                />
              </div>
            ) : (
              <div className="comparison-photo placeholder">
                <svg
                  width="32"
                  height="32"
                  viewBox="0 0 24 24"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                  aria-hidden="true"
                >
                  <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                  <circle cx="8.5" cy="8.5" r="1.5" />
                  <polyline points="21 15 16 10 5 21" />
                </svg>
                <span>No photo attached</span>
              </div>
            )}

            <h3 className="comparison-title">{report.title}</h3>

            <dl className="comparison-meta-list">
              <div className="comparison-meta-row">
                <dt>Category</dt>
                <dd>{report.category || "Uncategorized"}</dd>
              </div>

              <div className="comparison-meta-row">
                <dt>{type === "lost" ? "Date lost" : "Date found"}</dt>
                <dd>{report.date}</dd>
              </div>

              <div className="comparison-meta-row">
                <dt>Location</dt>
                <dd>{formatLocation(report)}</dd>
              </div>

              <div className="comparison-meta-row">
                <dt>{type === "lost" ? "Reporter" : "Finder"}</dt>
                <dd>
                  {report.privateReporterName ||
                    report.reporterName ||
                    "Anonymous"}
                </dd>
              </div>

              {report.contactPhone && (
                <div className="comparison-meta-row">
                  <dt>Contact</dt>
                  <dd>{report.contactPhone}</dd>
                </div>
              )}
            </dl>

            <div className="comparison-desc-box">
              <strong>Description:</strong>
              <p>{report.description}</p>
            </div>

            {report.mapX !== null &&
              report.mapY !== null &&
              report.mapX !== undefined &&
              report.mapY !== undefined && (
                <div className="comparison-map-box">
                  <strong>Pinned Map Location:</strong>
                  <div className="comparison-map-preview">
                    <img
                      src={
                        report.mapImageUrl || "/assets/images/campus-map.jpg"
                      }
                      alt={`${label} reported location`}
                    />
                    <span
                      className="detail-map-pin"
                      style={{
                        left: `${normalizeCoord(report.mapX)}%`,
                        top: `${normalizeCoord(report.mapY)}%`,
                      }}
                      title="Pinned location"
                    >
                      ●
                    </span>
                  </div>
                </div>
              )}
          </div>
        ) : (
          <div className="comparison-empty-placeholder">
            <svg
              width="40"
              height="40"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="1.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="12" cy="12" r="10" />
              <line x1="12" y1="8" x2="12" y2="12" />
              <line x1="12" y1="16" x2="12.01" y2="16" />
            </svg>
            <p>Select a lost report below to start side-by-side comparison.</p>
          </div>
        )}
      </div>
    );
  }

  return (
    <div
      className="modal-backdrop"
      role="dialog"
      aria-modal="true"
      aria-labelledby="compare-modal-title"
    >
      <section className="modal compare-modal">
        <button
          className="modal-close"
          onClick={onClose}
          type="button"
          aria-label="Close comparison dialog"
        >
          ×
        </button>

        <div className="modal-header-tag">CASE VERIFICATION WORKSPACE</div>
        <h2 id="compare-modal-title" className="compare-title">
          Compare &amp; Match Reports
        </h2>
        <p className="modal-intro">
          Review details side by side to ensure item identity before linking
          records and opening the collection claim.
        </p>

        {/* Side-by-Side Comparison Columns */}
        <div className="comparison-columns">
          {renderReportSide(selectedLost, "LOST REPORT (CANDIDATE)", "lost")}
          {renderReportSide(selected, "FOUND SUBMISSION", "found")}
        </div>

        {/* Match Form */}
        <form className="match-verification-form" onSubmit={onMatch}>
          <div className="form-group">
            <label htmlFor="lostId-select">
              Select Lost Report to Match Against *
            </label>
            <select
              id="lostId-select"
              name="lostId"
              required
              value={selectedLost?.id || ""}
              onChange={(event) => {
                const found = queueLost.find(
                  (lost) => String(lost.id) === event.target.value,
                );
                setSelectedLost(found || null);
              }}
            >
              <option value="">
                -- Choose a matching lost report candidate ({scoredCandidates.length} available) --
              </option>
              {scoredCandidates.map(({ lost, match }) => (
                <option key={lost.id} value={lost.id}>
                  [{match.score}% {match.confidence.toUpperCase()}] #{lost.id} - {lost.title} ({lost.date} · {formatLocation(lost)})
                </option>
              ))}
            </select>
          </div>

          {selectedLost && currentMatch && (
            <div
              className={`match-confidence-banner confidence-${currentMatch.confidence}`}
              style={{
                padding: "10px 14px",
                borderRadius: "8px",
                margin: "12px 0",
                display: "flex",
                flexDirection: "column",
                gap: "4px",
                background:
                  currentMatch.confidence === "high"
                    ? "rgba(16, 185, 129, 0.12)"
                    : currentMatch.confidence === "medium"
                      ? "rgba(59, 130, 246, 0.12)"
                      : "rgba(245, 158, 11, 0.12)",
                border: `1px solid ${
                  currentMatch.confidence === "high"
                    ? "rgba(16, 185, 129, 0.35)"
                    : currentMatch.confidence === "medium"
                      ? "rgba(59, 130, 246, 0.35)"
                      : "rgba(245, 158, 11, 0.35)"
                }`,
              }}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <strong>
                  Automated Match Confidence: {currentMatch.score}% ({currentMatch.confidence.toUpperCase()})
                </strong>
                <span
                  className={`status-badge ${
                    currentMatch.confidence === "high"
                      ? "status-success"
                      : currentMatch.confidence === "medium"
                        ? "status-blue"
                        : "status-amber"
                  }`}
                >
                  {currentMatch.confidence === "high"
                    ? "High Probability"
                    : currentMatch.confidence === "medium"
                      ? "Likely Candidate"
                      : "Low Similarity"}
                </span>
              </div>
              {currentMatch.reasons.length > 0 && (
                <small style={{ color: "var(--text-muted)", marginTop: "2px" }}>
                  Key match factors: {currentMatch.reasons.join(" • ")}
                </small>
              )}
            </div>
          )}

          {selectedLost && (
            <div className="intermediate-actions-row">
              <span className="actions-hint">Candidate actions:</span>
              <button
                type="button"
                className="btn btn-secondary btn-sm"
                onClick={() => onReviewStatus("under_review")}
              >
                Mark Lost Report Under Review
              </button>
              <button
                type="button"
                className="btn btn-danger btn-sm"
                onClick={() => onReviewStatus("reported")}
              >
                Reject Proposed Match
              </button>
            </div>
          )}

          <div className="form-row">
            <div className="form-group">
              <label htmlFor="finderName-input">Verified Finder Name *</label>
              <input
                id="finderName-input"
                name="finderName"
                defaultValue={selected?.reporterName || ""}
                required
                placeholder="Full name of person who turned in item"
              />
            </div>

            <div className="form-group">
              <label htmlFor="foundLocation-input">
                Verified Found Location *
              </label>
              <input
                id="foundLocation-input"
                name="foundLocation"
                defaultValue={formatLocation(selected) || ""}
                required
                placeholder="Specific location item was found"
              />
            </div>
          </div>

          <div className="form-group">
            <label htmlFor="notes-input">Verifier Evaluation Notes *</label>
            <textarea
              id="notes-input"
              name="notes"
              rows={3}
              required
              placeholder="Record distinguishing features, marks, or serial numbers checked during verification"
            />
          </div>

          <div className="modal-actions-bar">
            <button
              className="btn btn-primary btn-lg"
              type="submit"
              disabled={!selectedLost}
            >
              Confirm Match &amp; Publish CSA Claim
            </button>
            <button
              className="btn btn-secondary"
              type="button"
              onClick={onClose}
            >
              Cancel
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
