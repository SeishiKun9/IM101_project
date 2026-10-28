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
import ClaimConversationModal from "./components/ClaimConversationModal.jsx";
import ClaimModal from "./components/ClaimModal.jsx";
import ForgotPasswordModal from "./components/ForgotPasswordModal.jsx";
import Header from "./components/Header.jsx";
import ItemDetailsModal from "./components/ItemDetailsModal.jsx";
import ErrorBoundary from "./components/ErrorBoundary.jsx";
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
  const [category, setCategory] = useState("all");
  const [building, setBuilding] = useState("all");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [sort, setSort] = useState("newest");
  const [page, setPage] = useState(1);
  const [limit, setLimit] = useState(12);
  const [pagination, setPagination] = useState({
    total: 0,
    page: 1,
    limit: 12,
    totalPages: 1,
    hasNext: false,
    hasPrev: false,
  });
  const [itemsLoading, setItemsLoading] = useState(false);

  const [message, setMessage] = useState("");
  const [authOpen, setAuthOpen] = useState(false);
  const [authMode, setAuthMode] = useState("signin");
  const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
  const [reportOpen, setReportOpen] = useState(false);
  const [initialReportType, setInitialReportType] = useState("lost");
  const [selectedItem, setSelectedItem] = useState(null);
  const [claimModalItem, setClaimModalItem] = useState(null);
  const [activeChatClaimId, setActiveChatClaimId] = useState(null);
  const [pendingAction, setPendingAction] = useState(null);
  const [resetTokenFromUrl, setResetTokenFromUrl] = useState("");

  async function loadItems(overridePage = page, overrideLimit = limit) {
    const query = new URLSearchParams();
    if (search.trim()) query.set("search", search.trim());
    if (type !== "all") query.set("type", type);
    if (status !== "all") query.set("status", status);
    if (category !== "all") query.set("category", category);
    if (building !== "all") query.set("building", building);
    if (dateFrom) query.set("dateFrom", dateFrom);
    if (dateTo) query.set("dateTo", dateTo);
    if (sort !== "newest") query.set("sort", sort);
    query.set("page", overridePage);
    query.set("limit", overrideLimit);

    try {
      setItemsLoading(true);
      const res = await apiRequest(`/items?${query.toString()}`);
      if (Array.isArray(res)) {
        setItems(res);
        setPagination({
          total: res.length,
          page: overridePage,
          limit: overrideLimit,
          totalPages: Math.max(1, Math.ceil(res.length / overrideLimit)),
          hasNext: false,
          hasPrev: overridePage > 1,
        });
      } else {
        setItems(res.items || []);
        if (res.pagination) {
          setPagination(res.pagination);
        }
      }
      const stats = await apiRequest("/stats");
      setLostCount(stats.lostCount || 0);
    } catch (requestError) {
      setMessage(requestError.message);
    } finally {
      setItemsLoading(false);
    }
  }

  function handleSearchChange(newSearch) {
    setSearch(newSearch);
    if (newSearch.trim() && (sort === "newest" || !sort)) {
      setSort("relevance");
    } else if (!newSearch.trim() && sort === "relevance") {
      setSort("newest");
    }
    if (page !== 1) setPage(1);
  }
  function handleTypeChange(newType) {
    setType(newType);
    if (page !== 1) setPage(1);
  }
  function handleStatusChange(newStatus) {
    setStatus(newStatus);
    if (page !== 1) setPage(1);
  }
  function handleCategoryChange(newCategory) {
    setCategory(newCategory);
    if (page !== 1) setPage(1);
  }
  function handleBuildingChange(newBuilding) {
    setBuilding(newBuilding);
    if (page !== 1) setPage(1);
  }
  function handleDateFromChange(newDateFrom) {
    setDateFrom(newDateFrom);
    if (page !== 1) setPage(1);
  }
  function handleDateToChange(newDateTo) {
    setDateTo(newDateTo);
    if (page !== 1) setPage(1);
  }
  function handleSortChange(newSort) {
    setSort(newSort);
    if (page !== 1) setPage(1);
  }
  function handleResetFilters() {
    setSearch("");
    setType("all");
    setStatus("all");
    setCategory("all");
    setBuilding("all");
    setDateFrom("");
    setDateTo("");
    setSort("newest");
    setPage(1);
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
    loadItems(page, limit);
  }, [page, limit, search, type, status, category, building, dateFrom, dateTo, sort]);

  useEffect(() => {
    loadReports();
  }, [user]);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const token = params.get("resetToken");
    if (token) {
      setResetTokenFromUrl(token);
      setForgotPasswordOpen(true);
    }

    const itemId = params.get("item");
    if (itemId) {
      apiRequest(`/items/${itemId}`)
        .then((item) => {
          if (item) setSelectedItem(item);
        })
        .catch(() => {});
    }

    const claimId = params.get("claim");
    if (claimId) {
      setActiveChatClaimId(claimId);
    }
  }, [location.search]);

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

  function claimItem(item) {
    requireLogin(() => {
      setClaimModalItem(item);
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
                setSearch={handleSearchChange}
                type={type}
                setType={handleTypeChange}
                status={status}
                setStatus={handleStatusChange}
                category={category}
                setCategory={handleCategoryChange}
                building={building}
                setBuilding={handleBuildingChange}
                dateFrom={dateFrom}
                setDateFrom={handleDateFromChange}
                dateTo={dateTo}
                setDateTo={handleDateToChange}
                sort={sort}
                setSort={handleSortChange}
                onResetFilters={handleResetFilters}
                page={page}
                setPage={setPage}
                limit={limit}
                setLimit={setLimit}
                pagination={pagination}
                loading={itemsLoading}
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
                onOpenClaimChat={(claimId) => setActiveChatClaimId(claimId)}
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
          initialToken={resetTokenFromUrl}
          onClose={() => {
            setForgotPasswordOpen(false);
            setResetTokenFromUrl("");
          }}
          onBack={() => {
            setForgotPasswordOpen(false);
            setResetTokenFromUrl("");
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
          onViewItem={(itemId) => {
            setReportOpen(false);
            apiRequest(`/items/${itemId}`)
              .then((item) => {
                if (item) setSelectedItem(item);
              })
              .catch(() => {});
          }}
        />
      )}

      {selectedItem && (
        <ErrorBoundary
          title="Item Details"
          onReset={() => setSelectedItem(null)}
        >
          <ItemDetailsModal
            item={selectedItem}
            showPrivate={Boolean(
              user && reports.some((report) => report.id === selectedItem.id),
            )}
            onClaim={claimItem}
            onClose={() => setSelectedItem(null)}
            onSelectSimilar={(item) => setSelectedItem(item)}
          />
        </ErrorBoundary>
      )}

      {claimModalItem && (
        <ErrorBoundary
          title="Claim Request"
          onReset={() => setClaimModalItem(null)}
        >
          <ClaimModal
            item={claimModalItem}
            onClose={() => setClaimModalItem(null)}
            onSubmitted={(res) => {
              setClaimModalItem(null);
              loadReports();
              loadItems();
              setMessage("Claim request submitted successfully for verifier review.");
              if (res?.claimId) {
                setActiveChatClaimId(res.claimId);
              }
            }}
          />
        </ErrorBoundary>
      )}

      {activeChatClaimId && (
        <ErrorBoundary
          title="Claim Conversation"
          onReset={() => setActiveChatClaimId(null)}
        >
          <ClaimConversationModal
            claimId={activeChatClaimId}
            onClose={() => setActiveChatClaimId(null)}
            onClaimUpdated={() => {
              loadReports();
              loadItems();
            }}
          />
        </ErrorBoundary>
      )}
    </>
  );
}
