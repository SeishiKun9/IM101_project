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

  // 2. GET /api/admin/audit-logs (paginated and filtered list)
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

