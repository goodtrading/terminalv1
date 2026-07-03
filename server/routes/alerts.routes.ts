import type { Express, Request, Response, NextFunction } from "express";
import { z } from "zod";
import { alertPreferencesSchema, alertStatusSchema, type AlertStreamEnvelope } from "@shared/alerts";
import { requireSaasAdmin, requireSaasAuth } from "../middleware/saasAuth";
import { getAccessForUserId } from "../services/accessService";
import { envBool, isProduction } from "../lib/runtimeEnv";
import { evaluateServerAlertsForUser, getAlertEngineDiagnostics } from "../services/alerts/alertEngine";
import { alertStore } from "../services/alerts/alertStore";
import { ALERT_RULES, DISABLED_FLOW_ALERT_TYPES } from "../services/alerts/alertCatalog";
import { pool } from "../db";

type RateBucket = { count: number; resetAt: number };
const rateBuckets = new Map<string, RateBucket>();
const streamConnectionsByUser = new Map<string, number>();
const ALERT_RATE_WINDOW_MS = 60_000;
const ALERT_RATE_LIMIT = 120;
const ALERT_STREAM_MAX_CONNECTIONS_PER_USER = 4;

function alertsEnabled(_req: Request, res: Response, next: NextFunction): void {
  if (!envBool("ALERTS_ENABLED", true)) {
    res.status(503).json({ error: "ALERTS_DISABLED" });
    return;
  }
  next();
}

async function requireActivePlan(req: Request, res: Response, next: NextFunction): Promise<void> {
  const userId = req.saasUser?.id;
  if (!userId) {
    res.status(401).json({ error: "UNAUTHORIZED" });
    return;
  }
  const access = await getAccessForUserId(userId);
  if (!access.allowed) {
    res.status(403).json({ error: "SUBSCRIPTION_REQUIRED", reason: access.reason });
    return;
  }
  next();
}

function alertsRateLimit(req: Request, res: Response, next: NextFunction): void {
  const userId = req.saasUser?.id ?? "anon";
  const key = `${userId}:${req.path}`;
  const now = Date.now();
  const bucket = rateBuckets.get(key);
  if (!bucket || bucket.resetAt <= now) {
    rateBuckets.set(key, { count: 1, resetAt: now + ALERT_RATE_WINDOW_MS });
    next();
    return;
  }
  if (bucket.count >= ALERT_RATE_LIMIT) {
    res.status(429).json({ error: "RATE_LIMITED" });
    return;
  }
  bucket.count += 1;
  next();
}

const listQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(200).optional(),
  cursor: z.string().optional(),
  unreadOnly: z.coerce.boolean().optional(),
  status: alertStatusSchema.optional(),
  severity: z.string().optional(),
  domain: z.string().optional(),
  symbol: z.string().optional(),
  since: z.string().datetime().optional(),
  environment: z.enum(["web", "desktop", "mobile", "server"]).optional(),
});

const deviceRegistrationBody = z.object({
  platform: z.enum(["ios", "android"]),
  pushToken: z.string().min(8).max(512),
  deviceName: z.string().max(120).optional(),
  appVersion: z.string().max(40).optional(),
  enabled: z.boolean().optional(),
});

const simulateAlertBody = z.object({
  type: z.enum([
    "system.data_source_down",
    "gamma.regime_changed",
    "gamma.flip_crossed",
    "gamma.flip_approaching",
    "system.stale_data",
    "system.data_source_restored",
    "system.subscription_expiring",
  ]),
  symbol: z.string().min(1).max(32).default("BTCUSDT"),
  severity: z.enum(["P0", "P1", "P2", "P3", "P4"]).optional(),
  message: z.string().max(400).optional(),
});

function envelopeId(envelope: AlertStreamEnvelope): string {
  const data = envelope.data as { createdAt?: unknown; at?: unknown; id?: unknown } | undefined;
  const timestamp = typeof data?.createdAt === "string" ? data.createdAt : typeof data?.at === "string" ? data.at : new Date().toISOString();
  return timestamp;
}

