import type { Express, Request, Response } from "express";
import { requireSaasAuth } from "../middleware/saasAuth";
import {
  getAccountSnapshot,
  isBingxApiConnectionEnabled,
  testConnection,
} from "../services/exchanges/bingx/bingxAccountService";
import {
  clearBingXReadOnlyCache,
  getBingXReadOnlyHealth,
  getBingXReadOnlySnapshot,
  mapBingXErrorToSafe,
} from "../services/exchanges/bingx/bingxReadOnlyService";
import {
  deleteConnectionForUser,
  getConnectionForUser,
  hasEncryptionKey,
  listConnectionsForUser,
  saveConnectionForUser,
  toPublicConnection,
} from "../services/exchanges/bingx/bingxCredentialStore";
import type { BingXConnectResponseConnection } from "../services/exchanges/bingx/bingxTypes";
import {
  emitAuditEvent,
  emitBingXSnapshotSyncedIfAllowed,
} from "../services/system/auditLogService";

function logBingxConnectRouteEntered(req: Request): void {
  console.log("[BingX Connect Route Entered]", {
    hasSaasUser: Boolean(req.saasUser),
    saasUserId:
      req.saasUser?.id != null && Number.isFinite(Number(req.saasUser.id)),
    hasUser: Boolean(req.user),
    userId: req.user?.id != null && Number.isFinite(Number(req.user.id)),
  });
}

function bingxUnauthorized(
  res: Response,
  bingxCode: string,
  extra?: Record<string, string | boolean | null>,
): void {
  console.log("[BingX Auth Backend] 401 response", { bingxCode, ...extra });
  res.status(401).json({
    success: false,
    code: bingxCode,
    message: "You must be logged in to manage exchange connections.",
  });
}

function resolveRequestUserId(req: Request): number | null {
  const raw = req.saasUser?.id ?? req.user?.id;
  if (raw == null) return null;
  const id = Number(raw);
  return Number.isFinite(id) ? id : null;
}

function requireUserId(
  req: Request,
  res: Response,
  route: string,
): number | null {
  const id = resolveRequestUserId(req);
  if (id != null) return id;

  let bingxCode = "BINGX_401_REQUIRE_USER_ID";
  if (!req.saasUser && !req.user) {
    bingxCode = "BINGX_401_NO_SAAS_USER";
  } else if (!req.saasUser) {
    bingxCode = "BINGX_401_NO_SAAS_USER";
  } else if (!req.user) {
    bingxCode = "BINGX_401_NO_REQ_USER";
  }

  console.log("[BingX Auth Backend] 401 response", {
    bingxCode,
    route,
    hasSaasUser: Boolean(req.saasUser),
    hasUser: Boolean(req.user),
    saasUserIdPresent:
      req.saasUser?.id != null && Number.isFinite(Number(req.saasUser.id)),
    userIdPresent:
      req.user?.id != null && Number.isFinite(Number(req.user.id)),
  });
  bingxUnauthorized(res, bingxCode, { route });
  return null;
}

function toConnectResponse(
  c: ReturnType<typeof toPublicConnection>,
): BingXConnectResponseConnection {
  return {
    id: c.id,
    exchange: "bingx",
    mode: "read-only",
    apiKeyMasked: c.apiKeyMasked,
    connected: c.status === "connected",
    tradingEnabled: false,
    readOnly: true,
    label: c.label,
    createdAt: c.createdAt,
    lastValidatedAt: c.lastValidatedAt,
    lastHealth: c.lastHealth,
  };
}

