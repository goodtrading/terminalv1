import fs from "node:fs";
import path from "node:path";
import { listProviderConnections, getProviderConnection, rebindProviderConnectionOwner, selectDefaultProviderModel, type ResearchProviderConnection } from "./researchProviderConnections";
export type ActiveAIProfile = { ownerUserId: number; providerConnectionId: string; modelId: string; quality: "LOW" | "MID" | "HIGH"; updatedAt: string };
const filePath = () => process.env.GOODTRADING_ACTIVE_AI_PROFILE_PATH?.trim() || path.join(process.cwd(), "work", "active-ai-profiles.json");
function readAll(): Record<string, ActiveAIProfile> { try { return JSON.parse(fs.readFileSync(filePath(), "utf8")) as Record<string, ActiveAIProfile>; } catch (error) { if ((error as NodeJS.ErrnoException).code === "ENOENT") return {}; throw error; } }
function writeAll(value: Record<string, ActiveAIProfile>) { const file = filePath(); fs.mkdirSync(path.dirname(file), { recursive: true }); const tmp = `${file}.${process.pid}.${Date.now()}.tmp`; fs.writeFileSync(tmp, JSON.stringify(value), { mode: 0o600 }); fs.renameSync(tmp, file); }
function getRawActiveAIProfile(ownerUserId: number) { return readAll()[String(ownerUserId)] ?? null; }
export function getActiveAIProfile(ownerUserId: number) { return getRawActiveAIProfile(ownerUserId) ?? reconcileDevActiveAIProfile(ownerUserId); }
export function reconcileDevActiveAIProfile(ownerUserId: number): ActiveAIProfile | null {
  const current = getRawActiveAIProfile(ownerUserId);
  if (current || process.env.NODE_ENV === "production") return current;
  const target = getProviderConnection(ownerUserId);
  const connections = listProviderConnections();
  if (!target || target.status !== "CONNECTED" || connections.length !== 1) return null;
  const all = readAll();
  const orphan = Object.values(all).find((profile) => !connections.some((connection) => connection.connectionId === profile.providerConnectionId));
  if (!orphan) return null;
  const modelId = target.models.includes(orphan.modelId) ? orphan.modelId : target.model;
  const migrated: ActiveAIProfile = { ownerUserId, providerConnectionId: target.connectionId, modelId, quality: orphan.quality, updatedAt: new Date().toISOString() };
  all[String(ownerUserId)] = migrated;
  writeAll(all);
  return migrated;
}
export function reconcileDevOwnerState(ownerUserId: number): ActiveAIProfile | null {
  if (process.env.NODE_ENV === "production") return getActiveAIProfile(ownerUserId);
  const currentProfile = getRawActiveAIProfile(ownerUserId);
  const currentConnection = getProviderConnection(ownerUserId);
  if (currentProfile && currentConnection) return currentProfile;
  if (!currentProfile || currentConnection) return getActiveAIProfile(ownerUserId);
  const connections = listProviderConnections();
  if (connections.length !== 1) return null;
  const source = connections[0];
  if (source.providerId !== "openai-codex" || source.authMode !== "OAUTH") return null;
  const rebound = rebindProviderConnectionOwner(source.userId, ownerUserId);
  if (!rebound) return null;
  const profile: ActiveAIProfile = { ownerUserId, providerConnectionId: rebound.connectionId, modelId: rebound.models.includes(currentProfile.modelId) ? currentProfile.modelId : rebound.model, quality: currentProfile.quality, updatedAt: new Date().toISOString() };
  const all = readAll();
  all[String(ownerUserId)] = profile;
  writeAll(all);
  return profile;
}
export function setActiveAIProfile(profile: ActiveAIProfile) { const all = readAll(); all[String(profile.ownerUserId)] = profile; writeAll(all); return profile; }
export function ensureActiveAIProfile(ownerUserId: number, connection: ResearchProviderConnection): ActiveAIProfile {
  const current = getRawActiveAIProfile(ownerUserId);
  const validCurrent = current && current.providerConnectionId === connection.connectionId && connection.models.includes(current.modelId);
  if (validCurrent) return current;
  const profile: ActiveAIProfile = { ownerUserId, providerConnectionId: connection.connectionId, modelId: selectDefaultProviderModel(connection.providerId, connection.models), quality: current?.quality ?? "MID", updatedAt: new Date().toISOString() };
  return setActiveAIProfile(profile);
}
export function clearActiveAIProfile(ownerUserId: number) { const all = readAll(); delete all[String(ownerUserId)]; writeAll(all); }
