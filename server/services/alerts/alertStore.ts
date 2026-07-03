import type {
  AlertDelivery,
  AlertEvent,
  AlertHistoryEntry,
  AlertPreferences,
  AlertStatus,
  AlertStreamEnvelope,
  DeviceRegistration,
} from "@shared/alerts";
import { alertPreferencesSchema, defaultAlertPreferences } from "@shared/alerts";
import { pool } from "../../db";
import { envBool, isProduction } from "../../lib/runtimeEnv";

type AlertListener = (envelope: AlertStreamEnvelope) => void;

export interface AlertListFilters {
  userId?: string;
  status?: AlertStatus;
  unreadOnly?: boolean;
  severity?: string;
  domain?: string;
  symbol?: string;
  since?: string;
  cursor?: string;
  limit?: number;
}

export interface AlertStore {
  list(filters: AlertListFilters): Promise<{ alerts: AlertEvent[]; nextCursor?: string }>;
  unreadCount(userId?: string): Promise<number>;
  upsert(event: AlertEvent): Promise<AlertEvent>;
  updateStatus(id: string, userId: string | undefined, status: AlertStatus): Promise<AlertEvent | null>;
  getPreferences(userId: string): Promise<AlertPreferences>;
  savePreferences(userId: string, preferences: AlertPreferences): Promise<AlertPreferences>;
  addDelivery(delivery: AlertDelivery): Promise<void>;
  addDevice(device: DeviceRegistration): Promise<DeviceRegistration>;
  removeDevice(userId: string, id: string): Promise<boolean>;
  subscribe(userId: string | undefined, listener: AlertListener): () => void;
  publish(envelope: AlertStreamEnvelope): void;
}

function visibleToUser(alert: AlertEvent, userId?: string): boolean {
  return !alert.userId || (userId != null && alert.userId === userId);
}

function makeHistory(alertId: string, action: AlertHistoryEntry["action"], userId?: string): AlertHistoryEntry {
  return {
    id: `${alertId}:${action}:${Date.now()}`,
    alertId,
    userId,
    action,
    at: new Date().toISOString(),
    metadata: {},
  };
}

function dbUserId(userId?: string): number | null {
  if (!userId) return null;
  const n = Number(userId);
  return Number.isInteger(n) && n > 0 ? n : null;
}

class MemoryAlertStore implements AlertStore {
  private alerts = new Map<string, AlertEvent>();
  private deliveries = new Map<string, AlertDelivery>();
  private history: AlertHistoryEntry[] = [];
  private preferences = new Map<string, AlertPreferences>();
  private devices = new Map<string, DeviceRegistration>();
  private listeners = new Map<string, Set<AlertListener>>();
  private dbReady: Promise<boolean> | null = null;

