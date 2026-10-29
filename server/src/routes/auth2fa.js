// ==============================================================================
// Two-Factor Authentication (2FA / TOTP) Router
// Endpoints for enabling, confirming, disabling, and managing Google Authenticator
// TOTP secrets and backup recovery codes.
// ==============================================================================

import express from "express";
import crypto from "crypto";
import {
  generateBase32Secret,
  generateTOTP,
  verifyTOTP,
  generateBackupCodes,
  verifyBackupCode,
  getOtpAuthUrl,
  generateQRCodeDataUrl,
} from "../utils/totp.js";
import { logAudit, logFailure } from "../services/audit.js";

// Temporary in-memory cache for login 2FA verification challenges (TTL: 5 minutes)
export const tempLoginSessions = new Map();

// Periodic prune of expired temporary 2FA challenges
setInterval(() => {
  const now = Date.now();
  for (const [key, session] of tempLoginSessions.entries()) {
    if (session.expiresAt <= now) {
      tempLoginSessions.delete(key);
    }
  }
}, 60 * 1000);

export function create2FARouter({
  pool,
  asyncRoute,
  requireDatabase,
  requireAuth,
  verifyPassword,
  startSession,
  safeUser,
  updateSessionsForUser,
}) {
  const router = express.Router();

  // 1. GET /api/auth/2fa/status
  // Returns whether 2FA is currently active for the logged in user
  router.get(
    "/status",
    requireDatabase,
    requireAuth,
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        "SELECT two_factor_enabled, two_factor_confirmed_at, two_factor_backup_codes FROM users WHERE user_id = $1",
        [req.user.id],
      );
      const row = result.rows[0];
      const backupCodes = Array.isArray(row?.two_factor_backup_codes)
        ? row.two_factor_backup_codes
        : [];

      res.json({
        enabled: Boolean(row?.two_factor_enabled),
        confirmedAt: row?.two_factor_confirmed_at || null,
        remainingBackupCodes: backupCodes.length,
      });
    }),
  );

  // 2. POST /api/auth/2fa/setup
  // Generates a new secret, QR code, and backup codes for authenticator app enrollment
  router.post(
    "/setup",
    requireDatabase,
    requireAuth,
    asyncRoute(async (req, res) => {
      const secret = generateBase32Secret();
      const backup = generateBackupCodes(8);

      const otpAuthUrl = getOtpAuthUrl({
        issuer: "Holy Name University",
        accountName: req.user.email || req.user.name || "user",
        secret,
      });

      const qrCode = await generateQRCodeDataUrl(otpAuthUrl);

      // Save temporary secret and backup codes in database awaiting confirmation
      await pool.query(
        `UPDATE users
         SET two_factor_temp_secret = $1,
             two_factor_backup_codes = $2
         WHERE user_id = $3`,
        [secret, JSON.stringify(backup.hashedCodes), req.user.id],
      );

      res.json({
        secret,
        qrCode,
        otpAuthUrl,
        backupCodes: backup.plainCodes,
      });
    }),
  );

  // 3. POST /api/auth/2fa/confirm
  // User submits 6-digit code from their app to activate 2FA
  router.post(
    "/confirm",
    requireDatabase,
    requireAuth,
    asyncRoute(async (req, res) => {
      const { code } = req.body;
      if (!code) {
        return res.status(400).json({ error: "Please enter the 6-digit verification code from your authenticator app." });
      }

      const result = await pool.query(
        "SELECT two_factor_temp_secret, two_factor_backup_codes FROM users WHERE user_id = $1",
        [req.user.id],
      );
      const tempSecret = result.rows[0]?.two_factor_temp_secret;

      if (!tempSecret) {
        return res.status(400).json({
          error: "No active 2FA setup found. Please generate a new QR code first.",
        });
      }

      const isValid = verifyTOTP(code, tempSecret);
      if (!isValid) {
        await logFailure(pool, {
          actor: req.user,
          action: "UPDATE",
          entityType: "users",
          entityId: req.user.id,
          description: "Failed 2FA confirmation attempt (incorrect code)",
          error: "Invalid 6-digit code",
          req,
        });
        return res.status(400).json({
          error: "Invalid 6-digit code. Please verify the time on your device and enter the latest code shown in your app.",
        });
      }

      // Promote temporary secret to active secret
      await pool.query(
        `UPDATE users
         SET two_factor_secret = two_factor_temp_secret,
             two_factor_temp_secret = NULL,
             two_factor_enabled = true,
             two_factor_confirmed_at = now()
         WHERE user_id = $1`,
        [req.user.id],
      );

      await updateSessionsForUser(req.user.id, { twoFactorEnabled: true });

      await logAudit(pool, {
        actor: req.user,
        action: "UPDATE",
        status: "SUCCESS",
        entityType: "users",
        entityId: req.user.id,
        description: `User "${req.user.name}" enabled Two-Factor Authentication (Google Authenticator / TOTP)`,
        req,
      });

      res.json({
        success: true,
        message: "Two-Factor Authentication has been successfully enabled for your account.",
      });
    }),
  );

  // 4. POST /api/auth/2fa/disable
  // User submits account password and current code to disable 2FA
  router.post(
    "/disable",
    requireDatabase,
    requireAuth,
    asyncRoute(async (req, res) => {
      const { password, code } = req.body;
      if (!password) {
        return res.status(400).json({ error: "Your account password is required to disable Two-Factor Authentication." });
      }

      const userRes = await pool.query(
        "SELECT password_hash, two_factor_secret, two_factor_backup_codes FROM users WHERE user_id = $1",
        [req.user.id],
      );
      const user = userRes.rows[0];

      if (!user || !verifyPassword(password, user.password_hash)) {
        return res.status(401).json({ error: "Incorrect password. Cannot disable Two-Factor Authentication." });
      }

      // If code was provided, verify it too for enhanced safety
      if (code && user.two_factor_secret) {
        const isTotp = verifyTOTP(code, user.two_factor_secret);
        const isBackup = verifyBackupCode(code, user.two_factor_backup_codes || []).valid;
        if (!isTotp && !isBackup) {
          return res.status(400).json({ error: "Invalid authenticator code. Please enter the current code or leave blank if using password only." });
        }
      }

      await pool.query(
        `UPDATE users
         SET two_factor_enabled = false,
             two_factor_secret = NULL,
             two_factor_temp_secret = NULL,
             two_factor_backup_codes = NULL,
             two_factor_confirmed_at = NULL
         WHERE user_id = $1`,
        [req.user.id],
      );

      await updateSessionsForUser(req.user.id, { twoFactorEnabled: false });

      await logAudit(pool, {
        actor: req.user,
        action: "UPDATE",
        status: "SUCCESS",
        entityType: "users",
        entityId: req.user.id,
        description: `User "${req.user.name}" disabled Two-Factor Authentication`,
        req,
      });

      res.json({
        success: true,
        message: "Two-Factor Authentication has been successfully disabled.",
      });
    }),
  );

  // 5. POST /api/auth/2fa/regenerate-backup-codes
  // Regenerates a fresh set of 8 recovery codes
  router.post(
    "/regenerate-backup-codes",
    requireDatabase,
    requireAuth,
    asyncRoute(async (req, res) => {
      const { code } = req.body;
      const userRes = await pool.query(
        "SELECT two_factor_secret, two_factor_enabled FROM users WHERE user_id = $1",
        [req.user.id],
      );
      const user = userRes.rows[0];

      if (!user?.two_factor_enabled || !user.two_factor_secret) {
        return res.status(400).json({ error: "Two-Factor Authentication is not enabled on this account." });
      }

      if (code && !verifyTOTP(code, user.two_factor_secret)) {
        return res.status(400).json({ error: "Invalid authenticator code." });
      }

      const backup = generateBackupCodes(8);
      await pool.query(
        "UPDATE users SET two_factor_backup_codes = $1 WHERE user_id = $2",
        [JSON.stringify(backup.hashedCodes), req.user.id],
      );

      await logAudit(pool, {
        actor: req.user,
        action: "UPDATE",
        status: "SUCCESS",
        entityType: "users",
        entityId: req.user.id,
        description: `User "${req.user.name}" regenerated 2FA backup recovery codes`,
        req,
      });

      res.json({
        success: true,
        backupCodes: backup.plainCodes,
      });
    }),
  );

  // 6. POST /api/auth/2fa/verify-login
  // Public endpoint: complete second factor during sign-in
  router.post(
    "/verify-login",
    requireDatabase,
    asyncRoute(async (req, res) => {
      const { tempToken, code } = req.body;
      if (!tempToken || !code) {
        return res.status(400).json({ error: "Temporary 2FA token and 6-digit code are required." });
      }

      const challenge = tempLoginSessions.get(tempToken);
      if (!challenge || challenge.expiresAt < Date.now()) {
        if (challenge) tempLoginSessions.delete(tempToken);
        return res.status(401).json({ error: "Two-Factor sign-in challenge has expired. Please sign in again." });
      }

      const userRes = await pool.query(
        "SELECT * FROM users WHERE user_id = $1",
        [challenge.userId],
      );
      const user = userRes.rows[0];

      if (!user || user.is_active === false) {
        tempLoginSessions.delete(tempToken);
        return res.status(403).json({ error: "Account is inactive or not found." });
      }

      const cleanCode = String(code).trim();
      let isValid = verifyTOTP(cleanCode, user.two_factor_secret);
      let usedBackup = false;

      // If TOTP did not match, test backup codes
      if (!isValid && Array.isArray(user.two_factor_backup_codes)) {
        const backupResult = verifyBackupCode(cleanCode, user.two_factor_backup_codes);
        if (backupResult.valid) {
          isValid = true;
          usedBackup = true;
          // Consume the used backup code
          await pool.query(
            "UPDATE users SET two_factor_backup_codes = $1 WHERE user_id = $2",
            [JSON.stringify(backupResult.remainingHashes), user.user_id],
          );
        }
      }

      if (!isValid) {
        await logFailure(pool, {
          actor: safeUser(user),
          action: "LOGIN",
          entityType: "auth",
          description: `Failed 2FA code verification for "${user.email}"`,
          error: "Invalid 6-digit authenticator or backup code",
          req,
        });
        return res.status(401).json({
          error: "Invalid verification code. Please check your authenticator app and try again.",
        });
      }

      // Valid: clear challenge
      tempLoginSessions.delete(tempToken);

      const session = await startSession(user, res, req);
      await logAudit(pool, {
        actor: session.user,
        action: "LOGIN",
        status: "SUCCESS",
        entityType: "auth",
        entityId: user.user_id,
        description: `User "${session.user.name}" completed 2FA sign-in successfully${usedBackup ? " (via backup recovery code)" : " (via Google Authenticator)"}`,
        req,
      });

      res.json(session);
    }),
  );

  return router;
}
