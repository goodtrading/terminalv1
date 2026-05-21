import type { Express, Request, Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import {
  CLIENT_ALLOWED_AUDIT_TYPES,
  emitAuditEvent,
  getAuditEvents,
  type AuditEventSeverity,
  type AuditEventType,
} from "../services/system/auditLogService";
import { getSystemHealthForUser } from "../services/system/systemHealthService";

function resolveUserId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

const VALID_SEVERITIES = new Set<AuditEventSeverity>(["info", "warning", "error"]);

export function registerSystemRoutes(app: Express): void {
  app.get(
    "/api/system/health",
    requireSaasAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = resolveUserId(req);
        if (userId == null) {
          return res.status(401).json({
            success: false,
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          });
        }

        const symbol =
          typeof req.query.symbol === "string" && req.query.symbol.trim()
            ? req.query.symbol.trim()
            : "BTC-USDT";

        const { snapshot, recentAudit } = await getSystemHealthForUser(
          userId,
          symbol,
        );

        res.json({ success: true, snapshot, recentAudit });
      } catch (error: unknown) {
        console.error(
          "[API] GET /api/system/health error:",
          error instanceof Error ? error.message : error,
        );
        res.status(500).json({
          success: false,
          code: "SYSTEM_HEALTH_FAILED",
          message: "Failed to load system health.",
        });
      }
    },
  );

  app.get(
    "/api/system/audit-log",
    requireSaasAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = resolveUserId(req);
        if (userId == null) {
          return res.status(401).json({
            success: false,
            code: "UNAUTHORIZED",
            message: "Authentication required for audit log.",
          });
        }

        const limitRaw = req.query.limit != null ? Number(req.query.limit) : 80;
        const limit = Number.isFinite(limitRaw)
          ? Math.min(200, Math.max(1, limitRaw))
          : 80;

        const events = await getAuditEvents({
          userId,
          limit,
          includeGlobal: true,
        });

        res.json({ success: true, events });
      } catch (error: unknown) {
        console.error(
          "[API] GET /api/system/audit-log error:",
          error instanceof Error ? error.message : error,
        );
        res.status(500).json({
          success: false,
          code: "AUDIT_LOG_READ_FAILED",
          message: "Failed to load audit log.",
        });
      }
    },
  );

  app.post(
    "/api/system/audit-log/client-event",
    requireSaasAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = resolveUserId(req);
        if (userId == null) {
          return res.status(401).json({
            success: false,
            code: "UNAUTHORIZED",
            message: "Authentication required.",
          });
        }

        const body = req.body as Record<string, unknown> | undefined;
        const type = typeof body?.type === "string" ? body.type : "";
        const message =
          typeof body?.message === "string" ? body.message.trim() : "";
        const severityRaw =
          typeof body?.severity === "string" ? body.severity : "info";

        if (!message || message.length > 500) {
          return res.status(400).json({
            success: false,
            code: "INVALID_AUDIT_EVENT",
            message: "A valid message is required (max 500 chars).",
          });
        }

        if (!CLIENT_ALLOWED_AUDIT_TYPES.has(type as AuditEventType)) {
          return res.status(403).json({
            success: false,
            code: "AUDIT_TYPE_FORBIDDEN",
            message: "This audit event type cannot be submitted from the client.",
          });
        }

        const severity = VALID_SEVERITIES.has(severityRaw as AuditEventSeverity)
          ? (severityRaw as AuditEventSeverity)
          : "info";

        const metadata =
          body?.metadata != null &&
          typeof body.metadata === "object" &&
          !Array.isArray(body.metadata)
            ? (body.metadata as Record<string, unknown>)
            : undefined;

        const event = await emitAuditEvent({
          userId,
          type: type as AuditEventType,
          severity,
          message,
          metadata,
        });

        res.json({ success: true, event });
      } catch (error: unknown) {
        console.error(
          "[API] POST /api/system/audit-log/client-event error:",
          error instanceof Error ? error.message : error,
        );
        res.status(500).json({
          success: false,
          code: "AUDIT_LOG_WRITE_FAILED",
          message: "Failed to record audit event.",
        });
      }
    },
  );
}