  private async ensureDb(): Promise<boolean> {
    const allowMemoryFallback = envBool("ALERTS_ALLOW_MEMORY_FALLBACK", !isProduction);
    if (!pool) {
      if (!allowMemoryFallback) throw new Error("ALERTS_PERSISTENCE_UNAVAILABLE");
      return false;
    }
    if (!this.dbReady) {
      this.dbReady = pool
        .query(
          `CREATE TABLE IF NOT EXISTS goodtrading_alerts (
             id text PRIMARY KEY,
             user_id integer REFERENCES users(id) ON DELETE CASCADE,
             type text NOT NULL,
             severity text NOT NULL,
             domain text NOT NULL,
             symbol text,
             status text NOT NULL,
             deduplication_key text NOT NULL,
             created_at timestamptz NOT NULL,
             detected_at timestamptz NOT NULL,
             expires_at timestamptz,
             payload jsonb NOT NULL
           );
           CREATE INDEX IF NOT EXISTS goodtrading_alerts_user_created_idx ON goodtrading_alerts (user_id, created_at DESC);
           CREATE INDEX IF NOT EXISTS goodtrading_alerts_severity_idx ON goodtrading_alerts (severity);
           CREATE INDEX IF NOT EXISTS goodtrading_alerts_type_idx ON goodtrading_alerts (type);
           CREATE INDEX IF NOT EXISTS goodtrading_alerts_symbol_idx ON goodtrading_alerts (symbol);
           CREATE INDEX IF NOT EXISTS goodtrading_alerts_status_idx ON goodtrading_alerts (status);
           CREATE INDEX IF NOT EXISTS goodtrading_alerts_dedupe_idx ON goodtrading_alerts (deduplication_key);
           CREATE INDEX IF NOT EXISTS goodtrading_alerts_user_status_idx ON goodtrading_alerts (user_id, status);
           CREATE UNIQUE INDEX IF NOT EXISTS goodtrading_alerts_open_dedupe_idx
             ON goodtrading_alerts (COALESCE(user_id, 0), type, deduplication_key)
             WHERE status NOT IN ('acknowledged', 'dismissed', 'expired');
           CREATE TABLE IF NOT EXISTS goodtrading_alert_preferences (
             user_id integer PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
             payload jsonb NOT NULL,
             updated_at timestamptz NOT NULL DEFAULT now()
           );
           CREATE TABLE IF NOT EXISTS goodtrading_alert_deliveries (
             id text PRIMARY KEY,
             alert_id text NOT NULL,
             user_id integer REFERENCES users(id) ON DELETE CASCADE,
             channel text NOT NULL,
             status text NOT NULL,
             provider text NOT NULL DEFAULT 'noop',
             device_id text,
             attempted_at timestamptz NOT NULL DEFAULT now(),
             created_at timestamptz NOT NULL,
             delivered_at timestamptz,
             failed_at timestamptz,
             error_code text,
             error text,
             retry_count integer NOT NULL DEFAULT 0,
             payload jsonb NOT NULL
           );
           CREATE INDEX IF NOT EXISTS goodtrading_alert_deliveries_alert_idx ON goodtrading_alert_deliveries (alert_id);
           CREATE INDEX IF NOT EXISTS goodtrading_alert_deliveries_user_idx ON goodtrading_alert_deliveries (user_id);
           CREATE INDEX IF NOT EXISTS goodtrading_alert_deliveries_status_idx ON goodtrading_alert_deliveries (status);
           CREATE TABLE IF NOT EXISTS goodtrading_alert_history (
             id text PRIMARY KEY,
             alert_id text NOT NULL,
             user_id integer REFERENCES users(id) ON DELETE CASCADE,
             action text NOT NULL,
             at timestamptz NOT NULL,
             metadata jsonb NOT NULL DEFAULT '{}'::jsonb
           );
           CREATE INDEX IF NOT EXISTS goodtrading_alert_history_alert_idx ON goodtrading_alert_history (alert_id, at DESC);
           CREATE INDEX IF NOT EXISTS goodtrading_alert_history_user_idx ON goodtrading_alert_history (user_id, at DESC);
           CREATE TABLE IF NOT EXISTS goodtrading_alert_devices (
             id text PRIMARY KEY,
             user_id integer NOT NULL REFERENCES users(id) ON DELETE CASCADE,
             platform text NOT NULL,
             push_token text NOT NULL,
             device_name text,
             app_version text,
             enabled boolean NOT NULL,
             last_seen_at timestamptz NOT NULL,
             payload jsonb NOT NULL
           );
           CREATE INDEX IF NOT EXISTS goodtrading_alert_devices_user_idx ON goodtrading_alert_devices (user_id);
           CREATE UNIQUE INDEX IF NOT EXISTS goodtrading_alert_devices_user_token_idx ON goodtrading_alert_devices (user_id, push_token);`,
        )
        .then(() => true)
        .catch((error) => {
          if (!allowMemoryFallback) throw error;
          console.warn("[alerts] DB persistence unavailable, using memory store", {
            error: error instanceof Error ? error.message : String(error),
          });
          return false;
        });
    }
    return this.dbReady;
  }

  private async appendHistory(entry: AlertHistoryEntry): Promise<void> {
    this.history.push(entry);
    if ((await this.ensureDb()) && pool) {
      await pool.query(
        `INSERT INTO goodtrading_alert_history (id, alert_id, user_id, action, at, metadata)
         VALUES ($1, $2, $3, $4, $5, $6::jsonb)
         ON CONFLICT (id) DO NOTHING`,
        [entry.id, entry.alertId, dbUserId(entry.userId), entry.action, entry.at, JSON.stringify(entry.metadata)],
      );
    }
  }

