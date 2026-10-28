// ==============================================================================
// PostgreSQL Audit Logging Service
// Comprehensive, centralized audit trail with transaction safety,
// snapshot sanitation, automatic diffing, and query services.
// ==============================================================================

import crypto from "crypto";

const SENSITIVE_KEYS = new Set([
  "password",
  "password_hash",
  "passwordHash",
  "password_reset_token_hash",
  "passwordResetTokenHash",
  "resetToken",
  "token",
  "secret",
  "setupToken",
]);

/**
 * Remove sensitive credentials and tokens from audit snapshots.
 */
export function sanitizeSnapshot(data) {
  if (!data || typeof data !== "object") return data;
  if (Array.isArray(data)) {
    return data.map(sanitizeSnapshot);
  }

  const cleaned = {};
  for (const [key, value] of Object.entries(data)) {
    if (SENSITIVE_KEYS.has(key)) {
      continue;
    }
    if (value && typeof value === "object" && !Buffer.isBuffer(value)) {
      cleaned[key] = sanitizeSnapshot(value);
    } else {
      cleaned[key] = value;
    }
  }
  return cleaned;
}

/**
 * Compute field-level differences between old and new state.
 */
export function computeChangedFields(oldValues, newValues) {
  if (!oldValues && !newValues) return null;
  if (!oldValues) {
    const diff = {};
    for (const [k, v] of Object.entries(newValues)) {
      diff[k] = { old: null, new: v };
    }
    return diff;
  }
  if (!newValues) {
    const diff = {};
    for (const [k, v] of Object.entries(oldValues)) {
      diff[k] = { old: v, new: null };
    }
    return diff;
  }

  const diff = {};
  const allKeys = new Set([
    ...Object.keys(oldValues),
    ...Object.keys(newValues),
  ]);

  for (const key of allKeys) {
    if (SENSITIVE_KEYS.has(key)) continue;

    const oldVal = oldValues[key];
    const newVal = newValues[key];

    const oldStr = JSON.stringify(oldVal === undefined ? null : oldVal);
    const newStr = JSON.stringify(newVal === undefined ? null : newVal);

    if (oldStr !== newStr) {
      diff[key] = {
        old: oldVal === undefined ? null : oldVal,
        new: newVal === undefined ? null : newVal,
      };
    }
  }

  return Object.keys(diff).length > 0 ? diff : null;
}

/**
 * Extract trustworthy actor metadata from session user or explicit parameter.
 */
export function extractActorInfo(actor, req) {
  const user = actor || req?.user;
  if (!user) {
    return {
      userId: null,
      username: "system",
      role: "system",
    };
  }

  const userId = user.id ? Number(user.id) : user.user_id ? Number(user.user_id) : null;
  const username =
    user.username ||
    (user.email ? user.email.split("@")[0] : null) ||
    user.name ||
    (userId ? `user_${userId}` : "system");

  const role = user.role || "student";

  return {
    userId,
    username,
    role,
  };
}

export async function resolveActorInfo(clientOrPool, actor, req) {
  if (actor && typeof actor === "object" && (actor.username || actor.name)) {
    return extractActorInfo(actor, req);
  }
  if (req?.user && (req.user.id || req.user.user_id)) {
    return extractActorInfo(req.user, req);
  }
  const userId =
    typeof actor === "number" || typeof actor === "string"
      ? Number(actor)
      : actor?.id || actor?.user_id;

  if (userId && clientOrPool && typeof clientOrPool.query === "function") {
    try {
      const res = await clientOrPool.query(
        "SELECT user_id, username, name, email, role FROM users WHERE user_id = $1",
        [userId],
      );
      if (res.rows[0]) {
        return extractActorInfo(res.rows[0], req);
      }
    } catch (_) {}
  }

  return extractActorInfo(actor, req);
}

/**
 * Extract request context: IP address and User Agent.
 */
export function extractRequestContext(req) {
  if (!req) return { ipAddress: null, userAgent: null };

  const forwarded = req.headers?.["x-forwarded-for"];
  const ipAddress = forwarded
    ? String(forwarded).split(",")[0].trim()
    : req.ip || req.socket?.remoteAddress || null;

  const userAgent = req.get ? req.get("user-agent") : req.headers?.["user-agent"] || null;

  return { ipAddress, userAgent };
}

/**
 * Configure transaction-local settings at the start of a transaction
 * so database triggers have full authenticated context and can skip duplicate logs.
 */
