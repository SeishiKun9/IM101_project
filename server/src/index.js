import "dotenv/config";
import crypto from "node:crypto";
import fs from "node:fs";
import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

import { createLocationsRouter } from "./routes/locations.js";
import { createMapsRouter } from "./routes/maps.js";
import { createAdminLocationsRouter } from "./routes/adminLocations.js";
import { createAdminMapsRouter } from "./routes/adminMaps.js";
import { createProfileRouter } from "./routes/profile.js";
import { createAdminAuditRouter } from "./routes/adminAudit.js";
import { createCampusLogoRouter } from "./routes/campusLogo.js";
import {
  logAudit,
  logCreate,
  logUpdate,
  logDelete,
  logStatusChange,
  logAuthEvent,
  logFailure,
  setAuditContext,
} from "./services/audit.js";
import { runMigrations } from "../../db/migrate.js";
import {
  validatePhilippinePhone,
  validateName,
  validatePassword,
  validateSchoolEmail,
} from "./utils/validation.js";
import { calculateMatchScore } from "./utils/matchScorer.js";
import {
  sendPasswordResetEmail,
  sendClaimDecisionEmail,
  sendItemMatchedEmail,
  sendItemHandoverEmail,
  sendClaimMessageEmail,
  sendTestEmail,
  getMailerStatus,
  verifyMailerConnection,
} from "./utils/mailer.js";

const { Pool } = pg;
const app = express();
const port = Number(process.env.PORT || 3000);
const __dirname = path.dirname(fileURLToPath(import.meta.url));
const sessions = new Map();
const adminSetupToken = process.env.ADMIN_SETUP_TOKEN || "";

const isRemoteDb =
  process.env.DATABASE_URL &&
  !process.env.DATABASE_URL.includes("localhost") &&
  !process.env.DATABASE_URL.includes("127.0.0.1");

const pool = process.env.DATABASE_URL
  ? new Pool({
      connectionString: process.env.DATABASE_URL,
      ssl:
        process.env.NODE_ENV === "production" || isRemoteDb
          ? { rejectUnauthorized: false }
          : false,
    })
  : null;

// Configure reverse proxy trust (Render HTTPS)
app.set("trust proxy", 1);

// Security Headers (nosniff, frame protection, XSS filter, referrer policy)
app.use((req, res, next) => {
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("X-Frame-Options", "SAMEORIGIN");
  res.setHeader("X-XSS-Protection", "1; mode=block");
  res.setHeader("Referrer-Policy", "strict-origin-when-cross-origin");
  next();
});

// CORS and Credential Headers for local development and authorized origins
app.use((req, res, next) => {
  const origin = req.headers.origin;
  if (origin) {
    const isLocalhost =
      origin.startsWith("http://localhost:") ||
      origin.startsWith("http://127.0.0.1:") ||
      origin.startsWith("https://localhost:") ||
      origin.startsWith("https://127.0.0.1:");
    const isAppUrl = process.env.APP_URL && origin === process.env.APP_URL;

    if (isLocalhost || isAppUrl) {
      res.setHeader("Access-Control-Allow-Origin", origin);
      res.setHeader("Access-Control-Allow-Credentials", "true");
      res.setHeader(
        "Access-Control-Allow-Methods",
        "GET, POST, PUT, PATCH, DELETE, OPTIONS",
      );
      res.setHeader(
        "Access-Control-Allow-Headers",
        "Content-Type, Authorization, X-Requested-With",
      );
    }
  }

  if (req.method === "OPTIONS") {
    return res.sendStatus(204);
  }
  next();
});

app.use(express.json({ limit: "50mb" }));
app.use(express.urlencoded({ limit: "50mb", extended: true }));
app.use(express.static(path.join(__dirname, "../../client/dist")));
app.use("/uploads", express.static(path.join(__dirname, "../../uploads")));

const itemLocationJoins = `
  JOIN categories c ON c.category_id = i.category_id
  LEFT JOIN buildings b ON b.building_id = i.building_id
  LEFT JOIN floors f ON f.floor_id = i.floor_id
  LEFT JOIN rooms r ON r.room_id = i.room_id
  LEFT JOIN campus_maps m ON m.map_id = i.map_id
  LEFT JOIN locations l ON l.location_id = i.location_id`;

const publicItemFields = `
  i.item_id AS id, i.item_type AS type, i.title, i.description,
  i.date_reported AS date, i.status, c.category_name AS category,
  COALESCE(b.name, i.location_snapshot->>'buildingName', l.building, 'Campus Area') AS building,
  COALESCE(r.name, i.location_description, i.location_snapshot->>'roomName', l.location_name, 'General Area') AS location,
  COALESCE(f.name, i.location_snapshot->>'floorName', l.floor, 'All floors') AS floor,
  i.building_id AS "buildingId", i.floor_id AS "floorId", i.room_id AS "roomId",
  i.location_description AS "locationDescription",
  i.matched_lost_id AS "matchedLostId",
  i.matched_found_id AS "matchedFoundId", i.review_lost_id AS "reviewLostId", i.finder_name AS "finderName",
  i.found_location AS "foundLocation", i.confirmation_date AS "confirmationDate",
  i.map_id AS "mapId",
  COALESCE(m.image_path, '/uploads/maps/campus-map-v1.jpg') AS "mapImageUrl",
  COALESCE(m.name, 'Campus Main Map') AS "mapName",
  i.map_x AS "mapX", i.map_y AS "mapY",
  i.location_snapshot AS "locationSnapshot",
  i.reporter_id AS "reporterId",
  CASE WHEN i.is_anonymous THEN 'Anonymous' ELSE COALESCE(i.reporter_name, 'Unknown') END AS "reporterName",
  (SELECT image_path FROM item_images WHERE item_id = i.item_id ORDER BY uploaded_at LIMIT 1) AS image`;

function asyncRoute(handler) {
  return (req, res, next) =>
    Promise.resolve(handler(req, res, next)).catch(next);
}
function requireDatabase(req, res, next) {
  if (!pool)
    return res.status(503).json({ error: "Database is not configured." });
  next();
}
// Rate limiter store for sensitive authentication endpoints (Item 2B)
const rateLimitStore = new Map();

function createRateLimiter({
  windowMs = 15 * 60 * 1000,
  max = 10,
  message = "Too many attempts from this IP. Please wait a few minutes before trying again.",
} = {}) {
  // Periodically sweep expired entries (every 10 minutes)
  setInterval(() => {
    const now = Date.now();
    for (const [key, record] of rateLimitStore.entries()) {
      if (now > record.resetTime) {
        rateLimitStore.delete(key);
      }
    }
  }, 10 * 60 * 1000).unref();

  return (req, res, next) => {
    const ip =
      req.ip ||
      req.headers["x-forwarded-for"] ||
      req.socket.remoteAddress ||
      "client";
    const key = `${req.baseUrl || ""}${req.path}:${ip}`;
    const now = Date.now();

    let record = rateLimitStore.get(key);
    if (!record || now > record.resetTime) {
      record = { count: 1, resetTime: now + windowMs };
      rateLimitStore.set(key, record);
      return next();
    }

    record.count += 1;
    if (record.count > max) {
      const retryAfterSec = Math.ceil((record.resetTime - now) / 1000);
      res.setHeader("Retry-After", retryAfterSec);
      return res.status(429).json({
        error: message,
        retryAfterSeconds: retryAfterSec,
      });
    }

    next();
  };
}

const authRateLimiter = createRateLimiter({
  windowMs: 15 * 60 * 1000,
  max: 10,
  message:
    "Too many authentication attempts. Please wait 15 minutes before trying again.",
});

// Cookie parsing helper (Item 5)
function parseCookies(cookieHeader) {
  const cookies = {};
  if (!cookieHeader) return cookies;
  for (const pair of cookieHeader.split(";")) {
    const [name, ...val] = pair.split("=");
    const cleanName = name ? name.trim() : null;
    if (cleanName) {
      cookies[cleanName] = decodeURIComponent(val.join("=").trim());
    }
  }
  return cookies;
}

function tokenFrom(req) {
  const header = req.get("authorization") || "";
  if (header.startsWith("Bearer ")) {
    return header.slice(7).trim();
  }
  const cookies = parseCookies(req.get("cookie"));
  if (cookies.campus_session) {
    return cookies.campus_session;
  }
  return null;
}

// Image Data URI Sanitization (Item 4)
function isValidImageDataUri(dataUri) {
  if (!dataUri || typeof dataUri !== "string") return false;
  const trimmed = dataUri.trim();
  if (trimmed.startsWith("/uploads/") || trimmed.startsWith("/assets/"))
    return true;
  return /^data:image\/(png|jpeg|jpg|webp|gif);base64,[A-Za-z0-9+/=]+$/.test(
    trimmed,
  );
}

// Notification Creation Helper (Item 3 & 4)
async function createNotification(
  dbClient,
  { userId, title, message, type = "match_alert", link = null, itemId = null },
) {
  if (!dbClient || !userId) return;
  try {
    await dbClient.query(
      `INSERT INTO notifications (user_id, title, message, type, link, item_id, is_read, created_at)
       VALUES ($1, $2, $3, $4, $5, $6, false, now())`,
      [userId, title, message, type, link, itemId],
    );
  } catch (err) {
    console.warn("Notification creation warning:", err.message);
  }
}

// Persistent Database-Backed Sessions (Item 1 & 2A)
async function getSession(token) {
  if (!token) return null;
  const cached = sessions.get(token);
  if (cached) return cached;

  if (pool) {
    try {
      const res = await pool.query(
        "SELECT user_data, expires_at FROM user_sessions WHERE session_token = $1",
        [token],
      );
      if (res.rows.length > 0) {
        const row = res.rows[0];
        if (new Date(row.expires_at) > new Date()) {
          sessions.set(token, row.user_data);
          return row.user_data;
        } else {
          await pool.query(
            "DELETE FROM user_sessions WHERE session_token = $1",
            [token],
          );
        }
      }
    } catch (e) {
      console.warn("Session DB lookup warning:", e.message);
    }
  }
  return null;
}

async function requireAuth(req, res, next) {
  const token = tokenFrom(req);
  if (!token) {
    return res.status(401).json({ error: "Please sign in to continue." });
  }
  const user = await getSession(token);
  if (!user) {
    return res.status(401).json({ error: "Please sign in to continue." });
  }
  req.user = user;
  next();
}

function requireRole(...roles) {
  return (req, res, next) => {
    if (!roles.includes(req.user.role))
      return res
        .status(403)
        .json({ error: "You are not authorized for this workspace." });
    next();
  };
}

function hashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

function verifyPassword(password, stored) {
  const [, salt, expected] = String(stored).split(":");
  if (!salt || !expected) return false;
  const actual = crypto.scryptSync(password, salt, 64).toString("hex");
  return crypto.timingSafeEqual(
    Buffer.from(actual, "hex"),
    Buffer.from(expected, "hex"),
  );
}