function writeSse(res: Response, envelope: AlertStreamEnvelope): void {
  res.write(`id: ${envelopeId(envelope)}\n`);
  res.write(`event: ${envelope.event}\n`);
  res.write(`data: ${JSON.stringify(envelope)}\n\n`);
}

function sanitizeAlertHealthError(error: unknown): string {
  const message = error instanceof Error ? error.message : String(error);
  if (/relation .* does not exist/i.test(message)) return "alert_migration_missing";
  if (/connect|timeout|ECONN|EACCES|database/i.test(message)) return "database_unavailable";
  return "alert_health_check_failed";
}

async function readAlertPersistenceHealth() {
  const allowMemoryFallback = envBool("ALERTS_ALLOW_MEMORY_FALLBACK", !isProduction);
  if (!pool) {
    return {
      databaseAvailable: false,
      memoryFallbackActive: allowMemoryFallback,
      migrationReady: false,
      lastError: allowMemoryFallback ? null : "database_not_configured",
    };
  }

  try {
    await pool.query("SELECT 1");
    const tables = await pool.query(
      `SELECT
         to_regclass('public.goodtrading_alerts') IS NOT NULL AS alerts,
         to_regclass('public.goodtrading_alert_history') IS NOT NULL AS history,
         to_regclass('public.goodtrading_alert_deliveries') IS NOT NULL AS deliveries,
         to_regclass('public.goodtrading_alert_preferences') IS NOT NULL AS preferences`,
    );
    const row = tables.rows[0] as { alerts?: boolean; history?: boolean; deliveries?: boolean; preferences?: boolean } | undefined;
    const migrationReady = Boolean(row?.alerts && row.history && row.deliveries && row.preferences);
    return {
      databaseAvailable: true,
      memoryFallbackActive: false,
      migrationReady,
      lastError: migrationReady ? null : "alert_migration_missing",
    };
  } catch (error) {
    return {
      databaseAvailable: false,
      memoryFallbackActive: allowMemoryFallback,
      migrationReady: false,
      lastError: sanitizeAlertHealthError(error),
    };
  }
}

