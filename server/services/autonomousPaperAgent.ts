import { randomUUID } from "node:crypto";
import { buildLiveMarketContext } from "../ai/buildLiveMarketContext";
import { createResearchProvider } from "../ai/researchProvider";
import type { AIProvider } from "@shared/aiResearch";
import type { ShadowDecisionPayload, ShadowJournalEntry, ShadowTraderSession } from "@shared/shadowTrader";
import type { PaperExecutionIntent } from "@shared/autonomousPaper";
import { createAutonomousPaperEngine, type PaperExecutionBoundary } from "./autonomousPaperEngine";
import type { ShadowTraderStore } from "./shadowTraderStore";
import type { NautilusServerPaperRuntimeManager } from "./nautilusServerPaperRuntime";

const timers = new Map<string, NodeJS.Timeout>();
const inFlight = new Set<string>();
const actions = ["NO_TRADE", "ENTER_LONG", "ENTER_SHORT", "HOLD", "EXIT"] as const;

function parseDecision(raw: string): ShadowDecisionPayload {
  const value = JSON.parse(raw) as Partial<ShadowDecisionPayload>;
  if (!actions.includes(value.action as typeof actions[number]) || typeof value.thesis !== "string" || !value.thesis.trim()) throw new Error("PAPER_PROVIDER_MALFORMED_DECISION");
  return {
    action: value.action!, thesis: value.thesis.slice(0, 2000), keyEvidence: Array.isArray(value.keyEvidence) ? value.keyEvidence.filter((x): x is string => typeof x === "string").slice(0, 8) : [], contradictions: Array.isArray(value.contradictions) ? value.contradictions.filter((x): x is string => typeof x === "string").slice(0, 8) : [], invalidation: value.invalidation == null ? null : Number.isFinite(value.invalidation) ? value.invalidation : null, horizon: typeof value.horizon === "string" ? value.horizon : "intraday", dataLimitations: Array.isArray(value.dataLimitations) ? value.dataLimitations.filter((x): x is string => typeof x === "string").slice(0, 8) : [],
  };
}

function contextBbo(context: Record<string, unknown>) {
  const live = context.liveEvidence && typeof context.liveEvidence === "object" ? context.liveEvidence as Record<string, any> : {};
  const raw = live.BBO?.value ?? (context.bookState as any)?.bbo;
  const quality = live.BBO?.quality === "VALID" ? "VALID" : live.BBO?.quality === "STALE" ? "STALE" : live.BBO?.quality === "PARTIAL" ? "DEGRADED" : "UNAVAILABLE";
  return { bid: Number(raw?.bid), ask: Number(raw?.ask), capturedAt: String(context.capturedAt ?? new Date().toISOString()), quality } as const;
}

function prompt(session: ShadowTraderSession, context: Record<string, unknown>): string {
  return [
    "You are GoodTrading Autonomous PAPER Trader.",
    "Propose only a structured intent. GoodTrading deterministically validates risk and sends only to the authenticated Nautilus PAPER simulation.",
    "You have no LIVE, broker, or direct order authority. Never emit broker commands, leverage, owner IDs, or session IDs.",
    "Return JSON only with action, thesis, keyEvidence, contradictions, invalidation, horizon, dataLimitations.",
    `Allowed actions: ${actions.join(", ")}. Current PAPER position: ${JSON.stringify(session.position)}.`,
    `MARKET_EVIDENCE: ${JSON.stringify(context)}`,
  ].join("\n");
}

function boundaryFor(manager: NautilusServerPaperRuntimeManager, persistIntent: (intent: PaperExecutionIntent) => Promise<void>, recordEvidence: (status: "SUBMISSION_STARTED" | "SUBMITTED" | "AMBIGUOUS" | "RECONCILED", evidence: Record<string, unknown>) => Promise<void>, canExecute: () => Promise<boolean>): PaperExecutionBoundary {
  return {
    async submitProtectedEntry(input) {
      const result = await manager.submitProtectedEntryCommand(input.ownerUserId, input.idempotencyKey, { side: input.side, quantity: input.quantity, stopLoss: input.stopLoss, takeProfit: input.takeProfit });
      return { ...(result.command.response ?? {}), status: result.command.status };
    },
    async closePosition(input) {
      const result = await manager.closePositionCommand(input.ownerUserId, input.idempotencyKey);
      return { ...(result.command.response ?? {}), status: result.command.status };
    },
    async reconcile(input) {
      const [snapshot, orders] = await Promise.all([manager.readSnapshot(input.ownerUserId), manager.readOrders(input.ownerUserId)]);
      return { simulationSessionId: snapshot.simulationSessionId, position: snapshot.position, orders };
    },
    persistIntent,
    recordEvidence,
    canExecute,
  };
}

