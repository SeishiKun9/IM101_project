import React, { useEffect, useState } from "react";
import { apiRequest } from "../../api/client.js";
import {
  claimStatusText,
  roleNames,
  statusText,
} from "../../constants/statuses.js";
import AdminAccountForm from "./AdminAccountForm.jsx";
import AdminManagement from "./AdminManagement.jsx";
import CompareModal from "./CompareModal.jsx";

export default function ReviewWorkspace({ user, onChanged }) {
  const [queue, setQueue] = useState({
    items: [],
    lost: [],
    claims: [],
    cases: [],
  });
  const [selected, setSelected] = useState(null);
  const [selectedLost, setSelectedLost] = useState(null);
  const [error, setError] = useState("");

  async function refresh() {
    try {
      const data = await apiRequest("/review/queue");
      setQueue(data);
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  useEffect(() => {
    refresh();
  }, []);

  async function handleMatch(event) {
    event.preventDefault();
    try {
      await apiRequest(`/reports/${selected.id}/match`, {
        method: "POST",
        body: JSON.stringify(
          Object.fromEntries(new FormData(event.currentTarget)),
        ),
      });
      setSelected(null);
      setSelectedLost(null);
      refresh();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function decide(claimId, decision) {
    const reason =
      decision === "rejected"
        ? window.prompt("Reason for rejection") || "No reason provided"
        : "";
    try {
      await apiRequest(`/claims/${claimId}/decision`, {
        method: "POST",
        body: JSON.stringify({ decision, reason }),
      });
      refresh();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function collect(claimId) {
    try {
      await apiRequest(`/claims/${claimId}/collect`, { method: "POST" });
      refresh();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function markUnderReview(itemId) {
    try {
      await apiRequest(`/reports/${itemId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status: "under_review" }),
      });
      refresh();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  async function reviewSelectedMatch(status) {
    if (!selectedLost || !selected) return;
    try {
      await apiRequest(`/reports/${selected.id}/status`, {
        method: "PATCH",
        body: JSON.stringify({
          status,
          lostId: selectedLost.id,
        }),
      });
      setSelected(null);
      setSelectedLost(null);
      refresh();
      onChanged?.();
    } catch (requestError) {
      setError(requestError.message);
    }
  }

  const roleTitle = roleNames[user?.role] || "Staff";

  return (
    <section id="workspace" className="workspace-band">
      <p className="eyebrow">{roleTitle.toUpperCase()} WORKSPACE</p>
      <h2>
        {user?.role === "admin"
          ? "Administrator dashboard"
          : "Verifier dashboard"}
      </h2>

      {error && <p className="form-error">{error}</p>}

      <div className="review-grid">
        <section className="panel">
          <h3>Compare reports</h3>
          {queue.items.length ? (
            queue.items.map((item) => (
              <article className="review-row" key={item.id}>
                <div>
                  <strong>{item.title}</strong>
                  <small>
                    {item.building ? `${item.building} · ` : ""}
                    {item.location} · {item.date}
                  </small>
                </div>
                <span className="review-actions">
                  <button
                    className="secondary compact"
                    onClick={() => {
                      setSelected(item);
                      setSelectedLost(null);
                    }}
                  >
                    Open comparison
                  </button>
                  {item.status === "reported" && (
                    <button
                      className="secondary compact"
                      onClick={() => markUnderReview(item.id)}
                    >
                      Mark Under review
                    </button>
                  )}
                </span>
              </article>
            ))
          ) : (
            <p>No found reports need review.</p>
          )}
        </section>

        <section className="panel">
          <h3>Claim review and collection</h3>
          {queue.claims.length ? (
            queue.claims.map((claim) => (
              <article className="review-row" key={claim.id}>
                <div>
                  <strong>Claim #{claim.id}</strong>
                  <small>
                    {claim.claimant} · {claimStatusText(claim.status)}
                  </small>
                  {claim.finderPhone && (
                    <small>Finder phone: {claim.finderPhone}</small>
                  )}
                  {claim.rejectionReason && (
                    <small>{claim.rejectionReason}</small>
                  )}
                </div>

                {claim.status === "pending" ? (
                  <span className="review-actions">
                    <button
                      className="primary compact"
                      onClick={() => decide(claim.id, "approved")}
                    >
                      Approve claim
                    </button>
                    <button
                      className="danger compact"
                      onClick={() => decide(claim.id, "rejected")}
                    >
                      Reject claim
                    </button>
                  </span>
                ) : claim.status === "approved" ? (
                  <button
                    className="primary compact"
                    onClick={() => collect(claim.id)}
                  >
                    Mark as Complete and Close Case
                  </button>
                ) : null}
              </article>
            ))
          ) : (
            <p>No claims pending review.</p>
          )}
        </section>
      </div>

      <section className="panel resolved-cases">
        <h3>Resolved cases</h3>
        {queue.cases.length ? (
          queue.cases.map((caseItem) => (
            <article className="review-row" key={`case-${caseItem.id}`}>
              <div>
                <strong>{caseItem.title}</strong>
                <small>
                  {caseItem.type.toUpperCase()} · {statusText(caseItem.status)}
                </small>
                {caseItem.foundLocation && (
                  <small>Found at {caseItem.foundLocation}</small>
                )}
              </div>
              <span className="status">{statusText(caseItem.status)}</span>
            </article>
          ))
        ) : (
          <p>No matched cases yet.</p>
        )}
      </section>

      {user?.role === "admin" && (
        <>
          <AdminAccountForm />
          <AdminManagement />
        </>
      )}

      {selected && (
        <CompareModal
          selected={selected}
          selectedLost={selectedLost}
          setSelectedLost={setSelectedLost}
          queueLost={queue.lost}
          onClose={() => {
            setSelected(null);
            setSelectedLost(null);
          }}
          onMatch={handleMatch}
          onReviewStatus={reviewSelectedMatch}
        />
      )}
    </section>
  );
}