export function registerAlertRoutes(app: Express): void {
  const guards = [alertsEnabled, requireSaasAuth, requireActivePlan, alertsRateLimit];

  app.get("/api/alerts/catalog", alertsEnabled, (_req, res) => {
    res.json({
      rules: Object.values(ALERT_RULES),
      disabledFlowTypes: DISABLED_FLOW_ALERT_TYPES,
      featureFlags: {
        alertsEnabled: envBool("ALERTS_ENABLED", true),
        desktopNativeEnabled: envBool("ALERTS_DESKTOP_NATIVE_ENABLED", true),
        flowEnabled: envBool("ALERTS_FLOW_ENABLED", false),
        webNotificationsEnabled: envBool("ALERTS_WEB_NOTIFICATIONS_ENABLED", false),
        mobilePushEnabled: envBool("ALERTS_MOBILE_PUSH_ENABLED", false),
      },
    });
  });

  app.get("/api/alerts/health", requireSaasAuth, async (_req: Request, res: Response) => {
    const enabled = envBool("ALERTS_ENABLED", true);
    const allowMemoryFallback = envBool("ALERTS_ALLOW_MEMORY_FALLBACK", !isProduction);
    const persistence = await readAlertPersistenceHealth();
    const engine = getAlertEngineDiagnostics();
    const ok = enabled && (persistence.databaseAvailable || persistence.memoryFallbackActive) && persistence.migrationReady;
    const activeFeatureFlags = {
      alertsEnabled: enabled,
      desktopNativeEnabled: envBool("ALERTS_DESKTOP_NATIVE_ENABLED", true),
      flowEnabled: envBool("ALERTS_FLOW_ENABLED", false),
      webNotificationsEnabled: envBool("ALERTS_WEB_NOTIFICATIONS_ENABLED", false),
      mobilePushEnabled: envBool("ALERTS_MOBILE_PUSH_ENABLED", false),
    };

    res.status(ok ? 200 : enabled ? 503 : 200).json({
      ok,
      enabled,
      engineRunning: engine.engineRunning,
      evaluationMode: engine.evaluationMode,
      databaseAvailable: persistence.databaseAvailable,
      memoryFallbackActive: persistence.memoryFallbackActive,
      migrationReady: persistence.migrationReady,
      persistence: persistence.databaseAvailable ? "postgres" : persistence.memoryFallbackActive ? "memory" : "unavailable",
      memoryFallbackAllowed: allowMemoryFallback,
      sseConnections: Array.from(streamConnectionsByUser.values()).reduce((sum, count) => sum + count, 0),
      lastEvaluationAt: engine.lastEvaluationAt,
      lastSuccessfulEvaluationAt: engine.lastSuccessfulEvaluationAt,
      lastError: engine.lastError ?? persistence.lastError,
      activeFeatureFlags,
    });
  });

  app.get("/api/alerts", guards, async (req: Request, res: Response) => {
    const parsed = listQuerySchema.safeParse(req.query);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
      return;
    }
    const userId = String(req.saasUser!.id);
    await evaluateServerAlertsForUser(userId, parsed.data.environment ?? "web");
    const { environment: _environment, ...filters } = parsed.data;
    const result = await alertStore.list({
      userId,
      ...filters,
    });
    res.json(result);
  });

  app.get("/api/alerts/unread-count", guards, async (req: Request, res: Response) => {
    const userId = String(req.saasUser!.id);
    await evaluateServerAlertsForUser(userId, "web");
    res.json({ count: await alertStore.unreadCount(userId) });
  });

  app.get("/api/alerts/preferences", guards, async (req: Request, res: Response) => {
    res.json(await alertStore.getPreferences(String(req.saasUser!.id)));
  });

  app.put("/api/alerts/preferences", guards, async (req: Request, res: Response) => {
    const userId = String(req.saasUser!.id);
    const parsed = alertPreferencesSchema.safeParse({ ...req.body, userId });
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
      return;
    }
    res.json(await alertStore.savePreferences(userId, parsed.data));
  });

  app.post("/api/alerts/:id/read", guards, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const updated = await alertStore.updateStatus(id, String(req.saasUser!.id), "read");
    if (!updated) {
      res.status(404).json({ error: "ALERT_NOT_FOUND" });
      return;
    }
    res.json(updated);
  });

  app.post("/api/alerts/:id/acknowledge", guards, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const updated = await alertStore.updateStatus(id, String(req.saasUser!.id), "acknowledged");
    if (!updated) {
      res.status(404).json({ error: "ALERT_NOT_FOUND" });
      return;
    }
    res.json(updated);
  });

  app.post("/api/alerts/:id/dismiss", guards, async (req: Request, res: Response) => {
    const id = String(req.params.id);
    const updated = await alertStore.updateStatus(id, String(req.saasUser!.id), "dismissed");
    if (!updated) {
      res.status(404).json({ error: "ALERT_NOT_FOUND_OR_REQUIRES_ACK" });
      return;
    }
    res.json(updated);
  });

  app.get("/api/alerts/stream", alertsEnabled, requireSaasAuth, requireActivePlan, (req: Request, res: Response) => {
    const userId = String(req.saasUser!.id);
    const currentConnections = streamConnectionsByUser.get(userId) ?? 0;
    if (currentConnections >= ALERT_STREAM_MAX_CONNECTIONS_PER_USER) {
      res.status(429).json({ error: "ALERT_STREAM_LIMIT" });
      return;
    }
    streamConnectionsByUser.set(userId, currentConnections + 1);
    res.setHeader("Content-Type", "text/event-stream");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    res.flushHeaders?.();

    const lastEventId = typeof req.headers["last-event-id"] === "string" ? req.headers["last-event-id"] : undefined;
    void (async () => {
      if (lastEventId) {
        const replay = await alertStore.list({ userId, since: lastEventId, limit: 50 });
        for (const alert of replay.alerts.reverse()) {
          writeSse(res, { event: "alert.created", version: 1, data: alert });
        }
      }
      writeSse(res, { event: "source.health_changed", version: 1, data: { source: "alerts", healthy: true, at: new Date().toISOString() } });
    })().catch((error) => {
      writeSse(res, {
        event: "source.health_changed",
        version: 1,
        data: { source: "alerts", healthy: false, reason: "replay_failed", at: new Date().toISOString() },
      });
      console.warn("[alerts] stream replay failed", error);
    });
    const unsubscribe = alertStore.subscribe(userId, (envelope) => writeSse(res, envelope));
    const heartbeat = setInterval(() => {
      writeSse(res, { event: "heartbeat", version: 1, data: { at: new Date().toISOString() } });
    }, 15_000);
    req.on("close", () => {
      clearInterval(heartbeat);
      unsubscribe();
      streamConnectionsByUser.set(userId, Math.max(0, (streamConnectionsByUser.get(userId) ?? 1) - 1));
    });
  });

  app.post("/api/alerts/devices", guards, async (req: Request, res: Response) => {
    if (!envBool("ALERTS_MOBILE_PUSH_ENABLED", false)) {
      res.status(403).json({ error: "MOBILE_PUSH_DISABLED" });
      return;
    }
    const parsed = deviceRegistrationBody.safeParse(req.body);
    if (!parsed.success) {
      res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
      return;
    }
    const userId = String(req.saasUser!.id);
    const now = new Date().toISOString();
    const device = await alertStore.addDevice({
      id: `device:${userId}:${Date.now()}`,
      userId,
      platform: parsed.data.platform,
      pushToken: parsed.data.pushToken,
      deviceName: parsed.data.deviceName,
      appVersion: parsed.data.appVersion,
      enabled: parsed.data.enabled ?? true,
      lastSeenAt: now,
    });
    res.status(201).json({ ...device, pushToken: undefined });
  });

  app.delete("/api/alerts/devices/:id", guards, async (req: Request, res: Response) => {
    if (!envBool("ALERTS_MOBILE_PUSH_ENABLED", false)) {
      res.status(403).json({ error: "MOBILE_PUSH_DISABLED" });
      return;
    }
    const removed = await alertStore.removeDevice(String(req.saasUser!.id), String(req.params.id));
    res.json({ removed });
  });

  app.post(
    "/api/dev/alerts/simulate",
    alertsEnabled,
    requireSaasAdmin,
    alertsRateLimit,
    async (req: Request, res: Response) => {
      if (isProduction) {
        res.status(404).json({ error: "NOT_FOUND" });
        return;
      }
      const parsed = simulateAlertBody.safeParse(req.body);
      if (!parsed.success) {
        res.status(400).json({ error: "VALIDATION", details: parsed.error.flatten() });
        return;
      }
      const rule = ALERT_RULES[parsed.data.type];
      if (!rule) {
        res.status(400).json({ error: "UNKNOWN_ALERT_TYPE" });
        return;
      }
      const now = new Date().toISOString();
      const severity = parsed.data.severity ?? rule.defaultSeverity;
      const alert = await alertStore.upsert({
        id: `sim:${parsed.data.type}:${parsed.data.symbol}:${Date.now()}`,
        type: parsed.data.type,
        severity,
        domain: rule.domain,
        symbol: parsed.data.symbol,
        title: `[SIM] ${parsed.data.type}`,
        message: parsed.data.message ?? `Simulated ${parsed.data.type} for ${parsed.data.symbol}`,
        shortMessage: "Simulated alert",
        createdAt: now,
        detectedAt: now,
        userId: String(req.saasUser!.id),
        source: "dev-simulator",
        deduplicationKey: `sim:${parsed.data.type}:${parsed.data.symbol}`,
        requiresAcknowledgement: severity === "P0" || rule.requiresAcknowledgement,
        status: "new",
        metadata: {
          simulated: true,
          requestedBy: req.saasUser!.id,
        },
        actions: [{ id: "open-alerts", label: "Open alerts", action: "open_panel", payload: { panel: "alerts" } }],
        schemaVersion: 1,
      });
      await alertStore.addDelivery({
        id: `${alert.id}:in_app:${Date.now()}`,
        alertId: alert.id,
        userId: String(req.saasUser!.id),
        channel: "in_app",
        provider: "in_app",
        status: "queued",
        attemptedAt: now,
        createdAt: now,
        retryCount: 0,
      });
      res.status(201).json(alert);
    },
  );
}
