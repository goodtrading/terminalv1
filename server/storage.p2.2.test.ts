// @ts-nocheck

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { MemStorage } from "./storage";

function makeStorage() {
  return Object.create(MemStorage.prototype) as MemStorage;
}

test("P2.2 bootstrap preserves null structural normalization when live exposure fields are absent", async () => {
  const storage = makeStorage();

  storage.updateFromDeribitSummary(
    {
      totalGex: 1234,
      gammaFlip: 64_000,
      totalVanna: 28,
      totalCharm: 9,
      callWall: 66_000,
      putWall: 62_000,
      gammaMagnets: [65_000],
      shortGammaZones: [{ startStrike: 63_200, endStrike: 64_700 }],
    },
    65_000,
  );

  const exposure = await storage.getDealerExposure();
  assert.ok(exposure != null);
  assert.equal(exposure?.liveVannaExposure, 28);
  assert.equal(exposure?.liveCharmExposure, 9);
  assert.equal(exposure?.liveVannaGrossAbsExposure ?? null, null);
  assert.equal(exposure?.liveCharmGrossAbsExposure ?? null, null);
  assert.equal(exposure?.liveVannaDirectionalRatio ?? null, null);
  assert.equal(exposure?.liveCharmDirectionalRatio ?? null, null);
  assert.equal(exposure?.liveVannaValidRows ?? null, null);
  assert.equal(exposure?.liveCharmValidRows ?? null, null);
  assert.equal(exposure?.liveVannaTotalEligibleRows ?? null, null);
  assert.equal(exposure?.liveCharmTotalEligibleRows ?? null, null);

  const sensitivity = await storage.getDealerHedgeSensitivity();
  const state = await storage.getDealerHedgeState();
  assert.equal(sensitivity?.source, "BOOTSTRAP");
  assert.equal(sensitivity?.gammaUsdPerDollar, 1234);
  assert.equal(sensitivity?.vannaUsdPerVolPoint, null);
  assert.equal(sensitivity?.vannaGrossAbsUsdPerVolPoint, null);
  assert.equal(sensitivity?.vannaDirectionalRatio, null);
  assert.equal(sensitivity?.charmUsdPerDay, null);
  assert.equal(sensitivity?.charmGrossAbsUsdPerDay, null);
  assert.equal(sensitivity?.charmDirectionalRatio, null);
  assert.equal(sensitivity?.vannaValidRows, null);
  assert.equal(sensitivity?.vannaTotalEligibleRows, null);
  assert.equal(sensitivity?.charmValidRows, null);
  assert.equal(sensitivity?.charmTotalEligibleRows, null);
  assert.equal(state?.source, "BOOTSTRAP");
  assert.equal(state?.structuralPressure, null);

  const stressScenarios = await storage.getDealerHedgeStressScenarios();
  const stressByType = new Map(stressScenarios.map((scenario) => [scenario.scenarioType, scenario] as const));
  assert.equal(stressByType.size, 4);
  assert.equal(stressByType.get("SPOT_UP_1PCT")?.deltaSpotUsd, 650);
  assert.equal(stressByType.get("SPOT_UP_1PCT")?.deltaIvVolPoints, 0);
  assert.equal(stressByType.get("VOL_UP_1PT")?.requiredHedgeTradeUsd, null);
  assert.equal(stressByType.get("TIME_DECAY_1D")?.requiredHedgeTradeUsd, null);

  const market = await storage.getMarketState();
  assert.equal(market?.gammaRegime, "LONG GAMMA");
  assert.equal(market?.gammaFlip, 64_000);
});