  async list(filters: AlertListFilters): Promise<{ alerts: AlertEvent[]; nextCursor?: string }> {
    const limit = Math.min(Math.max(filters.limit ?? 50, 1), 200);
    if ((await this.ensureDb()) && pool) {
      const values: unknown[] = [dbUserId(filters.userId)];
      const where: string[] = ["(user_id IS NULL OR user_id = $1)"];
      if (filters.unreadOnly) where.push("status NOT IN ('read', 'acknowledged', 'dismissed')");
      if (filters.status) {
        values.push(filters.status);
        where.push(`status = $${values.length}`);
      }
      if (filters.severity) {
        values.push(filters.severity);
        where.push(`severity = $${values.length}`);
      }
      if (filters.domain) {
        values.push(filters.domain);
        where.push(`domain = $${values.length}`);
      }
      if (filters.symbol) {
        values.push(filters.symbol);
        where.push(`symbol = $${values.length}`);
      }
      if (filters.since) {
        values.push(filters.since);
        where.push(`created_at > $${values.length}`);
      }
      if (filters.cursor) {
        values.push(filters.cursor);
        where.push(`created_at < $${values.length}`);
      }
      values.push(limit + 1);
      const result = await pool.query(
        `SELECT payload FROM goodtrading_alerts WHERE ${where.join(" AND ")} ORDER BY created_at DESC LIMIT $${values.length}`,
        values,
      );
      const rows = result.rows.map((row) => row.payload as AlertEvent);
      const page = rows.slice(0, limit);
      return { alerts: page, nextCursor: rows.length > limit ? page[page.length - 1]?.createdAt : undefined };
    }
    let rows = Array.from(this.alerts.values())
      .filter((alert) => visibleToUser(alert, filters.userId))
      .filter((alert) => (filters.unreadOnly ? !["read", "acknowledged", "dismissed"].includes(alert.status) : true))
      .filter((alert) => (filters.status ? alert.status === filters.status : true))
      .filter((alert) => (filters.severity ? alert.severity === filters.severity : true))
      .filter((alert) => (filters.domain ? alert.domain === filters.domain : true))
      .filter((alert) => (filters.symbol ? alert.symbol === filters.symbol : true))
      .filter((alert) => (filters.since ? alert.createdAt > filters.since! : true))
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));

    if (filters.cursor) {
      rows = rows.filter((alert) => alert.createdAt < filters.cursor!);
    }

    const page = rows.slice(0, limit);
    const nextCursor = rows.length > limit ? page[page.length - 1]?.createdAt : undefined;
    return { alerts: page, nextCursor };
  }

  async unreadCount(userId?: string): Promise<number> {
    if ((await this.ensureDb()) && pool) {
      const result = await pool.query(
        `SELECT count(*)::int AS count FROM goodtrading_alerts
         WHERE (user_id IS NULL OR user_id = $1)
           AND status NOT IN ('read', 'acknowledged', 'dismissed')`,
        [dbUserId(userId)],
      );
      return Number(result.rows[0]?.count ?? 0);
    }
    return Array.from(this.alerts.values()).filter(
      (alert) => visibleToUser(alert, userId) && !["read", "acknowledged", "dismissed"].includes(alert.status),
    ).length;
  }

  async upsert(event: AlertEvent): Promise<AlertEvent> {
    const eventDbUserId = dbUserId(event.userId);
    let existing = Array.from(this.alerts.values()).find(
      (alert) =>
        alert.deduplicationKey === event.deduplicationKey &&
        alert.type === event.type &&
        alert.userId === event.userId &&
        !["acknowledged", "dismissed", "expired"].includes(alert.status),
    );
    if (!existing && (await this.ensureDb()) && pool) {
      const result = await pool.query(
        `SELECT payload FROM goodtrading_alerts
         WHERE deduplication_key = $1
           AND type = $2
           AND COALESCE(user_id, 0) = COALESCE($3, 0)
           AND status NOT IN ('acknowledged', 'dismissed', 'expired')
         ORDER BY created_at DESC
         LIMIT 1`,
        [event.deduplicationKey, event.type, eventDbUserId],
      );
      existing = result.rows[0]?.payload as AlertEvent | undefined;
    }
    const next = existing
      ? {
          ...existing,
          ...event,
          id: existing.id,
          createdAt: existing.createdAt,
          status: existing.status,
          metadata: { ...existing.metadata, ...event.metadata, updatedAt: event.createdAt },
        }
      : event;

    this.alerts.set(next.id, next);
    if ((await this.ensureDb()) && pool) {
      try {
        await pool.query(
          `INSERT INTO goodtrading_alerts
             (id, user_id, type, severity, domain, symbol, status, deduplication_key, created_at, detected_at, expires_at, payload)
           VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12::jsonb)
           ON CONFLICT (id) DO UPDATE SET
             status = EXCLUDED.status,
             payload = EXCLUDED.payload,
             severity = EXCLUDED.severity,
             symbol = EXCLUDED.symbol,
             expires_at = EXCLUDED.expires_at`,
          [
            next.id,
            dbUserId(next.userId),
            next.type,
            next.severity,
            next.domain,
            next.symbol ?? null,
            next.status,
            next.deduplicationKey,
            next.createdAt,
            next.detectedAt,
            next.expiresAt ?? null,
            JSON.stringify(next),
          ],
        );
      } catch (error) {
        if ((error as { code?: string }).code !== "23505") throw error;
        const result = await pool.query(
          `SELECT payload FROM goodtrading_alerts
           WHERE deduplication_key = $1
             AND type = $2
             AND COALESCE(user_id, 0) = COALESCE($3, 0)
             AND status NOT IN ('acknowledged', 'dismissed', 'expired')
           ORDER BY created_at DESC
           LIMIT 1`,
          [next.deduplicationKey, next.type, dbUserId(next.userId)],
        );
        const collided = result.rows[0]?.payload as AlertEvent | undefined;
        if (collided) return collided;
        throw error;
      }
    }
    await this.appendHistory(makeHistory(next.id, existing ? "updated" : "created", next.userId));
    this.publish({
      event: existing ? "alert.updated" : "alert.created",
      version: 1,
      data: next,
    });
    return next;
  }

  async updateStatus(id: string, userId: string | undefined, status: AlertStatus): Promise<AlertEvent | null> {
    let alert = this.alerts.get(id);
    if (!alert && (await this.ensureDb()) && pool) {
      const result = await pool.query(
        `SELECT payload FROM goodtrading_alerts WHERE id = $1 AND (user_id IS NULL OR user_id = $2) LIMIT 1`,
        [id, dbUserId(userId)],
      );
      alert = result.rows[0]?.payload as AlertEvent | undefined;
    }
    if (!alert || !visibleToUser(alert, userId)) return null;
    if (alert.requiresAcknowledgement && status === "dismissed") return null;
    const next = { ...alert, status };
    this.alerts.set(id, next);
    if ((await this.ensureDb()) && pool) {
      await pool.query(
        `UPDATE goodtrading_alerts SET status = $1, payload = $2::jsonb WHERE id = $3 AND (user_id IS NULL OR user_id = $4)`,
        [status, JSON.stringify(next), id, dbUserId(userId)],
      );
    }
    const action = status === "acknowledged" ? "acknowledged" : status === "dismissed" ? "dismissed" : "read";
    await this.appendHistory(makeHistory(id, action, userId));
    this.publish({
      event: status === "acknowledged" ? "alert.acknowledged" : status === "dismissed" ? "alert.dismissed" : "alert.read",
      version: 1,
      data: next,
    });
    return next;
  }

  async getPreferences(userId: string): Promise<AlertPreferences> {
    if ((await this.ensureDb()) && pool) {
      const result = await pool.query(`SELECT payload FROM goodtrading_alert_preferences WHERE user_id = $1`, [dbUserId(userId)]);
      if (result.rows[0]?.payload) return alertPreferencesSchema.parse(result.rows[0].payload);
    }
    return this.preferences.get(userId) ?? defaultAlertPreferences(userId);
  }

  async savePreferences(userId: string, preferences: AlertPreferences): Promise<AlertPreferences> {
    const parsed = alertPreferencesSchema.parse({ ...preferences, userId });
    this.preferences.set(userId, parsed);
    if ((await this.ensureDb()) && pool) {
      await pool.query(
        `INSERT INTO goodtrading_alert_preferences (user_id, payload, updated_at)
         VALUES ($1, $2::jsonb, now())
         ON CONFLICT (user_id) DO UPDATE SET payload = EXCLUDED.payload, updated_at = now()`,
        [dbUserId(userId), JSON.stringify(parsed)],
      );
    }
    this.publish({ event: "preferences.updated", version: 1, data: parsed });
    return parsed;
  }

  async addDelivery(delivery: AlertDelivery): Promise<void> {
    this.deliveries.set(delivery.id, delivery);
    if ((await this.ensureDb()) && pool) {
      await pool.query(
        `INSERT INTO goodtrading_alert_deliveries
           (id, alert_id, user_id, channel, status, provider, device_id, attempted_at, created_at, delivered_at, failed_at, error_code, error, retry_count, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           status = EXCLUDED.status,
           delivered_at = EXCLUDED.delivered_at,
           failed_at = EXCLUDED.failed_at,
           error_code = EXCLUDED.error_code,
           error = EXCLUDED.error,
           retry_count = EXCLUDED.retry_count,
           payload = EXCLUDED.payload`,
        [
          delivery.id,
          delivery.alertId,
          dbUserId(delivery.userId),
          delivery.channel,
          delivery.status,
          delivery.provider,
          delivery.deviceId ?? null,
          delivery.attemptedAt,
          delivery.createdAt,
          delivery.deliveredAt ?? null,
          delivery.failedAt ?? null,
          delivery.errorCode ?? null,
          delivery.error ?? null,
          delivery.retryCount,
          JSON.stringify(delivery),
        ],
      );
    }
    await this.appendHistory(
      makeHistory(delivery.alertId, delivery.status === "failed" ? "delivery_failed" : "delivered", delivery.userId),
    );
  }

  async addDevice(device: DeviceRegistration): Promise<DeviceRegistration> {
    this.devices.set(device.id, device);
    if ((await this.ensureDb()) && pool) {
      await pool.query(
        `INSERT INTO goodtrading_alert_devices
           (id, user_id, platform, push_token, device_name, app_version, enabled, last_seen_at, payload)
         VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb)
         ON CONFLICT (id) DO UPDATE SET
           enabled = EXCLUDED.enabled,
           last_seen_at = EXCLUDED.last_seen_at,
           payload = EXCLUDED.payload`,
        [
          device.id,
          dbUserId(device.userId),
          device.platform,
          device.pushToken,
          device.deviceName ?? null,
          device.appVersion ?? null,
          device.enabled,
          device.lastSeenAt,
          JSON.stringify(device),
        ],
      );
    }
    return device;
  }

  async removeDevice(userId: string, id: string): Promise<boolean> {
    if ((await this.ensureDb()) && pool) {
      const result = await pool.query(
        `UPDATE goodtrading_alert_devices SET enabled = false WHERE id = $1 AND user_id = $2`,
        [id, dbUserId(userId)],
      );
      if ((result.rowCount ?? 0) > 0) {
        const device = this.devices.get(id);
        if (device) this.devices.set(id, { ...device, enabled: false });
        return true;
      }
    }
    const device = this.devices.get(id);
    if (!device || device.userId !== userId) return false;
    this.devices.set(id, { ...device, enabled: false });
    return true;
  }

  subscribe(userId: string | undefined, listener: AlertListener): () => void {
    const key = userId ?? "global";
    const listeners = this.listeners.get(key) ?? new Set<AlertListener>();
    listeners.add(listener);
    this.listeners.set(key, listeners);
    return () => {
      listeners.delete(listener);
      if (listeners.size === 0) this.listeners.delete(key);
    };
  }

  publish(envelope: AlertStreamEnvelope): void {
    const data = envelope.data as AlertEvent | AlertPreferences | undefined;
    const userId = data && "userId" in data ? data.userId : undefined;
    for (const listener of Array.from(this.listeners.get("global") ?? [])) listener(envelope);
    if (userId) {
      for (const listener of Array.from(this.listeners.get(userId) ?? [])) listener(envelope);
    }
  }
}

export const alertStore: AlertStore = new MemoryAlertStore();