function safeUser(row) {
  return {
    id: String(row.user_id),
    username: row.username || (row.email ? row.email.split("@")[0] : row.name),
    name: row.name,
    email: row.email,
    role: row.role,
    isActive: row.is_active !== false,
    contactNumber: row.contact_number || null,
    defaultAnonymous: Boolean(row.default_anonymous),
    defaultHidePhone: row.default_hide_phone !== false,
    themePreference: row.theme_preference || "system",
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

async function updateSessionsForUser(userId, updatedUserData) {
  for (const [token, sessionUser] of sessions.entries()) {
    if (String(sessionUser.id) === String(userId)) {
      const merged = { ...sessionUser, ...updatedUserData };
      sessions.set(token, merged);
      if (pool) {
        pool
          .query(
            "UPDATE user_sessions SET user_data = $1 WHERE session_token = $2",
            [JSON.stringify(merged), token],
          )
          .catch(() => {});
      }
    }
  }
}

async function invalidateSessionsForUser(userId) {
  for (const [token, sessionUser] of sessions.entries()) {
    if (String(sessionUser.id) === String(userId)) {
      sessions.delete(token);
    }
  }
  if (pool) {
    try {
      await pool.query("DELETE FROM user_sessions WHERE user_id = $1", [
        userId,
      ]);
    } catch (e) {
      console.warn("Error invalidating DB sessions:", e.message);
    }
  }
}

function isRequestSecure(req) {
  if (!req) {
    return process.env.NODE_ENV === "production";
  }
  const host = String(
    req.headers["x-forwarded-host"] || req.headers.host || req.hostname || "",
  ).toLowerCase();
  const isLocalhost =
    host.includes("localhost") ||
    host.includes("127.0.0.1") ||
    host.includes("::1");
  if (isLocalhost) return false;

  return (
    req.secure === true ||
    req.protocol === "https" ||
    String(req.headers["x-forwarded-proto"] || "").toLowerCase() === "https" ||
    process.env.NODE_ENV === "production"
  );
}

function setSessionCookies(res, token, req = null) {
  if (!res || !res.cookie) return;
  const isSecure = isRequestSecure(req);
  const cookieOptions = {
    secure: isSecure,
    sameSite: "lax",
    path: "/",
    maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  };

  // 1. Primary HttpOnly auth session cookie
  res.cookie("campus_session", token, {
    ...cookieOptions,
    httpOnly: true,
  });

  // 2. Client-accessible companion cookie (visible in DevTools document.cookie & Inspect)
  res.cookie("campus_logged_in", "true", {
    ...cookieOptions,
    httpOnly: false,
  });
}

function clearSessionCookies(res, req = null) {
  if (!res || !res.clearCookie) return;
  const isSecure = isRequestSecure(req);
  const clearOptions = {
    path: "/",
    sameSite: "lax",
    secure: isSecure,
  };
  res.clearCookie("campus_session", {
    ...clearOptions,
    httpOnly: true,
  });
  res.clearCookie("campus_logged_in", {
    ...clearOptions,
    httpOnly: false,
  });
}

async function startSession(user, res = null, req = null) {
  const token = crypto.randomBytes(32).toString("hex");
  const userData = safeUser(user);
  sessions.set(token, userData);

  if (pool) {
    try {
      await pool.query(
        `INSERT INTO user_sessions (session_token, user_id, user_data, created_at, expires_at)
         VALUES ($1, $2, $3, now(), now() + INTERVAL '7 days')`,
        [token, user.user_id || user.id, JSON.stringify(userData)],
      );
    } catch (e) {
      console.warn("Error persisting session to DB:", e.message);
    }
  }

  if (res && res.cookie) {
    setSessionCookies(res, token, req);
  }

  return { token, user: userData };
}
async function findUser(emailOrUsername) {
  const clean = String(emailOrUsername || "").trim();
  const result = await pool.query(
    `SELECT user_id, username, name, email, password_hash, role, is_active,
            contact_number, default_anonymous, default_hide_phone,
            theme_preference, created_at, updated_at
     FROM users
     WHERE LOWER(email) = LOWER($1) OR LOWER(username) = LOWER($1)`,
    [clean],
  );
  return result.rows[0];
}
async function findUserById(userId) {
  const result = await pool.query(
    `SELECT user_id, username, name, email, password_hash, role, is_active,
            contact_number, default_anonymous, default_hide_phone,
            theme_preference, created_at, updated_at
     FROM users
     WHERE user_id = $1`,
    [userId],
  );
  return result.rows[0];
}

app.get(
  "/api/health",
  asyncRoute(async (req, res) => {
    if (!pool) return res.json({ status: "ok", database: "not configured" });
    await pool.query("SELECT 1");
    res.json({ status: "ok", database: "connected" });
  }),
);

app.use(
  "/api/locations",
  createLocationsRouter({ pool, asyncRoute, requireDatabase }),
);
app.use("/api/maps", createMapsRouter({ pool, asyncRoute, requireDatabase }));
app.use(
  "/api/admin/audit-logs",
  createAdminAuditRouter({
    pool,
    asyncRoute,
    requireDatabase,
    requireAuth,
    requireRole,
  }),
);
app.use(
  "/api/admin/maps",
  createAdminMapsRouter({
    pool,
    asyncRoute,
    requireDatabase,
    requireAuth,
    requireRole,
  }),
);
app.use(
  "/api/admin",
  createAdminLocationsRouter({
    pool,
    asyncRoute,
    requireDatabase,
    requireAuth,
    requireRole,
  }),
);

app.use(
  "/api/campus",
  createCampusLogoRouter({
    pool,
    asyncRoute,
    requireDatabase,
    requireAuth,
    requireRole,
  }),
);
app.use(
  "/api",
  createCampusLogoRouter({
    pool,
    asyncRoute,
    requireDatabase,
    requireAuth,
    requireRole,
  }),
);
app.use(
  "/api/profile",
  createProfileRouter({
    pool,
    asyncRoute,
    requireDatabase,
    requireAuth,
    safeUser,
    verifyPassword,
    hashPassword,
    updateSessionsForUser,
    invalidateSessionsForUser,
  }),
);

app.post(
  "/api/auth/register",
  authRateLimiter,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const {
      name,
      email,
      password,
      accountType = "client",
      setupToken = "",
    } = req.body;
    const nameVal = validateName(name);
    if (!nameVal.valid) {
      return res.status(400).json({ error: nameVal.error });
    }

    const emailVal = validateSchoolEmail(email, { requireSchoolDomain: true });
    if (!emailVal.valid) {
      return res.status(400).json({ error: emailVal.error });
    }

    const passVal = validatePassword(password);
    if (!passVal.valid) {
      return res.status(400).json({ error: passVal.error });
    }

    if (!["client", "admin"].includes(accountType))
      return res.status(400).json({ error: "Choose Client or Administrator." });
    if (
      accountType === "admin" &&
      (!adminSetupToken || setupToken !== adminSetupToken)
    )
      return res.status(403).json({
        error:
          "Administrator registration requires a valid setup authorization.",
      });

    const normalizedEmail = emailVal.formatted;
    const formattedName = nameVal.formatted;
    try {
      const role = accountType === "admin" ? "admin" : "student";
      let baseUsername = normalizedEmail.split("@")[0].replace(/[^a-zA-Z0-9_-]/g, "").slice(0, 45) || "user";
      let username = baseUsername;
      const existingUser = await pool.query("SELECT 1 FROM users WHERE LOWER(username) = LOWER($1)", [username]);
      if (existingUser.rows.length > 0) {
        username = `${baseUsername}_${Math.floor(1000 + Math.random() * 9000)}`;
      }

      const result = await pool.query(
        "INSERT INTO users (name, email, username, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, name, email, username, password_hash, role",
        [formattedName, normalizedEmail, username, hashPassword(password), role],
      );
      res.status(201).json(await startSession(result.rows[0], res, req));
    } catch (error) {
      if (error.code === "23505") {
        if (error.constraint === "users_username_unique") {
          return res.status(409).json({ error: "That username is already taken." });
        }
        return res
          .status(409)
          .json({ error: "That email already has an account." });
      }
      throw error;
    }
  }),
);

app.post(
  "/api/auth/login",
  authRateLimiter,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const emailOrUsername = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const user = await findUser(emailOrUsername);
    if (!user || !verifyPassword(req.body.password || "", user.password_hash)) {
      await logFailure(pool, {
        actor: { username: emailOrUsername || "anonymous" },
        action: "LOGIN",
        entityType: "auth",
        description: `Failed login attempt with identifier "${emailOrUsername}"`,
        error: "Email or password does not match.",
        req,
      });
      return res
        .status(401)
        .json({ error: "Email or password does not match." });
    }

    if (user.is_active === false) {
      await logFailure(pool, {
        actor: { username: emailOrUsername || "anonymous" },
        action: "LOGIN",
        entityType: "auth",
        description: `Login blocked for deactivated account "${emailOrUsername}"`,
        error: "This account has been deactivated. Please contact an administrator.",
        req,
      });
      return res
        .status(403)
        .json({ error: "This account has been deactivated. Please contact an administrator." });
    }

    const session = await startSession(user, res, req);
    await logAuthEvent(pool, {
      actor: session.user,
      action: "LOGIN",
      description: `User "${session.user.name}" (${session.user.username}) signed in successfully`,
      req,
    });
    res.json(session);
  }),
);

app.post(
  "/api/auth/forgot-password",
  authRateLimiter,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const email = String(req.body.email || "")
      .trim()
      .toLowerCase();
    const user = await findUser(email);
    if (!user) {
      if (process.env.NODE_ENV !== "production") {
        return res.status(404).json({
          error: `No registered account found with email "${email}". Please verify your email or sign up first.`,
        });
      }
      return res.json({
        message: "If that account exists, password reset instructions have been dispatched.",
      });
    }

    const resetToken = crypto.randomBytes(32).toString("hex");
    const tokenHash = crypto
      .createHash("sha256")
      .update(resetToken)
      .digest("hex");
    await pool.query(
      "UPDATE users SET password_reset_token_hash = $1, password_reset_expires_at = now() + interval '15 minutes' WHERE user_id = $2",
      [tokenHash, user.user_id],
    );

    // Send password reset email
    const appUrl = req.headers.origin || req.headers.referer;
    const mailResult = await sendPasswordResetEmail({
      to: user.email,
      name: user.name,
      resetToken,
      appUrl,
    }).catch((err) => {
      console.error("[Mailer Error]:", err);
      return { success: false, error: err.message };
    });

    const isSimulated = Boolean(mailResult?.simulated);
    const mailerErrorMessage = mailResult?.error || null;
    const response = {
      message: mailResult?.success
        ? `Password reset instructions have been sent to ${user.email}. Please check your inbox and spam folder.`
        : mailerErrorMessage
          ? `Notice: ${mailerErrorMessage} (A local test token has been generated and auto-filled below).`
          : "Password reset token generated. (Email provider not configured in .env, so the token was auto-filled below for local testing).",
      emailSent: Boolean(mailResult?.success),
      simulated: isSimulated,
      provider: mailResult?.provider || "none",
      mailerError: mailerErrorMessage,
    };

    if (process.env.NODE_ENV !== "production") {
      response.resetToken = resetToken;
      response.resetLink = `${appUrl || "http://localhost:3000"}/?resetToken=${encodeURIComponent(resetToken)}`;
    }
    res.json(response);
  }),
);

