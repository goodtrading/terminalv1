import type { Express, Request, Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import { requireBingxTerminalPlan } from "../middleware/bingxTerminalGuard";
import { bingxRateLimit } from "../middleware/bingxRateLimit";
import {
  BingxAccountError,
  getBingxAccountSnapshot,
  getSafeConnectionStatus,
  getTimeline,
  isBingxAccountEnabled,
  manualBingxAccountRefresh,
  buildTraderActionContext,
  getBingxAccountMetricsSnapshot,
} from "../integrations/bingx/account";
import { getConnectionForUser } from "../services/exchanges/bingx/bingxCredentialStore";

function resolveRequestUserId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function requireUserId(req: Request, res: Response): number | null {
  const id = resolveRequestUserId(req);
  if (id != null) return id;
  res.status(401).json({
    success: false,
    code: "BINGX_ACCOUNT_UNAUTHORIZED",
    message: "You must be logged in to view BingX account activity.",
  });
  return null;
}

function capInt(raw: unknown, fallback: number, max: number): number {
  const n = Number(raw);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(1, Math.min(max, Math.floor(n)));
}

function disabled(res: Response): void {
  res.status(403).json({
    success: false,
    code: "BINGX_ACCOUNT_DISABLED",
    message:
      "BingX account read model is disabled. Set GOODTRADING_BINGX_ACCOUNT_ENABLED=true.",
  });
}

function requireConnection(
  req: Request,
  res: Response,
  userId: number,
): string | null {
  const connectionId = String(req.query.connectionId ?? req.body?.connectionId ?? "").trim();
  if (!connectionId) {
    res.status(400).json({
      success: false,
      code: "BINGX_CONNECTION_NOT_FOUND",
      message: "connectionId is required.",
    });
    return null;
  }
  if (!getConnectionForUser(connectionId, userId)) {
    res.status(404).json({
      success: false,
      code: "BINGX_CONNECTION_NOT_FOUND",
      message: "BingX connection not found for this user.",
    });
    return null;
  }
  return connectionId;
}

function mapError(res: Response, err: unknown): void {
  if (err instanceof BingxAccountError) {
    const status =
      err.code === "BINGX_ACCOUNT_DISABLED"
        ? 403
        : err.code === "BINGX_CONNECTION_NOT_FOUND"
          ? 404
          : err.code === "BINGX_WRITE_OPERATION_BLOCKED"
            ? 403
            : err.code === "BINGX_RATE_LIMITED"
              ? 429
              : 400;
    const safe = err.toSafeClient();
    res.status(status).json({ success: false, ...safe });
    return;
  }
  res.status(500).json({
    success: false,
    code: "BINGX_ACCOUNT_ERROR",
    message: "BingX account request failed.",
  });
}

/**
 * AI-8.0 authenticated read-only account APIs.
 * No order placement / cancel / amend endpoints.
 */
export function registerBingxAccountRoutes(app: Express): void {
  const auth = [requireSaasAuth, requireBingxTerminalPlan] as const;

  app.get(
    "/api/account/bingx/status",
    ...auth,
    bingxRateLimit({ scope: "bingx.account.status", max: 30, windowMs: 60_000 }),
    (req, res) => {
      try {
        const userId = requireUserId(req, res);
        if (userId == null) return;
        const connectionId =
          typeof req.query.connectionId === "string"
            ? req.query.connectionId.trim()
            : undefined;
        const status = getSafeConnectionStatus(userId, connectionId || undefined);
        res.json({
          success: true,
          status,
          featureEnabled: isBingxAccountEnabled(),
          badges: ["BINGX REAL", "READ ONLY", "NOT CONNECTED TO AI"],
        });
      } catch (err) {
        mapError(res, err);
      }
    },
  );

  app.get(
    "/api/account/bingx/snapshot",
    ...auth,
    bingxRateLimit({ scope: "bingx.account.snapshot", max: 15, windowMs: 60_000 }),
    async (req, res) => {
      try {
        if (!isBingxAccountEnabled()) return disabled(res);
        const userId = requireUserId(req, res);
        if (userId == null) return;
        const connectionId = requireConnection(req, res, userId);
        if (!connectionId) return;
        const symbol =
          typeof req.query.symbol === "string" ? req.query.symbol : undefined;
        const snapshot = await getBingxAccountSnapshot({
          userId,
          connectionId,
          symbol,
          bypassCache:
            req.query.refresh === "1" || req.query.refresh === "true",
        });
        res.json({ success: true, snapshot });
      } catch (err) {
        mapError(res, err);
      }
    },
  );

  app.get(
    "/api/account/bingx/positions",
    ...auth,
    bingxRateLimit({ scope: "bingx.account.positions", max: 20, windowMs: 60_000 }),
    async (req, res) => {
      try {
        if (!isBingxAccountEnabled()) return disabled(res);
        const userId = requireUserId(req, res);
        if (userId == null) return;
        const connectionId = requireConnection(req, res, userId);
        if (!connectionId) return;
        const snapshot = await getBingxAccountSnapshot({ userId, connectionId });
        const limit = capInt(req.query.limit, 50, 50);
        res.json({
          success: true,
          positions: snapshot.positions.slice(0, limit),
          completeness: snapshot.completeness,
          capturedAt: snapshot.capturedAt,
        });
      } catch (err) {
        mapError(res, err);
      }
    },
  );

  app.get(
    "/api/account/bingx/orders/open",
    ...auth,
    bingxRateLimit({ scope: "bingx.account.orders.open", max: 20, windowMs: 60_000 }),
    async (req, res) => {
      try {
        if (!isBingxAccountEnabled()) return disabled(res);
        const userId = requireUserId(req, res);
        if (userId == null) return;
        const connectionId = requireConnection(req, res, userId);
        if (!connectionId) return;
        const snapshot = await getBingxAccountSnapshot({ userId, connectionId });
        const limit = capInt(req.query.limit, 100, 100);
        res.json({
          success: true,
          orders: snapshot.openOrders.slice(0, limit),
          completeness: snapshot.completeness,
          capturedAt: snapshot.capturedAt,
        });
      } catch (err) {
        mapError(res, err);
      }
    },
  );

  app.get(
    "/api/account/bingx/orders/history",
    ...auth,
    bingxRateLimit({ scope: "bingx.account.orders.history", max: 15, windowMs: 60_000 }),
    async (req, res) => {
      try {
        if (!isBingxAccountEnabled()) return disabled(res);
        const userId = requireUserId(req, res);
        if (userId == null) return;
        const connectionId = requireConnection(req, res, userId);
        if (!connectionId) return;
        const snapshot = await getBingxAccountSnapshot({ userId, connectionId });
        const limit = capInt(req.query.limit, 50, 100);
        res.json({
          success: true,
          orders: snapshot.recentOrders.slice(0, limit),
          completeness: snapshot.completeness,
          capturedAt: snapshot.capturedAt,
        });
      } catch (err) {
        mapError(res, err);
      }
    },
  );

  app.get(
    "/api/account/bingx/fills",
    ...auth,
    bingxRateLimit({ scope: "bingx.account.fills", max: 15, windowMs: 60_000 }),
    async (req, res) => {
      try {
        if (!isBingxAccountEnabled()) return disabled(res);
        const userId = requireUserId(req, res);
        if (userId == null) return;
        const connectionId = requireConnection(req, res, userId);
        if (!connectionId) return;
        const snapshot = await getBingxAccountSnapshot({ userId, connectionId });
        const limit = capInt(req.query.limit, 50, 100);
        res.json({
          success: true,
          fills: snapshot.recentFills.slice(0, limit),
          completeness: snapshot.completeness,
          capturedAt: snapshot.capturedAt,
        });
      } catch (err) {
        mapError(res, err);
      }
    },
  );

  app.get(
    "/api/account/bingx/timeline",
    ...auth,
    bingxRateLimit({ scope: "bingx.account.timeline", max: 20, windowMs: 60_000 }),
    async (req, res) => {
      try {
        if (!isBingxAccountEnabled()) return disabled(res);
        const userId = requireUserId(req, res);
        if (userId == null) return;
        const connectionId = requireConnection(req, res, userId);
        if (!connectionId) return;
        const snapshot = await getBingxAccountSnapshot({ userId, connectionId });
        const limit = capInt(req.query.limit, 50, 200);
        const events = getTimeline(userId, snapshot.accountId, limit);
        res.json({
          success: true,
          events,
          mentorEligible: false,
          aiConsumptionEnabled: false,
        });
      } catch (err) {
        mapError(res, err);
      }
    },
  );

  app.post(
    "/api/account/bingx/refresh",
    ...auth,
    bingxRateLimit({ scope: "bingx.account.refresh", max: 6, windowMs: 60_000 }),
    async (req, res) => {
      try {
        if (!isBingxAccountEnabled()) return disabled(res);
        const userId = requireUserId(req, res);
        if (userId == null) return;
        const connectionId = requireConnection(req, res, userId);
        if (!connectionId) return;
        const symbol =
          typeof req.body?.symbol === "string" ? req.body.symbol : undefined;
        const snapshot = await manualBingxAccountRefresh({
          userId,
          connectionId,
          symbol,
        });
        res.json({ success: true, snapshot });
      } catch (err) {
        mapError(res, err);
      }
    },
  );

  /** Diagnostics only — sanitized metrics, no payloads. */
  app.get(
    "/api/account/bingx/metrics",
    ...auth,
    bingxRateLimit({ scope: "bingx.account.metrics", max: 10, windowMs: 60_000 }),
    (_req, res) => {
      if (!isBingxAccountEnabled()) return disabled(res);
      res.json({ success: true, metrics: getBingxAccountMetricsSnapshot() });
    },
  );

  /** Future AI context preview — still mentorEligible=false; not wired to chat. */
  app.get(
    "/api/account/bingx/trader-action-context",
    ...auth,
    bingxRateLimit({ scope: "bingx.account.tac", max: 10, windowMs: 60_000 }),
    async (req, res) => {
      try {
        if (!isBingxAccountEnabled()) return disabled(res);
        const userId = requireUserId(req, res);
        if (userId == null) return;
        const connectionId = requireConnection(req, res, userId);
        if (!connectionId) return;
        const snapshot = await getBingxAccountSnapshot({ userId, connectionId });
        const context = buildTraderActionContext(snapshot);
        res.json({ success: true, context });
      } catch (err) {
        mapError(res, err);
      }
    },
  );
}
