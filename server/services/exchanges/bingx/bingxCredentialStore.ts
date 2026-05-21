import crypto from "crypto";
import fs from "fs";
import path from "path";
import { randomUUID } from "crypto";
import type {
  BingXApiCredentials,
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
  if (!fs.existsSync(STORAGE_DIR)) {
    fs.mkdirSync(STORAGE_DIR, { recursive: true });
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
    return parsed;
  } catch {
    return { connections: [] };
  }
}

function writeFile(data: StorageFile): void {
  ensureStorageDir();
  fs.writeFileSync(STORAGE_FILE, JSON.stringify(data, null, 2), "utf8");
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
  return {
    id: c.id,
    exchange: c.exchange,
    label: c.label,
    apiKeyMasked: c.apiKeyMasked,
    permissions: c.permissions,
    status: c.status,
    createdAt: c.createdAt,
    updatedAt: c.updatedAt,
    lastCheckedAt: c.lastCheckedAt,
    lastError: c.lastError,
  };
}

export function listConnections(): BingXPublicConnection[] {
  return readFile().connections.map(toPublicConnection);
}

export function getConnection(id: string): StoredBingXConnection | null {
  return readFile().connections.find((c) => c.id === id) ?? null;
}

export function getCredentials(id: string): BingXApiCredentials | null {
  const row = getConnection(id);
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

export function deleteConnection(id: string): boolean {
  const file = readFile();
  const next = file.connections.filter((c) => c.id !== id);
  if (next.length === file.connections.length) return false;
  writeFile({ connections: next });
  return true;
}

export function saveConnection(input: {
  credentials: BingXApiCredentials;
  label?: string;
  permissions: { readOnly: boolean; trading: boolean };
  status: StoredBingXConnection["status"];
  lastError?: string;
}): { connection: BingXPublicConnection; warning?: string } {
  if (!hasEncryptionKey()) {
    return {
      connection: {
        id: "ephemeral",
        exchange: "bingx",
        label: input.label || "BingX",
        apiKeyMasked: maskApiKey(input.credentials.apiKey),
        permissions: {
          readOnly: true,
          trading: false,
        },
        status: input.status,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
        lastError: input.lastError,
      },
      warning:
        "Encryption key missing. Credentials were not saved.",
    };
  }

  const now = new Date().toISOString();
  const row: StoredBingXConnection = {
    id: randomUUID(),
    exchange: "bingx",
    label: input.label?.trim() || "BingX API",
    apiKeyMasked: maskApiKey(input.credentials.apiKey),
    encryptedApiKey: encrypt(input.credentials.apiKey.trim()),
    encryptedApiSecret: encrypt(input.credentials.apiSecret.trim()),
    permissions: {
      readOnly: true,
      trading: false,
    },
    status: input.status,
    createdAt: now,
    updatedAt: now,
    lastCheckedAt: now,
    lastError: input.lastError,
  };

  const file = readFile();
  file.connections.push(row);
  writeFile(file);

  return { connection: toPublicConnection(row) };
}

export function updateConnectionStatus(
  id: string,
  status: StoredBingXConnection["status"],
  lastError?: string,
): void {
  const file = readFile();
  const row = file.connections.find((c) => c.id === id);
  if (!row) return;
  row.status = status;
  row.updatedAt = new Date().toISOString();
  row.lastCheckedAt = new Date().toISOString();
  row.lastError = lastError;
  writeFile(file);
}

export function getFirstConnectedConnection(): BingXPublicConnection | null {
  return (
    listConnections().find((c) => c.status === "connected") ?? null
  );
}
