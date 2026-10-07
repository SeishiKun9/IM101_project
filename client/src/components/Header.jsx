import React from "react";
import { Link, NavLink, useNavigate } from "react-router-dom";
import { useAuth } from "../context/AuthContext.jsx";

export default function Header({ onAuth }) {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  async function handleLogout() {
    await logout();
    navigate("/");
  }

  return (
    <header className="topbar">
      <Link className="brand" to="/">
        <span className="brand-mark">LF</span>
        Campus Lost &amp; Found
      </Link>
      <nav>
        <NavLink
          to="/"
          className={({ isActive }) => (isActive ? "active" : "")}
          end
        >
          Global dashboard
        </NavLink>

        {user && (
          <NavLink
            to="/my-reports"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            My reports
          </NavLink>
        )}

        {user?.role === "admin" && (
          <NavLink
            to="/administrator"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Administration
          </NavLink>
        )}

        {user?.role === "staff" && (
          <NavLink
            to="/verifier"
            className={({ isActive }) => (isActive ? "active" : "")}
          >
            Verifier workspace
          </NavLink>
        )}

        {user ? (
          <button className="sign-in" onClick={handleLogout}>
            Sign out ({user.name.split(" ")[0]})
          </button>
        ) : (
          <button className="sign-in" onClick={onAuth}>
            Sign in
          </button>
        )}
      </nav>
    </header>
  );
}