app.post(
  "/api/auth/reset-password",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const { token, password } = req.body;
    if (!token || typeof token !== "string" || !token.trim()) {
      return res.status(400).json({
        error: "A valid security reset token is required.",
      });
    }
    const passVal = validatePassword(password);
    if (!passVal.valid) {
      return res.status(400).json({ error: passVal.error });
    }
    const tokenHash = crypto.createHash("sha256").update(token).digest("hex");
    const result = await pool.query(
      "UPDATE users SET password_hash = $1, password_reset_token_hash = NULL, password_reset_expires_at = NULL WHERE password_reset_token_hash = $2 AND password_reset_expires_at > now() RETURNING user_id",
      [hashPassword(password), tokenHash],
    );
    if (!result.rows[0])
      return res
        .status(400)
        .json({ error: "That reset token is invalid or expired." });
    for (const [sessionToken, sessionUser] of sessions) {
      if (sessionUser.id === result.rows[0].user_id)
        sessions.delete(sessionToken);
    }
    if (pool) {
      pool.query("DELETE FROM user_sessions WHERE user_id = $1", [result.rows[0].user_id]).catch(() => {});
    }
    res.json({ message: "Password reset successfully. You can sign in now." });
  }),
);

app.post(
  "/api/auth/logout",
  asyncRoute(async (req, res) => {
    const token = tokenFrom(req);
    const user = token ? await getSession(token) : null;
    if (user) {
      await logAuthEvent(pool, {
        actor: user,
        action: "LOGOUT",
        description: `User "${user.name}" (${user.username}) signed out`,
        req,
      });
    }
    if (token) {
      sessions.delete(token);
      if (pool) {
        pool.query("DELETE FROM user_sessions WHERE session_token = $1", [token]).catch(() => {});
      }
    }
    clearSessionCookies(res, req);
    res.status(204).end();
  }),
);
app.get(
  "/api/auth/me",
  requireDatabase,
  requireAuth,
  asyncRoute(async (req, res) => {
    const userRow = await findUserById(req.user.id);
    if (!userRow) {
      sessions.delete(tokenFrom(req));
      return res.status(401).json({ error: "User no longer exists." });
    }
    const fresh = safeUser(userRow);
    const token = tokenFrom(req);
    sessions.set(token, fresh);
    // Refresh/sync session cookies so Inspect always reflects active session
    setSessionCookies(res, token, req);
    res.json({ user: fresh });
  }),
);

app.get(
  "/api/categories",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      "SELECT category_id AS id, category_name AS name FROM categories ORDER BY category_name ASC",
    );
    res.json(result.rows);
  }),
);

app.get(
  "/api/items",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const values = [];
    const where = [];

    // 1. Multi-token Search across multiple fields (Item 7)
    if (req.query.search) {
      const rawSearch = String(req.query.search).trim();
      if (rawSearch) {
        // Split by whitespace to support multi-term searches (e.g. "laptop scanlon blue")
        const tokens = rawSearch.split(/\s+/).filter(Boolean);
        for (const token of tokens) {
          values.push(`%${token}%`);
          const idx = values.length;
          where.push(`(
            i.title ILIKE $${idx} OR
            i.description ILIKE $${idx} OR
            c.category_name ILIKE $${idx} OR
            b.name ILIKE $${idx} OR
            r.name ILIKE $${idx} OR
            i.location_description ILIKE $${idx} OR
            i.location_snapshot->>'buildingName' ILIKE $${idx} OR
            i.location_snapshot->>'roomName' ILIKE $${idx}
          )`);
        }
      }
    }

    // 2. Type Filter
    if (["lost", "found"].includes(req.query.type)) {
      values.push(req.query.type);
      where.push(`i.item_type = $${values.length}`);
    }

    // 3. Status Filter
    if (req.query.status && req.query.status !== "all") {
      values.push(req.query.status);
      where.push(`i.status = $${values.length}`);
    }

    // 4. Category Filter (Item 7)
    if (req.query.category && req.query.category !== "all") {
      values.push(String(req.query.category).trim());
      where.push(`LOWER(c.category_name) = LOWER($${values.length})`);
    }

    // 5. Date Range Filters (Item 7)
    const startDate = req.query.startDate || req.query.dateFrom;
    if (startDate && !isNaN(Date.parse(startDate))) {
      values.push(startDate);
      where.push(`i.date_reported >= $${values.length}::date`);
    }

    const endDate = req.query.endDate || req.query.dateTo;
    if (endDate && !isNaN(Date.parse(endDate))) {
      values.push(endDate);
      where.push(`i.date_reported <= $${values.length}::date`);
    }

    // 6. Building Filter
    if (req.query.building && req.query.building !== "all") {
      values.push(String(req.query.building).trim());
      where.push(`(LOWER(b.name) = LOWER($${values.length}) OR LOWER(i.location_snapshot->>'buildingName') = LOWER($${values.length}))`);
    }

    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    // 7. Dynamic Sorting (Item 7)
    let orderBySql = "ORDER BY i.date_reported DESC, i.created_at DESC";
    if (req.query.sort === "oldest") {
      orderBySql = "ORDER BY i.date_reported ASC, i.created_at ASC";
    } else if (req.query.sort === "title_asc") {
      orderBySql = "ORDER BY LOWER(i.title) ASC, i.created_at DESC";
    } else if (req.query.sort === "title_desc") {
      orderBySql = "ORDER BY LOWER(i.title) DESC, i.created_at DESC";
    }

    // 8. Pagination (Item 6)
    const page = Math.max(1, parseInt(req.query.page, 10) || 1);
    const limit = Math.min(100, Math.max(1, parseInt(req.query.limit, 10) || 12));
    const offset = (page - 1) * limit;

    // Count query with same filter conditions
    const countResult = await pool.query(
      `SELECT COUNT(*)::int AS total FROM items i ${itemLocationJoins} ${whereSql}`,
      values,
    );
    const total = countResult.rows[0]?.total || 0;
    const totalPages = Math.max(1, Math.ceil(total / limit));

    // Items query with pagination limit & offset
    values.push(limit);
    const limitIdx = values.length;
    values.push(offset);
    const offsetIdx = values.length;

    const result = await pool.query(
      `SELECT ${publicItemFields} FROM items i ${itemLocationJoins} ${whereSql} ${orderBySql} LIMIT $${limitIdx} OFFSET $${offsetIdx}`,
      values,
    );

    const paginationData = {
      total,
      page,
      limit,
      totalPages,
      hasNext: page < totalPages,
      hasPrev: page > 1,
    };

    res.set("X-Total-Count", String(total));
    res.set("X-Total-Pages", String(totalPages));
    res.set("X-Current-Page", String(page));

    // If caller explicitly requested format=array for legacy test scripts
    if (req.query.format === "array") {
      return res.json(result.rows);
    }

    res.json({
      items: result.rows,
      pagination: paginationData,
    });
  }),
);

