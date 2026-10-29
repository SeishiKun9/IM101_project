import React, { createContext, useContext, useEffect, useState } from "react";
import { apiRequest, tokenKey } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function checkAuth() {
    try {
      const { user: savedUser } = await apiRequest("/auth/me");
      document.cookie = `campus_logged_in=true; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
      setUser(savedUser);
    } catch {
      localStorage.removeItem(tokenKey);
      document.cookie = "campus_logged_in=; path=/; max-age=0; SameSite=Lax";
      setUser(null);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    checkAuth();
  }, []);

  async function login(credentials) {
    const result = await apiRequest("/auth/login", {
      method: "POST",
      body: JSON.stringify(credentials),
    });
    if (result?.requires2FA) {
      return result;
    }
    localStorage.setItem(tokenKey, result.token);
    document.cookie = `campus_logged_in=true; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    setUser(result.user);
    return result.user;
  }

  async function verify2FALogin({ tempToken, code }) {
    const result = await apiRequest("/auth/2fa/verify-login", {
      method: "POST",
      body: JSON.stringify({ tempToken, code }),
    });
    localStorage.setItem(tokenKey, result.token);
    document.cookie = `campus_logged_in=true; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    setUser(result.user);
    return result.user;
  }

  async function register(payload) {
    const result = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    localStorage.setItem(tokenKey, result.token);
    document.cookie = `campus_logged_in=true; path=/; max-age=${7 * 24 * 60 * 60}; SameSite=Lax`;
    setUser(result.user);
    return result.user;
  }

  async function logout() {
    try {
      await apiRequest("/auth/logout", { method: "POST" });
    } catch (error) {
      console.warn("Logout request error:", error);
    }
    localStorage.removeItem(tokenKey);
    document.cookie = "campus_logged_in=; path=/; max-age=0; SameSite=Lax";
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        login,
        verify2FALogin,
        register,
        logout,
        refreshUser: checkAuth,
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) {
    throw new Error("useAuth must be used within an AuthProvider");
  }
  return context;
}
