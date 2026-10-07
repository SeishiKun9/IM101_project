import React from "react";
import ReportCard from "../components/ReportCard.jsx";
import { useAuth } from "../context/AuthContext.jsx";

export default function MyReportsPage({
  reports,
  onClaimItem,
  onSelectItem,
  onOpenReport,
  onRequireLogin,
}) {
  const { user } = useAuth();

  if (!user) {
    return (
      <section className="workspace my-reports">
        <div className="section-heading">
          <div>
            <p className="eyebrow">MY REPORTS</p>
            <h2>Your account activity</h2>
          </div>
        </div>
        <div className="empty-state">
          <p>Please sign in to view and manage your submitted reports.</p>
          <button
            className="primary"
            style={{ marginTop: "1rem" }}
            onClick={() => onRequireLogin?.()}
          >
            Sign in
          </button>
        </div>
      </section>
    );
  }

  return (
    <section id="my-reports" className="workspace my-reports">
      <div className="section-heading">
        <div>
          <p className="eyebrow">MY REPORTS</p>
          <h2>Your account activity</h2>
        </div>
        <div style={{ display: "flex", gap: "1rem", alignItems: "center" }}>
          <span>
            {reports.length} report{reports.length === 1 ? "" : "s"}
          </span>
          <button className="primary compact" onClick={onOpenReport}>
            New report
          </button>
        </div>
      </div>

      {reports.length ? (
        reports.map((item) => (
          <ReportCard
            key={item.id}
            item={item}
            privateView={true}
            onClaim={onClaimItem}
            onView={onSelectItem}
          />
        ))
      ) : (
        <div className="empty-state">
          Your submitted reports and claim requests will appear here.
        </div>
      )}
    </section>
  );
}