app.get(
  "/api/items/:itemId",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT ${publicItemFields} FROM items i ${itemLocationJoins} WHERE i.item_id = $1`,
      [req.params.itemId],
    );
    if (!result.rows[0]) {
      return res.status(404).json({ error: "Report not found." });
    }
    res.json(result.rows[0]);
  }),
);

app.get(
  "/api/items/:itemId/similar",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const targetQuery = await pool.query(
      `SELECT ${publicItemFields}
       FROM items i
       ${itemLocationJoins}
       WHERE i.item_id = $1`,
      [req.params.itemId],
    );

    if (!targetQuery.rows.length) {
      return res.status(404).json({ error: "Item not found." });
    }

    const target = targetQuery.rows[0];
    const oppositeType = target.type === "found" ? "lost" : "found";

    const candidates = await pool.query(
      `SELECT ${publicItemFields}
       FROM items i
       ${itemLocationJoins}
       WHERE i.item_type = $1
         AND i.item_id != $2
         AND i.status IN ('reported', 'under_review', 'found')
         AND (
           (i.item_type = 'found' AND i.matched_lost_id IS NULL) OR
           (i.item_type = 'lost' AND i.matched_found_id IS NULL)
         )
       ORDER BY i.created_at DESC
       LIMIT 60`,
      [oppositeType, target.id],
    );

    const scored = candidates.rows
      .map((cand) => {
        const lostObj = target.type === "lost" ? target : cand;
        const foundObj = target.type === "found" ? target : cand;
        const match = calculateMatchScore(lostObj, foundObj);
        return {
          ...cand,
          item: cand,
          score: match.score,
          confidence: match.confidence,
          reasons: match.reasons,
        };
      })
      .filter((s) => s.score >= 30)
      .sort((a, b) => b.score - a.score)
      .slice(0, 4);

    res.json(scored);
  }),
);

app.get(
  "/api/stats",
  requireDatabase,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      "SELECT COUNT(*)::int AS \"lostCount\" FROM items WHERE item_type = 'lost' AND status = 'reported'",
    );
    res.json(result.rows[0]);
  }),
);

app.post(
  "/api/items",
  requireDatabase,
  requireAuth,
  asyncRoute(async (req, res) => {
    const {
      title,
      description,
      category = "Campus report",
      locationDescription,
      building: legacyBuilding,
      floor: legacyFloor,
      room: legacyRoom,
      location: legacyLocation,
      reporterName,
      contactPhone,
      isAnonymous = false,
      hidePhone = true,
      mapId,
      mapX,
      mapY,
      image,
    } = req.body;

    const itemType = req.body.itemType || req.body.type;
    const dateReported = req.body.dateReported || req.body.date;
    const buildingId = req.body.buildingId || req.body.building_id;
    const floorId = req.body.floorId || req.body.floor_id;
    const roomId = req.body.roomId || req.body.room_id;

    if (
      !itemType ||
      !["lost", "found"].includes(itemType) ||
      !title?.trim() ||
      !description?.trim() ||
      !dateReported
    ) {
      return res.status(400).json({
        error: "Report type, title, description, and date are required.",
      });
    }

    // 1. Resolve & Validate Building
    let resolvedBuilding = null;
    if (buildingId) {
      const bRes = await pool.query(
        "SELECT building_id, name, is_active, is_archived FROM buildings WHERE building_id = $1",
        [buildingId],
      );
      if (
        !bRes.rows.length ||
        bRes.rows[0].is_archived ||
        !bRes.rows[0].is_active
      ) {
        return res.status(400).json({
          error:
            "The selected building is not active or available. Please refresh and select an active building.",
        });
      }
      resolvedBuilding = bRes.rows[0];
    } else if (legacyBuilding) {
      const bRes = await pool.query(
        "SELECT building_id, name, is_active, is_archived FROM buildings WHERE LOWER(TRIM(name)) = LOWER(TRIM($1)) AND is_archived = false",
        [legacyBuilding],
      );
      if (bRes.rows.length && bRes.rows[0].is_active) {
        resolvedBuilding = bRes.rows[0];
      }
    }

    if (!resolvedBuilding && !legacyLocation) {
      return res
        .status(400)
        .json({ error: "Please select a valid building or campus location." });
    }

    // 2. Resolve & Validate Floor (Optional, e.g. for whole building or outdoor areas)
    let resolvedFloor = null;
    if (floorId) {
      const fRes = await pool.query(
        "SELECT floor_id, building_id, name, is_active, is_archived FROM floors WHERE floor_id = $1",
        [floorId],
      );
      if (
        !fRes.rows.length ||
        fRes.rows[0].is_archived ||
        !fRes.rows[0].is_active
      ) {
        return res.status(400).json({
          error:
            "The selected floor is not active or available. Please reselect a valid floor.",
        });
      }
      if (
        resolvedBuilding &&
        fRes.rows[0].building_id !== resolvedBuilding.building_id
      ) {
        return res.status(400).json({
          error: "The selected floor does not belong to the selected building.",
        });
      }
      resolvedFloor = fRes.rows[0];
    } else if (legacyFloor && resolvedBuilding) {
      const fRes = await pool.query(
        "SELECT floor_id, building_id, name, is_active, is_archived FROM floors WHERE building_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND is_archived = false",
        [resolvedBuilding.building_id, legacyFloor],
      );
      if (fRes.rows.length && fRes.rows[0].is_active) {
        resolvedFloor = fRes.rows[0];
      }
    }

    // 3. Resolve & Validate Room (Optional, e.g. hallways, outdoor areas)
    let resolvedRoom = null;
    if (roomId) {
      const rRes = await pool.query(
        "SELECT room_id, floor_id, name, is_active, is_archived FROM rooms WHERE room_id = $1",
        [roomId],
      );
      if (
        !rRes.rows.length ||
        rRes.rows[0].is_archived ||
        !rRes.rows[0].is_active
      ) {
        return res.status(400).json({
          error:
            "The selected room is not active or available. Please reselect a valid room.",
        });
      }
      if (!resolvedFloor || rRes.rows[0].floor_id !== resolvedFloor.floor_id) {
        return res.status(400).json({
          error: "The selected room does not belong to the selected floor.",
        });
      }
      resolvedRoom = rRes.rows[0];
    } else if (legacyRoom && resolvedFloor) {
      const rRes = await pool.query(
        "SELECT room_id, floor_id, name, is_active, is_archived FROM rooms WHERE floor_id = $1 AND LOWER(TRIM(name)) = LOWER(TRIM($2)) AND is_archived = false",
        [resolvedFloor.floor_id, legacyRoom],
      );
      if (rRes.rows.length && rRes.rows[0].is_active) {
        resolvedRoom = rRes.rows[0];
      }
    }

    // 4. Validate Active Map & Coordinates
    const activeMapRes = await pool.query(
      "SELECT map_id, name, image_path FROM campus_maps WHERE is_active = true AND is_archived = false LIMIT 1",
    );
    const activeMap = activeMapRes.rows[0] || null;

    const hasPin =
      mapX !== undefined &&
      mapX !== null &&
      mapX !== "" &&
      mapY !== undefined &&
      mapY !== null &&
      mapY !== "";

    let resolvedMapId = null;
    let resolvedMapName = null;
    let resolvedMapVersion = null;

    if (hasPin) {
      if (mapId) {
        const mRes = await pool.query(
          "SELECT map_id, name, version_number FROM campus_maps WHERE map_id = $1",
          [mapId],
        );
        if (mRes.rows.length) {
          resolvedMapId = mRes.rows[0].map_id;
          resolvedMapName = mRes.rows[0].name;
          resolvedMapVersion = mRes.rows[0].version_number;
        }
      }
      if (!resolvedMapId && activeMap) {
        resolvedMapId = activeMap.map_id;
        resolvedMapName = activeMap.name;
        resolvedMapVersion = activeMap.version_number;
      }
    }

    if (image && !isValidImageDataUri(image)) {
      return res.status(400).json({
        error: "Invalid image format. Supported formats: JPEG, PNG, WebP, GIF.",
      });
    }

    if (itemType === "found") {
      if (!reporterName || !contactPhone || !image) {
        return res.status(400).json({
          error:
            "Found reports require finder name, contact phone, and item photo.",
        });
      }
      // If an active campus map exists, require placing a pin on it
      if (activeMap && !hasPin) {
        return res.status(400).json({
          error:
            "Found reports require a map pin pinpointing where the item was found.",
        });
      }
    }

    const locationSnapshot = {
      buildingName: resolvedBuilding?.name || legacyBuilding || null,
      floorName: resolvedFloor?.name || legacyFloor || null,
      roomName: resolvedRoom?.name || legacyRoom || null,
      locationDescription: (locationDescription || "").trim() || null,
      mapName: resolvedMapName || (hasPin ? "Campus Map" : null),
      mapVersion: resolvedMapVersion || null,
    };

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setAuditContext(client, req.user, req);
      const categoryResult = await client.query(
        "INSERT INTO categories (category_name) VALUES ($1) ON CONFLICT (category_name) DO UPDATE SET category_name = EXCLUDED.category_name RETURNING category_id",
        [category],
      );

      // Maintain legacy location record for backwards compatibility
      const legacyLocName =
        resolvedRoom?.name ||
        locationDescription?.trim() ||
        legacyRoom ||
        legacyLocation ||
        resolvedBuilding?.name ||
        "Campus Area";
      const legacyBuildingName =
        resolvedBuilding?.name || legacyBuilding || "Campus Area";
      const legacyFloorName =
        resolvedFloor?.name || legacyFloor || "All floors";

      const locationResult = await client.query(
        "INSERT INTO locations (location_name, building, floor) VALUES ($1, $2, $3) ON CONFLICT (building, location_name, floor) DO UPDATE SET floor = EXCLUDED.floor RETURNING location_id",
        [legacyLocName, legacyBuildingName, legacyFloorName],
      );

      const item = await client.query(
        `INSERT INTO items (
           reporter_id, category_id, location_id,
           building_id, floor_id, room_id, map_id,
           location_description, location_snapshot,
           item_type, title, description, date_reported,
           reporter_name, contact_phone, is_anonymous, hide_phone,
           map_x, map_y
         ) VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15, $16, $17, $18, $19)
         RETURNING item_id`,
        [
          req.user.id,
          categoryResult.rows[0].category_id,
          locationResult.rows[0].location_id,
          resolvedBuilding?.building_id || null,
          resolvedFloor?.floor_id || null,
          resolvedRoom?.room_id || null,
          resolvedMapId,
          (locationDescription || "").trim() || null,
          JSON.stringify(locationSnapshot),
          itemType,
          title.trim(),
          description.trim(),
          dateReported,
          reporterName || req.user.name,
          contactPhone || null,
          Boolean(isAnonymous),
          hidePhone !== false,
          hasPin ? mapX : null,
          hasPin ? mapY : null,
        ],
      );

      if (image) {
        await client.query(
          "INSERT INTO item_images (item_id, image_path) VALUES ($1, $2)",
          [item.rows[0].item_id, image],
        );
      }

      await logCreate(client, {
        actor: req.user,
        entityType: "items",
        entityId: item.rows[0].item_id,
        description: `${req.user.name} reported ${itemType} item: "${title.trim()}"`,
        newValues: {
          itemId: item.rows[0].item_id,
          itemType,
          title: title.trim(),
          description: description.trim(),
          dateReported,
          category,
          status: "reported",
          reporterName: reporterName || req.user.name,
          isAnonymous: Boolean(isAnonymous),
          locationSnapshot,
        },
        req,
      });

      // Automatic Match Alerts (Item 4)
      const newItemId = item.rows[0].item_id;
      const targetOppositeType = itemType === "found" ? "lost" : "found";
      const candidateReports = await client.query(
        `SELECT i.item_id, i.reporter_id, i.title, i.description, i.date_reported,
                c.category_name AS category,
                COALESCE(b.name, i.location_snapshot->>'buildingName') AS building,
                COALESCE(r.name, i.location_description, i.location_snapshot->>'roomName') AS location,
                u.email AS reporter_email, u.name AS reporter_name
         FROM items i
         JOIN categories c ON c.category_id = i.category_id
         LEFT JOIN buildings b ON b.building_id = i.building_id
         LEFT JOIN rooms r ON r.room_id = i.room_id
         LEFT JOIN users u ON u.user_id = i.reporter_id
         WHERE i.item_type = $1 AND i.status IN ('reported', 'under_review') AND i.reporter_id IS NOT NULL`,
        [targetOppositeType],
      );

      const currentReportForScoring = {
        title: title.trim(),
        description: description.trim(),
        category,
        building: resolvedBuilding?.name || legacyBuilding || null,
        room: resolvedRoom?.name || legacyRoom || null,
        date: dateReported,
      };

      for (const candidate of candidateReports.rows) {
        const candidateForScoring = {
          title: candidate.title,
          description: candidate.description,
          category: candidate.category,
          building: candidate.building,
          room: candidate.location,
          date: candidate.date_reported,
        };

        const lostObj = itemType === "found" ? candidateForScoring : currentReportForScoring;
        const foundObj = itemType === "found" ? currentReportForScoring : candidateForScoring;
        const matchResult = calculateMatchScore(lostObj, foundObj);

        if (matchResult.score >= 60) {
          if (itemType === "found") {
            // Found item reported -> Alert the student who reported the lost item!
            await createNotification(client, {
              userId: candidate.reporter_id,
              title: `Potential Match Detected! (${matchResult.score}%)`,
              message: `A found item "${title.trim()}" strongly matches your lost report "${candidate.title}".`,
              type: "match_alert",
              link: `/?item=${newItemId}`,
              itemId: newItemId,
            });

            // Also dispatch email alert to the lost item reporter!
            if (candidate.reporter_email) {
              const appUrl = req.headers.origin || req.headers.referer;
              sendItemMatchedEmail({
                to: candidate.reporter_email,
                name: candidate.reporter_name || "Campus Reporter",
                lostTitle: candidate.title,
                foundTitle: title.trim(),
                itemId: newItemId,
                appUrl,
              }).catch((err) => console.error("[Mailer Error]:", err));
            }
          } else {
            // Lost item reported -> Alert the reporter that a matching item was already found!
            await createNotification(client, {
              userId: req.user.id,
              title: `Possible Match Found! (${matchResult.score}%)`,
              message: `An item matching your description ("${candidate.title}") was already handed in! Check it on the dashboard.`,
              type: "match_alert",
              link: `/?item=${candidate.item_id}`,
              itemId: candidate.item_id,
            });

            if (req.user.email) {
              const appUrl = req.headers.origin || req.headers.referer;
              sendItemMatchedEmail({
                to: req.user.email,
                name: req.user.name || "Campus Reporter",
                lostTitle: title.trim(),
                foundTitle: candidate.title,
                itemId: candidate.item_id,
                appUrl,
              }).catch((err) => console.error("[Mailer Error]:", err));
            }
          }
        }
      }

      await client.query("COMMIT");
      res.status(201).json({ id: item.rows[0].item_id });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

// Deliberately update a report's location and map coordinates
app.patch(
  "/api/items/:itemId/location",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const { buildingId, floorId, roomId, locationDescription, mapX, mapY } =
      req.body;
    const itemQuery = await pool.query(
      "SELECT item_id, reporter_id FROM items WHERE item_id = $1",
      [req.params.itemId],
    );
    if (!itemQuery.rows.length) {
      return res.status(404).json({ error: "Item not found." });
    }
    const item = itemQuery.rows[0];
    if (
      item.reporter_id !== req.user.id &&
      !["staff", "admin"].includes(req.user.role)
    ) {
      return res
        .status(403)
        .json({ error: "Not authorized to update this item's location." });
    }

    let bName = null;
    let fName = null;
    let rName = null;

    if (buildingId) {
      const bRes = await pool.query(
        "SELECT name FROM buildings WHERE building_id = $1",
        [buildingId],
      );
      if (bRes.rows.length) bName = bRes.rows[0].name;
    }
    if (floorId) {
      const fRes = await pool.query(
        "SELECT name FROM floors WHERE floor_id = $1",
        [floorId],
      );
      if (fRes.rows.length) fName = fRes.rows[0].name;
    }
    if (roomId) {
      const rRes = await pool.query(
        "SELECT name FROM rooms WHERE room_id = $1",
        [roomId],
      );
      if (rRes.rows.length) rName = rRes.rows[0].name;
    }

    const hasPin =
      mapX !== undefined &&
      mapX !== null &&
      mapX !== "" &&
      mapY !== undefined &&
      mapY !== null &&
      mapY !== "";

    let mapId = null;
    let mapName = null;
    if (hasPin) {
      const activeMap = await pool.query(
        "SELECT map_id, name FROM campus_maps WHERE is_active = true AND is_archived = false LIMIT 1",
      );
      if (activeMap.rows.length) {
        mapId = activeMap.rows[0].map_id;
        mapName = activeMap.rows[0].name;
      }
    }

    const oldItemRes = await pool.query(
      "SELECT item_id, building_id, floor_id, room_id, location_description, map_id, map_x, map_y, location_snapshot FROM items WHERE item_id = $1",
      [req.params.itemId],
    );
    const oldItem = oldItemRes.rows[0];

    const snapshot = {
      buildingName: bName,
      floorName: fName,
      roomName: rName,
      locationDescription: (locationDescription || "").trim() || null,
      mapName,
    };

    await pool.query(
      `UPDATE items
       SET building_id = $1, floor_id = $2, room_id = $3,
           location_description = $4, map_id = $5,
           map_x = $6, map_y = $7, location_snapshot = $8,
           updated_at = now()
       WHERE item_id = $9`,
      [
        buildingId || null,
        floorId || null,
        roomId || null,
        (locationDescription || "").trim() || null,
        mapId,
        hasPin ? mapX : null,
        hasPin ? mapY : null,
        JSON.stringify(snapshot),
        req.params.itemId,
      ],
    );

    await logUpdate(pool, {
      actor: req.user,
      entityType: "items",
      entityId: req.params.itemId,
      description: `Updated location for item #${req.params.itemId}`,
      oldValues: oldItem,
      newValues: {
        buildingId: buildingId || null,
        floorId: floorId || null,
        roomId: roomId || null,
        locationDescription: (locationDescription || "").trim() || null,
        mapId,
        mapX: hasPin ? mapX : null,
        mapY: hasPin ? mapY : null,
        locationSnapshot: snapshot,
      },
      req,
    });

    res.json({ success: true });
  }),
);

