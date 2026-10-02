import { mkdir, readFile, readdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { randomUUID } from "node:crypto";
import type { ShadowTraderSession } from "@shared/shadowTrader";

const emptyPosition = () => ({ direction: "FLAT" as const, quantity: 0, entryPrice: null, entryTime: null, entryDecisionId: null, invalidation: null, realizedPnl: 0 });

function fileFor(root: string, id: string): string { return path.join(root, `${encodeURIComponent(id)}.json`); }
function recover(session: ShadowTraderSession): ShadowTraderSession { return session.status === "RUNNING" ? { ...session, status: "PAUSED", nextEvaluationAt: null, updatedAt: new Date().toISOString() } : session; }
function isWindowsReplaceError(error: unknown): boolean { const code = (error as NodeJS.ErrnoException)?.code; return process.platform === "win32" && (code === "EPERM" || code === "EACCES" || code === "EBUSY"); }
function sleep(ms: number): Promise<void> { return new Promise((resolve) => setTimeout(resolve, ms)); }
async function replaceFileAtomically(temp: string, target: string): Promise<void> {
  const backup = `${target}.${process.pid}.${randomUUID()}.bak`; let movedTarget = false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try { await rename(temp, target); return; } catch (error) {
      if (!isWindowsReplaceError(error)) throw error;
      try { await rename(target, backup); movedTarget = true; } catch (moveError) { if ((moveError as NodeJS.ErrnoException)?.code !== "ENOENT" && attempt === 2) throw error; }
      try { await rename(temp, target); if (movedTarget) await rm(backup, { force: true }); return; }
      catch (replaceError) { if (movedTarget) { try { await rename(backup, target); } catch { /* preserve replacement error */ } movedTarget = false; } if (attempt === 2) throw replaceError; await sleep(25 * (attempt + 1)); }
    }
  }
  throw new Error("SHADOW_ATOMIC_REPLACE_FAILED");
}

export function createShadowTraderStore(root = process.env.GOODTRADING_SHADOW_ROOT?.trim() || path.join(process.cwd(), "work", "shadow-trader", "sessions")) {
  const mutations = new Map<string, Promise<void>>();
  async function save(session: ShadowTraderSession): Promise<ShadowTraderSession> {
    await mkdir(root, { recursive: true });
    const target = fileFor(root, session.sessionId); const tmp = `${target}.${process.pid}.${randomUUID()}.tmp`;
    try { await writeFile(tmp, JSON.stringify(session, null, 2), { encoding: "utf8", mode: 0o600 }); await replaceFileAtomically(tmp, target); return session; }
    catch (error) { await rm(tmp, { force: true }).catch(() => undefined); throw error; }
  }
  async function get(sessionId: string, ownerUserId: number): Promise<ShadowTraderSession | null> {
    try { const raw = JSON.parse(await readFile(fileFor(root, sessionId), "utf8")) as ShadowTraderSession; if (raw.ownerUserId !== ownerUserId) return null; return raw; }
    catch (error: any) { if (error?.code === "ENOENT") return null; throw error; }
  }
  async function list(ownerUserId: number): Promise<ShadowTraderSession[]> {
    await mkdir(root, { recursive: true }); const files = (await readdir(root)).filter((x) => x.endsWith(".json")); const out: ShadowTraderSession[] = [];
    for (const file of files) { try { const raw = JSON.parse(await readFile(path.join(root, file), "utf8")) as ShadowTraderSession; if (raw.ownerUserId === ownerUserId) out.push(raw); } catch { /* isolate corrupt sessions */ } }
    return out.sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
  }
  async function recoverRunningSessions(): Promise<number> {
    await mkdir(root, { recursive: true }); let recovered = 0;
    const files = (await readdir(root)).filter((x) => x.endsWith(".json"));
    for (const file of files) { try { const raw = JSON.parse(await readFile(path.join(root, file), "utf8")) as ShadowTraderSession; if (raw.status === "RUNNING") { await save(recover(raw)); recovered += 1; } } catch { /* isolate corrupt sessions */ } }
    return recovered;
  }
  return {
    async create(input: { ownerUserId: number; provider: string; model: string; quality: "LOW" | "MID" | "HIGH"; cadenceMs?: number; mode?: "SHADOW" | "PAPER_AUTONOMOUS"; paperSimulationSessionId?: string | null; riskConfig?: ShadowTraderSession["riskConfig"] }): Promise<ShadowTraderSession> {
      const now = new Date().toISOString(); const mode = input.mode ?? "SHADOW"; const session: ShadowTraderSession = { sessionId: `${mode === "PAPER_AUTONOMOUS" ? "paper" : "shadow"}-${randomUUID()}`, ownerUserId: input.ownerUserId, instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual", startedAt: now, endedAt: null, mode, status: "CREATED", provider: input.provider, model: input.model, quality: input.quality, cadenceMs: Math.max(5_000, input.cadenceMs ?? 60_000), risk: { maxExposure: input.riskConfig?.maxExposure ?? 1, maxSessionLoss: input.riskConfig?.maxSessionLoss ?? 1000, cooldownMs: input.riskConfig?.cooldownMs ?? 60_000, requireInvalidation: true }, ...(mode === "PAPER_AUTONOMOUS" ? { paperSimulationSessionId: input.paperSimulationSessionId ?? null, riskConfig: input.riskConfig ?? { fixedQuantity: "1", maxExposure: 1, maxSessionLoss: 1000, cooldownMs: 60_000, requireInvalidation: true }, executionIntentCount: 0, executedOrderCount: 0, lastExecutionAt: null, currentCanonicalPaperPosition: null, latestExecution: null } : {}), position: emptyPosition(), trades: [], journal: [], decisionCount: 0, lastDecisionAt: null, lastMarketCapturedAt: null, nextEvaluationAt: null, failureReason: null, updatedAt: now }; return save(session);
    },
    get,
    list,
    recoverRunningSessions,
    update: async (sessionId: string, ownerUserId: number, updater: (session: ShadowTraderSession) => ShadowTraderSession) => {
      const previous = mutations.get(sessionId) ?? Promise.resolve();
      let tail!: Promise<void>;
      const operation = previous.catch(() => undefined).then(async () => { const current = await get(sessionId, ownerUserId); if (!current) return null; return save({ ...updater(current), updatedAt: new Date().toISOString() }); });
      tail = operation.then(() => undefined, () => undefined); mutations.set(sessionId, tail);
      try { return await operation; } finally { if (mutations.get(sessionId) === tail) mutations.delete(sessionId); }
    },
  };
}
export type ShadowTraderStore = ReturnType<typeof createShadowTraderStore>;