test("P2.2 dealer hedge sensitivity transitions live -> bootstrap -> no data without stale carryover", async () => {
  const storage = makeStorage();

  storage.updateFromDeribitSummary(
    {
      source: "LIVE_DERIBIT",
      totalGex: 100,
      gammaFlip: 64_000,
      liveVannaExposure: 7,
      liveVannaGrossAbsExposure: 9,
      liveVannaDirectionalRatio: 7 / 9,
      liveVannaValidRows: 2,
      liveVannaTotalEligibleRows: 2,
      liveCharmExposure: -3,
      liveCharmGrossAbsExposure: 11,
      liveCharmDirectionalRatio: -3 / 11,
      liveCharmValidRows: 2,
      liveCharmTotalEligibleRows: 2,
    } as any,
    65_000,
  );

  const liveSensitivity = await storage.getDealerHedgeSensitivity();
  const liveState = await storage.getDealerHedgeState();
  assert.equal(liveSensitivity?.source, "LIVE_DERIBIT");
  assert.equal(liveSensitivity?.gammaUsdPerDollar, 100);
  assert.equal(liveSensitivity?.vannaUsdPerVolPoint, 7);
  assert.equal(liveSensitivity?.vannaGrossAbsUsdPerVolPoint, 9);
  assert.equal(liveSensitivity?.vannaDirectionalRatio, 7 / 9);
  assert.equal(liveSensitivity?.charmUsdPerDay, -3);
  assert.equal(liveSensitivity?.charmGrossAbsUsdPerDay, 11);
  assert.equal(liveSensitivity?.charmDirectionalRatio, -3 / 11);
  assert.equal(liveState?.source, "LIVE_DERIBIT");
  assert.equal(liveState?.structuralPressure, null);

  const liveStress = await storage.getDealerHedgeStressScenarios();
  assert.equal(liveStress.find((scenario) => scenario.scenarioType === "SPOT_UP_1PCT")?.requiredHedgeTradeUsd, -65_000);
  assert.equal(liveStress.find((scenario) => scenario.scenarioType === "VOL_UP_1PT")?.requiredHedgeTradeUsd, -7);
  assert.equal(liveStress.find((scenario) => scenario.scenarioType === "TIME_DECAY_1D")?.requiredHedgeTradeUsd, 3);

  storage.updateFromDeribitSummary(
    {
      source: "BOOTSTRAP",
      totalGex: 77,
      gammaFlip: 64_000,
      totalVanna: 12,
      totalCharm: -8,
    } as any,
    65_000,
  );

  const bootstrapSensitivity = await storage.getDealerHedgeSensitivity();
  const bootstrapState = await storage.getDealerHedgeState();
  assert.equal(bootstrapSensitivity?.source, "BOOTSTRAP");
  assert.equal(bootstrapSensitivity?.gammaUsdPerDollar, 77);
  assert.equal(bootstrapSensitivity?.vannaUsdPerVolPoint, null);
  assert.equal(bootstrapSensitivity?.charmUsdPerDay, null);
  assert.equal(bootstrapState?.source, "BOOTSTRAP");
  assert.equal(bootstrapState?.structuralPressure, null);

  const bootstrapStress = await storage.getDealerHedgeStressScenarios();
  assert.equal(bootstrapStress.find((scenario) => scenario.scenarioType === "SPOT_UP_1PCT")?.requiredHedgeTradeUsd, -77 * 650);
  assert.equal(bootstrapStress.find((scenario) => scenario.scenarioType === "VOL_UP_1PT")?.requiredHedgeTradeUsd, null);
  assert.equal(bootstrapStress.find((scenario) => scenario.scenarioType === "TIME_DECAY_1D")?.requiredHedgeTradeUsd, null);

  storage.updateFromDeribitSummary(
    {
      totalGex: null,
      gammaFlip: null,
      totalVanna: null,
      totalCharm: null,
    } as any,
    65_000,
  );

  const noDataSensitivity = await storage.getDealerHedgeSensitivity();
  const noDataState = await storage.getDealerHedgeState();
  assert.equal(noDataSensitivity?.source, "NO_DATA");
  assert.equal(noDataSensitivity?.gammaUsdPerDollar, null);
  assert.equal(noDataSensitivity?.vannaUsdPerVolPoint, null);
  assert.equal(noDataSensitivity?.vannaGrossAbsUsdPerVolPoint, null);
  assert.equal(noDataSensitivity?.vannaDirectionalRatio, null);
  assert.equal(noDataSensitivity?.charmUsdPerDay, null);
  assert.equal(noDataSensitivity?.charmGrossAbsUsdPerDay, null);
  assert.equal(noDataSensitivity?.charmDirectionalRatio, null);
  assert.equal(noDataState?.source, "NO_DATA");
  assert.equal(noDataState?.structuralPressure, null);

  const noDataStress = await storage.getDealerHedgeStressScenarios();
  for (const scenario of noDataStress) {
    assert.equal(scenario.requiredHedgeTradeUsd, null);
    assert.equal(scenario.hedgeAction, null);
  }
});
