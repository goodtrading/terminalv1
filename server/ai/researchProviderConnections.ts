import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { deleteProviderSecret, getProviderSecret, providerSecretReference, putProviderSecret } from "./providerVault";
import { assertSafeCustomBaseUrl } from "./customProviderSecurity";

export type ResearchProviderId = "local" | "openai-codex" | "openai-api" | "anthropic" | "google" | "custom";
export type ResearchProviderAuthMode = "OAUTH" | "DEVICE_CODE" | "API_KEY" | "LOCAL" | "CUSTOM";
export type ProviderConnectionStatus = "DISCONNECTED" | "CONNECTING" | "CONNECTED" | "EXPIRED" | "RECONNECT_REQUIRED" | "RATE_LIMITED" | "UNAVAILABLE" | "ERROR";
export type ResearchProviderConnection = { connectionId: string; userId: number; providerId: ResearchProviderId; authMode: ResearchProviderAuthMode; status: ProviderConnectionStatus; model: string; models: string[]; credentialReference?: string; customBaseUrl?: string; createdAt: string; updatedAt: string; expiresAt?: string };
const metadataPath = () => process.env.GOODTRADING_PROVIDER_METADATA_PATH?.trim() || path.join(process.cwd(), "work", "provider-connections.json");
const connections = new Map<number, ResearchProviderConnection>();
function loadMetadata() { try { const records = JSON.parse(fs.readFileSync(metadataPath(), "utf8")) as ResearchProviderConnection[]; for (const record of records) if (Number.isSafeInteger(record.userId) && record.userId > 0) connections.set(record.userId, record); } catch (error) { if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error; } }
function persistMetadata() { const file = metadataPath(); fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.${Date.now()}.tmp`; fs.writeFileSync(tmp, JSON.stringify(Array.from(connections.values())), { mode: 0o600 }); fs.renameSync(tmp, file); }
loadMetadata();
const defaultModels: Record<ResearchProviderId, string[]> = { local: ["n12-fixture"], "openai-codex": [], "openai-api": ["gpt-4.1-mini"], anthropic: ["claude-sonnet-4-5"], google: ["gemini-2.5-flash"], custom: [] };
export function selectDefaultProviderModel(providerId: ResearchProviderId, models: string[]): string {
  if (providerId === "openai-codex" && models.includes("gpt-6-luna")) return "gpt-6-luna";
  return models[0] ?? defaultModels[providerId][0] ?? "custom";
}
const displayNames: Record<ResearchProviderId, string> = { local: "Local", "openai-codex": "OpenAI Codex", "openai-api": "OpenAI API", anthropic: "Anthropic", google: "Google Gemini", custom: "Custom" };
export function providerDisplayName(id: ResearchProviderId) { return displayNames[id]; }
export function supportedProviderAuthModes(id: ResearchProviderId): ResearchProviderAuthMode[] { if (id === "local") return ["LOCAL"]; if (id === "openai-codex") return ["OAUTH"]; if (id === "custom") return ["CUSTOM", "API_KEY"]; return ["API_KEY"]; }
export function listProviderCatalog() { return (Object.keys(displayNames) as ResearchProviderId[]).map((providerId) => ({ providerId, displayName: displayNames[providerId], authModes: supportedProviderAuthModes(providerId), models: defaultModels[providerId] })); }
export function getProviderConnection(userId: number) { return connections.get(userId) ?? null; }
export function listProviderConnections(): ResearchProviderConnection[] { return Array.from(connections.values()); }
export function rebindProviderConnectionOwner(fromUserId: number, toUserId: number): ResearchProviderConnection | null {
  if (process.env.NODE_ENV === "production") return null;
  const connection = connections.get(fromUserId);
  if (!connection || connections.has(toUserId) || connection.authMode !== "OAUTH" || connection.providerId !== "openai-codex") return null;
  const rebound = { ...connection, userId: toUserId, updatedAt: new Date().toISOString() };
  connections.delete(fromUserId);
  connections.set(toUserId, rebound);
  persistMetadata();
  return rebound;
}
export async function connectProvider(input: { userId: number; providerId: ResearchProviderId; authMode: ResearchProviderAuthMode; model?: string; apiKey?: string; customBaseUrl?: string; models?: string[] }) {
  if (!supportedProviderAuthModes(input.providerId).includes(input.authMode)) throw new Error("PROVIDER_AUTH_MODE_UNAVAILABLE");
  if (input.providerId === "custom") { if (!input.customBaseUrl) throw new Error("CUSTOM_PROVIDER_HTTPS_REQUIRED"); await assertSafeCustomBaseUrl(input.customBaseUrl); }
  if (input.authMode === "API_KEY" && !input.apiKey?.trim()) throw new Error("PROVIDER_API_KEY_REQUIRED");
  await disconnectProvider(input.userId); const now = new Date().toISOString(); const connectionId = crypto.randomUUID();
  const connection: ResearchProviderConnection = { connectionId, userId: input.userId, providerId: input.providerId, authMode: input.authMode, status: "CONNECTED", model: input.model?.trim() || selectDefaultProviderModel(input.providerId, input.models ?? []), models: input.models?.length ? input.models : defaultModels[input.providerId], customBaseUrl: input.customBaseUrl, createdAt: now, updatedAt: now };
  if (input.apiKey) { connection.credentialReference = providerSecretReference(input.userId, input.providerId, connectionId); await putProviderSecret(connection.credentialReference, { kind: "API_KEY", value: input.apiKey }); }
  connections.set(input.userId, connection); persistMetadata(); return connection;
}
export async function getProviderApiKey(userId: number) { const connection = getProviderConnection(userId); if (!connection?.credentialReference) return null; const secret = await getProviderSecret(connection.credentialReference); return secret?.kind === "API_KEY" ? secret.value : null; }
export async function disconnectProvider(userId: number) { const connection = connections.get(userId); if (connection?.credentialReference) await deleteProviderSecret(connection.credentialReference); connections.delete(userId); persistMetadata(); }
export async function testProviderConnection(userId: number) { const connection = getProviderConnection(userId); if (!connection) return { ok: false, status: "NOT_CONNECTED" }; if (connection.authMode === "API_KEY" && !(await getProviderApiKey(userId))) return { ok: false, status: "AUTH_INVALID" }; return { ok: true, status: "READY", provider: connection.providerId }; }
export function connectionPublic(connection: ResearchProviderConnection | null) { if (!connection) return null; const { credentialReference: _secret, userId: _owner, ...publicConnection } = connection; return publicConnection; }
