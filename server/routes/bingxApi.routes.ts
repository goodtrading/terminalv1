import type { Express, Request, Response } from "express";
import {
  getAccountSnapshot,
  isBingxApiConnectionEnabled,
  testConnection,
} from "../services/exchanges/bingx/bingxAccountService";
import {
  deleteConnection,
  getConnection,
  hasEncryptionKey,
  listConnections,
  saveConnection,
  toPublicConnection,
} from "../services/exchanges/bingx/bingxCredentialStore";

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
  app.post("/api/bingx/connect", async (req: Request, res: Response) => {
    try {
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

      const { apiKey, apiSecret, label, save } = parsed;

      const test = await testConnection({ apiKey, apiSecret });
      if (!test.success) {
        return res.status(400).json({
          success: false,
          code: test.errorCode ?? "CONNECTION_TEST_FAILED",
          message: test.message,
        });
      }

      const warnings: string[] = [];

      let connection = {
        id: "session-only",
        exchange: "bingx" as const,
        label: label || "BingX API",
        apiKeyMasked: test.apiKeyMasked!,
        permissions: { readOnly: true, trading: false },
        status: "connected" as const,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };

      let warning: string | undefined;

      if (save) {
        if (!hasEncryptionKey()) {
          warning =
            "Encryption key missing. Credentials were not saved.";
          warnings.push(warning);
        } else {
          const saved = saveConnection({
            credentials: { apiKey, apiSecret },
            label,
            permissions: { readOnly: true, trading: false },
            status: "connected",
          });
          connection = saved.connection;
          if (saved.warning) {
            warning = saved.warning;
            warnings.push(saved.warning);
          }
        }
      } else {
        warnings.push("Connection tested only; credentials were not persisted.");
      }

      res.json({
        success: true,
        connection,
        warning: warning ?? (warnings.length ? warnings.join(" ") : undefined),
        warnings,
      });
    } catch (error: unknown) {
      console.error("[API] POST /api/bingx/connect error:", error instanceof Error ? error.message : error);
      res.status(500).json({
        success: false,
        code: "BINGX_CONNECT_ERROR",
        message: "Failed to process BingX connection.",
      });
    }
  });

  app.get("/api/bingx/connections", (_req: Request, res: Response) => {
    try {
      res.json({
        connections: listConnections(),
        encryptionAvailable: hasEncryptionKey(),
      });
    } catch (error: unknown) {
      console.error("[API] GET /api/bingx/connections error:", error);
      res.status(500).json({ error: "Failed to list connections" });
    }
  });

  app.get("/api/bingx/account", async (req: Request, res: Response) => {
    try {
      const connectionId = String(req.query.connectionId ?? "").trim();
      if (!connectionId || connectionId === "session-only") {
        return res.status(400).json({
          success: false,
          code: "CONNECTION_ID_REQUIRED",
          message: "A saved connectionId is required for account sync.",
        });
      }

      const row = getConnection(connectionId);
      if (!row) {
        return res.status(404).json({
          success: false,
          code: "CONNECTION_NOT_FOUND",
          message: "BingX connection not found.",
        });
      }

      const symbol = typeof req.query.symbol === "string" ? req.query.symbol : undefined;
      const snapshot = await getAccountSnapshot(connectionId, symbol);
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

  app.delete("/api/bingx/connections/:id", (req: Request, res: Response) => {
    try {
      const id = String(req.params.id ?? "");
      const removed = deleteConnection(id);
      if (!removed) {
        return res.status(404).json({
          success: false,
          code: "CONNECTION_NOT_FOUND",
          message: "Connection not found.",
        });
      }
      res.json({ success: true });
    } catch (error: unknown) {
      console.error("[API] DELETE /api/bingx/connections error:", error);
      res.status(500).json({ error: "Failed to delete connection" });
    }
  });
}
