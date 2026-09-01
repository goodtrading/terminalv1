import assert from "node:assert/strict";
import test from "node:test";

import { MemStorage, type OptionsSummaryUpdate } from "./storage.ts";
import { adaptTerminalStateForMobile } from "./mobile-adapter.ts";

function makeStorage(): MemStorage {
  return Object.create(MemStorage.prototype) as MemStorage;
}

function bootstrap(storage: MemStorage, summary: OptionsSummaryUpdate, spotPrice: number) {
  (storage as any).bootstrapShellFromDeribitSummary(summary, spotPrice);
  return storage;
}

test("P0.3 case A: real short gamma zone is preserved exactly", () => {
  const storage = bootstrap(makeStorage(), {
    totalGex: 1234,
    gammaMagnets: [64000, 66000],
    shortGammaZones: [{ startStrike: 64200, endStrike: 65850 }],
  }, 65000) as any;

  assert.equal(storage.keyLevels.shortGammaPocketStart, 64200);
  assert.equal(storage.keyLevels.shortGammaPocketEnd, 65850);
  assert.equal(storage.keyLevels.deepRiskPocketStart, null);
  assert.equal(storage.keyLevels.deepRiskPocketEnd, null);
  assert.equal(storage.dealerHedgingFlow.flowTriggerUp, null);
  assert.equal(storage.dealerHedgingFlow.flowTriggerDown, null);
});

test("P0.3 case B/C/D: missing bootstrap fields stay unavailable instead of spot-derived", () => {
  const storage = bootstrap(makeStorage(), {
    totalGex: -456,
    gammaMagnets: [],
  }, 65000) as any;

  assert.equal(storage.keyLevels.shortGammaPocketStart, null);
  assert.equal(storage.keyLevels.shortGammaPocketEnd, null);
  assert.equal(storage.keyLevels.deepRiskPocketStart, null);
  assert.equal(storage.keyLevels.deepRiskPocketEnd, null);
  assert.equal(storage.dealerHedgingFlow.flowTriggerUp, null);
  assert.equal(storage.dealerHedgingFlow.flowTriggerDown, null);

  const raw = JSON.stringify({
    keyLevels: storage.keyLevels,
    dealerHedgingFlow: storage.dealerHedgingFlow,
  });
  assert.ok(!raw.includes("0.98"));
  assert.ok(!raw.includes("1.02"));
  assert.ok(!raw.includes("0.95"));
  assert.ok(!raw.includes("1.01"));
  assert.ok(!raw.includes("0.99"));
});

test("P0.3 case E: downstream mobile state keeps unavailable pockets null", () => {
  const mobile = adaptTerminalStateForMobile({
    levels: {
      callWall: null,
      putWall: null,
      dealerPivot: null,
      gammaMagnets: [],
      shortGammaPocket: { start: null, end: null },
    },
    market: {
      spot: 65000,
      totalGex: 0,
      gammaRegime: "TRANSITION",
      gammaFlip: null,
      distanceToFlip: null,
      marketMode: { type: null, description: null, confidence: null, drivers: [] },
      transitionZone: { start: null, end: null },
    },
    bias: { type: "NEUTRAL_CHOP", confidence: 50, drivers: [], invalidation: "", horizon: "INTRADAY" },
    risk: { cascadeRisk: "LOW", cascadeDirection: "NONE", squeezeProbability: 0, squeezeDirection: "NONE", squeezeType: "NONE", volatilityState: "NORMAL" },
    scenarios: [],
    alerts: [],
    meta: { timestamp: Date.now(), dataSource: "test", tickerStatus: "unavailable", lastUpdated: Date.now(), coherence: 1 },
  } as any);

  assert.equal(mobile.levels.shortGammaPocket.start, null);
  assert.equal(mobile.levels.shortGammaPocket.end, null);
  assert.equal(mobile.risk.squeezeProbability, 0);
  assert.ok(!JSON.stringify(mobile).includes("NaN"));
  assert.ok(!JSON.stringify(mobile).includes("0.98"));
});
