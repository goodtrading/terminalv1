import crypto from "crypto";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import {
  normalizeStoredConnectionFields,
  resolveConnectionCapability,
  resolveTradingEnabledFromStored,
} from "./bingxConnectionCapability";
import { probeBingXApiPermissions } from "./bingxApiPermissionProbe";
import type {
  BingXApiCredentials,
  BingXConnectionHealth,
  BingXPublicConnection,
  StoredBingXConnection,
} from "./bingxTypes";
import { maskApiKey } from "./bingxSigner";
import {
  cacheReadAllConnections,
  cacheReplaceConnections,
  ensureBingxConnectionsHydrated,
  isBingxConnectionPostgresMode,
  isUnsafeNonDurableBingxConnectionStore,
  migrateFileConnectionsToPostgres,
  reloadBingxConnectionCacheFromPostgres,
  UNSAFE_NON_DURABLE_BINGX_CONNECTION_STORE,
  type BingxConnectionMigrationResult,
} from "./bingxConnectionRepository";

const STORAGE_DIR = path.resolve(process.cwd(), "server", "storage");
const STORAGE_FILE = path.join(STORAGE_DIR, "bingx-connections.json");

let storageFileOverride: string | null = null;

/** Test seam — isolate ownership integration tests to a temp file. */
export function __setBingxStorageFileForTests(filePath: string | null): void {
  storageFileOverride = filePath;
}

function resolveStorageFile(): string {
  return storageFileOverride ?? STORAGE_FILE;
}

type StorageFile = {
  connections: StoredBingXConnection[];
};

function ensureStorageDir(): void {
  try {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
  } catch (err) {
    console.warn(
      "[storage] failed to ensure BingX storage dir:",
      err instanceof Error ? err.message : err,
    );
  }
}

function readFile(): StorageFile {
  // AI-8.1.3 — In postgres mode connections are durable in Postgres and served
  // from a synchronous cache hydrated at boot. The file store is dev/local only.
  if (isBingxConnectionPostgresMode()) {
    return { connections: cacheReadAllConnections() };
  }
  const filePath = resolveStorageFile();
  ensureStorageDir();
  if (!fs.existsSync(filePath)) {
    return { connections: [] };
  }
  try {
    const raw = fs.readFileSync(filePath, "utf8");
    const parsed = JSON.parse(raw) as StorageFile;
    if (!Array.isArray(parsed.connections)) return { connections: [] };
    return {
      connections: parsed.connections.filter(
        (c) =>
          c &&
          typeof c === "object" &&
          typeof (c as StoredBingXConnection).id === "string" &&
          typeof (c as StoredBingXConnection).userId === "number",
      ) as StoredBingXConnection[],
    };
  } catch (err) {
    console.warn(
      "[bingx-storage] connections file corrupt; resetting",
      err instanceof Error ? err.message : err,
    );
    try {
      if (fs.existsSync(filePath)) {
        fs.copyFileSync(
          filePath,
          `${filePath}.corrupt.${Date.now()}.bak`,
        );
      }
    } catch {
      // ignore
    }
    return { connections: [] };
  }
}

function writeFile(data: StorageFile): void {
  // AI-8.1.3 — Postgres mode: update the sync cache and durably persist.
  if (isBingxConnectionPostgresMode()) {
    cacheReplaceConnections(data.connections);
    return;
  }
  const filePath = resolveStorageFile();
  ensureStorageDir();
  try {
    fs.writeFileSync(filePath, JSON.stringify(data, null, 2), "utf8");
  } catch (err) {
    console.error(
      "[bingx-storage] write failed",
      err instanceof Error ? err.message : err,
    );
    throw new Error("BINGX_STORAGE_WRITE_FAILED");
  }
}

function normalizeUserId(userId: number): number {
  if (!Number.isFinite(userId) || userId <= 0) {
    throw new Error("INVALID_USER_ID");
  }
  return Math.floor(userId);
}

export function hasEncryptionKey(): boolean {
  const key = process.env.BINGX_CREDENTIAL_ENCRYPTION_KEY?.trim();
  return Boolean(key && key.length >= 16);
}

function deriveKey(): Buffer {
  const key = process.env.BINGX_CREDENTIAL_ENCRYPTION_KEY?.trim();
  if (!key) {
    throw new Error("BINGX_CREDENTIAL_ENCRYPTION_KEY_MISSING");
  }
  return crypto.createHash("sha256").update(key, "utf8").digest();
}