app.get(
  "/api/my/reports",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT ${publicItemFields},
              CASE WHEN i.reporter_id = $1 THEN i.reporter_name ELSE (CASE WHEN i.is_anonymous THEN 'Anonymous' ELSE i.reporter_name END) END AS "privateReporterName",
              CASE WHEN i.reporter_id = $1 THEN i.contact_phone ELSE (CASE WHEN i.hide_phone THEN NULL ELSE i.contact_phone END) END AS "contactPhone",
              i.is_anonymous AS "isAnonymous",
              i.hide_phone AS "hidePhone",
              COALESCE(
                json_agg(
                  json_build_object(
                    'id', cl.claim_id,
                    'status', cl.status,
                    'claimDate', cl.claim_date,
                    'reviewedAt', cl.reviewed_at,
                    'rejectionReason', cl.rejection_reason,
                    'itemId', cl.item_id,
                    'messageCount', (SELECT COUNT(*)::int FROM claim_messages WHERE claim_id = cl.claim_id),
                    'proofCount', (SELECT COUNT(*)::int FROM ownership_proofs WHERE claim_id = cl.claim_id)
                  )
                ) FILTER (WHERE cl.claim_id IS NOT NULL),
                '[]'
              ) AS claims
       FROM items i
       ${itemLocationJoins}
       LEFT JOIN claims cl ON (cl.item_id = i.item_id OR cl.item_id = i.matched_found_id) AND cl.claimant_id = $1
       WHERE i.reporter_id = $1 OR i.item_id IN (SELECT item_id FROM claims WHERE claimant_id = $1)
       GROUP BY i.item_id, c.category_name, b.name, f.name, r.name, m.image_path, m.name, l.building, l.location_name, l.floor
       ORDER BY i.created_at DESC`,
      [req.user.id],
    );
    res.json(result.rows);
  }),
);


// ==========================================
// In-App Notifications API (Item 3 & 4)
// ==========================================
app.get(
  "/api/notifications",
  requireDatabase,
  requireAuth,
  asyncRoute(async (req, res) => {
    const unreadRes = await pool.query(
      "SELECT COUNT(*)::int AS count FROM notifications WHERE user_id = $1 AND is_read = false",
      [req.user.id],
    );
    const result = await pool.query(
      `SELECT notification_id AS id, title, message, type, link,
              item_id AS "itemId", is_read AS "isRead", created_at AS "createdAt"
       FROM notifications
       WHERE user_id = $1
       ORDER BY created_at DESC
       LIMIT 50`,
      [req.user.id],
    );
    res.json({
      notifications: result.rows,
      unreadCount: unreadRes.rows[0]?.count || 0,
    });
  }),
);

app.patch(
  "/api/notifications/:id/read",
  requireDatabase,
  requireAuth,
  asyncRoute(async (req, res) => {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE notification_id = $1 AND user_id = $2",
      [req.params.id, req.user.id],
    );
    res.json({ success: true });
  }),
);

app.post(
  "/api/notifications/read-all",
  requireDatabase,
  requireAuth,
  asyncRoute(async (req, res) => {
    await pool.query(
      "UPDATE notifications SET is_read = true WHERE user_id = $1 AND is_read = false",
      [req.user.id],
    );
    res.json({ success: true });
  }),
);

app.delete(
  "/api/notifications/:id",
  requireDatabase,
  requireAuth,
  asyncRoute(async (req, res) => {
    await pool.query(
      "DELETE FROM notifications WHERE notification_id = $1 AND user_id = $2",
      [req.params.id, req.user.id],
    );
    res.status(204).end();
  }),
);

app.post(
  "/api/items/:itemId/claims",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const item = await pool.query(
      "SELECT item_id, item_type, matched_lost_id, status FROM items WHERE item_id = $1",
      [req.params.itemId],
    );
    const found = item.rows[0];
    if (!found || found.item_type !== "found")
      return res.status(404).json({ error: "Found report not found." });
    if (!found.matched_lost_id)
      return res.status(403).json({
        error:
          "You did not submit the lost report associated with this item, so you are not eligible to claim it.",
      });
    const owner = await pool.query(
      "SELECT reporter_id FROM items WHERE item_id = $1",
      [found.matched_lost_id],
    );
    if (!owner.rows[0] || owner.rows[0].reporter_id !== req.user.id)
      return res.status(403).json({
        error:
          "You did not submit the lost report associated with this item, so you are not eligible to claim it.",
      });
    if (["claimed", "completed", "closed"].includes(found.status))
      return res
        .status(409)
        .json({ error: "This case has already been completed." });
    const existing = await pool.query(
      "SELECT status FROM claims WHERE item_id = $1 AND claimant_id = $2",
      [found.item_id, req.user.id],
    );
    if (
      existing.rows.some((row) =>
        ["pending", "approved", "claimed"].includes(row.status),
      )
    )
      return res
        .status(409)
        .json({ error: "You already have an active claim for this item." });
    const { proofType, description, imageUrl, initialMessage } = req.body || {};
    const claim = await pool.query(
      "INSERT INTO claims (item_id, claimant_id) VALUES ($1, $2) ON CONFLICT (item_id, claimant_id) DO UPDATE SET status = 'pending', rejection_reason = NULL, reviewed_by = NULL, reviewed_at = NULL RETURNING claim_id",
      [found.item_id, req.user.id],
    );
    const newClaimId = claim.rows[0].claim_id;

    if (imageUrl || description || proofType) {
      await pool.query(
        "INSERT INTO ownership_proofs (claim_id, proof_type, description, image_url) VALUES ($1, $2, $3, $4)",
        [
          newClaimId,
          proofType || "Photo / Identification Proof",
          description ? String(description).trim() : null,
          imageUrl || null,
        ],
      );
    }

    if (initialMessage && typeof initialMessage === "string" && initialMessage.trim()) {
      await pool.query(
        "INSERT INTO claim_messages (claim_id, sender_id, message) VALUES ($1, $2, $3)",
        [newClaimId, req.user.id, initialMessage.trim()],
      );
    }

    await logCreate(pool, {
      actor: req.user,
      entityType: "claims",
      entityId: newClaimId,
      description: `${req.user.name} submitted claim #${newClaimId} for found item #${found.item_id}`,
      newValues: {
        claimId: newClaimId,
        itemId: found.item_id,
        claimantId: req.user.id,
        status: "pending",
      },
      req,
    });

    res.status(201).json({ claimId: newClaimId });
  }),
);

// ==========================================
// Claim Messaging & Ownership Evidence (Items 5 & 19)
// ==========================================
async function getClaimWithAccess(claimId, user, dbClient = pool) {
  const claimRes = await dbClient.query(
    `SELECT cl.claim_id AS id, cl.claim_id, cl.item_id AS "itemId", cl.claimant_id AS "claimantId",
            cl.status, cl.claim_date AS "claimDate", cl.reviewed_by AS "reviewedBy",
            cl.rejection_reason AS "rejectionReason",
            i.title AS "itemTitle", i.item_type AS "itemType",
            u.name AS "claimantName", u.email AS "claimantEmail"
     FROM claims cl
     JOIN items i ON i.item_id = cl.item_id
     JOIN users u ON u.user_id = cl.claimant_id
     WHERE cl.claim_id = $1`,
    [claimId],
  );
  const claim = claimRes.rows[0];
  if (!claim) return { error: "Claim not found.", status: 404 };

  const isClaimant = Number(claim.claimantId) === Number(user.id);
  const isStaff = user.role === "staff" || user.role === "admin";
  if (!isClaimant && !isStaff) {
    return { error: "You do not have permission to view or participate in this claim.", status: 403 };
  }
  return { claim, isClaimant, isStaff };
}

app.get(
  "/api/claims/:claimId/messages",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const access = await getClaimWithAccess(req.params.claimId, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const messages = await pool.query(
      `SELECT m.message_id AS id, m.claim_id AS "claimId", m.sender_id AS "senderId",
              m.message, m.created_at AS "createdAt",
              u.name AS "senderName", u.role AS "senderRole"
       FROM claim_messages m
       JOIN users u ON u.user_id = m.sender_id
       WHERE m.claim_id = $1
       ORDER BY m.created_at ASC`,
      [req.params.claimId],
    );

    res.json({
      claim: access.claim,
      messages: messages.rows,
    });
  }),
);

app.post(
  "/api/claims/:claimId/messages",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const access = await getClaimWithAccess(req.params.claimId, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const text = String(req.body.message || "").trim();
    if (!text) {
      return res.status(400).json({ error: "Message content cannot be blank." });
    }
    if (text.length > 2000) {
      return res.status(400).json({ error: "Message cannot exceed 2000 characters." });
    }

    const inserted = await pool.query(
      `INSERT INTO claim_messages (claim_id, sender_id, message)
       VALUES ($1, $2, $3)
       RETURNING message_id AS id, created_at AS "createdAt"`,
      [req.params.claimId, req.user.id, text],
    );

    const messageObj = {
      id: inserted.rows[0].id,
      claimId: Number(req.params.claimId),
      senderId: req.user.id,
      senderName: req.user.name,
      senderRole: req.user.role,
      message: text,
      createdAt: inserted.rows[0].createdAt,
    };

    const claim = access.claim;
    if (access.isStaff) {
      await createNotification(pool, {
        userId: claim.claimantId,
        title: `Verifier Message on Claim #${claim.id}`,
        message: `${req.user.name} (Verifier): "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`,
        type: "claim_update",
        link: `/?claim=${claim.id}`,
        itemId: claim.itemId,
      });

      // Email the claimant when staff leaves a question/comment
      const claimantUser = await pool.query("SELECT email, name FROM users WHERE user_id = $1", [claim.claimantId]);
      if (claimantUser.rows[0]?.email) {
        const appUrl = req.headers.origin || req.headers.referer;
        sendClaimMessageEmail({
          to: claimantUser.rows[0].email,
          name: claimantUser.rows[0].name,
          senderName: req.user.name,
          senderRole: req.user.role === "admin" ? "Campus Administrator" : "Campus Verifier",
          itemTitle: claim.itemTitle || `Item #${claim.itemId}`,
          claimId: claim.id,
          messageText: text,
          appUrl,
        }).catch((err) => console.error("[Mailer Error]:", err));
      }
    } else {
      if (claim.reviewedBy) {
        await createNotification(pool, {
          userId: claim.reviewedBy,
          title: `Claimant Reply on Claim #${claim.id}`,
          message: `${req.user.name}: "${text.slice(0, 80)}${text.length > 80 ? "..." : ""}"`,
          type: "claim_update",
          link: `/verifier`,
          itemId: claim.itemId,
        });
      }
    }

    res.status(201).json({ message: messageObj });
  }),
);