export async function runAutonomousPaperCycle(input: { session: ShadowTraderSession; store: ShadowTraderStore; manager: NautilusServerPaperRuntimeManager; provider?: AIProvider; readMarket?: () => Promise<Record<string, unknown>> }): Promise<ShadowTraderSession> {
  const currentAtStart = await input.store.get(input.session.sessionId, input.session.ownerUserId);
  if (!currentAtStart || currentAtStart.status !== "RUNNING") return currentAtStart ?? input.session;
  const cycleId = randomUUID(); const requestId = randomUUID(); const context = await (input.readMarket ?? (() => buildLiveMarketContext({ marketType: "Perpetual" })))(); const bbo = contextBbo(context);
  const provider = input.provider ?? await createResearchProvider(input.session.ownerUserId, input.session.quality, input.session.model, `paper:${input.session.sessionId}`);
  let payload: ShadowDecisionPayload;
  try { payload = parseDecision(String(await provider.generate({ prompt: prompt(input.session, context), schema: "ShadowTraderDecision" }))); }
  catch (error) {
    const now = new Date().toISOString(); const reason = error instanceof Error ? error.message : "PAPER_PROVIDER_ERROR";
    const journal: ShadowJournalEntry = { decisionId: randomUUID(), sessionId: input.session.sessionId, cycleId, requestId, timestamp: now, marketCapturedAt: String(context.capturedAt ?? now), instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual", action: "NO_TRADE", thesis: "Provider unavailable or malformed; no PAPER intent was created.", keyEvidence: [], contradictions: [], invalidation: null, horizon: "intraday", dataLimitations: [reason], provider: provider.id, model: provider.model ?? input.session.model, evidenceRef: "paper-evidence:unavailable", evidenceHash: "", accepted: false, rejectionReason: "PROVIDER_FAILURE", positionBefore: input.session.position, positionAfter: input.session.position, trade: null };
    return (await input.store.update(input.session.sessionId, input.session.ownerUserId, (session) => ({ ...session, status: session.status === "RUNNING" ? "RUNNING" : session.status, failureReason: reason, decisionCount: session.decisionCount + 1, lastDecisionAt: now, lastMarketCapturedAt: journal.marketCapturedAt, nextEvaluationAt: new Date(Date.now() + session.cadenceMs).toISOString(), journal: [...session.journal, journal] })))!;
  }
  const currentBeforeExecution = await input.store.get(input.session.sessionId, input.session.ownerUserId);
  if (!currentBeforeExecution || currentBeforeExecution.status !== "RUNNING") return currentBeforeExecution ?? input.session;
  const decisionId = randomUUID(); let currentIntent: PaperExecutionIntent | null = null;
  const pendingIntent = async (intent: PaperExecutionIntent) => { currentIntent = intent; const reservation = input.manager.reserveAutonomousIntent({ ownerUserId: intent.ownerUserId, simulationSessionId: intent.simulationSessionId, n13bSessionId: intent.sessionId, decisionId: intent.decisionId, executionIntentId: intent.executionIntentId, idempotencyKey: intent.idempotencyKey, instrument: intent.instrument, action: intent.action, side: intent.side, quantity: intent.quantity, marketCapturedAt: intent.marketCapturedAt, evidenceHash: intent.evidenceHash, riskPolicyVersion: intent.riskPolicyVersion }); if (reservation.created) input.manager.appendAutonomousEvidence({ ownerUserId: intent.ownerUserId, simulationSessionId: intent.simulationSessionId, idempotencyKey: intent.idempotencyKey, status: "INTENT_CREATED", evidence: { intent } }); await input.store.update(input.session.sessionId, input.session.ownerUserId, (session) => ({ ...session, latestExecution: { status: "AMBIGUOUS", reason: "INTENT_DURABLY_PERSISTED_BEFORE_SUBMIT", executionIntent: intent, simulationSessionId: intent.simulationSessionId, orderIds: [], protectionGroupId: null, response: null, reconciledPosition: null, reconciledOrders: [] } })); };
  const recordEvidence = async (status: "SUBMISSION_STARTED" | "SUBMITTED" | "AMBIGUOUS" | "RECONCILED", evidence: Record<string, unknown>) => { if (!currentIntent) throw new Error("AUTONOMOUS_INTENT_NOT_INITIALIZED"); input.manager.appendAutonomousEvidence({ ownerUserId: currentIntent.ownerUserId, simulationSessionId: currentIntent.simulationSessionId, idempotencyKey: currentIntent.idempotencyKey, status, evidence }); };
  const seedKeys = currentBeforeExecution.latestExecution?.executionIntent?.idempotencyKey ? [currentBeforeExecution.latestExecution.executionIntent.idempotencyKey] : [];
  const canExecute = async () => (await input.store.get(input.session.sessionId, input.session.ownerUserId))?.status === "RUNNING";
  const engine = createAutonomousPaperEngine(boundaryFor(input.manager, pendingIntent, recordEvidence, canExecute), seedKeys);
  const result = await engine.applyDecision({ session: { ...currentBeforeExecution, mode: currentBeforeExecution.mode, venue: currentBeforeExecution.venue, marketType: currentBeforeExecution.marketType, paperSimulationSessionId: currentBeforeExecution.paperSimulationSessionId, riskConfig: currentBeforeExecution.riskConfig }, decision: { decisionId, action: payload.action, invalidation: payload.invalidation }, bbo });
  const now = new Date().toISOString(); const journal: ShadowJournalEntry = { decisionId, sessionId: input.session.sessionId, cycleId, requestId, timestamp: now, marketCapturedAt: bbo.capturedAt, instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual", action: payload.action, thesis: payload.thesis, keyEvidence: payload.keyEvidence, contradictions: payload.contradictions, invalidation: payload.invalidation, horizon: payload.horizon, dataLimitations: payload.dataLimitations, provider: provider.id, model: provider.model ?? input.session.model, evidenceRef: "paper-evidence:execution", evidenceHash: "", accepted: result.execution.status !== "REJECTED", rejectionReason: result.execution.reason, positionBefore: input.session.position, positionAfter: result.position, trade: null };
  const executionChanged = result.execution.status === "ACKNOWLEDGED";
  return (await input.store.update(input.session.sessionId, input.session.ownerUserId, (session) => ({ ...session, status: "RUNNING", failureReason: result.execution.status === "REJECTED" ? result.execution.reason : null, position: result.position, journal: [...session.journal, journal], decisionCount: session.decisionCount + 1, executionIntentCount: (session.executionIntentCount ?? 0) + (result.execution.executionIntent ? 1 : 0), executedOrderCount: (session.executedOrderCount ?? 0) + (executionChanged ? result.execution.orderIds.length : 0), lastExecutionAt: executionChanged ? now : session.lastExecutionAt, currentCanonicalPaperPosition: result.execution.reconciledPosition, latestExecution: result.execution, lastDecisionAt: now, lastMarketCapturedAt: bbo.capturedAt, nextEvaluationAt: new Date(Date.now() + session.cadenceMs).toISOString() })))!;
}

export async function startAutonomousPaperLoop(session: ShadowTraderSession, store: ShadowTraderStore, manager: NautilusServerPaperRuntimeManager): Promise<ShadowTraderSession> {
  const updated = await store.update(session.sessionId, session.ownerUserId, (value) => ({ ...value, status: "RUNNING", failureReason: null, nextEvaluationAt: new Date().toISOString() }));
  if (!updated) throw new Error("PAPER_SESSION_NOT_FOUND");
  const runOnce = async () => { if (inFlight.has(updated.sessionId)) return; inFlight.add(updated.sessionId); try { const current = await store.get(updated.sessionId, updated.ownerUserId); if (current?.status === "RUNNING") await runAutonomousPaperCycle({ session: current, store, manager }); } finally { inFlight.delete(updated.sessionId); } };
  await runOnce();
  const timer = setInterval(async () => { try { await runOnce(); } catch (error) { await store.update(updated.sessionId, updated.ownerUserId, (value) => value.status === "RUNNING" ? ({ ...value, status: "FAILED", failureReason: error instanceof Error ? error.message : "PAPER_CYCLE_FAILED", nextEvaluationAt: null }) : value); } }, updated.cadenceMs);
  timers.set(updated.sessionId, timer); return (await store.get(updated.sessionId, updated.ownerUserId))!;
}

export async function pauseAutonomousPaperLoop(session: ShadowTraderSession, store: ShadowTraderStore): Promise<ShadowTraderSession | null> { const timer = timers.get(session.sessionId); if (timer) clearInterval(timer); timers.delete(session.sessionId); return store.update(session.sessionId, session.ownerUserId, (value) => ({ ...value, status: "PAUSED", nextEvaluationAt: null })); }
export async function stopAutonomousPaperLoop(session: ShadowTraderSession, store: ShadowTraderStore, manager: NautilusServerPaperRuntimeManager): Promise<ShadowTraderSession | null> { const timer = timers.get(session.sessionId); if (timer) clearInterval(timer); timers.delete(session.sessionId); try { manager.revokeOrderExecution(session.ownerUserId, session.paperSimulationSessionId ?? ""); } catch { /* lifecycle stop remains truthful; native PAPER state is not implicitly closed */ } return store.update(session.sessionId, session.ownerUserId, (value) => ({ ...value, status: "STOPPED", endedAt: new Date().toISOString(), nextEvaluationAt: null })); }