function encrypt(plaintext: string): string {
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", deriveKey(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

function decrypt(payload: string): string {
  const parts = payload.split(":");
  if (parts.length !== 3) throw new Error("Invalid encrypted payload");
  const [ivB64, tagB64, dataB64] = parts;
  const iv = Buffer.from(ivB64, "base64");
  const tag = Buffer.from(tagB64, "base64");
  const data = Buffer.from(dataB64, "base64");
  const decipher = crypto.createDecipheriv("aes-256-gcm", deriveKey(), iv);
  decipher.setAuthTag(tag);
  return Buffer.concat([decipher.update(data), decipher.final()]).toString("utf8");
}

export function toPublicConnection(c: StoredBingXConnection): BingXPublicConnection {
  const row = normalizeStoredConnectionFields(c);
  return {
    id: row.id,
    exchange: row.exchange,
    label: row.label,
    apiKeyMasked: row.apiKeyMasked,
    connectionMode: row.connectionMode,
    readOnly: row.readOnly,
    tradingPermissionConfirmed: row.tradingPermissionConfirmed,
    tradingEnabled: row.tradingEnabled,
    connected: row.status === "connected",
    permissions: row.permissions,
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastCheckedAt: row.lastCheckedAt,
    lastValidatedAt: row.lastValidatedAt,
    lastHealth: row.lastHealth,
    lastError: row.lastError,
  };
}

export function listConnectionsForUser(userId: number): BingXPublicConnection[] {
  const uid = normalizeUserId(userId);
  return readFile()
    .connections.filter((c) => c.userId === uid)
    .map((c) => toPublicConnection(normalizeStoredConnectionFields(c)));
}

export function getConnectionForUser(
  id: string,
  userId: number,
): StoredBingXConnection | null {
  const uid = normalizeUserId(userId);
  const row = readFile().connections.find((c) => c.id === id && c.userId === uid);
  return row ? normalizeStoredConnectionFields(row) : null;
}

export function getCredentialsForUser(
  id: string,
  userId: number,
): BingXApiCredentials | null {
  const row = getConnectionForUser(id, userId);
  if (!row) return null;
  if (!hasEncryptionKey()) return null;
  try {
    return {
      apiKey: decrypt(row.encryptedApiKey),
      apiSecret: decrypt(row.encryptedApiSecret),
    };
  } catch {
    return null;
  }
}

export function deleteConnectionForUser(id: string, userId: number): boolean {
  const uid = normalizeUserId(userId);
  const file = readFile();
  const next = file.connections.filter((c) => !(c.id === id && c.userId === uid));
  if (next.length === file.connections.length) return false;
  writeFile({ connections: next });
  return true;
}

export type SaveConnectionForUserResult =
  | { ok: true; connection: BingXPublicConnection }
  | { ok: false; code: string; message: string };

export function saveConnectionForUser(input: {
  userId: number;
  credentials: BingXApiCredentials;
  label?: string;
  status: StoredBingXConnection["status"];
  lastError?: string;
  lastHealth?: BingXConnectionHealth;
  capability: ReturnType<typeof resolveConnectionCapability>;
}): SaveConnectionForUserResult {
  // AI-8.1.3 — Never persist credentials to an ephemeral filesystem in
  // production. Saving is blocked until the durable Postgres repository is used.
  if (isUnsafeNonDurableBingxConnectionStore()) {
    return {
      ok: false,
      code: UNSAFE_NON_DURABLE_BINGX_CONNECTION_STORE,
      message:
        "Durable connection storage is required in production. Set GOODTRADING_BINGX_CONNECTION_REPOSITORY=postgres.",
    };
  }
  if (!hasEncryptionKey()) {
    return {
      ok: false,
      code: "BINGX_ENCRYPTION_KEY_MISSING",
      message:
        "Server encryption key is missing. BingX credentials cannot be saved.",
    };
  }

  const uid = normalizeUserId(input.userId);
  const now = new Date().toISOString();
  const cap = input.capability;

  const row: StoredBingXConnection = {
    id: randomUUID(),
    userId: uid,
    exchange: "bingx",
    label: input.label?.trim() || "BingX API",
    apiKeyMasked: maskApiKey(input.credentials.apiKey),
    encryptedApiKey: encrypt(input.credentials.apiKey.trim()),
    encryptedApiSecret: encrypt(input.credentials.apiSecret.trim()),
    connectionMode: cap.connectionMode,
    readOnly: cap.readOnly,
    tradingPermissionConfirmed: cap.tradingPermissionConfirmed,
    tradingEnabled: cap.tradingEnabled,
    permissions: cap.permissions,
    status: input.status,
    createdAt: now,
    updatedAt: now,
    lastCheckedAt: now,
    lastValidatedAt: now,
    lastHealth: input.lastHealth,
    lastError: input.lastError,
  };

  const file = readFile();
  file.connections = file.connections.filter(
    (c) => !(c.userId === uid && c.exchange === "bingx"),
  );
  file.connections.push(row);
  writeFile(file);

  return { ok: true, connection: toPublicConnection(row) };
}

export async function refreshConnectionPermissionsForUser(
  id: string,
  userId: number,
): Promise<BingXPublicConnection | null> {
  const uid = normalizeUserId(userId);
  const file = readFile();
  const row = file.connections.find((c) => c.id === id && c.userId === uid);
  if (!row) return null;

  const credentials = getCredentialsForUser(id, uid);
  if (!credentials) {
    return toPublicConnection(normalizeStoredConnectionFields(row));
  }

  const probe = await probeBingXApiPermissions(credentials);
  const cap = resolveConnectionCapability(probe);
  const now = new Date().toISOString();

  row.connectionMode = cap.connectionMode;
  row.readOnly = cap.readOnly;
  row.tradingPermissionConfirmed = cap.tradingPermissionConfirmed;
  row.tradingEnabled = cap.tradingEnabled;
  row.permissions = cap.permissions;
  row.updatedAt = now;
  row.lastCheckedAt = now;
  row.lastValidatedAt = now;

  writeFile(file);
  return toPublicConnection(row);
}

export async function listConnectionsForUserRefreshed(
  userId: number,
): Promise<BingXPublicConnection[]> {
  const uid = normalizeUserId(userId);
  const list = readFile().connections.filter((c) => c.userId === uid);
  const out: BingXPublicConnection[] = [];

  for (const row of list) {
    if (row.status === "connected" && hasEncryptionKey()) {
      try {
        const refreshed = await refreshConnectionPermissionsForUser(row.id, uid);
        out.push(refreshed ?? toPublicConnection(row));
      } catch {
        out.push(toPublicConnection(row));
      }
    } else {
      out.push(toPublicConnection(row));
    }
  }

  return out;
}

export function updateConnectionStatusForUser(
  id: string,
  userId: number,
  status: StoredBingXConnection["status"],
  lastError?: string,
  lastHealth?: BingXConnectionHealth,
): void {
  const uid = normalizeUserId(userId);
  const file = readFile();
  const row = file.connections.find((c) => c.id === id && c.userId === uid);
  if (!row) return;
  const normalized = normalizeStoredConnectionFields(row);
  normalized.status = status;
  normalized.updatedAt = new Date().toISOString();
  normalized.lastCheckedAt = normalized.updatedAt;
  normalized.lastValidatedAt = normalized.lastCheckedAt;
  normalized.lastError = lastError;
  if (lastHealth) normalized.lastHealth = lastHealth;
  normalized.tradingEnabled = resolveTradingEnabledFromStored(normalized);
  const idx = file.connections.findIndex((c) => c.id === id && c.userId === uid);
  file.connections[idx] = normalized;
  writeFile(file);
}

export function updateConnectionHealthForUser(
  id: string,
  userId: number,
  lastHealth: BingXConnectionHealth,
): void {
  const uid = normalizeUserId(userId);
  const file = readFile();
  const row = file.connections.find((c) => c.id === id && c.userId === uid);
  if (!row) return;
  row.lastHealth = lastHealth;
  row.updatedAt = new Date().toISOString();
  writeFile(file);
}

export function getFirstConnectedConnectionForUser(
  userId: number,
): BingXPublicConnection | null {
  return (
    listConnectionsForUser(userId).find((c) => c.status === "connected") ?? null
  );
}

/** @deprecated Use user-scoped helpers. Kept for internal migration only. */
export function listConnections(): BingXPublicConnection[] {
  return readFile().connections.map((c) => toPublicConnection(c));
}

/** @deprecated Use getConnectionForUser */
export function getConnection(id: string): StoredBingXConnection | null {
  const row = readFile().connections.find((c) => c.id === id);
  return row ? normalizeStoredConnectionFields(row) : null;
}

/** @deprecated Use getCredentialsForUser */
export function getCredentials(id: string): BingXApiCredentials | null {
  const row = getConnection(id);
  if (!row || typeof row.userId !== "number") return null;
  return getCredentialsForUser(id, row.userId);
}

/**
 * AI-8.1.3 — Hydrate the durable connection cache from Postgres at boot.
 * No-op outside postgres mode. Never throws (logs on failure internally).
 */
export async function hydrateBingxConnections(): Promise<void> {
  await ensureBingxConnectionsHydrated();
}

/** Read connections directly from the JSON file store (migration source). */
function readFileConnectionsRaw(): StoredBingXConnection[] {
  const filePath = resolveStorageFile();
  try {
    if (!fs.existsSync(filePath)) return [];
    const parsed = JSON.parse(fs.readFileSync(filePath, "utf8")) as StorageFile;
    if (!Array.isArray(parsed.connections)) return [];
    return parsed.connections.filter(
      (c) =>
        c &&
        typeof c === "object" &&
        typeof (c as StoredBingXConnection).id === "string" &&
        typeof (c as StoredBingXConnection).userId === "number",
    ) as StoredBingXConnection[];
  } catch {
    return [];
  }
}

/**
 * AI-8.1.3 — Controlled file → Postgres migration. Expected sourceRecords=0 in
 * production (no ephemeral connection saved). Idempotent by connection id.
 */
export async function migrateBingxConnectionsFromFileToPostgres(): Promise<BingxConnectionMigrationResult> {
  const source = readFileConnectionsRaw();
  const result = await migrateFileConnectionsToPostgres(source);
  if (result.ran && result.migrated > 0) {
    // Refresh the cache so migrated rows are immediately visible.
    await reloadBingxConnectionCacheFromPostgres();
  }
  return result;
}

/** @deprecated Use deleteConnectionForUser */
export function deleteConnection(id: string): boolean {
  const file = readFile();
  const next = file.connections.filter((c) => c.id !== id);
  if (next.length === file.connections.length) return false;
  writeFile({ connections: next });
  return true;
}