export async function setAuditContext(clientOrPool, actor, req, skipTrigger = true) {
  if (!clientOrPool || typeof clientOrPool.query !== "function") return;
  try {
    if (skipTrigger) {
      await clientOrPool.query("SELECT set_config('audit.skip_trigger', 'true', true)");
    }
    const { userId, username, role, ipAddress } = await resolveActorInfo(actor, req, clientOrPool);
    if (userId) {
      await clientOrPool.query("SELECT set_config('audit.actor_user_id', $1, true)", [String(userId)]);
    }
    if (username) {
      await clientOrPool.query("SELECT set_config('audit.actor_username', $1, true)", [username]);
    }
    if (role) {
      await clientOrPool.query("SELECT set_config('audit.actor_role', $1, true)", [role]);
    }
    if (ipAddress) {
      await clientOrPool.query("SELECT set_config('audit.client_ip', $1, true)", [ipAddress]);
    }
  } catch (_) {
    // Non-critical outside transaction blocks
  }
}

/**
 * Core logging function that writes to the central audit_logs table.
 * If executed inside a database transaction client, transaction-local settings
 * are set to suppress redundant database-level triggers.
 */
export async function logAudit(
  clientOrPool,
  {
    actor,
    action,
    status = "SUCCESS",
    entityType,
    entityId,
    description,
    oldValues = null,
    newValues = null,
    changedFields = null,
    req = null,
  },
) {
  if (!clientOrPool) return null;

  const { userId, username, role } = await resolveActorInfo(clientOrPool, actor, req);
  const { ipAddress, userAgent } = extractRequestContext(req);

  const cleanOld = sanitizeSnapshot(oldValues);
  const cleanNew = sanitizeSnapshot(newValues);
  const calculatedDiff =
    changedFields || computeChangedFields(cleanOld, cleanNew);

  const cleanEntityId = entityId !== undefined && entityId !== null ? String(entityId) : null;
  const cleanDesc =
    description ||
    `${username} performed ${action} on ${entityType}${cleanEntityId ? ` #${cleanEntityId}` : ""}`;

  // If this is a transaction client, configure transaction-local settings
  // so that database triggers know the authenticated user and skip duplicate logs.
  if (typeof clientOrPool.query === "function") {
    try {
      await clientOrPool.query("SELECT set_config('audit.skip_trigger', 'true', true)");
      if (userId) {
        await clientOrPool.query("SELECT set_config('audit.actor_user_id', $1, true)", [String(userId)]);
      }
      if (username) {
        await clientOrPool.query("SELECT set_config('audit.actor_username', $1, true)", [username]);
      }
      if (role) {
        await clientOrPool.query("SELECT set_config('audit.actor_role', $1, true)", [role]);
      }
      if (ipAddress) {
        await clientOrPool.query("SELECT set_config('audit.client_ip', $1, true)", [ipAddress]);
      }
    } catch (_) {
      // Non-critical if set_config fails outside a transaction block
    }
  }

  const query = `
    INSERT INTO audit_logs (
      actor_user_id,
      actor_username,
      actor_role,
      action,
      status,
      entity_type,
      entity_id,
      description,
      old_values,
      new_values,
      changed_fields,
      ip_address,
      user_agent,
      created_at,
      -- legacy column synchronization
      user_id,
      table_name,
      record_id,
      old_data,
      new_data,
      action_time
    ) VALUES (
      $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, now(),
      $1, $6, $14, $9, $10, now()
    )
    RETURNING id, actor_username, actor_role, action, status, entity_type, entity_id, description, created_at
  `;

  const legacyRecordId = cleanEntityId && !isNaN(Number(cleanEntityId)) ? Number(cleanEntityId) : 0;

  const values = [
    userId || null,
    username,
    role,
    action.toUpperCase(),
    status.toUpperCase(),
    entityType,
    cleanEntityId,
    cleanDesc,
    cleanOld ? JSON.stringify(cleanOld) : null,
    cleanNew ? JSON.stringify(cleanNew) : null,
    calculatedDiff ? JSON.stringify(calculatedDiff) : null,
    ipAddress,
    userAgent,
    legacyRecordId,
  ];

  try {
    const result = await clientOrPool.query(query, values);
    return result.rows[0];
  } catch (err) {
    console.error("Non-fatal audit logging notice:", err.message);
    return null;
  }
}

/**
 * Record a successful creation.
 */
export async function logCreate(clientOrPool, options) {
  return logAudit(clientOrPool, {
    ...options,
    action: "CREATE",
    status: "SUCCESS",
    oldValues: null,
  });
}

/**
 * Record a successful update.
 */
export async function logUpdate(clientOrPool, options) {
  return logAudit(clientOrPool, {
    ...options,
    action: options.action || "UPDATE",
    status: "SUCCESS",
  });
}

/**
 * Record a successful deletion.
 */
export async function logDelete(clientOrPool, options) {
  return logAudit(clientOrPool, {
    ...options,
    action: "DELETE",
    status: "SUCCESS",
    newValues: null,
  });
}

/**
 * Record a workflow status change.
 */
