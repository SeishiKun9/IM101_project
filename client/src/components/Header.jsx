import React, { useEffect, useState } from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { apiRequest } from "../api/client.js";
import { roleNames } from "../constants/statuses.js";
import { useAuth } from "../context/AuthContext.jsx";
import UserMenu, { getInitials } from "./UserMenu.jsx";
import ThemeSelector, { GuestThemeToggle } from "./ThemeSelector.jsx";
import NotificationBell from "./NotificationBell.jsx";

export default function Header({ onAuth }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  const [campusLogo, setCampusLogo] = useState(null);
  const [logoLoadError, setLogoLoadError] = useState(false);

  useEffect(() => {
    let isMounted = true;
    function fetchLogo(event) {
      if (event?.detail) {
        setCampusLogo(event.detail);
        setLogoLoadError(false);
        return;
      }
      apiRequest("/campus/logo?t=" + Date.now())
        .then((data) => {
          if (isMounted && data?.logo) {
            setCampusLogo(data.logo);
            setLogoLoadError(false);
          }
        })
        .catch(() => {
          // Silently keep default SVG
        });
    }

    fetchLogo();
    window.addEventListener("campus-logo-changed", fetchLogo);

    return () => {
      isMounted = false;
      window.removeEventListener("campus-logo-changed", fetchLogo);
    };
  }, []);

  const logoSrc = React.useMemo(() => {
    if (!campusLogo?.image_url && !campusLogo?.imageUrl) return null;
    const url = campusLogo.image_url || campusLogo.imageUrl;
    if (url.startsWith("data:") || url.startsWith("blob:")) return url;
    const ts = campusLogo.updatedAt ? new Date(campusLogo.updatedAt).getTime() : Date.now();
    return url.includes("?") ? `${url}&t=${ts}` : `${url}?t=${ts}`;
  }, [campusLogo?.image_url, campusLogo?.imageUrl, campusLogo?.updatedAt]);

  async function handleLogout() {
    setMobileMenuOpen(false);
    await logout();
    navigate("/");
  }

  function closeMobile() {
    setMobileMenuOpen(false);
  }

  const roleLabel = user ? roleNames[user.role] || user.role : null;
  const initials = user ? getInitials(user.name) : "";

  return (
    <header className="topbar">
      <div className="topbar-container">
        <Link className="brand" to="/" onClick={closeMobile}>
          <span
            className={`brand-mark ${logoSrc && !logoLoadError ? "brand-logo-mark" : ""}`}
            aria-hidden="true"
            style={
              logoSrc && !logoLoadError
                ? {
                    width: "42px",
                    height: "42px",
                    minWidth: "42px",
                    background: "#ffffff",
                    padding: "2px",
                    border: "1px solid var(--border)",
                    borderRadius: "8px",
                    boxShadow: "0 1px 4px rgba(0, 0, 0, 0.08)",
                    display: "flex",
                    alignItems: "center",
                    justifyContent: "center",
                    overflow: "hidden",
                  }
                : {}
            }
          >
            {logoSrc && !logoLoadError ? (
              <img
                key={logoSrc}
                src={logoSrc}
                alt={campusLogo.alt_text || campusLogo.name || "Campus logo"}
                style={{
                  width: "100%",
                  height: "100%",
                  objectFit: "contain",
                  borderRadius: "6px",
                  display: "block",
                }}
                onError={() => setLogoLoadError(true)}
                onLoad={() => setLogoLoadError(false)}
              />
            ) : (
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
            )}
          </span>
          <span className="brand-text">
            {campusLogo?.name ? (
              <span>{campusLogo.name}</span>
            ) : (
              <>
                Campus <span className="brand-accent">Lost &amp; Found</span>
              </>
            )}
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

        {/* Right side: User dropdown or Guest Theme + Sign in */}
        <div className="topbar-actions">
          {user ? (
            <>
              <NotificationBell onNavigate={closeMobile} />
              <UserMenu onNavigate={closeMobile} />
            </>
          ) : (
            <div className="guest-header-actions">
              <GuestThemeToggle />
              <button
                className="btn btn-primary btn-sm"
                onClick={onAuth}
                type="button"
              >
                Sign in
              </button>
            </div>
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

            {user && (
              <NavLink
                to="/profile"
                className={({ isActive }) =>
                  isActive ? "mobile-nav-link active" : "mobile-nav-link"
                }
                onClick={closeMobile}
              >
                My Profile
              </NavLink>
            )}

            <div className="mobile-drawer-footer">
              {user ? (
                <div className="mobile-user-box">
                  <div className="mobile-user-info-row">
                    <div className="mobile-avatar-circle" aria-hidden="true">
                      {initials}
                    </div>
                    <div className="mobile-user-info">
                      <strong>{user.name}</strong>
                      <small>{user.email}</small>
                      <span className={`user-role-badge ${user.role}`}>
                        {roleLabel}
                      </span>
                    </div>
                  </div>

                  <div className="mobile-appearance-box">
                    <label className="mobile-section-label">Appearance</label>
                    <ThemeSelector variant="segmented" />
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
                <div className="mobile-guest-box">
                  <div className="mobile-appearance-box" style={{ marginBottom: "16px" }}>
                    <label className="mobile-section-label">Appearance</label>
                    <ThemeSelector variant="segmented" />
                  </div>
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
                </div>
              )}
            </div>
          </nav>
        </div>
      )}
    </header>
  );
}
