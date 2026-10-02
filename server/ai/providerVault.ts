import crypto from "node:crypto";
import fs from "node:fs/promises";
import path from "node:path";
import { getWindowsSecret, putWindowsSecret, deleteWindowsSecret } from "./windowsDpapiVault";

export type VaultSecretKind = "API_KEY" | "OAUTH_REFRESH_TOKEN";
export type VaultSecret = { kind: VaultSecretKind; value: string };

type VaultRecord = { iv: string; tag: string; ciphertext: string };
type VaultFile = Record<string, VaultRecord>;

const vaultPath = () => process.env.GOODTRADING_PROVIDER_VAULT_PATH?.trim() || path.join(process.cwd(), "work", "provider-vault.json");
function vaultKey(): Buffer {
  const raw = process.env.GOODTRADING_PROVIDER_VAULT_KEY?.trim();
  if (!raw || raw.length < 32) throw new Error("PROVIDER_VAULT_NOT_CONFIGURED");
  return crypto.createHash("sha256").update(raw, "utf8").digest();
}
async function readVault(): Promise<VaultFile> {
  try { return JSON.parse(await fs.readFile(vaultPath(), "utf8")) as VaultFile; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; }
}
function encrypt(value: string): VaultRecord {
  const iv = crypto.randomBytes(12); const cipher = crypto.createCipheriv("aes-256-gcm", vaultKey(), iv);
  const ciphertext = Buffer.concat([cipher.update(value, "utf8"), cipher.final()]);
  return { iv: iv.toString("base64url"), tag: cipher.getAuthTag().toString("base64url"), ciphertext: ciphertext.toString("base64url") };
}
function decrypt(record: VaultRecord): string {
  const decipher = crypto.createDecipheriv("aes-256-gcm", vaultKey(), Buffer.from(record.iv, "base64url"));
  decipher.setAuthTag(Buffer.from(record.tag, "base64url"));
  return Buffer.concat([decipher.update(Buffer.from(record.ciphertext, "base64url")), decipher.final()]).toString("utf8");
}
async function writeVault(vault: VaultFile): Promise<void> {
  const file = vaultPath(); await fs.mkdir(path.dirname(file), { recursive: true });
  const tmp = `${file}.${process.pid}.${Date.now()}.tmp`; await fs.writeFile(tmp, JSON.stringify(vault), { mode: 0o600 }); await fs.rename(tmp, file);
}
function useWindowsStore(): boolean { return process.platform === "win32" && process.env.GOODTRADING_PROVIDER_SECURE_STORE !== "DEV_ENCRYPTED_FALLBACK"; }
export async function putProviderSecret(reference: string, secret: VaultSecret): Promise<void> { if (useWindowsStore()) return putWindowsSecret(reference, JSON.stringify(secret)); const vault = await readVault(); vault[reference] = encrypt(JSON.stringify(secret)); await writeVault(vault); }
export async function getProviderSecret(reference: string): Promise<VaultSecret | null> { if (useWindowsStore()) { const value = await getWindowsSecret(reference); return value ? JSON.parse(value) as VaultSecret : null; } const record = (await readVault())[reference]; if (!record) return null; const secret = JSON.parse(decrypt(record)) as VaultSecret; return secret; }
export async function deleteProviderSecret(reference: string): Promise<void> { if (useWindowsStore()) return deleteWindowsSecret(reference); const vault = await readVault(); if (!vault[reference]) return; delete vault[reference]; await writeVault(vault); }
export function providerSecretReference(userId: number, providerId: string, connectionId: string): string { return `provider:${userId}:${providerId}:${connectionId}`; }
