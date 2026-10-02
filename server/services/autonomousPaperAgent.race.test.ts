import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import test from "node:test";
import { runAutonomousPaperCycle } from "./autonomousPaperAgent";
import { createShadowTraderStore } from "./shadowTraderStore";

const context = async () => ({ capturedAt: new Date().toISOString(), liveEvidence: { BBO: { quality: "VALID", value: { bid: 85000, ask: 85001 } } } });

async function race(status: "PAUSED" | "STOPPED") {
  const dir = await mkdtemp(path.join(tmpdir(), "gt-n13b-race-"));
  const store = createShadowTraderStore(path.join(dir, "sessions"));
  let release!: () => void;
  const provider = { id: "fixture", model: "fixture", mocked: true, health: async () => ({ ok: true }), generate: async () => { await new Promise<void>((resolve) => { release = resolve; }); return JSON.stringify({ action: "ENTER_LONG", thesis: "late", keyEvidence: [], contradictions: [], invalidation: 84000, horizon: "intraday", dataLimitations: [] }); } };
  let submitCount = 0;
  const manager = { submitProtectedEntryCommand: async () => { submitCount += 1; throw new Error("unexpected submit"); }, closePositionCommand: async () => { submitCount += 1; throw new Error("unexpected close"); }, readSnapshot: async () => ({ simulationSessionId: "sim", position: null }), readOrders: async () => [], reserveAutonomousIntent: () => { throw new Error("late intent must not be reserved"); }, appendAutonomousEvidence: () => undefined } as any;
  try {
    const session = await store.create({ ownerUserId: 777, provider: "fixture", model: "fixture", quality: "HIGH", cadenceMs: 5_000, mode: "PAPER_AUTONOMOUS", paperSimulationSessionId: "sim", riskConfig: { fixedQuantity: "0.001", maxExposure: 1, maxSessionLoss: 1000, cooldownMs: 0, requireInvalidation: true } });
    await store.update(session.sessionId, 777, (value) => ({ ...value, status: "RUNNING" }));
    const pending = runAutonomousPaperCycle({ session: (await store.get(session.sessionId, 777))!, store, manager, provider, readMarket: context });
    await new Promise((resolve) => setImmediate(resolve));
    await store.update(session.sessionId, 777, (value) => ({ ...value, status }));
    release();
    await pending;
    const final = await store.get(session.sessionId, 777);
    assert.equal(final?.status, status);
    assert.equal(final?.decisionCount, 0);
    assert.equal(submitCount, 0);
  } finally { await rm(dir, { recursive: true, force: true }); }
}

test("provider completion after PAUSE cannot create intent or submit PAPER", async () => { await race("PAUSED"); });
test("provider completion after STOP cannot create intent or submit PAPER", async () => { await race("STOPPED"); });
