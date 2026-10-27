/**
 * Validation utilities for Campus Lost & Found System
 * Handles passwords, names, school emails, and contact numbers.
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
    return { valid: false, error: "Full name is required." };
  }
  const trimmed = name.trim();
  if (trimmed.length < 2) {
    return { valid: false, error: "Name must be at least 2 characters long." };
  }
  if (trimmed.length > 120) {
    return { valid: false, error: "Name cannot exceed 120 characters." };
  }
  // Support spaces, apostrophes, hyphens, periods, commas, and all Unicode letters
  if (!/^[\p{L}\p{M}\s.',-]+$/u.test(trimmed)) {
    return {
      valid: false,
      error:
        "Name can only contain letters, spaces, commas, apostrophes, hyphens, and periods.",
    };
  }
  return { valid: true, formatted: trimmed };
}

/**
 * Breakdown of password criteria for real-time feedback and validation
 */
export function checkPasswordCriteria(password = "") {
  const str = typeof password === "string" ? password : "";
  const minLength = str.length >= 8 && str.length <= 128;
  const hasUpper = /[A-Z]/.test(str);
  const hasLower = /[a-z]/.test(str);
  const hasNumber = /[0-9]/.test(str);
  const hasSpecial = /[^a-zA-Z0-9\s]/.test(str);

  const criteriaCount = [
    minLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSpecial,
  ].filter(Boolean).length;

  let strength = "weak";
  if (criteriaCount >= 5) {
    strength = "strong";
  } else if (criteriaCount >= 4) {
    strength = "good";
  } else if (criteriaCount >= 2) {
    strength = "fair";
  }

  return {
    minLength,
    hasUpper,
    hasLower,
    hasNumber,
    hasSpecial,
    criteriaCount,
    strength,
    isValid: minLength && hasUpper && hasLower && hasNumber && hasSpecial,
  };
}

/**
 * Validates password complexity
 * @param {string} password - The password to validate
 * @param {object} [options]
 * @param {boolean} [options.isChange] - If true, checks against current password
 * @param {string} [options.currentPassword] - The user's current password
 */
export function validatePassword(
  password,
  { isChange = false, currentPassword = null } = {},
) {
  if (!password || typeof password !== "string") {
    return { valid: false, error: "Password is required." };
  }

  if (password.length < 8) {
    return {
      valid: false,
      error: "Password must be at least 8 characters long.",
    };
  }

  if (password.length > 128) {
    return {
      valid: false,
      error: "Password cannot exceed 128 characters.",
    };
  }

  const missing = [];
  if (!/[A-Z]/.test(password)) missing.push("one uppercase letter (A-Z)");
  if (!/[a-z]/.test(password)) missing.push("one lowercase letter (a-z)");
  if (!/[0-9]/.test(password)) missing.push("one number (0-9)");
  if (!/[^a-zA-Z0-9\s]/.test(password))
    missing.push("one special character (e.g. !@#$%^&*)");

  if (missing.length > 0) {
    return {
      valid: false,
      error: `Password must contain at least ${missing.join(", ")}.`,
    };
  }

  if (isChange && currentPassword && password === currentPassword) {
    return {
      valid: false,
      error: "New password cannot be the same as your current password.",
    };
  }

  return { valid: true };
}

/**
 * Validates institutional school email addresses
 * @param {string} email
 * @param {object} [options]
 * @param {boolean} [options.requireSchoolDomain=true]
 */
export function validateSchoolEmail(email, { requireSchoolDomain = true } = {}) {
  if (!email || typeof email !== "string") {
    return { valid: false, error: "Email address is required." };
  }

  const trimmed = email.trim().toLowerCase();
  if (trimmed.length > 254) {
    return { valid: false, error: "Email address cannot exceed 254 characters." };
  }

  // Standard RFC-compliant email pattern check
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)+$/;
  if (!emailRegex.test(trimmed)) {
    return { valid: false, error: "Please enter a valid email address format." };
  }

  if (requireSchoolDomain) {
    if (!trimmed.endsWith(".edu") && !trimmed.endsWith(".edu.ph")) {
      return {
        valid: false,
        error:
          "Please use your institutional campus email address (.edu or .edu.ph).",
      };
    }
  }

  return { valid: true, formatted: trimmed };
}
