(() => {
  const { createElement: h, useEffect, useState } = React;
  const api = window.CampusApi.request;
  const tokenKey = window.CampusApi.tokenKey;
  const {
    AuthModal,
    ForgotPasswordModal,
    Header,
    ItemCard,
    ItemDetailsModal,
    ReportCard,
    ReportForm,
    ReviewWorkspace,
    statusText,
  } = window.CampusComponents;
  const root = document.getElementById("root");

  function dashboardPath(role) {
    if (role === "admin") return "/administrator.html";
    if (role === "staff") return "/verifier.html";
    return "/client.html";
  }

  function requiredRoleForPath() {
    if (window.location.pathname.endsWith("administrator.html")) return "admin";
    if (window.location.pathname.endsWith("verifier.html")) return "staff";
    if (window.location.pathname.endsWith("client.html")) return "student";
    return null;
  }

  function App() {
    const [user, setUser] = useState(null);
    const [items, setItems] = useState([]);
    const [reports, setReports] = useState([]);
    const [authOpen, setAuthOpen] = useState(false);
    const [forgotPasswordOpen, setForgotPasswordOpen] = useState(false);
    const [authMode, setAuthMode] = useState("signin");
    const [reportOpen, setReportOpen] = useState(false);
    const [pendingAction, setPendingAction] = useState(null);
    const [search, setSearch] = useState("");
    const [type, setType] = useState("all");
    const [status, setStatus] = useState("all");
    const [message, setMessage] = useState("");
    const [lostCount, setLostCount] = useState(0);
    const [selectedItem, setSelectedItem] = useState(null);

    async function loadItems() {
      const query = new URLSearchParams({ search });
      if (type !== "all") query.set("type", type);
      if (status !== "all") query.set("status", status);
      try {
        setItems(await api(`/items?${query.toString()}`));
        const stats = await api("/stats");
        setLostCount(stats.lostCount);
      } catch (requestError) {
        setMessage(requestError.message);
      }
    }

    async function loadReports() {
      if (!user) return;
      try {
        setReports(await api("/my/reports"));
      } catch (requestError) {
        setMessage(requestError.message);
      }
    }

    useEffect(() => {
      loadItems();
    }, [search, type, status]);

    useEffect(() => {
      const token = localStorage.getItem(tokenKey);
      if (!token) return;
      api("/auth/me")
        .then(({ user: savedUser }) => setUser(savedUser))
        .catch(() => localStorage.removeItem(tokenKey));
    }, []);

    useEffect(() => {
      loadReports();
      const requiredRole = requiredRoleForPath();
      if (user && requiredRole && user.role !== requiredRole) {
        window.location.replace(dashboardPath(user.role));
      }
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
      setUser(savedUser);
      setAuthOpen(false);
      const action = pendingAction;
      setPendingAction(null);
      if (action) {
        action();
        return;
      }
      window.location.href = dashboardPath(savedUser.role);
    }

    async function claimItem(item) {
      requireLogin(async () => {
        try {
          await api(`/items/${item.id}/claims`, {
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

    async function logout() {
      try {
        await api("/auth/logout", { method: "POST" });
      } catch (requestError) {
        setMessage(requestError.message);
      }
      localStorage.removeItem(tokenKey);
      setUser(null);
      setReports([]);
      window.location.href = "/";
    }

    const publicCards = items.length
      ? items.map((item) => {
          const cardItem = {
            ...item,
            eligibleToClaim:
              item.type !== "found" ||
              !user ||
              reports.some((report) => report.id === item.matchedLostId),
          };
          return h(ItemCard, {
            key: item.id,
            item: cardItem,
            onClaim: claimItem,
            onView: setSelectedItem,
          });
        })
      : h(
          "div",
          { className: "empty-state" },
          "No public reports match those filters.",
        );

    const reportCards = reports.length
      ? reports.map((item) =>
          h(ReportCard, {
            key: item.id,
            item,
            privateView: true,
            onClaim: claimItem,
            onView: setSelectedItem,
          }),
        )
      : h(
          "div",
          { className: "empty-state" },
          "Your submitted reports and claim requests will appear here.",
        );

    const typeButtons = ["all", "lost", "found"].map((value) =>
      h(
        "button",
        {
          key: value,
          className: type === value ? "filter active" : "filter",
          onClick: () => setType(value),
        },
        value === "all"
          ? "All reports"
          : value[0].toUpperCase() + value.slice(1),
      ),
    );
    const statusOptions = [
      "reported",
      "under_review",
      "found",
      "claimed",
      "completed",
    ].map((value) => h("option", { key: value, value }, statusText(value)));

    const mainSections = [
      h(
        "section",
        { className: "intro", key: "intro" },
        h(
          "div",
          { className: "intro-copy" },
          h("p", { className: "eyebrow" }, "CAMPUS OPERATIONS / 2026"),
          h(
            "h1",
            null,
            "Find what matters.",
            h("br"),
            h("em", null, "Return it right."),
          ),
          h(
            "p",
            { className: "lede" },
            "A public, accountable record for every lost item, found report, and verified handover across campus.",
          ),
          h(
            "button",
            {
              className: "primary",
              onClick: () => requireLogin(() => setReportOpen(true)),
            },
            "Report an item",
          ),
        ),
      ),
      h(
        "section",
        { id: "browse", className: "workspace", key: "public" },
        h(
          "div",
          { className: "section-heading" },
          h(
            "div",
            null,
            h("p", { className: "eyebrow" }, "GLOBAL DASHBOARD"),
            h("h2", null, "Public board"),
            h(
              "p",
              { className: "lost-counter" },
              `Currently lost: ${lostCount}`,
            ),
          ),
          h("input", {
            className: "search-input",
            type: "search",
            placeholder: "Search items",
            value: search,
            onChange: (event) => setSearch(event.target.value),
          }),
        ),
        h(
          "div",
          { className: "filters" },
          typeButtons,
          h(
            "select",
            {
              className: "status-filter",
              value: status,
              onChange: (event) => setStatus(event.target.value),
            },
            h("option", { value: "all" }, "All statuses"),
            statusOptions,
          ),
        ),
        h("div", { className: "item-grid" }, publicCards),
      ),
    ];

    if (user) {
      mainSections.push(
        h(
          "section",
          {
            id: "my-reports",
            className: "workspace my-reports",
            key: "reports",
          },
          h(
            "div",
            { className: "section-heading" },
            h(
              "div",
              null,
              h("p", { className: "eyebrow" }, "MY REPORTS"),
              h("h2", null, "Your account activity"),
            ),
            h(
              "span",
              null,
              `${reports.length} report${reports.length === 1 ? "" : "s"}`,
            ),
          ),
          reportCards,
        ),
      );
    }

    if (user && ["staff", "admin"].includes(user.role)) {
      mainSections.push(
        h(ReviewWorkspace, {
          user,
          onChanged: () => {
            loadItems();
            loadReports();
          },
          key: "workspace",
        }),
      );
    }

    const overlays = [
      message &&
        h(
          "div",
          { className: "toast", onClick: () => setMessage(""), key: "message" },
          message,
        ),
      authOpen &&
        h(AuthModal, {
          mode: authMode,
          setMode: setAuthMode,
          onClose: () => setAuthOpen(false),
          onForgot: () => {
            setAuthOpen(false);
            setForgotPasswordOpen(true);
          },
          onSuccess: handleAuthentication,
          key: "auth",
        }),
      forgotPasswordOpen &&
        h(ForgotPasswordModal, {
          onClose: () => setForgotPasswordOpen(false),
          onBack: () => {
            setForgotPasswordOpen(false);
            setAuthMode("signin");
            setAuthOpen(true);
          },
          key: "forgot-password",
        }),
      reportOpen &&
        h(ReportForm, {
          onClose: () => setReportOpen(false),
          onSaved: () => {
            setReportOpen(false);
            loadItems();
            loadReports();
            setMessage("Report submitted successfully.");
          },
          key: "report",
        }),
      selectedItem &&
        h(ItemDetailsModal, {
          item: selectedItem,
          showPrivate: Boolean(
            user && reports.some((report) => report.id === selectedItem.id),
          ),
          onClaim: claimItem,
          onClose: () => setSelectedItem(null),
          key: "details",
        }),
    ];

    return h(
      React.Fragment,
      null,
      h(Header, {
        user,
        onAuth: () => setAuthOpen(true),
        onLogout: logout,
      }),
      h("main", null, mainSections),
      overlays,
    );
  }

  ReactDOM.createRoot(root).render(h(App));
})();
