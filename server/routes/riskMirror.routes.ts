import type { Express, Request, Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import { buildReadOnlyRiskMirrorSnapshot } from "../services/riskMirror/riskMirrorService";
import { emitAuditEvent } from "../services/system/auditLogService";
import {
  emitRiskMirrorAuditsFromSnapshot,
  emitRiskMirrorServiceErrorIfAllowed,
} from "../services/system/riskMirrorAudits";

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

        void emitRiskMirrorAuditsFromSnapshot(
          userId,
          connectionId,
          symbol,
          snapshot,
        );

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

        void emitRiskMirrorServiceErrorIfAllowed(
          userId,
          connectionId,
          symbol,
          "RISK_MIRROR_FAILED",
          "Risk mirror snapshot failed",
        );

        res.status(500).json({
          success: false,
          code: "RISK_MIRROR_FAILED",
          message: "Unable to build risk mirror snapshot.",
        });
      }
    },
  );
}
