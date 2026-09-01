import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { MemStorage, type OptionsSummaryUpdate } from "./storage";
import { MarketDataGateway } from "./market-gateway";

type HedgeFlow = Awaited<ReturnType<MemStorage["getDealerHedgingFlow"]>>;

type Exposure = Awaited<ReturnType<MemStorage["getDealerExposure"]>>;

function makeStorage(): MemStorage {
  return Object.create(MemStorage.prototype) as MemStorage;
}

function writeCsvFixture(rows: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "p1-8-storage-"));
  const file = join(dir, "fixture.csv");
  writeFileSync(
    file,
    [
      "instrument,gamma,open_interest,iv_bid,iv_ask",
      ...rows,
    ].join("\n"),
    "utf8"
  );
  return file;
}

function heuristicRows(gamma: number): string[] {
  return [
    "BTC-07MAR27-65000-C,0,1000,50,50",
    `BTC-07MAR27-66000-C,${gamma},100,50,50`,
  ];
}

function liveSummary(totalVanna: number | null, totalCharm: number | null): OptionsSummaryUpdate {
  return {
    totalGex: 1234,
    gammaFlip: 64_000,
    callWall: 65_000,
    putWall: 63_000,
    gammaMagnets: [65_000],
    shortGammaZones: [{ startStrike: 63_000, endStrike: 64_000 }],
    totalVanna,
    totalCharm,
  };
}

async function withPinnedSpot<T>(fn: () => Promise<T> | T): Promise<T> {
  const original = MarketDataGateway.getCachedTicker;
  (MarketDataGateway as any).getCachedTicker = () => ({ price: 65_000 });
  try {
    return await fn();
  } finally {
    (MarketDataGateway as any).getCachedTicker = original;
  }
}

async function runHeuristicFixture(gamma: number): Promise<{ exposure: Exposure; flow: HedgeFlow }> {
  return withPinnedSpot(async () => {
    const storage = makeStorage();
    await storage.recomputeAll(writeCsvFixture(heuristicRows(gamma)));
    return {
      exposure: await storage.getDealerExposure(),
      flow: await storage.getDealerHedgingFlow(),
    };
  });
}

function flowComparable(flow: HedgeFlow) {
  if (!flow) return flow;
  const { timestamp, ...rest } = flow as NonNullable<HedgeFlow> & { timestamp: Date };
  return rest;
}

async function applyLiveSummary(storage: MemStorage, totalVanna: number | null, totalCharm: number | null): Promise<{ exposure: Exposure; flow: HedgeFlow }> {
  storage.updateFromDeribitSummary(liveSummary(totalVanna, totalCharm), 65_000);
  return {
    exposure: await storage.getDealerExposure(),
    flow: await storage.getDealerHedgingFlow(),
  };
}


test("P1.8 case A: heuristic mild score stays normalized and LOW", async () => {
  const { exposure, flow } = await runHeuristicFixture(1e-5);

  assert.equal(exposure?.liveVannaExposure, null);
  assert.equal(exposure?.liveCharmExposure, null);
  assert.equal(exposure?.heuristicVannaScore, exposure?.vannaExposure);
  assert.equal(exposure?.heuristicCharmScore, exposure?.charmExposure);
  assert.ok(exposure?.heuristicVannaScore != null);
  assert.ok(exposure?.heuristicCharmScore != null);
  assert.ok(flow?.hedgeFlowIntensity != null);
});

test("P1.8 case B: heuristic strong score remains stronger than mild without borrowing live magnitude", async () => {
  const mild = await runHeuristicFixture(1e-5);
  const strong = await runHeuristicFixture(1e-4);

  assert.equal(strong.exposure?.liveVannaExposure, null);
  assert.equal(strong.exposure?.liveCharmExposure, null);
  assert.equal(strong.exposure?.heuristicVannaScore, strong.exposure?.vannaExposure);
  assert.equal(strong.exposure?.heuristicCharmScore, strong.exposure?.charmExposure);
  assert.ok(Math.abs(strong.exposure?.heuristicVannaScore ?? 0) >= Math.abs(mild.exposure?.heuristicVannaScore ?? 0));
  assert.ok(Math.abs(strong.exposure?.heuristicCharmScore ?? 0) >= Math.abs(mild.exposure?.heuristicCharmScore ?? 0));
  assert.ok(strong.flow?.hedgeFlowIntensity != null);
});

