import { randomUUID } from "node:crypto";
import type { Express, Request, Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import { requireMobileTerminalPlan } from "../middleware/mobileTerminalGuard";
import { mobileRateLimit } from "../middleware/mobileRateLimit";
import { parseMobileMarketStateV2Query } from "../mobile/v2/mobileMarketStateV2.schema";
import {
  attachResponseMetrics,
  projectCanonicalSnapshot,
} from "../mobile/v2/buildCanonicalMobileState";
import { getCanonicalMobileSnapshot } from "../mobile/v2/mobileMarketStateCache";
import { SUPPORTED_ASSETS } from "../mobile/v2/mobileMarketStateV2.types";

declare global {
  namespace Express {
    interface Request {
      mobileV2RequestId?: string;
    }
  }
}

function requestIdMiddleware(req: Request, res: Response, next: () => void): void {
  const incoming = req.headers["x-request-id"];
  const requestId =
    typeof incoming === "string" && incoming.trim().length > 0
      ? incoming.trim()
      : randomUUID();
  req.mobileV2RequestId = requestId;
  res.setHeader("X-Request-Id", requestId);
  next();
}

export function registerMobileMarketStateV2Routes(app: Express): void {
  app.get(
    "/api/mobile/market-state/v2",
    requestIdMiddleware,
    requireSaasAuth,
    requireMobileTerminalPlan,
    mobileRateLimit({
      scope: "mobile.market-state.v2",
      max: 60,
      windowMs: 60_000,
      code: "MOBILE_RATE_LIMITED",
    }),
    async (req: Request, res: Response) => {
      const requestId = req.mobileV2RequestId ?? randomUUID();
      const servedAt = new Date().toISOString();

      const parsed = parseMobileMarketStateV2Query(req.query as Record<string, unknown>);
      if (!parsed.ok) {
        if (parsed.error === "UNSUPPORTED_ASSET") {
          res.status(400).json({
            status: "error",
            error: {
              code: "UNSUPPORTED_ASSET",
              message: "Only BTC is currently supported",
              supportedAssets: [...SUPPORTED_ASSETS],
            },
            meta: { requestId, servedAt },
          });
          return;
        }
        res.status(400).json({
          status: "error",
          error: {
            code: "INVALID_MODE",
            message: "mode must be one of: micro, macro, both",
          },
          meta: { requestId, servedAt },
        });
        return;
      }

      const { asset, mode } = parsed.value;

      try {
        const { snapshot } = await getCanonicalMobileSnapshot(asset);
        const serializeStart = Date.now();
        const projected = projectCanonicalSnapshot(snapshot, mode, mode);
        const data = attachResponseMetrics(projected, serializeStart);

        console.log("[MobileV2] served", {
          requestId,
          userId: req.mobileTerminalAccess?.userId ?? null,
          asset,
          mode,
          snapshotId: data.metadata.snapshotId,
          cacheHit: data.metadata.cacheHit,
          buildTimeMs: data.metadata.buildTimeMs,
          bytes: data.metadata.approximateResponseBytes,
        });

        res.json({
          status: "success",
          data,
          meta: {
            requestId,
            generatedAt: data.metadata.generatedAt,
            servedAt,
            snapshotId: data.metadata.snapshotId,
          },
        });
      } catch (error) {
        console.error("[MobileV2] error", {
          requestId,
          message: error instanceof Error ? error.message : String(error),
        });
        res.status(500).json({
          status: "error",
          error: {
            code: "MARKET_STATE_UNAVAILABLE",
            message: "Failed to build mobile market state",
          },
          meta: { requestId, servedAt },
        });
      }
    },
  );

  console.log("[MobileV2] Endpoint registered: GET /api/mobile/market-state/v2");
}