function sanitizeConnectBody(body: unknown): {
  apiKey: string;
  apiSecret: string;
  label?: string;
  save: boolean;
  requestedTrading: boolean;
} | null {
  if (!body || typeof body !== "object") return null;
  const b = body as Record<string, unknown>;
  const apiKey = typeof b.apiKey === "string" ? b.apiKey.trim() : "";
  const apiSecret = typeof b.apiSecret === "string" ? b.apiSecret.trim() : "";
  if (!apiKey || !apiSecret) return null;

  const perms = b.requestedPermissions as Record<string, unknown> | undefined;
  const requestedTrading = Boolean(perms?.trading);

  return {
    apiKey,
    apiSecret,
    label: typeof b.label === "string" ? b.label.trim() : undefined,
    save: b.save !== false,
    requestedTrading,
  };
}

export function registerBingxApiRoutes(app: Express): void {
  app.post("/api/bingx/connect", requireSaasAuth, async (req: Request, res: Response) => {
    logBingxConnectRouteEntered(req);

    try {
      const userId = requireUserId(req, res, "/api/bingx/connect");
      if (userId == null) return;

      if (!isBingxApiConnectionEnabled()) {
        return res.status(403).json({
          success: false,
          code: "BINGX_API_DISABLED",
          message: "BingX API connection is disabled.",
        });
      }

      const parsed = sanitizeConnectBody(req.body);
      if (!parsed) {
        return res.status(400).json({
          success: false,
          code: "INVALID_CREDENTIALS",
          message: "API Key and API Secret are required.",
        });
      }

      if (parsed.requestedTrading) {
        return res.status(403).json({
          success: false,
          code: "TRADING_LOCKED",
          message: "Live trading is disabled in this build.",
        });
      }

      const isProd = process.env.NODE_ENV === "production";
      if ((parsed.save || isProd) && !hasEncryptionKey()) {
        return res.status(503).json({
          success: false,
          code: "BINGX_ENCRYPTION_KEY_MISSING",
          message:
            "Server encryption key is missing. BingX credentials cannot be saved.",
        });
      }

      const { apiKey, apiSecret, label, save } = parsed;

      const test = await testConnection({ apiKey, apiSecret });
      if (!test.success) {
        return res.status(400).json({
          success: false,
          code: test.errorCode ?? "CONNECTION_TEST_FAILED",
          message: test.message,
        });
      }

      if (!save) {
        void emitAuditEvent({
          userId,
          type: "bingx_connected",
          severity: "info",
          message: "BingX read-only connected (session only)",
          metadata: {
            exchange: "bingx",
            mode: "read-only",
            apiKeyMasked: test.apiKeyMasked,
            saved: false,
          },
        });
        return res.json({
          success: true,
          saved: false,
          connection: {
            id: "session-only",
            exchange: "bingx",
            mode: "read-only",
            apiKeyMasked: test.apiKeyMasked!,
            connected: true,
            tradingEnabled: false,
            readOnly: true,
            createdAt: new Date().toISOString(),
          },
          warning:
            "Connected for this session only. Credentials were not saved.",
          message: "BingX API verified (session only).",
        });
      }

      const saved = saveConnectionForUser({
        userId,
        credentials: { apiKey, apiSecret },
        label,
        status: "connected",
        lastHealth: "healthy",
      });

      if (!saved.ok) {
        return res.status(503).json({
          success: false,
          code: saved.code,
          message: saved.message,
        });
      }

      const conn = toConnectResponse(saved.connection);
      void emitAuditEvent({
        userId,
        type: "bingx_connected",
        severity: "info",
        message: "BingX read-only connected",
        metadata: {
          exchange: "bingx",
          mode: "read-only",
          apiKeyMasked: conn.apiKeyMasked,
          connectionId: conn.id,
        },
      });
      void emitAuditEvent({
        userId,
        type: "bingx_credential_saved",
        severity: "info",
        message: "BingX credentials saved (encrypted)",
        metadata: {
          exchange: "bingx",
          connectionId: conn.id,
          apiKeyMasked: conn.apiKeyMasked,
        },
      });

      res.json({
        success: true,
        saved: true,
        connection: conn,
        message: "Credentials saved securely to your account.",
      });
    } catch (error: unknown) {
      console.error(
        "[API] POST /api/bingx/connect error:",
        error instanceof Error ? error.message : error,
      );
      res.status(500).json({
        success: false,
        code: "BINGX_CONNECT_ERROR",
        message: "Failed to process BingX connection.",
      });
    }
  });

  app.get("/api/bingx/connections", requireSaasAuth, (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req, res, "/api/bingx/connections");
      if (userId == null) return;

      res.json({
        success: true,
        connections: listConnectionsForUser(userId),
        encryptionAvailable: hasEncryptionKey(),
      });
    } catch (error: unknown) {
      console.error("[API] GET /api/bingx/connections error:", error);
      res.status(500).json({
        success: false,
        code: "BINGX_LIST_FAILED",
        message: "Failed to list connections",
      });
    }
  });

  app.get(
    "/api/bingx/read-only/snapshot",
    requireSaasAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = requireUserId(req, res, "/api/bingx/read-only/snapshot");
        if (userId == null) return;

        const connectionId = String(req.query.connectionId ?? "").trim();
        if (!connectionId) {
          return res.status(400).json({
            success: false,
            code: "BINGX_CONNECTION_NOT_FOUND",
            message: "connectionId is required.",
          });
        }

        if (!getConnectionForUser(connectionId, userId)) {
          return res.status(404).json({
            success: false,
            code: "BINGX_CONNECTION_NOT_FOUND",
            message: "BingX connection not found.",
            details: { safeReason: "Connection not found for this user" },
          });
        }

        const symbol =
          typeof req.query.symbol === "string" ? req.query.symbol : undefined;
        const bypassCache =
          req.query.refresh === "1" || req.query.refresh === "true";
        const snapshot = await getBingXReadOnlySnapshot(
          connectionId,
          userId,
          symbol,
          { bypassCache },
        );

        if (snapshot.error) {
          const status =
            snapshot.error.code === "BINGX_CONNECTION_NOT_FOUND" ? 404 : 400;
          void emitAuditEvent({
            userId,
            type: "bingx_sync_error",
            severity: "error",
            message: "BingX snapshot sync failed",
            metadata: {
              exchange: "bingx",
              connectionId,
              code: snapshot.error.code,
              safeReason: snapshot.error.message,
            },
          });
          return res.status(status).json({
            success: false,
            code: snapshot.error.code,
            message: snapshot.error.message,
            details: { safeReason: snapshot.error.message },
          });
        }

        void emitBingXSnapshotSyncedIfAllowed(userId, connectionId, {
          symbol: snapshot.symbol,
          health: snapshot.health,
        });

        res.json({ success: true, snapshot });
      } catch (error: unknown) {
        const mapped = mapBingXErrorToSafe(error);
        const uid = resolveRequestUserId(req);
        if (uid != null) {
          const connectionId = String(req.query.connectionId ?? "").trim();
          void emitAuditEvent({
            userId: uid,
            type: "bingx_sync_error",
            severity: "error",
            message: "BingX snapshot sync failed",
            metadata: {
              exchange: "bingx",
              connectionId: connectionId || undefined,
              code: mapped.code,
              safeReason: mapped.safeReason,
            },
          });
        }
        console.error(
          "[API] GET /api/bingx/read-only/snapshot error:",
          mapped.code,
        );
        res.status(500).json({
          success: false,
          code: "BINGX_API_ERROR",
          message: mapped.message,
          details: { safeReason: mapped.safeReason },
        });
      }
    },
  );

  app.get(
    "/api/bingx/read-only/health",
    requireSaasAuth,
    async (req: Request, res: Response) => {
      try {
        const userId = requireUserId(req, res, "/api/bingx/read-only/health");
        if (userId == null) return;

        const connectionId = String(req.query.connectionId ?? "").trim();
        if (!connectionId) {
          return res.status(400).json({
            success: false,
            code: "BINGX_CONNECTION_NOT_FOUND",
            message: "connectionId is required.",
          });
        }

        if (!getConnectionForUser(connectionId, userId)) {
          return res.status(404).json({
            success: false,
            code: "BINGX_CONNECTION_NOT_FOUND",
            message: "BingX connection not found.",
            details: { safeReason: "Connection not found for this user" },
          });
        }

        const bypassCache =
          req.query.refresh === "1" || req.query.refresh === "true";
        const health = await getBingXReadOnlyHealth(connectionId, userId, {
          bypassCache,
        });

        if (health.error && health.health === "error") {
          const status =
            health.error.code === "BINGX_CONNECTION_NOT_FOUND" ? 404 : 400;
          return res.status(status).json({
            success: false,
            code: health.error.code,
            message: health.error.message,
            details: { safeReason: health.error.safeReason },
            health: health.health,
            latencyMs: health.latencyMs,
            lastSyncTime: health.lastSyncTime,
            permissions: health.permissions,
            warnings: health.warnings,
          });
        }

        res.json({
          success: health.success,
          health: health.health,
          latencyMs: health.latencyMs,
          lastSyncTime: health.lastSyncTime,
          permissions: health.permissions,
          warnings: health.warnings,
        });
      } catch (error: unknown) {
        const mapped = mapBingXErrorToSafe(error);
        console.error("[API] GET /api/bingx/read-only/health error:", mapped.code);
        res.status(500).json({
          success: false,
          code: "BINGX_API_ERROR",
          message: mapped.message,
          details: { safeReason: mapped.safeReason },
          health: "error",
        });
      }
    },
  );

  app.get("/api/bingx/account", requireSaasAuth, async (req: Request, res: Response) => {
    try {
      const userId = requireUserId(req, res, "/api/bingx/account");
      if (userId == null) return;

      const connectionId = String(req.query.connectionId ?? "").trim();
      if (!connectionId || connectionId === "session-only") {
        return res.status(400).json({
          success: false,
          code: "CONNECTION_ID_REQUIRED",
          message: "A saved connectionId is required for account sync.",
        });
      }

      if (!getConnectionForUser(connectionId, userId)) {
        return res.status(404).json({
          success: false,
          code: "BINGX_CONNECTION_NOT_FOUND",
          message: "BingX connection not found.",
        });
      }

      const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
      const snapshot = await getAccountSnapshot(connectionId, userId, symbol);
      res.json({ success: true, account: snapshot });
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : "Account sync failed";
      console.error("[API] GET /api/bingx/account error:", message);
      res.status(500).json({
        success: false,
        code: "ACCOUNT_SYNC_ERROR",
        message: "Account sync error",
      });
    }
  });

  app.delete(
    "/api/bingx/connections/:id",
    requireSaasAuth,
    (req: Request, res: Response) => {
      try {
        const userId = requireUserId(req, res, "/api/bingx/connections/:id");
        if (userId == null) return;

        const id = String(req.params.id ?? "");
        const existing = getConnectionForUser(id, userId);
        const removed = deleteConnectionForUser(id, userId);
        clearBingXReadOnlyCache(id, userId);
        if (!removed) {
          return res.status(404).json({
            success: false,
            code: "BINGX_CONNECTION_NOT_FOUND",
            message: "Connection not found.",
          });
        }
        void emitAuditEvent({
          userId,
          type: "bingx_credential_deleted",
          severity: "warning",
          message: "BingX saved connection deleted",
          metadata: {
            exchange: "bingx",
            connectionId: id,
            apiKeyMasked: existing?.apiKeyMasked,
          },
        });
        res.json({ success: true });
      } catch (error: unknown) {
        console.error("[API] DELETE /api/bingx/connections error:", error);
        res.status(500).json({
          success: false,
          code: "BINGX_DELETE_FAILED",
          message: "Failed to delete connection",
        });
      }
    },
  );
}