test("P1.8 case C/D: live exposures keep sign-only bias and do not leak magnitude into decision flow", async () => {
  const storage = makeStorage();

  const modest = await applyLiveSummary(storage, 28, 9);
  assert.equal(modest.exposure?.liveVannaExposure, 28);
  assert.equal(modest.exposure?.liveCharmExposure, 9);
  assert.equal(modest.exposure?.heuristicVannaScore, null);
  assert.equal(modest.exposure?.heuristicCharmScore, null);
  assert.equal(modest.exposure?.vannaBias, "BULLISH");
  assert.equal(modest.exposure?.charmBias, "BULLISH");
  assert.equal(modest.exposure?.vannaExposure, 28);
  assert.equal(modest.exposure?.charmExposure, 9);
  assert.equal(modest.flow?.hedgeFlowBias, null);
  assert.equal(modest.flow?.hedgeFlowIntensity, null);
  assert.equal(modest.flow?.accelerationRisk, null);

  const unavailableSummary: OptionsSummaryUpdate = {
    totalGex: null,
    gammaFlip: null,
    callWall: null,
    putWall: null,
    gammaMagnets: [],
    shortGammaZones: [],
    totalVanna: null,
    totalCharm: null,
  };
  storage.updateFromDeribitSummary(unavailableSummary, 65_000);
  const clearedExposure = await storage.getDealerExposure();
  const clearedFlow = await storage.getDealerHedgingFlow();
  assert.equal(clearedExposure?.liveVannaExposure, null);
  assert.equal(clearedExposure?.liveCharmExposure, null);
  assert.equal(clearedExposure?.heuristicVannaScore, null);
  assert.equal(clearedExposure?.heuristicCharmScore, null);
  assert.equal(clearedExposure?.vannaExposure, null);
  assert.equal(clearedExposure?.charmExposure, null);
  assert.equal(clearedFlow?.hedgeFlowBias, null);
  assert.equal(clearedFlow?.hedgeFlowIntensity, null);
});

test("P1.8 case D: enormous live exposures produce the same normalized decision result as modest live exposures", async () => {
  const storage = makeStorage();
  const modest = await applyLiveSummary(storage, 28, 9);
  const enormous = await applyLiveSummary(storage, 3_000, 25_000);

  assert.equal(enormous.exposure?.liveVannaExposure, 3_000);
  assert.equal(enormous.exposure?.liveCharmExposure, 25_000);
  assert.equal(enormous.exposure?.vannaBias, "BULLISH");
  assert.equal(enormous.exposure?.charmBias, "BULLISH");
  assert.deepEqual(flowComparable(enormous.flow), flowComparable(modest.flow));
});

test("P1.8 case E: heuristic -> live -> heuristic returns to the correct source-specific decision state", async () => {
  const storage = makeStorage();

  storage.recomputeAll(writeCsvFixture(heuristicRows(1e-5)));
  const heuristicBefore = await storage.getDealerHedgingFlow();
  assert.ok(heuristicBefore?.hedgeFlowIntensity != null);

  await applyLiveSummary(storage, 28, 9);
  const liveFlow = await storage.getDealerHedgingFlow();
  assert.equal(liveFlow?.hedgeFlowBias, null);
  assert.equal(liveFlow?.hedgeFlowIntensity, null);

  storage.recomputeAll(writeCsvFixture(heuristicRows(1e-5)));
  const heuristicAfter = await storage.getDealerHedgingFlow();
  const heuristicExposureAfter = await storage.getDealerExposure();
  assert.ok(heuristicAfter?.hedgeFlowIntensity != null);
  assert.equal(heuristicExposureAfter?.liveVannaExposure, null);
  assert.equal(heuristicExposureAfter?.heuristicVannaScore, heuristicExposureAfter?.vannaExposure);
  assert.equal(heuristicExposureAfter?.heuristicCharmScore, heuristicExposureAfter?.charmExposure);
});

test("P1.8 case F: live magnitude alone cannot change the normalized flow result", async () => {
  const storage = makeStorage();
  const modest = await applyLiveSummary(storage, 28, 9);
  const enormous = await applyLiveSummary(storage, 3_000, 25_000);

  assert.deepEqual(flowComparable(modest.flow), flowComparable(enormous.flow));
  assert.deepEqual(
    { bias: modest.exposure?.vannaBias, charm: modest.exposure?.charmBias },
    { bias: "BULLISH", charm: "BULLISH" }
  );
});
