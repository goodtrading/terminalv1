import assert from "node:assert/strict";
import { existsSync } from "node:fs";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import type { AIProvider } from "@shared/aiResearch";
import { runAutonomousPaperCycle } from "./autonomousPaperAgent";
import { createShadowTraderStore } from "./shadowTraderStore";
import { NautilusServerPaperRuntimeManager, type ServerPaperQuoteObservation } from "./nautilusServerPaperRuntime";
import { computeShadowAuthorityDelta, getShadowAuthoritySnapshot, resetShadowAuthorityCounters } from "./shadowTraderAuthorityObserver";

const runtimeRoot = path.resolve(process.env.GT_N3D5_ISOLATED_RUNTIME ?? "build/n2c/runtime/nautilus-runtime");

class SequenceProvider implements AIProvider {
  readonly id = "deterministic-paper-fixture";
  readonly model = "n13b-fixture";
  readonly mocked = true;
  private index = 0;
  constructor(private readonly actions: string[]) {}
  async health() { return { ok: true }; }
  async generate() {
    const action = this.actions[Math.min(this.index++, this.actions.length - 1)];
    return JSON.stringify({ action, thesis: `controlled ${action}`, keyEvidence: ["CONTROLLED_TEST_PERP_BBO"], contradictions: [], invalidation: action === "ENTER_LONG" ? 84000 : action === "ENTER_SHORT" ? 86000 : null, horizon: "intraday", dataLimitations: [] });
  }
}

async function controlledContext() {
  return { capturedAt: new Date().toISOString(), liveEvidence: { BBO: { quality: "VALID", value: { bid: 85000, ask: 85001 } } } };
}

async function runScenario(actions: string[], ownerUserId: number) {
  const dir = await mkdtemp(path.join(tmpdir(), "gt-n13b-agent-e2e-"));
  let quoteSequence = 0;
  const quoteProvider = async (): Promise<ServerPaperQuoteObservation> => { const now = Date.now(); quoteSequence += 1; return { source: "CONTROLLED_TEST_PERP_BBO", symbol: "BTCUSDT", marketType: "perpetual", bid: "85000", ask: "85001", bidSize: "5", askSize: "5", sourceTimestampMs: now, observedAtMs: now, sourceAgeMs: 0, endpoint: "test://controlled-perp-bbo", sequence: quoteSequence }; };
  const manager = new NautilusServerPaperRuntimeManager({ runtimeRoot, prewarmPackage: true, registryPath: path.join(dir, "sessions.sqlite"), maxSessions: 2, startTimeoutMs: 90_000, requestTimeoutMs: 15_000, allowControlledTestQuotes: true, allowOrderAuthorization: true, ordersEnabled: true, quoteProvider });
  const store = createShadowTraderStore(path.join(dir, "sessions"));
  try {
    const native = await manager.startForUser(ownerUserId);
    const session = await store.create({ ownerUserId, provider: "deterministic-paper-fixture", model: "n13b-fixture", quality: "HIGH", mode: "PAPER_AUTONOMOUS", paperSimulationSessionId: native.simulationSessionId, riskConfig: { fixedQuantity: "0.001", maxExposure: 1, maxSessionLoss: 1000, cooldownMs: 0, requireInvalidation: true, stopLossDistance: 100, takeProfitDistance: 100 } });
    await store.update(session.sessionId, ownerUserId, (value) => ({ ...value, status: "RUNNING" }));
    manager.grantOrderExecution(ownerUserId, native.simulationSessionId);
    const provider = new SequenceProvider(actions);
    for (let index = 0; index < actions.length; index += 1) {
      const current = await store.get(session.sessionId, ownerUserId); assert.ok(current);
      await runAutonomousPaperCycle({ session: current!, store, manager, provider, readMarket: controlledContext });
    }
    const final = await store.get(session.sessionId, ownerUserId); assert.ok(final);
    const snapshot = await manager.readSnapshot(ownerUserId);
    const orders = await manager.readOrders(ownerUserId);
    const fills = await manager.readFills(ownerUserId);
    const evidence = manager.listAutonomousEvidence(ownerUserId, native.simulationSessionId);
    return { dir, manager, store, session: final!, simulationSessionId: native.simulationSessionId, snapshot, orders, fills, evidence };
  } catch (error) { await manager.dispose(); await rm(dir, { recursive: true, force: true }); throw error; }
}

test("N13B deterministic LONG runs through agent, canonical Nautilus PAPER and append-only provenance", { timeout: 240_000 }, async () => {
  assert.ok(existsSync(path.join(runtimeRoot, "python.exe")));
  const result = await runScenario(["ENTER_LONG", "HOLD", "ENTER_LONG", "EXIT"], 611);
  try {
    assert.equal(result.snapshot.position?.side, "FLAT");
    assert.equal(result.snapshot.position?.quantity, "0");
    assert.equal(result.fills.length, 2);
    assert.equal(result.orders.filter((order) => ["CREATED", "SUBMITTED", "ACCEPTED", "PARTIALLY_FILLED", "CANCEL_PENDING"].includes(String(order.status).toUpperCase())).length, 0);
    assert.deepEqual(result.evidence.map((row) => row.status), ["INTENT_CREATED", "SUBMISSION_STARTED", "SUBMITTED", "RECONCILED", "INTENT_CREATED", "SUBMISSION_STARTED", "SUBMITTED", "RECONCILED"]);
    const entry = result.evidence.find((row) => row.status === "RECONCILED" && row.evidence.response && typeof row.evidence.response === "object")!;
    assert.ok(entry.evidence.executionIntentId);
    assert.ok(result.evidence.some((row) => row.evidence.response && typeof row.evidence.response === "object" && JSON.stringify(row.evidence.response).includes("protectionGroupId")));
  } finally { await result.manager.dispose(); await rm(result.dir, { recursive: true, force: true }); }
});

test("N13B native PAPER same idempotency key remains isolated across owners", { timeout: 240_000 }, async () => {
  const a = await runScenario(["ENTER_LONG", "EXIT"], 612);
  const b = await runScenario(["ENTER_SHORT", "EXIT"], 613);
  try {
    assert.equal(a.fills.length, 2); assert.equal(b.fills.length, 2);
    assert.notEqual(a.simulationSessionId, b.simulationSessionId);
    assert.equal(a.snapshot.position?.side, "FLAT"); assert.equal(b.snapshot.position?.side, "FLAT");
    assert.ok(a.orders.every((order) => String(order.simulationSessionId ?? a.simulationSessionId) === a.simulationSessionId || order.simulationSessionId === undefined));
    assert.ok(b.orders.every((order) => String(order.simulationSessionId ?? b.simulationSessionId) === b.simulationSessionId || order.simulationSessionId === undefined));
  } finally { await a.manager.dispose(); await b.manager.dispose(); await rm(a.dir, { recursive: true, force: true }); await rm(b.dir, { recursive: true, force: true }); }
});

test("N13B controlled PAPER lifecycle proves PAPER authority and zero LIVE authority", { timeout: 240_000 }, async () => {
  resetShadowAuthorityCounters();
  const baseline = getShadowAuthoritySnapshot("2026-10-01T00:00:00.000Z");
  const result = await runScenario(["ENTER_LONG", "EXIT"], 614);
  try {
    const final = getShadowAuthoritySnapshot("2026-10-01T00:01:00.000Z");
    const delta = computeShadowAuthorityDelta(baseline, final);
    assert.deepEqual(delta, { paperSubmit: 4, nautilusMutation: 4, liveSubmit: 0, brokerSubmit: 0 });
  } finally { await result.manager.dispose(); await rm(result.dir, { recursive: true, force: true }); }
});
