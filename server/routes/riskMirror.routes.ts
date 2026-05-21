import type { Express, Request, Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import { buildReadOnlyRiskMirrorSnapshot } from "../services/riskMirror/riskMirrorService";
import {
  emitAuditEvent,
  emitRiskMirrorAuditIfAllowed,
} from "../services/system/auditLogService";

function resolveUserId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

export function registerRiskMirrorRoutes(app: Express): void {
  app.get(
    "/api/risk-mirror/bingx",
    requireSaasAuth,
    async (req: Request, res: Response) => {
      const userId = resolveUserId(req);
      if (userId == null) {
        return res.status(401).json({
          success: false,
          code: "UNAUTHORIZED",
          message: "Authentication required.",
        });
      }

      const connectionId =
        typeof req.query.connectionId === "string"
          ? req.query.connectionId.trim()
          : "";
      const symbol =
        typeof req.query.symbol === "string" && req.query.symbol.trim()
          ? req.query.symbol.trim()
          : "BTC-USDT";

      if (!connectionId) {
        return res.status(400).json({
          success: false,
          code: "MISSING_CONNECTION_ID",
          message: "connectionId is required.",
        });
      }

      try {
        const snapshot = await buildReadOnlyRiskMirrorSnapshot(
          connectionId,
          userId,
          symbol,
        );

        for (const w of snapshot.warnings) {
          if (w.severity === "danger" || w.severity === "warning") {
            void emitRiskMirrorAuditIfAllowed(userId, w.id, {
              type:
                w.severity === "danger" ? "risk_mirror_error" : "risk_mirror_warning",
              severity: w.severity === "danger" ? "error" : "warning",
              message: `${w.title}: ${w.message}`,
              metadata: {
                source: "risk_mirror",
                warningId: w.id,
                symbol,
                connectionId,
              },
            });
          }
        }

        res.json({ success: true, snapshot });
      } catch (error: unknown) {
        const message =
          error instanceof Error
            ? error.message
            : "Risk mirror snapshot failed.";

        console.error(
          "[API] GET /api/risk-mirror/bingx error:",
          error instanceof Error ? error.message : error,
        );

        void emitAuditEvent({
          userId,
          type: "risk_mirror_error",
          severity: "error",
          message: "Risk mirror snapshot failed",
          metadata: {
            source: "risk_mirror",
            connectionId,
            symbol,
            safeReason: message.slice(0, 200),
          },
        });

        res.status(500).json({
          success: false,
          code: "RISK_MIRROR_FAILED",
          message: "Unable to build risk mirror snapshot.",
        });
      }
    },
  );
}