export async function logStatusChange(clientOrPool, options) {
  const { oldStatus, newStatus } = options;
  const desc =
    options.description ||
    `Status changed from "${oldStatus}" to "${newStatus}" for ${options.entityType} #${options.entityId}`;

  return logAudit(clientOrPool, {
    ...options,
    action: options.action || "UPDATE",
    status: options.status || "SUCCESS",
    description: desc,
    changedFields: options.changedFields || {
      status: { old: oldStatus, new: newStatus },
    },
    oldValues: options.oldValues || { status: oldStatus },
    newValues: options.newValues || { status: newStatus },
  });
}

/**
 * Record authentication events (e.g. LOGIN, LOGOUT).
 */
export async function logAuthEvent(pool, { actor, action, status = "SUCCESS", description, req }) {
  return logAudit(pool, {
    actor,
    action,
    status,
    entityType: "auth",
    entityId: actor?.id ? String(actor.id) : null,
    description: description || `${action} event for ${actor?.name || actor?.email || "user"}`,
    req,
  });
}

/**
 * Record failed operations safely outside the failing transaction.
 */
export async function logFailure(
  pool,
  { actor, action, entityType, entityId, description, error, req },
) {
  try {
    const errorMsg = error instanceof Error ? error.message : String(error || "");
    const desc = description || `Failed ${action} on ${entityType}: ${errorMsg}`;

    return await logAudit(pool, {
      actor,
      action,
      status: "FAILURE",
      entityType,
      entityId,
      description: desc,
      newValues: errorMsg ? { errorMessage: errorMsg } : null,
      req,
    });
  } catch (err) {
    console.error("Failed to log failure audit:", err);
    return null;
  }
}

/**
 * Backwards-compatible bridge for existing logAdminAudit calls.
 */
export async function logAdminAudit(
  client,
  userId,
  action,
  tableName,
  recordId,
  oldData,
  newData,
  req = null,
) {
  return logAudit(client, {
    actor: userId ? { id: userId } : null,
    action,
    status: "SUCCESS",
    entityType: tableName,
    entityId: recordId,
    oldValues: oldData,
    newValues: newData,
    req,
  });
}

/**
 * Query audit logs with pagination, multi-criteria filtering, and secure sorting.
 */
