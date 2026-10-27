// ==============================================================================
// Admin Audit Log API Routes
// Protected endpoints for administrators to inspect audit history and overview metrics.
// ==============================================================================

import express from "express";
import {
  getAuditLogs,
  getAuditOverview,
  getAuditLogById,
  recoverDeletedAuditRecord,
} from "../services/audit.js";

export function createAdminAuditRouter({
  pool,
  asyncRoute,
  requireDatabase,
  requireAuth,
  requireRole,
}) {
  const router = express.Router();

  router.use(requireDatabase);
  router.use(requireAuth);
  router.use(requireRole("admin"));

  // 1. GET /api/admin/audit-logs/overview
  router.get(
    "/overview",
    asyncRoute(async (req, res) => {
      const overview = await getAuditOverview(pool, req.query);
      res.json(overview);
    }),
  );

  // 2. GET /api/admin/audit-logs/export/csv (export matching audit logs to CSV)
  router.get(
    "/export/csv",
    asyncRoute(async (req, res) => {
      const result = await getAuditLogs(pool, { ...req.query, page: 1, limit: 10000 });
      const logs = result.logs || [];

      const headers = [
        "Audit ID",
        "Timestamp",
        "Action",
        "Status",
        "Entity Type",
        "Entity ID",
        "Actor Username",
        "Actor Role",
        "IP Address",
        "Description",
      ];

      function escapeCsv(val) {
        if (val === null || val === undefined) return '""';
        return `"${String(val).replace(/"/g, '""')}"`;
      }

      const rows = logs.map((log) => [
        escapeCsv(log.id),
        escapeCsv(log.createdAt),
        escapeCsv(log.action),
        escapeCsv(log.status),
        escapeCsv(log.entityType),
        escapeCsv(log.entityId),
        escapeCsv(log.actorUsername),
        escapeCsv(log.actorRole),
        escapeCsv(log.ipAddress),
        escapeCsv(log.description),
      ]);

      const csvContent = [headers.join(","), ...rows.map((r) => r.join(","))].join("\r\n");
      const filename = `audit-logs-${new Date().toISOString().slice(0, 10)}.csv`;
      res.setHeader("Content-Type", "text/csv; charset=utf-8");
      res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
      res.send(csvContent);
    }),
  );

  // 3. GET /api/admin/audit-logs (paginated and filtered list)
  router.get(
    "/",
    asyncRoute(async (req, res) => {
      const result = await getAuditLogs(pool, req.query);
      res.json(result);
    }),
  );

  // 3. GET /api/admin/audit-logs/:id (single log detail)
  router.get(
    "/:id",
    asyncRoute(async (req, res) => {
      const log = await getAuditLogById(pool, req.params.id);
      if (!log) {
        return res.status(404).json({ error: "Audit record not found." });
      }
      res.json(log);
    }),
  );

  // 4. POST /api/admin/audit-logs/:id/recover (recover deleted record from snapshot)
  router.post(
    "/:id/recover",
    asyncRoute(async (req, res) => {
      try {
        const result = await recoverDeletedAuditRecord(
          pool,
          req.params.id,
          req.user,
          req,
        );
        res.json(result);
      } catch (err) {
        const status = err.statusCode || (err.message.includes("exists") ? 409 : 400);
        res.status(status).json({ error: err.message });
      }
    }),
  );

  return router;
}

