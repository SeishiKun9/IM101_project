import React, { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { useAuth } from "../context/AuthContext.jsx";

function formatTimeAgo(dateString) {
  if (!dateString) return "";
  const date = new Date(dateString);
  const now = new Date();
  const diffInSeconds = Math.floor((now - date) / 1000);

  if (diffInSeconds < 30) return "Just now";
  if (diffInSeconds < 60) return `${diffInSeconds}s ago`;

  const diffInMinutes = Math.floor(diffInSeconds / 60);
  if (diffInMinutes < 60) return `${diffInMinutes}m ago`;

  const diffInHours = Math.floor(diffInMinutes / 60);
  if (diffInHours < 24) return `${diffInHours}h ago`;

  const diffInDays = Math.floor(diffInHours / 24);
  if (diffInDays < 7) return `${diffInDays}d ago`;

  return date.toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
  });
}

function getNotificationIcon(type) {
  switch (type) {
    case "match_alert":
      return (
        <span className="notif-icon-badge badge-match" title="Match Alert">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <circle cx="12" cy="12" r="10" />
            <polygon points="12 8 8 12 12 16 16 12 12 8" />
          </svg>
        </span>
      );
    case "claim_update":
      return (
        <span className="notif-icon-badge badge-claim" title="Claim Update">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M16 4h2a2 2 0 0 1 2 2v14a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V6a2 2 0 0 1 2-2h2" />
            <rect x="8" y="2" width="8" height="4" rx="1" ry="1" />
            <path d="m9 14 2 2 4-4" />
          </svg>
        </span>
      );
    case "status_update":
      return (
        <span className="notif-icon-badge badge-status" title="Status Update">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <polyline points="23 4 23 10 17 10" />
            <polyline points="1 20 1 14 7 14" />
            <path d="M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" />
          </svg>
        </span>
      );
    default:
      return (
        <span className="notif-icon-badge badge-general" title="Notification">
          <svg width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
            <path d="M13.73 21a2 2 0 0 1-3.46 0" />
          </svg>
        </span>
      );
  }
}

