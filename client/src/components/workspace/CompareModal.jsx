import React from "react";
import { formatLocation, normalizeCoord } from "../../utils/location.js";

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

  function renderReportSide(report, label, type) {
    return (
      <div className={`comparison-side ${type}`}>
        <span className={`tag ${type}`}>{label}</span>
        {report ? (
          <>
            {report.image ? (
              <img
                className="comparison-photo"
                src={report.image}
                alt={report.title}
              />
            ) : (
              <div className="comparison-photo placeholder">
                No image attached
              </div>
            )}
            <h3>{report.title}</h3>
            <p>Category: {report.category || "Not specified"}</p>
            <p>{report.description}</p>
            <p>
              {type === "lost" ? "Date lost" : "Date found"}: {report.date}
            </p>
            <p>Location: {formatLocation(report)}</p>
            <p>
              {type === "lost" ? "Reporter" : "Finder"}:{" "}
              {report.privateReporterName ||
                report.reporterName ||
                "Not provided"}
            </p>
            {report.contactPhone && <p>Phone: {report.contactPhone}</p>}
            {report.mapX !== null &&
              report.mapY !== null &&
              report.mapX !== undefined &&
              report.mapY !== undefined && (
                <div className="comparison-map">
                  <img
                    src={report.mapImageUrl || "/assets/images/campus-map.jpg"}
                    alt={`${label} reported location`}
                  />
                  <span
                    className="detail-map-pin"
                    style={{
                      left: `${normalizeCoord(report.mapX)}%`,
                      top: `${normalizeCoord(report.mapY)}%`,
                    }}
                  >
                    ●
                  </span>
                </div>
              )}
          </>
        ) : (
          <p className="comparison-empty">Select a lost report to compare.</p>
        )}
      </div>
    );
  }

  return (
    <div className="modal-backdrop">
      <section className="modal compare-modal">
        <button className="modal-close" onClick={onClose}>
          ×
        </button>
        <p className="eyebrow">CASE REVIEW</p>
        <h2>Compare reports</h2>

        <div className="comparison-columns">
          {renderReportSide(selectedLost, "LOST REPORT", "lost")}
          {renderReportSide(selected, "FOUND SUBMISSION", "found")}
        </div>

        <form className="review-form" onSubmit={onMatch}>
          <label>
            Matching lost report
            <select
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
              <option value="">Select a report</option>
              {queueLost.map((lost) => (
                <option key={lost.id} value={lost.id}>
                  {lost.title} (#{lost.id})
                </option>
              ))}
            </select>
          </label>

          {selectedLost && (
            <div className="review-actions">
              <button
                type="button"
                className="secondary compact"
                onClick={() => onReviewStatus("under_review")}
              >
                Mark lost report Under review
              </button>
              <button
                type="button"
                className="danger compact"
                onClick={() => onReviewStatus("reported")}
              >
                Reject proposed match
              </button>
            </div>
          )}

          <label>
            Verified finder name
            <input name="finderName" required />
          </label>

          <label>
            Where was it found?
            <input name="foundLocation" required />
          </label>

          <label>
            Verifier notes
            <textarea name="notes" rows={3} required />
          </label>

          <button className="primary full">
            Confirm match and publish CSA claim
          </button>
        </form>
      </section>
    </div>
  );
}