app.get(
  "/api/claims/:claimId/evidence",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const access = await getClaimWithAccess(req.params.claimId, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const proofs = await pool.query(
      `SELECT proof_id AS id, proof_type AS "proofType", description,
              image_url AS "imageUrl", submitted_at AS "submittedAt"
       FROM ownership_proofs
       WHERE claim_id = $1
       ORDER BY submitted_at ASC`,
      [req.params.claimId],
    );

    res.json({ proofs: proofs.rows });
  }),
);

app.post(
  "/api/claims/:claimId/evidence",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const access = await getClaimWithAccess(req.params.claimId, req.user);
    if (access.error) return res.status(access.status).json({ error: access.error });

    const { proofType, description, imageUrl } = req.body;
    if (!description && !imageUrl) {
      return res.status(400).json({ error: "Please provide an evidence description or photo attachment." });
    }

    const inserted = await pool.query(
      `INSERT INTO ownership_proofs (claim_id, proof_type, description, image_url)
       VALUES ($1, $2, $3, $4)
       RETURNING proof_id AS id, proof_type AS "proofType", description,
                 image_url AS "imageUrl", submitted_at AS "submittedAt"`,
      [
        req.params.claimId,
        proofType || "Photo / Receipt Attachment",
        description ? String(description).trim() : null,
        imageUrl || null,
      ],
    );

    const claim = access.claim;
    if (!access.isStaff && claim.reviewedBy) {
      await createNotification(pool, {
        userId: claim.reviewedBy,
        title: `New Evidence Uploaded for Claim #${claim.id}`,
        message: `${req.user.name} attached ownership proof for "${claim.itemTitle}".`,
        type: "claim_update",
        link: `/verifier`,
        itemId: claim.itemId,
      });
    }

    res.status(201).json({ proof: inserted.rows[0] });
  }),
);

app.patch(
  "/api/items/:itemId/privacy",
  requireAuth,
  requireDatabase,
  asyncRoute(async (req, res) => {
    const { isAnonymous, hidePhone } = req.body;
    const oldRes = await pool.query(
      "SELECT item_id, is_anonymous, hide_phone FROM items WHERE item_id = $1 AND reporter_id = $2",
      [req.params.itemId, req.user.id],
    );
    const oldItem = oldRes.rows[0];

    const result = await pool.query(
      "UPDATE items SET is_anonymous = $1, hide_phone = $2 WHERE item_id = $3 AND reporter_id = $4 RETURNING item_id",
      [
        Boolean(isAnonymous),
        hidePhone !== false,
        req.params.itemId,
        req.user.id,
      ],
    );
    if (!result.rows[0])
      return res
        .status(403)
        .json({ error: "Only the report owner can update privacy settings." });

    await logUpdate(pool, {
      actor: req.user,
      entityType: "items",
      entityId: req.params.itemId,
      description: `Updated privacy settings for item #${req.params.itemId}`,
      oldValues: oldItem,
      newValues: {
        isAnonymous: Boolean(isAnonymous),
        hidePhone: hidePhone !== false,
      },
      req,
    });

    res.json({ ok: true });
  }),
);

app.get(
  "/api/review/queue",
  requireAuth,
  requireDatabase,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const items = await pool.query(
      `SELECT ${publicItemFields}, i.reporter_name AS "privateReporterName", i.contact_phone AS "contactPhone", i.is_anonymous AS "isAnonymous", i.hide_phone AS "hidePhone" FROM items i ${itemLocationJoins} WHERE i.item_type = 'found' AND i.status IN ('reported', 'under_review') AND i.matched_lost_id IS NULL ORDER BY i.created_at`,
    );
    const lost = await pool.query(
      `SELECT ${publicItemFields}, i.reporter_name AS "privateReporterName", i.contact_phone AS "contactPhone", i.is_anonymous AS "isAnonymous", i.hide_phone AS "hidePhone" FROM items i ${itemLocationJoins} WHERE i.item_type = 'lost' AND i.status IN ('reported', 'under_review') AND i.matched_found_id IS NULL ORDER BY i.created_at`,
    );
    const claims = await pool.query(
      `SELECT cl.claim_id AS id, cl.status, cl.claim_date AS "claimDate", cl.reviewed_at AS "reviewedAt", cl.rejection_reason AS "rejectionReason", cl.item_id AS "itemId", i.title AS "itemTitle", u.name AS claimant, u.email, i.reporter_name AS "finderName", i.contact_phone AS "finderPhone", (SELECT COUNT(*)::int FROM claim_messages WHERE claim_id = cl.claim_id) AS "messageCount", (SELECT COUNT(*)::int FROM ownership_proofs WHERE claim_id = cl.claim_id) AS "proofCount" FROM claims cl JOIN users u ON u.user_id = cl.claimant_id JOIN items i ON i.item_id = cl.item_id ORDER BY cl.claim_date DESC`,
    );
    const cases = await pool.query(
      `SELECT ${publicItemFields}, 
              i.reporter_name AS "privateReporterName", 
              i.contact_phone AS "contactPhone", 
              i.is_anonymous AS "isAnonymous", 
              i.hide_phone AS "hidePhone",
              lost_item.title AS "lostTitle",
              lost_item.reporter_name AS "lostReporterName"
       FROM items i 
       ${itemLocationJoins}
       LEFT JOIN items lost_item ON lost_item.item_id = i.matched_lost_id
       WHERE (i.item_type = 'found' AND i.matched_lost_id IS NOT NULL AND i.status IN ('found', 'claimed', 'completed'))
          OR (i.matched_lost_id IS NULL AND i.matched_found_id IS NULL AND i.status IN ('found', 'claimed', 'completed'))
       ORDER BY i.updated_at DESC`,
    );
    res.json({
      items: items.rows,
      lost: lost.rows,
      claims: claims.rows,
      cases: cases.rows,
    });
  }),
);

