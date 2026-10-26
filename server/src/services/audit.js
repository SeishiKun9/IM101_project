// ==============================================================================
// PostgreSQL Audit Logging Service
// Comprehensive, centralized audit trail with transaction safety,
// snapshot sanitation, automatic diffing, and query services.
// ==============================================================================

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

  const result = await clientOrPool.query(query, values);
  return result.rows[0];
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

  const validLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 20));
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

  if (startDate && startDate.trim()) {
    values.push(startDate.trim());
    conditions.push(`a.created_at >= $${values.length}::timestamptz`);
  }

  if (endDate && endDate.trim()) {
    values.push(endDate.trim());
    conditions.push(`a.created_at <= $${values.length}::timestamptz`);
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
