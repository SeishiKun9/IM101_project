import React, {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";
import { apiRequest } from "../api/client.js";
import { useAuth } from "./AuthContext.jsx";

const ThemeContext = createContext(null);

export const GUEST_THEME_KEY = "campusGuestTheme";
export const USER_THEME_CACHE_KEY = "campusUserThemeCache";

function getSystemTheme() {
  if (
    typeof window !== "undefined" &&
    window.matchMedia &&
    window.matchMedia("(prefers-color-scheme: dark)").matches
  ) {
    return "dark";
  }
  return "light";
}

function resolveEffectiveTheme(preference) {
  if (preference === "light") return "light";
  if (preference === "dark") return "dark";
  return getSystemTheme();
}

function applyThemeToDocument(effectiveTheme) {
  if (typeof document !== "undefined") {
    document.documentElement.setAttribute("data-theme", effectiveTheme);
    // Also set color-scheme style for native scrollbars and inputs
    document.documentElement.style.colorScheme = effectiveTheme;
  }
}

export function ThemeProvider({ children }) {
  const { user, setUser } = useAuth();

  // Initial preference: if signed in, user's preference or cache; otherwise guest storage or "light" (white theme default)
  const [themePreference, setThemePreferenceState] = useState(() => {
    if (typeof window === "undefined") return "light";
    const guest = localStorage.getItem(GUEST_THEME_KEY);
    return guest || "light";
  });

  const [effectiveTheme, setEffectiveTheme] = useState(() =>
    resolveEffectiveTheme(themePreference),
  );
  const [syncError, setSyncError] = useState("");

  // Sync with signed-in user preference on login / auth change
  useEffect(() => {
    if (user && user.themePreference) {
      const userPref = user.themePreference;
      setThemePreferenceState(userPref);
      localStorage.setItem(USER_THEME_CACHE_KEY, userPref);
      const eff = resolveEffectiveTheme(userPref);
      setEffectiveTheme(eff);
      applyThemeToDocument(eff);
    } else if (user && !user.themePreference) {
      setThemePreferenceState("light");
      setEffectiveTheme("light");
      applyThemeToDocument("light");
    } else if (!user) {
      // Logged out: restore guest preference or default to light
      const guest = localStorage.getItem(GUEST_THEME_KEY) || "light";
      setThemePreferenceState(guest);
      const eff = resolveEffectiveTheme(guest);
      setEffectiveTheme(eff);
      applyThemeToDocument(eff);
    }
  }, [user?.id, user?.themePreference]);

  // Handle system theme media query changes
  useEffect(() => {
    if (typeof window === "undefined" || !window.matchMedia) return;
    const mediaQuery = window.matchMedia("(prefers-color-scheme: dark)");

    function handleSystemChange() {
      if (themePreference === "system") {
        const eff = getSystemTheme();
        setEffectiveTheme(eff);
        applyThemeToDocument(eff);
      }
    }

    mediaQuery.addEventListener("change", handleSystemChange);
    return () => mediaQuery.removeEventListener("change", handleSystemChange);
  }, [themePreference]);

  // Apply effective theme whenever it changes
  useEffect(() => {
    const eff = resolveEffectiveTheme(themePreference);
    setEffectiveTheme(eff);
    applyThemeToDocument(eff);
  }, [themePreference]);

  // Function to change theme preference
  const setThemePreference = useCallback(
    async (newPref) => {
      if (!["light", "dark", "system"].includes(newPref)) return;

      const previousPref = themePreference;
      setSyncError("");

      // Optimistically update UI
      setThemePreferenceState(newPref);
      const newEff = resolveEffectiveTheme(newPref);
      setEffectiveTheme(newEff);
      applyThemeToDocument(newEff);

      if (user) {
        // Signed-in user: save to PostgreSQL
        try {
          const updated = await apiRequest("/profile/preferences", {
            method: "PATCH",
            body: JSON.stringify({ themePreference: newPref }),
          });
          localStorage.setItem(USER_THEME_CACHE_KEY, newPref);
          if (setUser) {
            setUser((prev) => (prev ? { ...prev, ...updated } : prev));
          }
        } catch (err) {
          // Revert on failure
          setThemePreferenceState(previousPref);
          const prevEff = resolveEffectiveTheme(previousPref);
          setEffectiveTheme(prevEff);
          applyThemeToDocument(prevEff);
          setSyncError(
            err.message ||
              "Failed to save theme preference to server. Reverted.",
          );
          throw err;
        }
      } else {
        // Guest user: save to localStorage
        localStorage.setItem(GUEST_THEME_KEY, newPref);
      }
    },
    [themePreference, user, setUser],
  );

  return (
    <ThemeContext.Provider
      value={{
        themePreference,
        effectiveTheme,
        setThemePreference,
        syncError,
        setSyncError,
      }}
    >
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  const context = useContext(ThemeContext);
  if (!context) {
    throw new Error("useTheme must be used within a ThemeProvider");
  }
  return context;
}
