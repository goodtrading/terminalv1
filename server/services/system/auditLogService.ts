import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import { maskApiKey } from "../exchanges/bingx/bingxSigner";

export type AuditEventSeverity = "info" | "warning" | "error";

export type AuditEventType =
  | "bingx_connected"
  | "bingx_disconnected"
  | "bingx_saved_connection_restored"
  | "bingx_credential_saved"
  | "bingx_credential_deleted"
  | "bingx_snapshot_synced"
  | "bingx_sync_error"
  | "broker_switched"
  | "paper_order_submitted"
  | "paper_order_cancelled"
  | "paper_position_closed"
  | "paper_partial_close"
  | "security_guard_event"
  | "market_data_error"
  | "system_health_error"
  | "risk_mirror_warning"
  | "risk_mirror_error"
  | "execution_context_captured"
  | "execution_context_warning"
  | "live_readiness_checked"
  | "live_readiness_failed"
  | "live_guard_blocked"
  | "live_order_preview_requested"
  | "live_order_preview_blocked"
  | "live_order_preview_passed";

export interface AuditLogEvent {
  id: string;
  userId?: number;
  type: AuditEventType;
  severity: AuditEventSeverity;
  timestamp: number;
  message: string;
  metadata?: Record<string, unknown>;
}

const STORAGE_DIR = path.resolve(process.cwd(), "server", "storage");
const STORAGE_FILE = path.join(STORAGE_DIR, "audit-log.json");
const MAX_EVENTS = 1000;
const SNAPSHOT_SYNC_THROTTLE_MS = 60_000;

const DANGEROUS_KEYS = new Set([
  "apisecret",
  "secret",
  "api_key",
  "password",
  "token",
  "authorization",
  "cookie",
  "credentials",
  "privatekey",
  "requestbody",
  "rawbody",
]);

type StorageFile = { events: AuditLogEvent[] };

const snapshotSyncLastEmit = new Map<string, number>();
const riskMirrorAuditLastEmit = new Map<string, number>();
const RISK_MIRROR_AUDIT_THROTTLE_MS = 60_000;

function ensureStorageDir(): void {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  } catch (err) {
    console.warn(
      "[storage] failed to ensure audit storage dir:",
      err instanceof Error ? err.message : err,
    );
  }
}

function looksLikeFullApiKey(value: string): boolean {
  const v = value.trim();
  if (v.length < 12) return false;
  if (v.includes("****")) return false;
  return /^[A-Za-z0-9_-]+$/.test(v);
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): Record<string, unknown> | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;

  const out: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(metadata)) {
    const lower = key.toLowerCase();

    if (DANGEROUS_KEYS.has(lower)) continue;

    if (lower === "apikey" || lower === "api_key") {
      if (typeof value === "string") {
        if (looksLikeFullApiKey(value)) {
          out.apiKeyMasked = maskApiKey(value);
        }
      }
      continue;
    }

    if (value != null && typeof value === "object" && !Array.isArray(value)) {
      const nested = sanitizeAuditMetadata(value as Record<string, unknown>);
      if (nested && Object.keys(nested).length > 0) {
        out[key] = nested;
      }
      continue;
    }

    if (Array.isArray(value)) {
      out[key] = value.map((item) => {
        if (item != null && typeof item === "object" && !Array.isArray(item)) {
          return sanitizeAuditMetadata(item as Record<string, unknown>) ?? {};
        }
        return item;
      });
      continue;
    }

    out[key] = value;
  }

  return Object.keys(out).length > 0 ? out : undefined;
}

/** Warm storage at boot; safe no-op on failure. */
export function readStorageWarmup(): void {
  readStorage();
}

function readStorage(): StorageFile {
  ensureStorageDir();
  if (!fs.existsSync(STORAGE_FILE)) {
    return { events: [] };
  }
  try {
    const raw = fs.readFileSync(STORAGE_FILE, "utf8");
    const parsed = JSON.parse(raw) as StorageFile;
    if (!Array.isArray(parsed.events)) return { events: [] };
    const events = parsed.events.filter(
      (e) =>
        e &&
        typeof e === "object" &&
        typeof (e as AuditLogEvent).id === "string" &&
        typeof (e as AuditLogEvent).type === "string" &&
        typeof (e as AuditLogEvent).timestamp === "number",
    ) as AuditLogEvent[];
    return { events };
  } catch (err) {
    console.warn(
      "[audit] audit-log.json corrupt or unreadable; resetting storage",
      err instanceof Error ? err.message : err,
    );
    try {
      if (fs.existsSync(STORAGE_FILE)) {
        fs.copyFileSync(
          STORAGE_FILE,
          `${STORAGE_FILE}.corrupt.${Date.now()}.bak`,
        );
      }
    } catch {
      // ignore backup failure
    }
    return { events: [] };
  }
}