app.post(
  "/api/reports/:foundId/match",
  requireAuth,
  requireDatabase,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const { lostId, finderName, foundLocation, notes } = req.body;
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      const found = await client.query(
        "SELECT item_id, title, matched_lost_id, reporter_id FROM items WHERE item_id = $1 AND item_type = 'found' AND matched_lost_id IS NULL FOR UPDATE",
        [req.params.foundId],
      );
      const lost = await client.query(
        "SELECT item_id, title, matched_found_id, reporter_id FROM items WHERE item_id = $1 AND item_type = 'lost' AND matched_found_id IS NULL FOR UPDATE",
        [lostId],
      );
      if (!found.rows[0] || !lost.rows[0])
        return res
          .status(404)
          .json({ error: "Both reports are required for a match." });
      await client.query(
        "UPDATE items SET status = 'found', matched_lost_id = $1, review_lost_id = NULL, matched_by = $5, finder_name = $2, found_location = $3, confirmation_date = now(), verifier_notes = $4 WHERE item_id = $6",
        [
          lostId,
          finderName,
          foundLocation,
          notes,
          req.user.id,
          req.params.foundId,
        ],
      );
      await client.query(
        "UPDATE items SET status = 'found', matched_found_id = $1, matched_by = $5, finder_name = $2, found_location = $3, confirmation_date = now(), verifier_notes = $4 WHERE item_id = $6",
        [
          req.params.foundId,
          finderName,
          foundLocation,
          notes,
          req.user.id,
          lostId,
        ],
      );

      await logStatusChange(client, {
        actor: req.user,
        action: "MATCH",
        entityType: "items",
        entityId: req.params.foundId,
        oldStatus: "reported",
        newStatus: "found",
        description: `Verifier matched found report #${req.params.foundId} ("${found.rows[0].title}") with lost report #${lostId}`,
        newValues: { matchedLostId: lostId, finderName, foundLocation, verifierNotes: notes },
        req,
      });

      await logStatusChange(client, {
        actor: req.user,
        action: "MATCH",
        entityType: "items",
        entityId: lostId,
        oldStatus: "reported",
        newStatus: "found",
        description: `Lost report #${lostId} ("${lost.rows[0].title}") matched with found report #${req.params.foundId}`,
        newValues: { matchedFoundId: req.params.foundId },
        req,
      });

      if (lost.rows[0]?.reporter_id) {
        await createNotification(client, {
          userId: lost.rows[0].reporter_id,
          title: "Your Lost Item Has Been Found & Verified! 🎉",
          message: `Great news! Your lost item "${found.rows[0].title}" has been found and verified. Please claim it at the CSA OFFICE with your Student ID.`,
          type: "item_ready",
          link: `/?item=${req.params.foundId}`,
          itemId: req.params.foundId,
        });

        // Email the lost item reporter
        const reporterUserRes = await client.query(
          "SELECT email, name FROM users WHERE user_id = $1",
          [lost.rows[0].reporter_id],
        );
        const reporterUser = reporterUserRes.rows[0];
        if (reporterUser?.email) {
          const appUrl = req.headers.origin || req.headers.referer;
          sendItemMatchedEmail({
            to: reporterUser.email,
            name: reporterUser.name,
            lostTitle: lost.rows[0].title,
            foundTitle: found.rows[0].title,
            itemId: req.params.foundId,
            appUrl,
          }).catch((err) => console.error("[Mailer Error]:", err));
        }
      }

      await client.query("COMMIT");
      res.json({ ok: true, message: "Item found. Please collect it at CSA." });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.patch(
  "/api/reports/:itemId/status",
  requireAuth,
  requireDatabase,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const { status, lostId } = req.body;
    if (!["under_review", "reported"].includes(status))
      return res
        .status(400)
        .json({ error: "Status must be Under review or Reported." });
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setAuditContext(client, req.user, req);
      const itemResult = await client.query(
        "SELECT item_id, title, status, item_type, review_lost_id, reporter_id FROM items WHERE item_id = $1 FOR UPDATE",
        [req.params.itemId],
      );
      const item = itemResult.rows[0];
      if (!item) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Report not found." });
      }

      if (status === "under_review" && lostId) {
        const lostResult = await client.query(
          "SELECT item_id, title, reporter_id FROM items WHERE item_id = $1 AND item_type = 'lost' AND status IN ('reported', 'under_review') AND matched_found_id IS NULL FOR UPDATE",
          [lostId],
        );
        if (item.item_type !== "found" || !lostResult.rows[0]) {
          await client.query("ROLLBACK");
          return res.status(409).json({
            error: "Select an unresolved lost report for this review.",
          });
        }
        await client.query(
          "UPDATE items SET status = 'under_review', review_lost_id = $1 WHERE item_id = $2 AND matched_lost_id IS NULL",
          [lostId, item.item_id],
        );
        await client.query(
          "UPDATE items SET status = 'under_review' WHERE item_id = $1 AND matched_found_id IS NULL",
          [lostId],
        );

        if (lostResult.rows[0]?.reporter_id) {
          await createNotification(client, {
            userId: lostResult.rows[0].reporter_id,
            title: "Report Status: Under Review",
            message: `Your lost report "${lostResult.rows[0].title}" has been moved to Under Review with a candidate found item.`,
            type: "status_update",
            link: `/?item=${lostId}`,
            itemId: lostId,
          });
        }
      } else if (status === "under_review") {
        if (item.item_type === "found" && item.review_lost_id) {
          await client.query(
            "UPDATE items SET status = 'under_review' WHERE item_id = $1 AND matched_found_id IS NULL",
            [item.review_lost_id],
          );
        }
        const result = await client.query(
          "UPDATE items SET status = 'under_review' WHERE item_id = $1 AND status IN ('reported', 'under_review') AND matched_lost_id IS NULL AND matched_found_id IS NULL RETURNING item_id",
          [item.item_id],
        );
        if (!result.rows[0]) {
          await client.query("ROLLBACK");
          return res
            .status(409)
            .json({ error: "This report cannot be moved to Under review." });
        }
      } else if (item.item_type === "found" && item.review_lost_id) {
        await client.query(
          "UPDATE items SET status = 'reported', review_lost_id = NULL WHERE item_id = $1 AND matched_lost_id IS NULL",
          [item.item_id],
        );
        await client.query(
          "UPDATE items SET status = 'reported' WHERE item_id = $1 AND matched_found_id IS NULL",
          [item.review_lost_id],
        );
      } else {
        const result = await client.query(
          "UPDATE items SET status = 'reported' WHERE item_id = $1 AND matched_found_id IS NULL AND matched_lost_id IS NULL RETURNING item_id",
          [item.item_id],
        );
        if (!result.rows[0]) {
          await client.query("ROLLBACK");
          return res
            .status(409)
            .json({ error: "This report cannot be returned to Reported." });
        }
      }

      await logStatusChange(client, {
        actor: req.user,
        entityType: "items",
        entityId: item.item_id,
        oldStatus: item.status,
        newStatus: status,
        description: `Verifier updated item #${item.item_id} ("${item.title}") status to "${status}"`,
        req,
      });

      if (item.reporter_id) {
        await createNotification(client, {
          userId: item.reporter_id,
          title: `Report Status: ${status === "under_review" ? "Under Review" : "Reported"}`,
          message: `Your report "${item.title}" status is now ${status === "under_review" ? "Under Review" : "Reported"}.`,
          type: "status_update",
          link: `/?item=${item.item_id}`,
          itemId: item.item_id,
        });
      }

      await client.query("COMMIT");
      res.json({ ok: true, status });
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.post(
  "/api/claims/:claimId/decision",
  requireAuth,
  requireDatabase,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const { decision, reason = "" } = req.body;
    if (!["approved", "rejected"].includes(decision))
      return res
        .status(400)
        .json({ error: "Decision must be approved or rejected." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setAuditContext(client, req.user, req);

      const prevClaimRes = await client.query(
        "SELECT claim_id, item_id, claimant_id, status FROM claims WHERE claim_id = $1 FOR UPDATE",
        [req.params.claimId],
      );
      const prevClaim = prevClaimRes.rows[0];

      const result = await client.query(
        "UPDATE claims SET status = $1, reviewed_by = $2, reviewed_at = now(), rejection_reason = $3 WHERE claim_id = $4 AND status = 'pending' RETURNING claim_id",
        [
          decision,
          req.user.id,
          decision === "rejected" ? reason : null,
          req.params.claimId,
        ],
      );
      if (!result.rows[0]) {
        await client.query("ROLLBACK");
        return res
          .status(409)
          .json({ error: "Only pending claims can be decided." });
      }

      await logStatusChange(client, {
        actor: req.user,
        action: decision === "approved" ? "APPROVE" : "REJECT",
        entityType: "claims",
        entityId: req.params.claimId,
        oldStatus: "pending",
        newStatus: decision,
        description: `Verifier ${decision} claim #${req.params.claimId}${decision === "rejected" ? ` (Reason: ${reason})` : ""}`,
        oldValues: prevClaim,
        newValues: {
          claimId: req.params.claimId,
          status: decision,
          reviewedBy: req.user.id,
          rejectionReason: decision === "rejected" ? reason : null,
        },
        req,
      });

      if (prevClaim.claimant_id) {
        await createNotification(client, {
          userId: prevClaim.claimant_id,
          title: decision === "approved" ? "Claim Approved - Ready for Pickup! 🎉" : "Claim Status Update",
          message: decision === "approved"
            ? `Your claim for item #${prevClaim.item_id} has been approved by campus staff. Please visit the CSA office to collect your item.`
            : `Your claim for item #${prevClaim.item_id} was reviewed. Decision: ${decision}${reason ? ` (Reason: ${reason})` : ""}`,
          type: "claim_decision",
          link: `/?item=${prevClaim.item_id}`,
          itemId: prevClaim.item_id,
        });

        // Email the claimant with decision details
        const claimantInfo = await client.query(
          "SELECT u.email, u.name, i.title AS item_title FROM users u JOIN items i ON i.item_id = $2 WHERE u.user_id = $1",
          [prevClaim.claimant_id, prevClaim.item_id],
        );
        const claimant = claimantInfo.rows[0];
        if (claimant?.email) {
          const appUrl = req.headers.origin || req.headers.referer;
          sendClaimDecisionEmail({
            to: claimant.email,
            name: claimant.name,
            itemTitle: claimant.item_title || `Item #${prevClaim.item_id}`,
            decision,
            reason,
            claimId: req.params.claimId,
            itemId: prevClaim.item_id,
            appUrl,
          }).catch((err) => console.error("[Mailer Error]:", err));
        }
      }

      await client.query("COMMIT");
      res.json({ ok: true });
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }),
);

app.post(
  "/api/claims/:claimId/collect",
  requireAuth,
  requireDatabase,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      "UPDATE claims SET status = 'claimed' WHERE claim_id = $1 AND status = 'approved' RETURNING item_id, claimant_id",
      [req.params.claimId],
    );
    if (!result.rows[0])
      return res
        .status(409)
        .json({ error: "Only approved claims can be collected." });
    await pool.query(
      "UPDATE claims SET collection_date = now(), collected_by = $1 WHERE claim_id = $2",
      [req.user.id, req.params.claimId],
    );
    await pool.query(
      "UPDATE items SET status = 'completed', collection_date = now(), collected_by = $1 WHERE item_id = $2 OR matched_lost_id = $2 OR matched_found_id = $2",
      [req.user.id, result.rows[0].item_id],
    );

    await logStatusChange(pool, {
      actor: req.user,
      action: "COLLECT",
      entityType: "claims",
      entityId: req.params.claimId,
      oldStatus: "approved",
      newStatus: "claimed",
      description: `Verifier processed collection for claim #${req.params.claimId}`,
      req,
    });

    await logStatusChange(pool, {
      actor: req.user,
      action: "COLLECT",
      entityType: "items",
      entityId: result.rows[0].item_id,
      newStatus: "completed",
      description: `Item #${result.rows[0].item_id} marked as completed upon collection`,
      req,
    });

    if (result.rows[0]?.claimant_id) {
      await createNotification(pool, {
        userId: result.rows[0].claimant_id,
        title: "Item Handover Completed",
        message: "Your item was successfully claimed and marked as completed. Thank you for using Campus Lost & Found!",
        type: "item_ready",
        link: `/?item=${result.rows[0].item_id}`,
        itemId: result.rows[0].item_id,
      });

      // Email the claimant confirmation receipt
      const claimantInfo = await pool.query(
        "SELECT u.email, u.name, i.title AS item_title FROM users u JOIN items i ON i.item_id = $2 WHERE u.user_id = $1",
        [result.rows[0].claimant_id, result.rows[0].item_id],
      );
      const claimant = claimantInfo.rows[0];
      if (claimant?.email) {
        const appUrl = req.headers.origin || req.headers.referer;
        sendItemHandoverEmail({
          to: claimant.email,
          name: claimant.name,
          itemTitle: claimant.item_title || `Item #${result.rows[0].item_id}`,
          claimId: req.params.claimId,
          appUrl,
        }).catch((err) => console.error("[Mailer Error]:", err));
      }
    }

    res.json({ ok: true });
  }),
);

// Mailer status check & test dispatch (Admin / Staff)
app.get(
  "/api/admin/mailer/status",
  requireDatabase,
  requireAuth,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const status = getMailerStatus();
    const verification = await verifyMailerConnection();
    res.json({ ...status, connection: verification });
  }),
);

app.post(
  "/api/admin/mailer/test",
  requireDatabase,
  requireAuth,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const targetEmail = String(req.body.to || req.user.email || "").trim();
    if (!targetEmail) {
      return res
        .status(400)
        .json({ error: "Target recipient email address is required." });
    }
    const appUrl = req.headers.origin || req.headers.referer;
    const result = await sendTestEmail({ to: targetEmail, appUrl });
    res.json(result);
  }),
);

