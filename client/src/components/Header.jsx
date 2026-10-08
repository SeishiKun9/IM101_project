import React, { useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { roleNames } from "../constants/statuses.js";
import { useAuth } from "../context/AuthContext.jsx";

export default function Header({ onAuth }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);

  async function handleLogout() {
    setMobileMenuOpen(false);
    await logout();
    navigate("/");
  }

  function closeMobile() {
    setMobileMenuOpen(false);
  }

  const roleLabel = user ? roleNames[user.role] || user.role : null;

  return (
    <header className="topbar">
      <div className="topbar-container">
        <Link className="brand" to="/" onClick={closeMobile}>
          <span className="brand-mark" aria-hidden="true">
            <svg
              width="18"
              height="18"
              viewBox="0 0 24 24"
              fill="none"
              stroke="currentColor"
              strokeWidth="2.5"
              strokeLinecap="round"
              strokeLinejoin="round"
            >
              <circle cx="11" cy="11" r="8" />
              <line x1="21" y1="21" x2="16.65" y2="16.65" />
            </svg>
          </span>
          <span className="brand-text">
            Campus <span className="brand-accent">Lost &amp; Found</span>
          </span>
        </Link>

        {/* Desktop Navigation */}
        <nav className="desktop-nav" aria-label="Main Navigation">
          <NavLink
            to="/"
            className={({ isActive }) =>
              isActive ? "nav-link active" : "nav-link"
            }
            end
          >
            Public Dashboard
          </NavLink>

          {user && (
            <NavLink
              to="/my-reports"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              My Reports
            </NavLink>
          )}

          {user?.role === "staff" && (
            <NavLink
              to="/verifier"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Verifier Workspace
            </NavLink>
          )}

          {user?.role === "admin" && (
            <NavLink
              to="/administrator"
              className={({ isActive }) =>
                isActive ? "nav-link active" : "nav-link"
              }
            >
              Administration
            </NavLink>
          )}
        </nav>

        {/* Right side: User info / Sign in & Mobile menu toggle */}
        <div className="topbar-actions">
          {user ? (
            <div className="user-profile-menu">
              <span className={`user-role-badge ${user.role}`}>
                {roleLabel}
              </span>
              <span className="user-greeting" title={user.email}>
                {user.name.split(" ")[0]}
              </span>
              <button
                className="btn btn-secondary btn-sm"
                onClick={handleLogout}
                type="button"
                aria-label="Sign out"
              >
                Sign out
              </button>
            </div>
          ) : (
            <button
              className="btn btn-primary btn-sm"
              onClick={onAuth}
              type="button"
            >
              Sign in
            </button>
          )}

          {/* Mobile hamburger button */}
          <button
            className="mobile-menu-btn"
            type="button"
            aria-label="Toggle navigation menu"
            aria-expanded={mobileMenuOpen}
            onClick={() => setMobileMenuOpen((prev) => !prev)}
          >
            <span
              className={`hamburger-icon ${mobileMenuOpen ? "open" : ""}`}
            />
          </button>
        </div>
      </div>

      {/* Mobile Drawer Navigation */}
      {mobileMenuOpen && (
        <div className="mobile-drawer" role="dialog" aria-modal="true">
          <div className="mobile-drawer-backdrop" onClick={closeMobile} />
          <nav className="mobile-drawer-content" aria-label="Mobile Navigation">
            <div className="mobile-drawer-header">
              <span className="mobile-drawer-title">Navigation</span>
              <button
                className="modal-close"
                onClick={closeMobile}
                type="button"
                aria-label="Close menu"
              >
                ×
              </button>
            </div>

            <NavLink
              to="/"
              className={({ isActive }) =>
                isActive ? "mobile-nav-link active" : "mobile-nav-link"
              }
              onClick={closeMobile}
              end
            >
              Public Dashboard
            </NavLink>

            {user && (
              <NavLink
                to="/my-reports"
                className={({ isActive }) =>
                  isActive ? "mobile-nav-link active" : "mobile-nav-link"
                }
                onClick={closeMobile}
              >
                My Reports
              </NavLink>
            )}

            {user?.role === "staff" && (
              <NavLink
                to="/verifier"
                className={({ isActive }) =>
                  isActive ? "mobile-nav-link active" : "mobile-nav-link"
                }
                onClick={closeMobile}
              >
                Verifier Workspace
              </NavLink>
            )}

            {user?.role === "admin" && (
              <NavLink
                to="/administrator"
                className={({ isActive }) =>
                  isActive ? "mobile-nav-link active" : "mobile-nav-link"
                }
                onClick={closeMobile}
              >
                Administration
              </NavLink>
            )}

            <div className="mobile-drawer-footer">
              {user ? (
                <div className="mobile-user-box">
                  <div className="mobile-user-info">
                    <strong>{user.name}</strong>
                    <small>{user.email}</small>
                    <span className={`user-role-badge ${user.role}`}>
                      {roleLabel}
                    </span>
                  </div>
                  <button
                    className="btn btn-secondary full"
                    onClick={handleLogout}
                    type="button"
                  >
                    Sign out
                  </button>
                </div>
              ) : (
                <button
                  className="btn btn-primary full"
                  onClick={() => {
                    closeMobile();
                    onAuth();
                  }}
                  type="button"
                >
                  Sign in to Campus Account
                </button>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
