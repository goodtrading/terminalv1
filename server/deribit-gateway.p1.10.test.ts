import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DeribitOptionsGateway, computeLiveGreekFields } from "./deribit-gateway";
import { MemStorage, type OptionsSummaryUpdate } from "./storage";

const NOW_MS = Date.UTC(2026, 7, 13, 8, 0, 0);

function makeValidLiveOption(overrides: Partial<Record<string, unknown>> = {}) {
  return {
    strike: 65000,
    expiry: "15AUG26",
    optionType: "call" as const,
    openInterest: 100,
    ivMark: 0.5,
    ivBid: undefined,
    ivAsk: undefined,
    gammaExposure: undefined,
    vannaExposure: undefined,
    charmExposure: undefined,
    ...overrides,
  };
}

function closeTo(actual: number, expected: number, tol: number, label: string) {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tol, `${label}: expected ${expected}, got ${actual} (diff ${diff})`);
}

test("P1.10 case A/G: valid live IV keeps the exact BS outputs unchanged", () => {
  const current = computeLiveGreekFields(65000, 65000, "call", 125, "15AUG26", NOW_MS, 50, undefined, undefined);
  assert.equal(current.sigma, 0.5);
  assert.ok(current.gammaExposure != null);
  assert.ok(current.vannaExposure != null);
  assert.ok(current.charmExposure != null);

  const viaMark = computeLiveGreekFields(65000, 65000, "call", 125, "15AUG26", NOW_MS, 50, undefined, undefined);
  closeTo(viaMark.gammaExposure!, current.gammaExposure!, 1e-15, "Gamma regression");
  closeTo(viaMark.vannaExposure!, current.vannaExposure!, 1e-15, "Vanna regression");
  closeTo(viaMark.charmExposure!, current.charmExposure!, 1e-15, "Charm regression");
});

test("P1.10 case B/C/D/E: missing, null, malformed, and zero live IV do not fabricate Greeks", () => {
  const rows = [
    computeLiveGreekFields(65000, 65000, "call", 125, "15AUG26", NOW_MS, null, undefined, undefined),
    computeLiveGreekFields(65000, 65000, "call", 125, "15AUG26", NOW_MS, undefined, undefined, undefined),
    computeLiveGreekFields(65000, 65000, "call", 125, "15AUG26", NOW_MS, "bad", undefined, undefined),
    computeLiveGreekFields(65000, 65000, "call", 125, "15AUG26", NOW_MS, 0, undefined, undefined),
  ];

  for (const row of rows) {
    assert.equal(row.sigma, null);
    assert.equal(row.gammaExposure, undefined);
    assert.equal(row.vannaExposure, undefined);
    assert.equal(row.charmExposure, undefined);
  }
});

test("P1.10 case F: bid/ask-only live evidence is accepted when both sides are valid", () => {
  const row = computeLiveGreekFields(65000, 65000, "call", 125, "15AUG26", NOW_MS, undefined, 50, 60);
  assert.equal(row.sigma, 0.55);
  assert.ok(row.gammaExposure != null);
  assert.ok(row.vannaExposure != null);
  assert.ok(row.charmExposure != null);
});

test("P1.10 missing-IV summary export stays null and does not overwrite heuristic storage state", async () => {
  const storage = Object.create(MemStorage.prototype) as MemStorage;
  (storage as any).marketState = { totalGex: 0, gammaRegime: "LONG GAMMA", timestamp: new Date() };
  (storage as any).optionsPositioning = { callWall: 0, putWall: 0, dealerPivot: 0, timestamp: new Date() };
  (storage as any).keyLevels = { support: [], resistance: [], gammaMagnets: [], shortGammaPocketStart: null, shortGammaPocketEnd: null, timestamp: new Date() };
  (storage as any).dealerExposure = {
    id: 1,
    liveVannaExposure: null,
    liveCharmExposure: null,
    heuristicVannaScore: 1.23,
    heuristicCharmScore: -4.56,
    vannaExposure: 1.23,
    charmExposure: -4.56,
    vannaBias: "BULLISH",
    charmBias: "BEARISH",
    gammaPressure: "+0.10",
    gammaConcentration: 0.2,
    timestamp: new Date(),
  };
  (storage as any).dealerHedgingFlow = {
    id: 1,
    hedgeFlowBias: "NEUTRAL",
    hedgeFlowIntensity: "MEDIUM",
    accelerationRisk: "LOW",
    flowTriggerUp: 70000,
    flowTriggerDown: 64000,
    timestamp: new Date(),
  };

  storage.updateFromDeribitSummary({ totalGex: 99, gammaFlip: 65000, totalVanna: null, totalCharm: null } as OptionsSummaryUpdate, 65000);
  const exposure = await storage.getDealerExposure();
  assert.equal(exposure?.liveVannaExposure, null);
  assert.equal(exposure?.liveCharmExposure, null);
  assert.equal(exposure?.heuristicVannaScore, 1.23);
  assert.equal(exposure?.heuristicCharmScore, -4.56);
});

test("P1.10 missing-IV option does not create synthetic gamma-hint/pinning contribution", async () => {
  const validOnly = await DeribitOptionsGateway.getSummary(
    [makeValidLiveOption({ ivMark: 50, gammaExposure: 1000, vannaExposure: 1, charmExposure: 1 })] as any,
    65000,
    "LIVE_DERIBIT"
  );
  const withMissing = await DeribitOptionsGateway.getSummary(
    [
      makeValidLiveOption({ ivMark: 50, gammaExposure: 1000, vannaExposure: 1, charmExposure: 1 }),
      makeValidLiveOption({ strike: 72000, openInterest: 1, ivMark: undefined, ivBid: undefined, ivAsk: undefined, gammaExposure: undefined, vannaExposure: undefined, charmExposure: undefined }),
    ] as any,
    65000,
    "LIVE_DERIBIT"
  );

  assert.equal(withMissing.totalGex, validOnly.totalGex);
  assert.equal(withMissing.gammaFlip, validOnly.gammaFlip);
  assert.equal(withMissing.callWall, validOnly.callWall);
  assert.equal(withMissing.putWall, validOnly.putWall);
  assert.equal(withMissing.pinningStrength, validOnly.pinningStrength);
  assert.equal(withMissing.gammaWallStrength?.length, validOnly.gammaWallStrength?.length);
  assert.equal(withMissing.vannaBias, validOnly.vannaBias);
  assert.equal(withMissing.charmBias, validOnly.charmBias);
});
