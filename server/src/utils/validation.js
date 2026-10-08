/**
 * Philippine phone number and profile validation utilities
 */

export function validatePhilippinePhone(phone) {
  if (phone === null || phone === undefined || String(phone).trim() === "") {
    return { valid: true, formatted: null };
  }

  const raw = String(phone).trim();
  // Strip spaces, dashes, parentheses
  const cleaned = raw.replace(/[\s\-()]/g, "");

  // Format 1: starts with +639 followed by 9 digits (total 13 chars)
  if (/^\+639\d{9}$/.test(cleaned)) {
    return { valid: true, formatted: cleaned };
  }

  // Format 2: starts with 639 followed by 9 digits (total 12 digits)
  if (/^639\d{9}$/.test(cleaned)) {
    return { valid: true, formatted: `+${cleaned}` };
  }

  // Format 3: starts with 09 followed by 9 digits (total 11 digits)
  if (/^09\d{9}$/.test(cleaned)) {
    return { valid: true, formatted: cleaned };
  }

  return {
    valid: false,
    error:
      "Please enter a valid Philippine contact number (e.g., 09171234567 or +639171234567).",
  };
}

export function validateName(name) {
  if (!name || typeof name !== "string") {
    return { valid: false, error: "Name is required." };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, error: "Name must be at least 2 characters long." };
  }
  if (trimmed.length > 120) {
    return { valid: false, error: "Name cannot exceed 120 characters." };
  }
  // Support spaces, apostrophes, hyphens, periods, and all Unicode letters
  if (!/^[\p{L}\p{M}\s.'-]+$/u.test(trimmed)) {
    return {
      valid: false,
      error:
        "Name can only contain letters, spaces, apostrophes, hyphens, and periods.",
    };
  }
  return { valid: true, formatted: trimmed };
}
