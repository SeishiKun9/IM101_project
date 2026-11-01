import React, { createContext, useContext, useEffect, useState } from "react";
import { apiRequest, tokenKey } from "../api/client.js";

const AuthContext = createContext(null);

export function AuthProvider({ children }) {
  const [user, setUser] = useState(null);
  const [loading, setLoading] = useState(true);

  async function checkAuth() {
    const token = localStorage.getItem(tokenKey);
    if (!token) {
      setUser(null);
      setLoading(false);
      return;
    }

    try {
      const { user: savedUser } = await apiRequest("/auth/me");
      setUser(savedUser);
    } catch {
      localStorage.removeItem(tokenKey);
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
    localStorage.setItem(tokenKey, result.token);
    setUser(result.user);
    return result.user;
  }

  async function register(payload) {
    const result = await apiRequest("/auth/register", {
      method: "POST",
      body: JSON.stringify(payload),
    });
    localStorage.setItem(tokenKey, result.token);
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
    setUser(null);
  }

  return (
    <AuthContext.Provider
      value={{
        user,
        setUser,
        loading,
        login,
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
