import crypto from "crypto";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  BingXApiCredentials,
  BingXConnectionHealth,
  BingXPublicConnection,
  StoredBingXConnection,
} from "./bingxTypes";
import { maskApiKey } from "./bingxSigner";

const STORAGE_DIR = path.resolve(process.cwd(), "server", "storage");
const STORAGE_FILE = path.join(STORAGE_DIR, "bingx-connections.json");

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
  ensureStorageDir();
  if (!fs.existsSync(STORAGE_FILE)) {
    return { connections: [] };
  }
  try {
    const raw = fs.readFileSync(STORAGE_FILE, "utf8");
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
  } catch {
    return { connections: [] };
  }
}

function writeFile(data: StorageFile): void {
  ensureStorageDir();
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), "utf8");
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

function normalizeStoredRow(raw: StoredBingXConnection): StoredBingXConnection {
  return {
    ...raw,
    mode: "read-only",
    tradingEnabled: false,
    permissions: { readOnly: true, trading: false },
  };
}

export function toPublicConnection(c: StoredBingXConnection): BingXPublicConnection {
  const row = normalizeStoredRow(c);
  return {
    id: row.id,
    exchange: row.exchange,
    label: row.label,
    apiKeyMasked: row.apiKeyMasked,
    mode: "read-only",
    readOnly: true,
    tradingEnabled: false,
    connected: row.status === "connected",
    permissions: { readOnly: true, trading: false },
    status: row.status,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt,
    lastCheckedAt: row.lastCheckedAt,
    lastValidatedAt: row.lastValidatedAt ?? row.lastCheckedAt,
    lastHealth: row.lastHealth,
    lastError: row.lastError,
  };
}

export function listConnectionsForUser(userId: number): BingXPublicConnection[] {
  const uid = normalizeUserId(userId);
  return readFile()
    .connections.filter((c) => c.userId === uid)
    .map(toPublicConnection);
}

export function getConnectionForUser(
  id: string,
  userId: number,
): StoredBingXConnection | null {
  const uid = normalizeUserId(userId);
  const row = readFile().connections.find((c) => c.id === id && c.userId === uid);
  return row ? normalizeStoredRow(row) : null;
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
}): SaveConnectionForUserResult {
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
  const row: StoredBingXConnection = {
    id: randomUUID(),
    userId: uid,
    exchange: "bingx",
    label: input.label?.trim() || "BingX API",
    apiKeyMasked: maskApiKey(input.credentials.apiKey),
    encryptedApiKey: encrypt(input.credentials.apiKey.trim()),
    encryptedApiSecret: encrypt(input.credentials.apiSecret.trim()),
    mode: "read-only",
    tradingEnabled: false,
    permissions: { readOnly: true, trading: false },
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
  row.status = status;
  row.updatedAt = new Date().toISOString();
  row.lastCheckedAt = new Date().toISOString();
  row.lastValidatedAt = row.lastCheckedAt;
  row.lastError = lastError;
  if (lastHealth) row.lastHealth = lastHealth;
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
  return readFile().connections.map(toPublicConnection);
}

/** @deprecated Use getConnectionForUser */
export function getConnection(id: string): StoredBingXConnection | null {
  return readFile().connections.find((c) => c.id === id) ?? null;
}

/** @deprecated Use getCredentialsForUser */
export function getCredentials(id: string): BingXApiCredentials | null {
  const row = getConnection(id);
  if (!row || typeof row.userId !== "number") return null;
  return getCredentialsForUser(id, row.userId);
}

/** @deprecated Use deleteConnectionForUser */
export function deleteConnection(id: string): boolean {
  const file = readFile();
  const next = file.connections.filter((c) => c.id !== id);
  if (next.length === file.connections.length) return false;
  writeFile({ connections: next });
  return true;
}
