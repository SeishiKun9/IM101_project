import express from "express";
import { logAdminAudit } from "../services/audit.js";
import { validatePhilippinePhone, validateName } from "../utils/validation.js";

// Rate limiter for password change attempts: max 5 attempts per 15 minutes per user
const passwordChangeAttempts = new Map();

function checkPasswordRateLimit(userId) {
  const now = Date.now();
  const windowMs = 15 * 60 * 1000;
  const attempts = passwordChangeAttempts.get(userId) || [];
  const recentAttempts = attempts.filter((t) => now - t < windowMs);

  if (recentAttempts.length >= 5) {
    const oldest = recentAttempts[0];
    const retryAfterMin = Math.ceil((windowMs - (now - oldest)) / 60000);
    return {
      allowed: false,
      error: `Too many password change attempts. Please try again in ${retryAfterMin} minute(s).`,
    };
  }

  return { allowed: true, recentAttempts };
}

function recordPasswordAttempt(userId, recentAttempts) {
  recentAttempts.push(Date.now());
  passwordChangeAttempts.set(userId, recentAttempts);
}

function clearPasswordAttempts(userId) {
  passwordChangeAttempts.delete(userId);
}

export function createProfileRouter({
  pool,
  asyncRoute,
  requireDatabase,
  requireAuth,
  safeUser,
  verifyPassword,
  hashPassword,
  updateSessionsForUser,
  invalidateSessionsForUser,
}) {
  const router = express.Router();

  router.use(requireDatabase);
  router.use(requireAuth);

  // 1. GET /api/profile
  router.get(
    ["/", "/api/profile"],
    asyncRoute(async (req, res) => {
      const result = await pool.query(
        `SELECT user_id, name, email, role, contact_number,
                default_anonymous, default_hide_phone, theme_preference,
                created_at, updated_at
         FROM users
         WHERE user_id = $1`,
        [req.user.id],
      );

      if (!result.rows.length) {
        return res.status(404).json({ error: "User account not found." });
      }

      res.json(safeUser(result.rows[0]));
    }),
  );

  // 2. PATCH /api/profile (Personal Information: Name and Contact Number only)
  router.patch(
    ["/", "/api/profile"],
    asyncRoute(async (req, res) => {
      const { name, contactNumber } = req.body;

      // Validate name if provided
      let formattedName = undefined;
      if (name !== undefined) {
        const nameVal = validateName(name);
        if (!nameVal.valid) {
          return res.status(400).json({ error: nameVal.error });
        }
        formattedName = nameVal.formatted;
      }

      // Validate contact number if provided
      let formattedPhone = undefined;
      if (contactNumber !== undefined) {
        const phoneVal = validatePhilippinePhone(contactNumber);
        if (!phoneVal.valid) {
          return res.status(400).json({ error: phoneVal.error });
        }
        formattedPhone = phoneVal.formatted;
      }

      if (formattedName === undefined && formattedPhone === undefined) {
        return res.status(400).json({ error: "No profile changes provided." });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const curRes = await client.query(
          `SELECT user_id, name, email, role, contact_number,
                  default_anonymous, default_hide_phone, theme_preference,
                  created_at, updated_at
           FROM users
           WHERE user_id = $1
           FOR UPDATE`,
          [req.user.id],
        );

        if (!curRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "User account not found." });
        }
        const oldRow = curRes.rows[0];

        const newName = formattedName !== undefined ? formattedName : oldRow.name;
        const newPhone =
          formattedPhone !== undefined ? formattedPhone : oldRow.contact_number;

        const updateRes = await client.query(
          `UPDATE users
           SET name = $1, contact_number = $2, updated_at = now()
           WHERE user_id = $3
           RETURNING user_id, name, email, role, contact_number,
                     default_anonymous, default_hide_phone, theme_preference,
                     created_at, updated_at`,
          [newName, newPhone, req.user.id],
        );
        const updatedRow = updateRes.rows[0];

        // Audit log
        await logAdminAudit(
          client,
          req.user.id,
          "UPDATE_PROFILE",
          "users",
          req.user.id,
          { name: oldRow.name, contactNumber: oldRow.contact_number },
          { name: updatedRow.name, contactNumber: updatedRow.contact_number },
        );

        await client.query("COMMIT");

        // Update active in-memory sessions
        const updatedUser = safeUser(updatedRow);
        updateSessionsForUser(req.user.id, updatedUser);

        res.json(updatedUser);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // 3. PATCH /api/profile/preferences (Privacy Defaults & Theme Preference)
  router.patch(
    ["/preferences", "/api/profile/preferences"],
    asyncRoute(async (req, res) => {
      const { defaultAnonymous, defaultHidePhone, themePreference } = req.body;

      if (
        defaultAnonymous === undefined &&
        defaultHidePhone === undefined &&
        themePreference === undefined
      ) {
        return res
          .status(400)
          .json({ error: "No preference changes provided." });
      }

      if (
        themePreference !== undefined &&
        !["light", "dark", "system"].includes(themePreference)
      ) {
        return res.status(400).json({
          error: "Theme preference must be 'light', 'dark', or 'system'.",
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const curRes = await client.query(
          `SELECT user_id, name, email, role, contact_number,
                  default_anonymous, default_hide_phone, theme_preference,
                  created_at, updated_at
           FROM users
           WHERE user_id = $1
           FOR UPDATE`,
          [req.user.id],
        );

        if (!curRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "User account not found." });
        }
        const oldRow = curRes.rows[0];

        const newAnon =
          defaultAnonymous !== undefined
            ? Boolean(defaultAnonymous)
            : oldRow.default_anonymous;
        const newHidePhone =
          defaultHidePhone !== undefined
            ? Boolean(defaultHidePhone)
            : oldRow.default_hide_phone;
        const newTheme =
          themePreference !== undefined
            ? themePreference
            : oldRow.theme_preference;

        const updateRes = await client.query(
          `UPDATE users
           SET default_anonymous = $1, default_hide_phone = $2, theme_preference = $3, updated_at = now()
           WHERE user_id = $4
           RETURNING user_id, name, email, role, contact_number,
                     default_anonymous, default_hide_phone, theme_preference,
                     created_at, updated_at`,
          [newAnon, newHidePhone, newTheme, req.user.id],
        );
        const updatedRow = updateRes.rows[0];

        // Audit log
        await logAdminAudit(
          client,
          req.user.id,
          "UPDATE_PREFERENCES",
          "users",
          req.user.id,
          {
            defaultAnonymous: oldRow.default_anonymous,
            defaultHidePhone: oldRow.default_hide_phone,
            themePreference: oldRow.theme_preference,
          },
          {
            defaultAnonymous: updatedRow.default_anonymous,
            defaultHidePhone: updatedRow.default_hide_phone,
            themePreference: updatedRow.theme_preference,
          },
        );

        await client.query("COMMIT");

        // Update active in-memory sessions
        const updatedUser = safeUser(updatedRow);
        updateSessionsForUser(req.user.id, updatedUser);

        res.json(updatedUser);
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  // 4. POST /api/profile/change-password
  router.post(
    ["/change-password", "/api/profile/change-password"],
    asyncRoute(async (req, res) => {
      const { currentPassword, newPassword, confirmPassword } = req.body;

      // Rate limit check
      const rateCheck = checkPasswordRateLimit(req.user.id);
      if (!rateCheck.allowed) {
        return res.status(429).json({ error: rateCheck.error });
      }

      if (!currentPassword) {
        return res
          .status(400)
          .json({ error: "Current password is required." });
      }
      if (!newPassword || newPassword.length < 6) {
        return res.status(400).json({
          error: "New password must be at least 6 characters long.",
        });
      }
      if (newPassword !== confirmPassword) {
        return res.status(400).json({
          error: "New password and confirmation do not match.",
        });
      }

      const client = await pool.connect();
      try {
        await client.query("BEGIN");

        const curRes = await client.query(
          "SELECT user_id, password_hash FROM users WHERE user_id = $1 FOR UPDATE",
          [req.user.id],
        );

        if (!curRes.rows.length) {
          await client.query("ROLLBACK");
          return res.status(404).json({ error: "User account not found." });
        }
        const userRow = curRes.rows[0];

        // Verify current password
        if (!verifyPassword(currentPassword, userRow.password_hash)) {
          recordPasswordAttempt(req.user.id, rateCheck.recentAttempts);
          await client.query("ROLLBACK");
          return res
            .status(400)
            .json({ error: "Current password does not match." });
        }

        // Hash new password
        const newHash = hashPassword(newPassword);

        await client.query(
          `UPDATE users
           SET password_hash = $1, password_reset_token_hash = NULL,
               password_reset_expires_at = NULL, updated_at = now()
           WHERE user_id = $2`,
          [newHash, req.user.id],
        );

        // Audit log event only (never sensitive data)
        await logAdminAudit(
          client,
          req.user.id,
          "CHANGE_PASSWORD",
          "users",
          req.user.id,
          null,
          { event: "password_changed", timestamp: new Date().toISOString() },
        );

        await client.query("COMMIT");

        // Clear failed rate limit attempts on success
        clearPasswordAttempts(req.user.id);

        // Invalidate all active sessions for this user
        invalidateSessionsForUser(req.user.id);

        res.json({
          message:
            "Password changed successfully. Please sign in again with your new password.",
        });
      } catch (err) {
        await client.query("ROLLBACK");
        throw err;
      } finally {
        client.release();
      }
    }),
  );

  return router;
}
