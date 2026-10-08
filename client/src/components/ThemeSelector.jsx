import React from "react";
import { useTheme } from "../context/ThemeContext.jsx";

export default function ThemeSelector({ variant = "cards" }) {
  const { themePreference, effectiveTheme, setThemePreference, syncError } =
    useTheme();

  const options = [
    {
      id: "light",
      label: "Light",
      description: "Clean emerald light theme with crisp contrast",
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <circle cx="12" cy="12" r="5" />
          <line x1="12" y1="1" x2="12" y2="3" />
          <line x1="12" y1="21" x2="12" y2="23" />
          <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
          <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
          <line x1="1" y1="12" x2="3" y2="12" />
          <line x1="21" y1="12" x2="23" y2="12" />
          <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
          <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
        </svg>
      ),
    },
    {
      id: "dark",
      label: "Dark",
      description: "Deep charcoal-emerald theme easy on the eyes",
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
        </svg>
      ),
    },
    {
      id: "system",
      label: "System",
      description: `Follows device setting (currently ${effectiveTheme})`,
      icon: (
        <svg
          width="18"
          height="18"
          viewBox="0 0 24 24"
          fill="none"
          stroke="currentColor"
          strokeWidth="2"
          strokeLinecap="round"
          strokeLinejoin="round"
        >
          <rect x="2" y="3" width="20" height="14" rx="2" ry="2" />
          <line x1="8" y1="21" x2="16" y2="21" />
          <line x1="12" y1="17" x2="12" y2="21" />
        </svg>
      ),
    },
  ];

  if (variant === "segmented") {
    return (
      <div className="theme-segmented-group" role="radiogroup" aria-label="Theme mode">
        {options.map((opt) => {
          const isSelected = themePreference === opt.id;
          return (
            <button
              key={opt.id}
              type="button"
              role="radio"
              aria-checked={isSelected}
              className={`theme-segment-btn ${isSelected ? "active" : ""}`}
              onClick={() => setThemePreference(opt.id)}
            >
              <span className="theme-btn-icon" aria-hidden="true">
                {opt.icon}
              </span>
              <span>{opt.label}</span>
            </button>
          );
        })}
      </div>
    );
  }

  return (
    <div className="theme-cards-container">
      {syncError && (
        <div className="alert-banner alert-danger" style={{ marginBottom: "14px" }}>
          {syncError}
        </div>
      )}
      <div className="theme-options-grid" role="radiogroup" aria-label="Appearance selection">
        {options.map((opt) => {
          const isSelected = themePreference === opt.id;
          return (
            <div
              key={opt.id}
              role="radio"
              aria-checked={isSelected}
              tabIndex={0}
              className={`theme-option-card ${isSelected ? "selected" : ""}`}
              onClick={() => setThemePreference(opt.id)}
              onKeyDown={(e) => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  setThemePreference(opt.id);
                }
              }}
            >
              <div className="theme-card-top">
                <span className="theme-card-icon" aria-hidden="true">
                  {opt.icon}
                </span>
                <span className="theme-card-title">{opt.label}</span>
                <span className={`theme-card-radio-indicator ${isSelected ? "checked" : ""}`} />
              </div>
              <p className="theme-card-desc">{opt.description}</p>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function GuestThemeToggle() {
  const { themePreference, effectiveTheme, setThemePreference } = useTheme();
  const [open, setOpen] = React.useState(false);
  const ref = React.useRef(null);

  React.useEffect(() => {
    function handleClickOutside(e) {
      if (ref.current && !ref.current.contains(e.target)) setOpen(false);
    }
    if (open) document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [open]);

  return (
    <div className="guest-theme-wrapper" ref={ref}>
      <button
        type="button"
        className="btn btn-secondary btn-icon-only guest-theme-btn"
        onClick={() => setOpen((prev) => !prev)}
        aria-label={`Appearance settings (currently ${themePreference})`}
        aria-expanded={open}
        aria-haspopup="true"
        title={`Appearance: ${themePreference}`}
      >
        {effectiveTheme === "dark" ? (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
          </svg>
        ) : (
          <svg
            width="17"
            height="17"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            aria-hidden="true"
          >
            <circle cx="12" cy="12" r="5" />
            <line x1="12" y1="1" x2="12" y2="3" />
            <line x1="12" y1="21" x2="12" y2="23" />
            <line x1="4.22" y1="4.22" x2="5.64" y2="5.64" />
            <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
            <line x1="1" y1="12" x2="3" y2="12" />
            <line x1="21" y1="12" x2="23" y2="12" />
            <line x1="4.22" y1="19.78" x2="5.64" y2="18.36" />
            <line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
          </svg>
        )}
      </button>

      {open && (
        <div className="guest-theme-dropdown" role="menu">
          <div className="guest-theme-title">Theme</div>
          <button
            type="button"
            className={`guest-theme-item ${themePreference === "light" ? "active" : ""}`}
            onClick={() => {
              setThemePreference("light");
              setOpen(false);
            }}
          >
            Light
          </button>
          <button
            type="button"
            className={`guest-theme-item ${themePreference === "dark" ? "active" : ""}`}
            onClick={() => {
              setThemePreference("dark");
              setOpen(false);
            }}
          >
            Dark
          </button>
          <button
            type="button"
            className={`guest-theme-item ${themePreference === "system" ? "active" : ""}`}
            onClick={() => {
              setThemePreference("system");
              setOpen(false);
            }}
          >
            System
          </button>
        </div>
      )}
    </div>
  );
}
