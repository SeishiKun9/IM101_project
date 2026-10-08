import React, { useState, useRef, useEffect } from "react";
import { Link, useNavigate } from "react-router-dom";
import { roleNames } from "../constants/statuses.js";
import { useAuth } from "../context/AuthContext.jsx";
import ThemeSelector from "./ThemeSelector.jsx";

export function getInitials(name = "") {
  if (!name || typeof name !== "string") return "?";
  const parts = name.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return "?";
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function UserMenu({ onNavigate }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef(null);

  // Close on Escape or click outside
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

  if (!user) return null;

  const roleLabel = roleNames[user.role] || user.role;
  const initials = getInitials(user.name);

  async function handleLogout() {
    setOpen(false);
    if (onNavigate) onNavigate();
    await logout();
    navigate("/");
  }

  return (
    <div className="user-dropdown-container" ref={menuRef}>
      <button
        type="button"
        className={`user-dropdown-trigger ${open ? "active" : ""}`}
        onClick={() => setOpen((prev) => !prev)}
        aria-expanded={open}
        aria-haspopup="true"
        aria-label="User account and appearance menu"
      >
        <span className="user-avatar-initials" aria-hidden="true">
          {initials}
        </span>
        <span className="user-trigger-name">
          {user.name.split(" ")[0]}
        </span>
        <svg
          className={`user-chevron ${open ? "rotated" : ""}`}
          width="14"
          height="14"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeLinejoin="round"
          aria-hidden="true"
        >
          <polyline points="6 9 12 15 18 9" />
        </svg>
      </button>

      {open && (
        <div className="user-dropdown-menu" role="menu">
          {/* User info card */}
          <div className="user-menu-header">
            <div className="user-menu-avatar-large" aria-hidden="true">
              {initials}
            </div>
            <div className="user-menu-meta">
              <strong className="user-menu-name">{user.name}</strong>
              <span className="user-menu-email">{user.email}</span>
              <span className={`user-role-badge ${user.role}`}>
                {roleLabel}
              </span>
            </div>
          </div>

          <div className="user-menu-divider" />

          {/* Navigation Links */}
          <div className="user-menu-links">
            <Link
              to="/profile"
              className="user-menu-item"
              role="menuitem"
              onClick={() => {
                setOpen(false);
                if (onNavigate) onNavigate();
              }}
            >
              <svg
                width="16"
                height="16"
                viewBox="0 0 24 24"
                fill="none"
                stroke="currentColor"
                strokeWidth="2"
                strokeLinecap="round"
                strokeLinejoin="round"
                aria-hidden="true"
              >
                <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                <circle cx="12" cy="7" r="4" />
              </svg>
              <span>My Profile</span>
            </Link>
          </div>

          <div className="user-menu-divider" />

          {/* Appearance Section */}
          <div className="user-menu-appearance">
            <div className="user-menu-section-title">
              <span>Appearance</span>
            </div>
            <ThemeSelector variant="segmented" />
          </div>

          <div className="user-menu-divider" />

          {/* Sign Out */}
          <button
            type="button"
            className="user-menu-item signout"
            role="menuitem"
            onClick={handleLogout}
          >
            <svg
              width="16"
              height="16"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2"
              strokeLinecap="round"
              strokeLinejoin="round"
              aria-hidden="true"
            >
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />
              <polyline points="16 17 21 12 16 7" />
              <line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            <span>Sign out</span>
          </button>
        </div>
      )}
    </div>
  );
}