export default function NotificationBell({ onNavigate }) {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState("all"); // 'all' or 'unread'
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(false);
  const [markingAll, setMarkingAll] = useState(false);
  const menuRef = useRef(null);

  async function fetchNotifications(silent = false) {
    if (!user) return;
    if (!silent) setLoading(true);
    try {
      const data = await apiRequest("/notifications");
      setNotifications(data.notifications || []);
      setUnreadCount(Number(data.unreadCount || 0));
    } catch {
      // Ignore background poll errors
    } finally {
      if (!silent) setLoading(false);
    }
  }

  // Initial fetch and 30s background polling
  useEffect(() => {
    if (!user) return;

    fetchNotifications();

    const interval = setInterval(() => {
      fetchNotifications(true);
    }, 30000);

    function handleCustomRefresh() {
      fetchNotifications(true);
    }

    window.addEventListener("refresh-notifications", handleCustomRefresh);

    return () => {
      clearInterval(interval);
      window.removeEventListener("refresh-notifications", handleCustomRefresh);
    };
  }, [user]);

  // Click outside and escape key handling
  useEffect(() => {
    function handleKeyDown(e) {
      if (e.key === "Escape" && open) {
        setOpen(false);
      }
    }

    function handleClickOutside(e) {
      if (menuRef.current && !menuRef.current.contains(e.target)) {
        setOpen(false);
      }
    }

    if (open) {
      document.addEventListener("keydown", handleKeyDown);
      document.addEventListener("mousedown", handleClickOutside);
    }
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.removeEventListener("mousedown", handleClickOutside);
    };
  }, [open]);

  async function handleMarkAsRead(id, e) {
    if (e) e.stopPropagation();
    try {
      await apiRequest(`/notifications/${id}/read`, { method: "PATCH" });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, isRead: true } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch {
      // Ignore error
    }
  }

  async function handleMarkAllAsRead() {
    if (unreadCount === 0 || markingAll) return;
    setMarkingAll(true);
    try {
      await apiRequest("/notifications/read-all", { method: "POST" });
      setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch {
      // Ignore error
    } finally {
      setMarkingAll(false);
    }
  }

  async function handleDeleteNotification(id, e) {
    if (e) e.stopPropagation();
    try {
      await apiRequest(`/notifications/${id}`, { method: "DELETE" });
      const target = notifications.find((n) => n.id === id);
      setNotifications((prev) => prev.filter((n) => n.id !== id));
      if (target && !target.isRead) {
        setUnreadCount((prev) => Math.max(0, prev - 1));
      }
    } catch {
      // Ignore error
    }
  }

  function handleNotificationClick(n) {
    if (!n.isRead) {
      handleMarkAsRead(n.id);
    }
    setOpen(false);
    if (onNavigate) onNavigate();

    if (n.link) {
      navigate(n.link);
    }
  }

  if (!user) return null;

  const displayedNotifications =
    filter === "unread"
      ? notifications.filter((n) => !n.isRead)
      : notifications;

  return (
    <div className="notif-dropdown-container" ref={menuRef}>
      <button
        type="button"
        className={`notif-bell-btn ${open ? "active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label={`Campus notifications, ${unreadCount} unread`}
        title={unreadCount > 0 ? `${unreadCount} unread notifications` : "Notifications"}
      >
        <svg
          width="19"
          height="19"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
          className="notif-bell-svg"
        >
          <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
          <path d="M13.73 21a2 2 0 0 1-3.46 0" />
        </svg>

        {unreadCount > 0 && (
          <span className="notif-badge-pill" aria-label={`${unreadCount} unread`}>
            {unreadCount > 99 ? "99+" : unreadCount}
          </span>
        )}
      </button>

      {open && (
        <div className="notif-dropdown-menu" role="dialog" aria-label="Notifications Panel">
          <div className="notif-header">
            <div className="notif-header-title">
              <span className="notif-title-text">Notifications</span>
              {unreadCount > 0 && (
                <span className="notif-count-tag">{unreadCount} new</span>
              )}
            </div>

            {unreadCount > 0 && (
              <button
                type="button"
                className="notif-mark-all-btn"
                onClick={handleMarkAllAsRead}
                disabled={markingAll}
              >
                {markingAll ? "Marking..." : "Mark all read"}
              </button>
            )}
          </div>

          {/* Filter tabs */}
          <div className="notif-filter-tabs">
            <button
              type="button"
              className={`notif-tab ${filter === "all" ? "active" : ""}`}
              onClick={() => setFilter("all")}
            >
              All ({notifications.length})
            </button>
            <button
              type="button"
              className={`notif-tab ${filter === "unread" ? "active" : ""}`}
              onClick={() => setFilter("unread")}
            >
              Unread ({unreadCount})
            </button>
          </div>

          {/* Notification List */}
          <div className="notif-body">
            {loading && notifications.length === 0 ? (
              <div className="notif-empty-state">
                <span className="notif-empty-spinner">⌛</span>
                <p>Loading campus notifications...</p>
              </div>
            ) : displayedNotifications.length === 0 ? (
              <div className="notif-empty-state">
                <span className="notif-empty-icon">🔔</span>
                <p className="notif-empty-title">All caught up!</p>
                <p className="notif-empty-desc">
                  {filter === "unread"
                    ? "You have no unread alerts at this time."
                    : "No notifications yet. You will be notified when your reports are matched or updated."}
                </p>
              </div>
            ) : (
              <div className="notif-list">
                {displayedNotifications.map((n) => (
                  <div
                    key={n.id}
                    className={`notif-item ${!n.isRead ? "unread" : ""}`}
                    onClick={() => handleNotificationClick(n)}
                    role="button"
                    tabIndex={0}
                    onKeyDown={(e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        handleNotificationClick(n);
                      }
                    }}
                  >
                    {!n.isRead && <span className="notif-unread-dot" title="Unread" />}
                    
                    <div className="notif-icon-col">
                      {getNotificationIcon(n.type)}
                    </div>

                    <div className="notif-content-col">
                      <div className="notif-item-top">
                        <strong className="notif-item-title">{n.title}</strong>
                        <span className="notif-item-time">{formatTimeAgo(n.createdAt)}</span>
                      </div>
                      <p className="notif-item-message">{n.message}</p>
                    </div>

                    <div className="notif-actions-col">
                      <button
                        type="button"
                        className="notif-dismiss-btn"
                        title="Dismiss notification"
                        onClick={(e) => handleDeleteNotification(n.id, e)}
                        aria-label="Dismiss notification"
                      >
                        ×
                      </button>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>

          <div className="notif-footer">
            <span className="notif-footer-text">
              Real-time match alerts & claim updates
            </span>
          </div>
        </div>
      )}
    </div>
  );
}
