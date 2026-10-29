// ==============================================================================
// TOTP (Time-Based One-Time Password) & Two-Factor Authentication Service
// RFC 6238 / RFC 4226 compliant implementation for Google Authenticator,
// Microsoft Authenticator, Apple Passwords, Authy, and 1Password.
// ==============================================================================

import crypto from "crypto";
import QRCode from "qrcode";

const BASE32_ALPHABET = "ABCDEFGHIJKLMNOPQRSTUVWXYZ234567";

/**
 * Generate a cryptographically secure random Base32 secret string.
 * @param {number} byteLength - Number of random bytes (default 20 bytes = 160 bits)
 * @returns {string} Base32-encoded secret string
 */
export function generateBase32Secret(byteLength = 20) {
  const randomBytes = crypto.randomBytes(byteLength);
  let bits = 0;
  let value = 0;
  let output = "";
  for (let i = 0; i < randomBytes.length; i++) {
    value = (value << 8) | randomBytes[i];
    bits += 8;
    while (bits >= 5) {
      output += BASE32_ALPHABET[(value >>> (bits - 5)) & 31];
      bits -= 5;
    }
  }
  if (bits > 0) {
    output += BASE32_ALPHABET[(value << (5 - bits)) & 31];
  }
  return output;
}

/**
 * Decode a Base32 string into a Buffer.
 * @param {string} base32 - Base32 string
 * @returns {Buffer} Decoded binary buffer
 */
export function decodeBase32(base32) {
  const clean = String(base32 || "")
    .toUpperCase()
    .replace(/=+$/, "")
    .replace(/[\s-]/g, "");

  let bits = 0;
  let value = 0;
  const bytes = [];
  for (let i = 0; i < clean.length; i++) {
    const val = BASE32_ALPHABET.indexOf(clean[i]);
    if (val === -1) continue;
    value = (value << 5) | val;
    bits += 5;
    if (bits >= 8) {
      bytes.push((value >>> (bits - 8)) & 255);
      bits -= 8;
    }
  }
  return Buffer.from(bytes);
}

/**
 * Generate an RFC 6238 6-digit TOTP code for a given secret and time offset.
 * @param {string} secret - Base32-encoded secret
 * @param {number} timeStep - Time step in seconds (default 30)
 * @param {number} windowOffset - Time step offset (0 for current, -1 for previous, +1 for next)
 * @returns {string} 6-digit one-time code
 */
export function generateTOTP(secret, timeStep = 30, windowOffset = 0) {
  const epoch = Math.floor(Date.now() / 1000);
  const time = Math.floor(epoch / timeStep) + windowOffset;
  const buffer = Buffer.alloc(8);
  buffer.writeBigInt64BE(BigInt(time));

  const key = decodeBase32(secret);
  const hmac = crypto.createHmac("sha1", key).update(buffer).digest();

  const offset = hmac[hmac.length - 1] & 0x0f;
  const code = (hmac.readUInt32BE(offset) & 0x7fffffff) % 1000000;
  return code.toString().padStart(6, "0");
}

/**
 * Verify a user-provided 6-digit TOTP code against a secret.
 * Allows a +/-1 step clock drift (current, 30s before, 30s after).
 * @param {string} token - User input code
 * @param {string} secret - Base32-encoded secret
 * @param {number} timeStep - Time step in seconds (default 30)
 * @param {number} window - Number of allowable step drifts (default 1)
 * @returns {boolean}
 */
export function verifyTOTP(token, secret, timeStep = 30, window = 1) {
  if (!token || !secret) return false;
  const cleanToken = String(token).trim().replace(/[\s-]/g, "");
  if (!/^\d{6}$/.test(cleanToken)) return false;

  for (let errorWindow = -window; errorWindow <= window; errorWindow++) {
    const calculated = generateTOTP(secret, timeStep, errorWindow);
    if (cleanToken === calculated) {
      return true;
    }
  }
  return false;
}

/**
 * Hash a backup code using SHA-256 for secure database storage.
 */
export function hashBackupCode(code) {
  const normalized = String(code || "").trim().toUpperCase().replace(/[\s-]/g, "");
  return crypto.createHash("sha256").update(normalized).digest("hex");
}

/**
 * Generate a set of backup recovery codes formatted as XXXX-XXXX.
 * @param {number} count - Number of backup codes (default 8)
 * @returns {{ plainCodes: string[], hashedCodes: string[] }}
 */
export function generateBackupCodes(count = 8) {
  const plainCodes = [];
  const hashedCodes = [];
  const chars = "23456789ABCDEFGHJKLMNPQRSTUVWXYZ"; // Base32 without 0, 1, I, O to prevent confusion

  for (let i = 0; i < count; i++) {
    const randomBytes = crypto.randomBytes(8);
    let codeStr = "";
    for (let j = 0; j < 8; j++) {
      codeStr += chars[randomBytes[j] % chars.length];
    }
    const formatted = `${codeStr.slice(0, 4)}-${codeStr.slice(4)}`;
    plainCodes.push(formatted);
    hashedCodes.push(hashBackupCode(formatted));
  }

  return { plainCodes, hashedCodes };
}

/**
 * Verify a submitted backup code against stored hashes, returning remaining unused hashes.
 * @param {string} code - Candidate backup code
 * @param {string[]} storedHashes - Array of hashed backup codes from database
 * @returns {{ valid: boolean, remainingHashes: string[] }}
 */
export function verifyBackupCode(code, storedHashes = []) {
  if (!code || !Array.isArray(storedHashes) || storedHashes.length === 0) {
    return { valid: false, remainingHashes: storedHashes || [] };
  }

  const candidateHash = hashBackupCode(code);
  const index = storedHashes.indexOf(candidateHash);

  if (index !== -1) {
    const remainingHashes = storedHashes.filter((_, idx) => idx !== index);
    return { valid: true, remainingHashes };
  }

  return { valid: false, remainingHashes: storedHashes };
}

/**
 * Construct an otpauth:// URI recognized by all major authenticator apps.
 */
export function getOtpAuthUrl({ issuer = "Campus Lost & Found", accountName, secret }) {
  const cleanIssuer = encodeURIComponent(issuer.trim());
  const cleanAccount = encodeURIComponent(accountName.trim());
  return `otpauth://totp/${cleanIssuer}:${cleanAccount}?secret=${secret}&issuer=${cleanIssuer}&algorithm=SHA1&digits=6&period=30`;
}

/**
 * Render an otpauth URL into a base64 Data URL QR Code image.
 */
export async function generateQRCodeDataUrl(otpAuthUrl) {
  return await QRCode.toDataURL(otpAuthUrl, {
    errorCorrectionLevel: "M",
    type: "image/png",
    margin: 2,
    width: 240,
    color: {
      dark: "#000000",
      light: "#ffffff",
    },
  });
}
