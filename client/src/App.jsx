import React, { useEffect, useState } from "react";
import {
  Navigate,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import { apiRequest } from "./api/client.js";
import AuthModal from "./components/AuthModal.jsx";
import ForgotPasswordModal from "./components/ForgotPasswordModal.jsx";
import Header from "./components/Header.jsx";
import ItemDetailsModal from "./components/ItemDetailsModal.jsx";
import ReportFormModal from "./components/ReportFormModal.jsx";
import Toast from "./components/Toast.jsx";
import { useAuth } from "./context/AuthContext.jsx";
import DashboardPage from "./pages/DashboardPage.jsx";
import MyReportsPage from "./pages/MyReportsPage.jsx";
import WorkspacePage from "./pages/WorkspacePage.jsx";
import ProfilePage from "./pages/ProfilePage.jsx";

export default function App() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const [items, setItems] = useState([]);
  const [reports, setReports] = useState([]);
  const [lostCount, setLostCount] = useState(0);

  const [search, setSearch] = useState("");
  const [type, setType] = useState("all");
  const [status, setStatus] = useState("all");

  const [message, setMessage] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [initialReportType, setInitialReportType] = useState("lost");
  const [selectedItem, setSelectedItem] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);

  async function loadItems() {
    const query = new URLSearchParams({ search });
    if (type !== "all") query.set("type", type);
    if (status !== "all") query.set("status", status);
    try {
      const fetchedItems = await apiRequest(`/items?${query.toString()}`);
      setItems(fetchedItems);
      const stats = await apiRequest("/stats");
      setLostCount(stats.lostCount || 0);
    } catch (requestError) {
      setMessage(requestError.message);
    }
  }

  async function loadReports() {
    if (!user) {
      setReports([]);
      return;
    }
    try {
      const fetchedReports = await apiRequest("/my/reports");
      setReports(fetchedReports);
    } catch (requestError) {
      setMessage(requestError.message);
    }
  }

  useEffect(() => {
    loadItems();
  }, [search, type, status]);

  useEffect(() => {
    loadReports();
  }, [user]);

  function requireLogin(action) {
    if (user) {
      action();
      return;
    }
    setPendingAction(() => action);
    setAuthMode("signin");
    setAuthOpen(true);
  }

  function handleAuthentication(savedUser) {
    setAuthOpen(false);
    const action = pendingAction;
    setPendingAction(null);
    if (action) {
      action();
      return;
    }

    if (location.pathname === "/profile") {
      navigate("/profile");
      return;
    }

    if (savedUser.role === "admin") {
      navigate("/administrator");
    } else if (savedUser.role === "staff") {
      navigate("/verifier");
    } else {
      navigate("/my-reports");
    }
  }

  async function claimItem(item) {
    requireLogin(async () => {
      try {
        await apiRequest(`/items/${item.id}/claims`, {
          method: "POST",
          body: JSON.stringify({}),
        });
        setMessage("Claim request submitted for verifier review.");
        loadReports();
      } catch (requestError) {
        setMessage(requestError.message);
      }
    });
  }

  return (
    <>
      <Header
        onAuth={() => {
          setAuthMode("signin");
          setAuthOpen(true);
        }}
      />

      <main>
        <Routes>
          <Route
            path="/"
            element={
              <DashboardPage
                items={items}
                lostCount={lostCount}
                search={search}
                setSearch={setSearch}
                type={type}
                setType={setType}
                status={status}
                setStatus={setStatus}
                user={user}
                userReports={reports}
                onOpenReport={(reportType = "lost") =>
                  requireLogin(() => {
                    setInitialReportType(reportType);
                    setReportOpen(true);
                  })
                }
                onOpenLostReport={() =>
                  requireLogin(() => {
                    setInitialReportType("lost");
                    setReportOpen(true);
                  })
                }
                onOpenFoundReport={() =>
                  requireLogin(() => {
                    setInitialReportType("found");
                    setReportOpen(true);
                  })
                }
                onClaimItem={claimItem}
                onSelectItem={setSelectedItem}
              />
            }
          />
          <Route
            path="/my-reports"
            element={
              <MyReportsPage
                reports={reports}
                onClaimItem={claimItem}
                onSelectItem={setSelectedItem}
                onOpenReport={(reportType = "lost") => {
                  setInitialReportType(reportType);
                  setReportOpen(true);
                }}
                onRequireLogin={() => {
                  setAuthMode("signin");
                  setAuthOpen(true);
                }}
              />
            }
          />
          <Route
            path="/verifier"
            element={
              <WorkspacePage
                requiredRole="staff"
                onDataChanged={() => {
                  loadItems();
                  loadReports();
                }}
                onRequireLogin={() => {
                  setAuthMode("signin");
                  setAuthOpen(true);
                }}
              />
            }
          />
          <Route
            path="/administrator"
            element={
              <WorkspacePage
                requiredRole="admin"
                onDataChanged={() => {
                  loadItems();
                  loadReports();
                }}
                onRequireLogin={() => {
                  setAuthMode("signin");
                  setAuthOpen(true);
                }}
              />
            }
          />
          <Route
            path="/profile"
            element={
              <ProfilePage
                onRequireLogin={() => {
                  setAuthMode("signin");
                  setAuthOpen(true);
                }}
              />
            }
          />

          {/* Aliases & backward-compatible redirects */}
          <Route
            path="/admin"
            element={<Navigate to="/administrator" replace />}
          />
          <Route
            path="/client.html"
            element={<Navigate to="/my-reports" replace />}
          />
          <Route
            path="/verifier.html"
            element={<Navigate to="/verifier" replace />}
          />
          <Route
            path="/administrator.html"
            element={<Navigate to="/administrator" replace />}
          />
          <Route path="/index.html" element={<Navigate to="/" replace />} />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </main>

      {message && <Toast message={message} onClose={() => setMessage("")} />}

      {authOpen && (
        <AuthModal
          mode={authMode}
          setMode={setAuthMode}
          onClose={() => setAuthOpen(false)}
          onSuccess={handleAuthentication}
          onForgot={() => {
            setAuthOpen(false);
            setForgotPasswordOpen(true);
          }}
        />
      )}

      {forgotPasswordOpen && (
        <ForgotPasswordModal
          onClose={() => setForgotPasswordOpen(false)}
          onBack={() => {
            setForgotPasswordOpen(false);
            setAuthMode("signin");
            setAuthOpen(true);
          }}
        />
      )}

      {reportOpen && (
        <ReportFormModal
          initialType={initialReportType}
          onClose={() => setReportOpen(false)}
          onSaved={() => {
            setReportOpen(false);
            loadItems();
            loadReports();
            setMessage("Report submitted successfully.");
          }}
        />
      )}

      {selectedItem && (
        <ItemDetailsModal
          item={selectedItem}
          showPrivate={Boolean(
            user && reports.some((report) => report.id === selectedItem.id),
          )}
          onClaim={claimItem}
          onClose={() => setSelectedItem(null)}
        />
      )}
    </>
  );
}