function writeStorage(data: StorageFile): void {
  ensureStorageDir();
  const trimmed =
    data.events.length > MAX_EVENTS
      ? { events: data.events.slice(-MAX_EVENTS) }
      : data;
  try {
    fs.writeFileSync(STORAGE_FILE, JSON.stringify(trimmed, null, 2), "utf8");
  } catch (err) {
    console.error(
      "[audit] write failed",
      err instanceof Error ? err.message : err,
    );
  }
}

export async function clearOldAuditEvents(): Promise<void> {
  const data = readStorage();
  if (data.events.length <= MAX_EVENTS) return;
  data.events = data.events
    .sort((a, b) => a.timestamp - b.timestamp)
    .slice(-MAX_EVENTS);
  writeStorage(data);
}

export async function emitAuditEvent(event: {
  userId?: number;
  type: AuditEventType;
  severity?: AuditEventSeverity;
  message: string;
  metadata?: Record<string, unknown>;
}): Promise<AuditLogEvent> {
  const record: AuditLogEvent = {
    id: randomUUID(),
    userId:
      event.userId != null && Number.isFinite(event.userId)
        ? Math.floor(event.userId)
        : undefined,
    type: event.type,
    severity: event.severity ?? "info",
    timestamp: Date.now(),
    message: String(event.message).slice(0, 500),
    metadata: sanitizeAuditMetadata(event.metadata),
  };

  const data = readStorage();
  data.events.push(record);
  if (data.events.length > MAX_EVENTS) {
    data.events = data.events
      .sort((a, b) => a.timestamp - b.timestamp)
      .slice(-MAX_EVENTS);
  }
  writeStorage(data);
  return record;
}

export async function getAuditEvents(params: {
  userId?: number;
  limit?: number;
  includeGlobal?: boolean;
}): Promise<AuditLogEvent[]> {
  const limit = Math.min(200, Math.max(1, params.limit ?? 80));
  const includeGlobal = params.includeGlobal !== false;
  const data = readStorage();

  let filtered = data.events;
  if (params.userId != null && Number.isFinite(params.userId)) {
    const uid = Math.floor(params.userId);
    filtered = data.events.filter(
      (e) =>
        e.userId === uid || (includeGlobal && e.userId == null),
    );
  }

  return filtered
    .sort((a, b) => b.timestamp - a.timestamp)
    .slice(0, limit);
}

/** Throttle bingx_snapshot_synced to at most once per 60s per userId+connectionId. */
export async function emitBingXSnapshotSyncedIfAllowed(
  userId: number,
  connectionId: string,
  metadata?: Record<string, unknown>,
): Promise<AuditLogEvent | null> {
  const key = `${userId}:${connectionId}`;
  const now = Date.now();
  const last = snapshotSyncLastEmit.get(key) ?? 0;
  if (now - last < SNAPSHOT_SYNC_THROTTLE_MS) {
    return null;
  }
  snapshotSyncLastEmit.set(key, now);
  return emitAuditEvent({
    userId,
    type: "bingx_snapshot_synced",
    severity: "info",
    message: "BingX read-only snapshot synced",
    metadata: {
      exchange: "bingx",
      connectionId,
      ...metadata,
    },
  });
}

/** Throttle risk mirror audit events to at most once per 60s per throttle key. */
export async function emitRiskMirrorAuditIfAllowed(
  userId: number,
  throttleKey: string,
  event: {
    type: "risk_mirror_warning" | "risk_mirror_error";
    severity: AuditEventSeverity;
    message: string;
    metadata?: Record<string, unknown>;
  },
): Promise<AuditLogEvent | null> {
  const key = throttleKey;
  const now = Date.now();
  const last = riskMirrorAuditLastEmit.get(key) ?? 0;
  if (now - last < RISK_MIRROR_AUDIT_THROTTLE_MS) {
    return null;
  }
  riskMirrorAuditLastEmit.set(key, now);
  return emitAuditEvent({
    userId,
    type: event.type,
    severity: event.severity,
    message: event.message,
    metadata: event.metadata,
  });
}

export const CLIENT_ALLOWED_AUDIT_TYPES: ReadonlySet<AuditEventType> =
  new Set<AuditEventType>([
    "broker_switched",
    "bingx_saved_connection_restored",
    "system_health_error",
  ]);