// Full CSV export for reports registry (Item 2F)
app.get(
  "/api/admin/export/reports-csv",
  requireDatabase,
  requireAuth,
  requireRole("staff", "admin"),
  asyncRoute(async (req, res) => {
    const values = [];
    const where = [];
    if (req.query.type && ["lost", "found"].includes(req.query.type)) {
      values.push(req.query.type);
      where.push(`i.item_type = $${values.length}`);
    }
    if (req.query.status && req.query.status !== "all") {
      values.push(req.query.status);
      where.push(`i.status = $${values.length}`);
    }
    const whereSql = where.length ? `WHERE ${where.join(" AND ")}` : "";

    const result = await pool.query(
      `SELECT
         i.item_id,
         i.item_type,
         i.title,
         i.description,
         c.category_name,
         i.status,
         i.date_reported,
         COALESCE(b.name, i.location_snapshot->>'buildingName', l.building, 'Campus Area') AS building_name,
         COALESCE(f.name, i.location_snapshot->>'floorName', l.floor, 'All floors') AS floor_name,
         COALESCE(r.name, i.location_description, i.location_snapshot->>'roomName', l.location_name, 'General Area') AS room_name,
         CASE WHEN i.is_anonymous THEN 'Anonymous' ELSE COALESCE(i.reporter_name, 'Unknown') END AS reporter,
         i.contact_phone,
         i.matched_lost_id,
         i.matched_found_id,
         i.created_at
       FROM items i
       ${itemLocationJoins}
       ${whereSql}
       ORDER BY i.item_id DESC`,
      values,
    );

    function escapeCsv(val) {
      if (val === null || val === undefined) return '""';
      const str = String(val).replace(/"/g, '""');
      return `"${str}"`;
    }

    const headers = [
      "Item ID",
      "Type",
      "Title",
      "Category",
      "Status",
      "Date Reported",
      "Building",
      "Floor",
      "Room/Location",
      "Reporter",
      "Contact Phone",
      "Matched Lost ID",
      "Matched Found ID",
      "Created At",
    ];

    const lines = [headers.join(",")];
    for (const row of result.rows) {
      lines.push(
        [
          row.item_id,
          escapeCsv(row.item_type),
          escapeCsv(row.title),
          escapeCsv(row.category_name),
          escapeCsv(row.status),
          escapeCsv(row.date_reported ? new Date(row.date_reported).toISOString().slice(0, 10) : ""),
          escapeCsv(row.building_name),
          escapeCsv(row.floor_name),
          escapeCsv(row.room_name),
          escapeCsv(row.reporter),
          escapeCsv(row.contact_phone),
          row.matched_lost_id || "",
          row.matched_found_id || "",
          escapeCsv(row.created_at ? new Date(row.created_at).toISOString() : ""),
        ].join(","),
      );
    }

    const csvOutput = "\uFEFF" + lines.join("\r\n");
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="campus_registry_reports_${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    res.send(csvOutput);
  }),
);

app.post(
  "/api/admin/accounts",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const { name, email, password, role, setupToken = "" } = req.body;
    if (role !== "staff" && role !== "admin") {
      return res.status(400).json({
        error: "Administrators can provision Verifier or Administrator accounts only.",
      });
    }

    const nameVal = validateName(name);
    if (!nameVal.valid) {
      return res.status(400).json({ error: nameVal.error });
    }

    const emailVal = validateSchoolEmail(email, {
      requireSchoolDomain: role === "admin",
    });
    if (!emailVal.valid) {
      return res.status(400).json({ error: emailVal.error });
    }

    const passVal = validatePassword(password);
    if (!passVal.valid) {
      return res.status(400).json({ error: passVal.error });
    }

    if (
      role === "admin" &&
      (!adminSetupToken || setupToken !== adminSetupToken)
    ) {
      return res.status(403).json({
        error: "Administrator registration requires a valid setup authorization.",
      });
    }

    const normalizedEmail = emailVal.formatted;
    const formattedName = nameVal.formatted;

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setAuditContext(client, req.user, req);

      const username = email.split("@")[0].toLowerCase().replace(/[^a-z0-9_]/g, "_");
      const result = await client.query(
        "INSERT INTO users (name, email, username, password_hash, role) VALUES ($1, $2, $3, $4, $5) RETURNING user_id, name, email, username, password_hash, role",
        [formattedName, normalizedEmail, username, hashPassword(password), role],
      );

      const roleLabel = role === "admin" ? "administrator" : "verifier";
      await logCreate(client, {
        actor: req.user,
        entityType: "users",
        entityId: result.rows[0].user_id,
        description: `Admin created ${roleLabel} account "${name}" (${email.toLowerCase()})`,
        newValues: {
          userId: result.rows[0].user_id,
          name,
          username,
          email: email.toLowerCase(),
          role,
        },
        req,
      });

      await client.query("COMMIT");
      res.status(201).json({ user: safeUser(result.rows[0]) });
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23505")
        return res
          .status(409)
          .json({ error: "That email already has an account." });
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.get(
  "/api/admin/users",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      "SELECT user_id AS id, name, email, role, is_active AS \"isActive\", created_at AS \"createdAt\" FROM users ORDER BY created_at DESC",
    );
    res.json(result.rows);
  }),
);

app.patch(
  "/api/admin/users/:userId/status",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const { isActive } = req.body;
    if (typeof isActive !== "boolean") {
      return res.status(400).json({ error: "isActive must be a boolean." });
    }
    if (!isActive && Number(req.params.userId) === Number(req.user.id)) {
      return res
        .status(400)
        .json({ error: "You cannot deactivate your own administrator account." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setAuditContext(client, req.user, req);

      const targetRes = await client.query(
        "SELECT user_id, name, email, role, is_active FROM users WHERE user_id = $1 FOR UPDATE",
        [req.params.userId],
      );
      const targetUser = targetRes.rows[0];
      if (!targetUser) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User account not found." });
      }

      const updatedRes = await client.query(
        "UPDATE users SET is_active = $1, updated_at = now() WHERE user_id = $2 RETURNING user_id AS id, name, email, role, is_active AS \"isActive\"",
        [isActive, req.params.userId],
      );

      if (!isActive) {
        invalidateSessionsForUser(req.params.userId);
      }

      const actionLabel = isActive ? "REACTIVATE" : "DEACTIVATE";
      const roleLabel =
        targetUser.role === "staff"
          ? "verifier"
          : targetUser.role === "admin"
          ? "administrator"
          : "user";

      await logAudit(client, {
        actor: req.user,
        action: actionLabel,
        status: "SUCCESS",
        entityType: "users",
        entityId: req.params.userId,
        description: `Admin ${actionLabel.toLowerCase()}d ${roleLabel} account "${targetUser.name}" (${targetUser.email})`,
        oldValues: { isActive: targetUser.is_active },
        newValues: { isActive },
        req,
      });

      await client.query("COMMIT");
      res.json(updatedRes.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      throw err;
    } finally {
      client.release();
    }
  }),
);

app.put(
  "/api/admin/users/:userId",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const { name, email, isActive } = req.body;
    const nameVal = validateName(name);
    if (!nameVal.valid) {
      return res.status(400).json({ error: nameVal.error });
    }

    const emailVal = validateSchoolEmail(email, { requireSchoolDomain: true });
    if (!emailVal.valid) {
      return res.status(400).json({ error: emailVal.error });
    }

    const normalizedEmail = emailVal.formatted;
    const formattedName = nameVal.formatted;

    if (isActive === false && Number(req.params.userId) === Number(req.user.id)) {
      return res
        .status(400)
        .json({ error: "You cannot deactivate your own administrator account." });
    }

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setAuditContext(client, req.user, req);

      const targetRes = await client.query(
        "SELECT user_id, name, email, role, is_active FROM users WHERE user_id = $1 FOR UPDATE",
        [req.params.userId],
      );
      const targetUser = targetRes.rows[0];
      if (!targetUser) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User account not found." });
      }

      const targetActive = typeof isActive === "boolean" ? isActive : targetUser.is_active;

      const updatedRes = await client.query(
        `UPDATE users
         SET name = $1, email = $2, is_active = $3, updated_at = now()
         WHERE user_id = $4
         RETURNING user_id AS id, name, email, role, is_active AS "isActive"`,
        [formattedName, normalizedEmail, targetActive, req.params.userId],
      );

      if (!targetActive) {
        invalidateSessionsForUser(req.params.userId);
      } else {
        updateSessionsForUser(req.params.userId, {
          name: formattedName,
          email: normalizedEmail,
        });
      }

      await logAudit(client, {
        actor: req.user,
        action: "UPDATE",
        status: "SUCCESS",
        entityType: "users",
        entityId: req.params.userId,
        description: `Admin updated account "${targetUser.name}" (${targetUser.email})`,
        oldValues: {
          name: targetUser.name,
          email: targetUser.email,
          isActive: targetUser.is_active,
        },
        newValues: {
          name: name.trim(),
          email: normalizedEmail,
          isActive: targetActive,
        },
        req,
      });

      await client.query("COMMIT");
      res.json(updatedRes.rows[0]);
    } catch (err) {
      await client.query("ROLLBACK");
      if (err.code === "23505") {
        return res
          .status(409)
          .json({ error: "An account with that email already exists." });
      }
      throw err;
    } finally {
      client.release();
    }
  }),
);

app.delete(
  "/api/admin/users/:userId",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    if (Number(req.params.userId) === Number(req.user.id))
      return res
        .status(400)
        .json({ error: "You cannot remove your own administrator account." });

    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setAuditContext(client, req.user, req);

      const targetRes = await client.query(
        "SELECT user_id, name, email, role, username FROM users WHERE user_id = $1 FOR UPDATE",
        [req.params.userId],
      );
      const targetUser = targetRes.rows[0];
      if (!targetUser) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User account not found." });
      }

      const result = await client.query(
        "DELETE FROM users WHERE user_id = $1 RETURNING user_id",
        [req.params.userId],
      );
      if (!result.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "User account not found." });
      }

      invalidateSessionsForUser(req.params.userId);

      const roleLabel =
        targetUser.role === "staff"
          ? "verifier"
          : targetUser.role === "admin"
          ? "administrator"
          : "user";

      await logDelete(client, {
        actor: req.user,
        entityType: "users",
        entityId: req.params.userId,
        description: `Admin deleted ${roleLabel} account "${targetUser.name || targetUser.email || req.params.userId}"`,
        oldValues: targetUser,
        req,
      });

      await client.query("COMMIT");
      res.status(204).end();
    } catch (error) {
      await client.query("ROLLBACK");
      if (error.code === "23503")
        return res.status(409).json({
          error: "This account has related records (reports, claims, or audits) and cannot be removed.",
        });
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.get(
  "/api/admin/items",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const result = await pool.query(
      `SELECT ${publicItemFields}, i.reporter_name AS "privateReporterName", i.contact_phone AS "contactPhone", i.is_anonymous AS "isAnonymous", i.hide_phone AS "hidePhone" FROM items i ${itemLocationJoins} ORDER BY i.created_at DESC LIMIT 100`,
    );
    res.json(result.rows);
  }),
);

app.delete(
  "/api/admin/items/:itemId",
  requireAuth,
  requireDatabase,
  requireRole("admin"),
  asyncRoute(async (req, res) => {
    const client = await pool.connect();
    try {
      await client.query("BEGIN");
      await setAuditContext(client, req.user, req);
      const caseResult = await client.query(
        "SELECT item_id, title, matched_lost_id, matched_found_id, status FROM items WHERE item_id = $1 FOR UPDATE",
        [req.params.itemId],
      );
      if (!caseResult.rows[0]) {
        await client.query("ROLLBACK");
        return res.status(404).json({ error: "Report not found." });
      }
      const caseIds = [
        ...new Set(
          [
            caseResult.rows[0].item_id,
            caseResult.rows[0].matched_lost_id,
            caseResult.rows[0].matched_found_id,
          ].filter(Boolean),
        ),
      ];
      await client.query("DELETE FROM claims WHERE item_id = ANY($1)", [
        caseIds,
      ]);
      await client.query("DELETE FROM items WHERE item_id = ANY($1)", [
        caseIds,
      ]);

      await logDelete(client, {
        actor: req.user,
        entityType: "items",
        entityId: req.params.itemId,
        description: `Admin permanently removed report case #${req.params.itemId} ("${caseResult.rows[0].title}")`,
        oldValues: caseResult.rows[0],
        req,
      });

      await client.query("COMMIT");
      res.status(204).end();
    } catch (error) {
      await client.query("ROLLBACK");
      throw error;
    } finally {
      client.release();
    }
  }),
);

app.use((error, req, res, next) => {
  console.error("API error handler:", error);
  const status = Number(error.status || error.statusCode || 500);
  const message = error.message || "The server could not complete that request.";
  res.status(status).json({
    error: message,
    code: error.code || undefined,
  });
});
app.get("*", (req, res) => {
  const distIndex = path.join(__dirname, "../../client/dist/index.html");
  if (fs.existsSync(distIndex)) {
    return res.sendFile(distIndex);
  }
  res.sendFile(path.join(__dirname, "../../client/index.html"));
});

async function startServer() {
  if (pool) {
    try {
      console.log("Checking and applying database migrations on startup...");
      await runMigrations(pool);
      console.log("Database migrations ready.");
    } catch (err) {
      console.error("Warning: migration check on startup failed:", err);
    }
  }

  app.listen(port, () =>
    console.log(`Campus Lost & Found running at http://localhost:${port}`),
  );
}

startServer();

export { app, pool };