export async function getAuditLogs(pool, queryParams = {}) {
  const {
    page = 1,
    limit = 20,
    search = "",
    username = "",
    role = "",
    action = "",
    status = "",
    entityType = "",
    startDate = "",
    endDate = "",
    sortBy = "created_at",
    sortOrder = "DESC",
  } = queryParams;

  const maxLimit = queryParams.export === 'true' || parseInt(limit, 10) > 100 ? 10000 : 100;
  const validLimit = Math.min(maxLimit, Math.max(1, parseInt(limit, 10) || 20));
  const validPage = Math.max(1, parseInt(page, 10) || 1);
  const offset = (validPage - 1) * validLimit;

  // Whitelist sortable columns to prevent SQL injection
  const ALLOWED_SORT_COLUMNS = {
    id: "a.id",
    created_at: "a.created_at",
    action: "a.action",
    status: "a.status",
    actor_username: "a.actor_username",
    actor_role: "a.actor_role",
    entity_type: "a.entity_type",
  };
  const sortColumn = ALLOWED_SORT_COLUMNS[sortBy] || "a.created_at";
  const order = String(sortOrder).toUpperCase() === "ASC" ? "ASC" : "DESC";

  const conditions = [];
  const values = [];

  if (search && search.trim()) {
    values.push(`%${search.trim()}%`);
    conditions.push(`(
      a.actor_username ILIKE $${values.length} OR
      a.description ILIKE $${values.length} OR
      a.entity_type ILIKE $${values.length} OR
      a.entity_id ILIKE $${values.length}
    )`);
  }

  if (username && username.trim()) {
    values.push(username.trim().toLowerCase());
    conditions.push(`LOWER(a.actor_username) = $${values.length}`);
  }

  if (role && role.trim() && role !== "all") {
    values.push(role.trim().toLowerCase());
    conditions.push(`LOWER(a.actor_role) = $${values.length}`);
  }

  if (action && action.trim() && action !== "all") {
    values.push(action.trim().toUpperCase());
    conditions.push(`a.action = $${values.length}`);
  }

  if (status && status.trim() && status !== "all") {
    values.push(status.trim().toUpperCase());
    conditions.push(`a.status = $${values.length}`);
  }

  if (entityType && entityType.trim() && entityType !== "all") {
    values.push(entityType.trim().toLowerCase());
    conditions.push(`LOWER(a.entity_type) = $${values.length}`);
  }

  const effectiveStartDate = startDate || queryParams.start_date || queryParams.from;
  const effectiveEndDate = endDate || queryParams.end_date || queryParams.to;

  if (effectiveStartDate && effectiveStartDate.trim()) {
    values.push(effectiveStartDate.trim());
    conditions.push(`a.created_at >= ${values.length}::timestamptz`);
  }

  if (effectiveEndDate && effectiveEndDate.trim()) {
    values.push(effectiveEndDate.trim());
    conditions.push(`a.created_at <= (${values.length}::date + INTERVAL '1 day')`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  // Count total matching records
  const countQuery = `
    SELECT COUNT(*)::bigint AS total
    FROM audit_logs a
    ${whereClause}
  `;
  const countRes = await pool.query(countQuery, values);
  const total = parseInt(countRes.rows[0]?.total || "0", 10);
  const totalPages = Math.ceil(total / validLimit) || 1;

  // Fetch paginated records
  values.push(validLimit);
  const limitParam = `$${values.length}`;
  values.push(offset);
  const offsetParam = `$${values.length}`;

  const dataQuery = `
    SELECT
      a.id,
      a.actor_user_id,
      a.actor_user_id AS "actorUserId",
      a.actor_username,
      a.actor_username AS "actorUsername",
      a.actor_role,
      a.actor_role AS "actorRole",
      a.action,
      a.status,
      a.entity_type,
      a.entity_type AS "entityType",
      a.entity_id,
      a.entity_id AS "entityId",
      a.description,
      a.old_values,
      a.old_values AS "oldValues",
      a.new_values,
      a.new_values AS "newValues",
      a.changed_fields,
      a.changed_fields AS "changedFields",
      a.ip_address,
      a.ip_address AS "ipAddress",
      a.user_agent,
      a.user_agent AS "userAgent",
      a.created_at,
      a.created_at AS "createdAt"
    FROM audit_logs a
    ${whereClause}
    ORDER BY ${sortColumn} ${order}
    LIMIT ${limitParam} OFFSET ${offsetParam}
  `;

  const dataRes = await pool.query(dataQuery, values);

  return {
    logs: dataRes.rows,
    total,
    page: validPage,
    totalPages,
    limit: validLimit,
    pagination: {
      page: validPage,
      limit: validLimit,
      total,
      totalPages,
    },
  };
}

/**
 * Fetch detailed audit log by primary key.
 */
export async function getAuditLogById(pool, id) {
  const result = await pool.query(
    `SELECT
       a.id,
       a.actor_user_id AS "actorUserId",
       a.actor_username AS "actorUsername",
       a.actor_role AS "actorRole",
       a.action,
       a.status,
       a.entity_type AS "entityType",
       a.entity_id AS "entityId",
       a.description,
       a.old_values AS "oldValues",
       a.new_values AS "newValues",
       a.changed_fields AS "changedFields",
       a.ip_address AS "ipAddress",
       a.user_agent AS "userAgent",
       a.created_at AS "createdAt"
     FROM audit_logs a
     WHERE a.id = $1`,
    [id],
  );

  return result.rows[0] || null;
}

/**
 * Retrieve activity overview statistics, distinguishing lifetime totals
 * from date-filtered periods, plus user summaries and daily trends.
 */
export async function getAuditOverview(pool, { startDate = "", endDate = "" } = {}) {
  // 1. Lifetime totals
  const lifetimeRes = await pool.query("SELECT * FROM v_audit_activity_overview");
  const lifetime = lifetimeRes.rows[0] || {
    total_actions: 0,
    total_success: 0,
    total_failure: 0,
    total_creates: 0,
    total_updates: 0,
    total_deletes: 0,
    last_activity_at: null,
  };

  // 2. Date filtered metrics
  const conditions = [];
  const values = [];

  if (startDate && startDate.trim()) {
    values.push(startDate.trim());
    conditions.push(`created_at >= $${values.length}::timestamptz`);
  }
  if (endDate && endDate.trim()) {
    values.push(endDate.trim());
    conditions.push(`created_at <= $${values.length}::timestamptz`);
  }

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(" AND ")}` : "";

  const filteredQuery = `
    SELECT
      COUNT(*)::bigint AS total_actions,
      COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint AS total_success,
      COUNT(*) FILTER (WHERE status = 'FAILURE')::bigint AS total_failure,
      COUNT(*) FILTER (WHERE action IN ('CREATE', 'INSERT'))::bigint AS total_creates,
      COUNT(*) FILTER (WHERE action IN ('UPDATE', 'UPDATE_PROFILE', 'UPDATE_PREFERENCES', 'APPROVE', 'REJECT', 'MATCH', 'COLLECT', 'ACTIVATE', 'ARCHIVE'))::bigint AS total_updates,
      COUNT(*) FILTER (WHERE action IN ('DELETE', 'REMOVE'))::bigint AS total_deletes,
      MAX(created_at) AS last_activity_at
    FROM audit_logs
    ${whereClause}
  `;
  const filteredRes = await pool.query(filteredQuery, values);
  const filtered = filteredRes.rows[0] || lifetime;

  // 3. Activity by User
  const userSummaryQuery = `
    SELECT
      actor_username AS username,
      actor_role AS role,
      COUNT(*) FILTER (WHERE action IN ('CREATE', 'INSERT'))::bigint AS creates,
      COUNT(*) FILTER (WHERE action IN ('UPDATE', 'UPDATE_PROFILE', 'UPDATE_PREFERENCES', 'APPROVE', 'REJECT', 'MATCH', 'COLLECT', 'ACTIVATE', 'ARCHIVE'))::bigint AS updates,
      COUNT(*) FILTER (WHERE action IN ('DELETE', 'REMOVE'))::bigint AS deletes,
      COUNT(*)::bigint AS total,
      MAX(created_at) AS "lastActionAt"
    FROM audit_logs
    ${whereClause}
    GROUP BY actor_username, actor_role
    ORDER BY total DESC
    LIMIT 15
  `;
  const userSummaryRes = await pool.query(userSummaryQuery, values);

  // 4. Activity by Role
  const roleSummaryQuery = `
    SELECT
      actor_role AS role,
      COUNT(*)::bigint AS count
    FROM audit_logs
    ${whereClause}
    GROUP BY actor_role
    ORDER BY count DESC
  `;
  const roleSummaryRes = await pool.query(roleSummaryQuery, values);

  // 5. Activity by Entity Type
  const entitySummaryQuery = `
    SELECT
      entity_type AS "entityType",
      COUNT(*)::bigint AS count
    FROM audit_logs
    ${whereClause}
    GROUP BY entity_type
    ORDER BY count DESC
    LIMIT 10
  `;
  const entitySummaryRes = await pool.query(entitySummaryQuery, values);

  // 6. Daily activity trends (last 30 days)
  const dailyActivityQuery = `
    SELECT
      (created_at AT TIME ZONE 'UTC')::date::text AS date,
      COUNT(*)::bigint AS count,
      COUNT(*) FILTER (WHERE status = 'SUCCESS')::bigint AS "successCount",
      COUNT(*) FILTER (WHERE status = 'FAILURE')::bigint AS "failureCount"
    FROM audit_logs
    ${whereClause}
    GROUP BY (created_at AT TIME ZONE 'UTC')::date
    ORDER BY (created_at AT TIME ZONE 'UTC')::date DESC
    LIMIT 30
  `;
  const dailyActivityRes = await pool.query(dailyActivityQuery, values);

  // 7. Recent 10 activities
  const recentQuery = `
    SELECT
      id,
      actor_username AS "actorUsername",
      actor_role AS "actorRole",
      action,
      status,
      entity_type AS "entityType",
      entity_id AS "entityId",
      description,
      created_at AS "createdAt"
    FROM audit_logs
    ORDER BY created_at DESC
    LIMIT 10
  `;
  const recentRes = await pool.query(recentQuery);

  const usersSummary = userSummaryRes.rows.map((u) => ({
    ...u,
    total_actions: u.total,
  }));

  return {
    lifetime,
    filtered,
    metrics: filtered,
    userSummary: usersSummary,
    usersSummary,
    roleSummary: roleSummaryRes.rows,
    rolesSummary: roleSummaryRes.rows,
    entitySummary: entitySummaryRes.rows,
    entitiesSummary: entitySummaryRes.rows,
    dailyActivity: dailyActivityRes.rows,
    recentActivity: recentRes.rows,
  };
}

function internalHashPassword(password) {
  const salt = crypto.randomBytes(16).toString("hex");
  const hash = crypto.scryptSync(password, salt, 64).toString("hex");
  return `scrypt:${salt}:${hash}`;
}

/**
 * Recover a previously deleted entity from its audit log snapshot.
 */
export async function recoverDeletedAuditRecord(pool, logId, actorUser, req) {
  const log = await getAuditLogById(pool, logId);
  if (!log) {
    const err = new Error("Audit log record not found.");
    err.statusCode = 404;
    throw err;
  }

  const actionUpper = String(log.action || "").toUpperCase();
  if (actionUpper !== "DELETE" && actionUpper !== "REMOVE") {
    const err = new Error("Only deleted audit records can be recovered.");
    err.statusCode = 400;
    throw err;
  }

  const snapshot = log.oldValues;
  if (!snapshot || typeof snapshot !== "object" || Object.keys(snapshot).length === 0) {
    const err = new Error("No historical snapshot data found to recover this record.");
    err.statusCode = 400;
    throw err;
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    await setAuditContext(client, actorUser, req);

    const entityType = String(log.entityType || "").toLowerCase();
    let recoveredRecord = null;
    let detailsMessage = "";

    if (entityType === "users") {
      if (snapshot.email) {
        const emailCheck = await client.query(
          "SELECT user_id, email FROM users WHERE LOWER(email) = LOWER($1)",
          [snapshot.email],
        );
        if (emailCheck.rows.length > 0) {
          const err = new Error(
            `Cannot recover user: an account with email "${snapshot.email}" already exists (User #${emailCheck.rows[0].user_id}).`,
          );
          err.statusCode = 409;
          throw err;
        }
      }

      if (log.entityId && !isNaN(Number(log.entityId))) {
        const idCheck = await client.query(
          "SELECT user_id FROM users WHERE user_id = $1",
          [Number(log.entityId)],
        );
        if (idCheck.rows.length > 0) {
          const err = new Error(`Cannot recover user: user account #${log.entityId} already exists.`);
          err.statusCode = 409;
          throw err;
        }
      }

      const defaultPassword = "Recovered2026!";
      const passHash =
        snapshot.password_hash ||
        snapshot.passwordHash ||
        internalHashPassword(defaultPassword);
      const role = snapshot.role || "student";
      const name = snapshot.name || snapshot.username || `User ${log.entityId}`;
      const email = snapshot.email || `recovered_${log.entityId}@campus.edu`;
      const username = snapshot.username || email.split("@")[0];

      let insertRes;
      if (log.entityId && !isNaN(Number(log.entityId))) {
        insertRes = await client.query(
          `INSERT INTO users (user_id, name, email, password_hash, role, username, is_active)
           VALUES ($1, $2, $3, $4, $5, $6, true)
           RETURNING user_id AS id, name, email, role, username, is_active AS "isActive"`,
          [Number(log.entityId), name, email, passHash, role, username],
        );
        await client.query(
          "SELECT setval('users_user_id_seq', (SELECT GREATEST(MAX(user_id), 1) FROM users))",
        );
      } else {
        insertRes = await client.query(
          `INSERT INTO users (name, email, password_hash, role, username, is_active)
           VALUES ($1, $2, $3, $4, $5, true)
           RETURNING user_id AS id, name, email, role, username, is_active AS "isActive"`,
          [name, email, passHash, role, username],
        );
      }
      recoveredRecord = insertRes.rows[0];
      detailsMessage = `User account "${recoveredRecord.name}" (${recoveredRecord.email}) has been recovered.`;
    } else if (entityType === "items") {
      if (log.entityId && !isNaN(Number(log.entityId))) {
        const idCheck = await client.query("SELECT item_id FROM items WHERE item_id = $1", [
          Number(log.entityId),
        ]);
        if (idCheck.rows.length > 0) {
          const err = new Error(`Cannot recover report: report #${log.entityId} already exists.`);
          err.statusCode = 409;
          throw err;
        }
      }

      const title = snapshot.title || `Recovered Item #${log.entityId}`;
      const itemType = snapshot.item_type || snapshot.itemType || snapshot.type || "lost";
      const description =
        snapshot.description || snapshot.title || "Recovered report from audit log snapshot";
      const status = snapshot.status || "reported";
      const reporterName = snapshot.reporter_name || snapshot.reporterName || "Campus Member";
      const dateReported =
        snapshot.date_reported || snapshot.dateReported || new Date().toISOString().split("T")[0];

      let reporterId =
        snapshot.reporter_id ||
        snapshot.reporterId ||
        actorUser?.id ||
        (actorUser?.userId ? Number(actorUser.userId) : null);
      if (!reporterId) {
        const u = await client.query("SELECT user_id FROM users LIMIT 1");
        reporterId = u.rows[0]?.user_id || 1;
      } else {
        const uCheck = await client.query("SELECT user_id FROM users WHERE user_id = $1", [reporterId]);
        if (uCheck.rows.length === 0) {
          const uFallback = await client.query("SELECT user_id FROM users LIMIT 1");
          reporterId = uFallback.rows[0]?.user_id || reporterId;
        }
      }

      let categoryId = snapshot.category_id || snapshot.categoryId;
      if (!categoryId) {
        const catRes = await client.query("SELECT category_id FROM categories LIMIT 1");
        categoryId = catRes.rows[0]?.category_id || 1;
      } else {
        const catCheck = await client.query("SELECT category_id FROM categories WHERE category_id = $1", [categoryId]);
        if (catCheck.rows.length === 0) {
          const catFallback = await client.query("SELECT category_id FROM categories LIMIT 1");
          categoryId = catFallback.rows[0]?.category_id || categoryId;
        }
      }

      let insertRes;
      if (log.entityId && !isNaN(Number(log.entityId))) {
        insertRes = await client.query(
          `INSERT INTO items (item_id, title, item_type, description, status, reporter_name, date_reported, reporter_id, category_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
           RETURNING item_id AS id, title, item_type AS "itemType", status`,
          [Number(log.entityId), title, itemType, description, status, reporterName, dateReported, reporterId, categoryId],
        );
        await client.query(
          "SELECT setval('items_item_id_seq', (SELECT GREATEST(MAX(item_id), 1) FROM items))",
        );
      } else {
        insertRes = await client.query(
          `INSERT INTO items (title, item_type, description, status, reporter_name, date_reported, reporter_id, category_id)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8)
           RETURNING item_id AS id, title, item_type AS "itemType", status`,
          [title, itemType, description, status, reporterName, dateReported, reporterId, categoryId],
        );
      }
      recoveredRecord = insertRes.rows[0];
      detailsMessage = `Report case #${recoveredRecord.id} ("${recoveredRecord.title}") has been recovered.`;
    } else if (entityType === "campus_maps") {
      if (log.entityId && !isNaN(Number(log.entityId))) {
        const idCheck = await client.query("SELECT map_id FROM campus_maps WHERE map_id = $1", [
          Number(log.entityId),
        ]);
        if (idCheck.rows.length > 0) {
          const err = new Error(`Cannot recover map: campus map #${log.entityId} already exists.`);
          err.statusCode = 409;
          throw err;
        }
      }

      const title = snapshot.title || `Recovered Map Version #${log.entityId}`;
      const imageUrl = snapshot.image_url || snapshot.imageUrl || "";
      const svgOverlay = snapshot.svg_overlay || snapshot.svgOverlay || null;

      let insertRes;
      if (log.entityId && !isNaN(Number(log.entityId))) {
        insertRes = await client.query(
          `INSERT INTO campus_maps (map_id, title, image_url, svg_overlay, is_active, is_archived)
           VALUES ($1, $2, $3, $4, false, false)
           RETURNING map_id AS id, title, is_active AS "isActive"`,
          [Number(log.entityId), title, imageUrl, svgOverlay],
        );
        await client.query(
          "SELECT setval('campus_maps_map_id_seq', (SELECT GREATEST(MAX(map_id), 1) FROM campus_maps))",
        );
      } else {
        insertRes = await client.query(
          `INSERT INTO campus_maps (title, image_url, svg_overlay, is_active, is_archived)
           VALUES ($1, $2, $3, false, false)
           RETURNING map_id AS id, title, is_active AS "isActive"`,
          [title, imageUrl, svgOverlay],
        );
      }
      recoveredRecord = insertRes.rows[0];
      detailsMessage = `Campus map version #${recoveredRecord.id} ("${recoveredRecord.title}") recovered in inactive state.`;
    } else if (entityType === "buildings") {
      if (log.entityId && !isNaN(Number(log.entityId))) {
        const idCheck = await client.query(
          "SELECT building_id FROM buildings WHERE building_id = $1",
          [Number(log.entityId)],
        );
        if (idCheck.rows.length > 0) {
          const err = new Error(`Cannot recover building: building #${log.entityId} already exists.`);
          err.statusCode = 409;
          throw err;
        }
      }
      const name = snapshot.name || snapshot.building_name || `Recovered Building #${log.entityId}`;
      const code =
        snapshot.code || snapshot.building_code || `B${log.entityId || Date.now().toString().slice(-4)}`;

      let insertRes;
      if (log.entityId && !isNaN(Number(log.entityId))) {
        insertRes = await client.query(
          `INSERT INTO buildings (building_id, name, code, is_archived)
           VALUES ($1, $2, $3, false)
           RETURNING building_id AS id, name, code`,
          [Number(log.entityId), name, code],
        );
        await client.query(
          "SELECT setval('buildings_building_id_seq', (SELECT GREATEST(MAX(building_id), 1) FROM buildings))",
        );
      } else {
        insertRes = await client.query(
          `INSERT INTO buildings (name, code, is_archived)
           VALUES ($1, $2, false)
           RETURNING building_id AS id, name, code`,
          [name, code],
        );
      }
      recoveredRecord = insertRes.rows[0];
      detailsMessage = `Building "${recoveredRecord.name}" (${recoveredRecord.code}) recovered successfully.`;
    } else if (entityType === "floors") {
      const buildingId = snapshot.building_id || snapshot.buildingId;
      if (!buildingId) {
        const err = new Error("Cannot recover floor without parent building reference.");
        err.statusCode = 400;
        throw err;
      }
      const bCheck = await client.query(
        "SELECT building_id FROM buildings WHERE building_id = $1",
        [buildingId],
      );
      if (bCheck.rows.length === 0) {
        const err = new Error(
          `Cannot recover floor: parent building #${buildingId} does not exist. Please recover or create the building first.`,
        );
        err.statusCode = 409;
        throw err;
      }
      const floorNumber = snapshot.floor_number ?? snapshot.floorNumber ?? 1;
      const floorName = snapshot.floor_name || snapshot.name || `Floor ${floorNumber}`;

      let insertRes;
      if (log.entityId && !isNaN(Number(log.entityId))) {
        insertRes = await client.query(
          `INSERT INTO floors (floor_id, building_id, floor_number, floor_name, is_archived)
           VALUES ($1, $2, $3, $4, false)
           RETURNING floor_id AS id, building_id, floor_number, floor_name`,
          [Number(log.entityId), buildingId, floorNumber, floorName],
        );
        await client.query(
          "SELECT setval('floors_floor_id_seq', (SELECT GREATEST(MAX(floor_id), 1) FROM floors))",
        );
      } else {
        insertRes = await client.query(
          `INSERT INTO floors (building_id, floor_number, floor_name, is_archived)
           VALUES ($1, $2, $3, false)
           RETURNING floor_id AS id, building_id, floor_number, floor_name`,
          [buildingId, floorNumber, floorName],
        );
      }
      recoveredRecord = insertRes.rows[0];
      detailsMessage = `Floor "${recoveredRecord.floor_name}" (Building #${buildingId}) recovered successfully.`;
    } else if (entityType === "rooms") {
      const floorId = snapshot.floor_id || snapshot.floorId;
      if (!floorId) {
        const err = new Error("Cannot recover room without parent floor reference.");
        err.statusCode = 400;
        throw err;
      }
      const fCheck = await client.query("SELECT floor_id FROM floors WHERE floor_id = $1", [
        floorId,
      ]);
      if (fCheck.rows.length === 0) {
        const err = new Error(
          `Cannot recover room: parent floor #${floorId} does not exist. Please recover or create the floor first.`,
        );
        err.statusCode = 409;
        throw err;
      }
      const roomNumber = snapshot.room_number || snapshot.roomNumber || `R-${log.entityId}`;
      const roomName = snapshot.room_name || snapshot.name || `Room ${roomNumber}`;

      let insertRes;
      if (log.entityId && !isNaN(Number(log.entityId))) {
        insertRes = await client.query(
          `INSERT INTO rooms (room_id, floor_id, room_number, room_name, is_archived)
           VALUES ($1, $2, $3, $4, false)
           RETURNING room_id AS id, floor_id, room_number, room_name`,
          [Number(log.entityId), floorId, roomNumber, roomName],
        );
        await client.query(
          "SELECT setval('rooms_room_id_seq', (SELECT GREATEST(MAX(room_id), 1) FROM rooms))",
        );
      } else {
        insertRes = await client.query(
          `INSERT INTO rooms (floor_id, room_number, room_name, is_archived)
           VALUES ($1, $2, $3, false)
           RETURNING room_id AS id, floor_id, room_number, room_name`,
          [floorId, roomNumber, roomName],
        );
      }
      recoveredRecord = insertRes.rows[0];
      detailsMessage = `Room "${recoveredRecord.room_name}" (#${recoveredRecord.room_number}) recovered successfully.`;
    } else {
      // Dynamic fallback for any other table by inspecting information_schema
      const colsRes = await client.query(
        `SELECT column_name, data_type, is_nullable
         FROM information_schema.columns
         WHERE table_name = $1 AND table_schema = 'public'`,
        [entityType],
      );
      if (colsRes.rows.length === 0) {
        const err = new Error(`Cannot automatically recover entity of unknown type "${entityType}".`);
        err.statusCode = 400;
        throw err;
      }
      const validCols = new Set(colsRes.rows.map((r) => r.column_name.toLowerCase()));
      const insertCols = [];
      const insertVals = [];
      const params = [];
      let pIdx = 1;

      for (const [key, val] of Object.entries(snapshot)) {
        const colName = key.toLowerCase();
        if (validCols.has(colName) && val !== undefined) {
          insertCols.push(colName);
          insertVals.push(`$${pIdx++}`);
          params.push(val);
        }
      }

      if (insertCols.length === 0) {
        const err = new Error(`No matching valid database columns found in snapshot for "${entityType}".`);
        err.statusCode = 400;
        throw err;
      }

      const q = `INSERT INTO ${entityType} (${insertCols.join(", ")}) VALUES (${insertVals.join(", ")}) RETURNING *`;
      const dynRes = await client.query(q, params);
      recoveredRecord = dynRes.rows[0];
      detailsMessage = `Record in "${entityType}" recovered successfully.`;
    }

    // Log the RESTORE action in the audit trail
    await logAudit(client, {
      actor: actorUser,
      action: "RESTORE",
      status: "SUCCESS",
      entityType: log.entityType,
      entityId: log.entityId || (recoveredRecord ? Object.values(recoveredRecord)[0] : null),
      description: `Admin recovered deleted ${log.entityType} #${log.entityId || ""} from audit record #${log.id}`,
      newValues: recoveredRecord,
      oldValues: null,
      req,
    });

    await client.query("COMMIT");
    return {
      success: true,
      message: detailsMessage || "Record recovered successfully.",
      recoveredRecord,
      entityType: log.entityType,
      entityId: log.entityId,
    };
  } catch (err) {
    await client.query("ROLLBACK");
    throw err;
  } finally {
    client.release();
  }
}

