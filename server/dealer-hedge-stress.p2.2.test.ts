import test from "node:test";
import assert from "node:assert/strict";

import type { DealerHedgeSensitivity } from "@shared/schema";

import { buildDealerHedgeStressScenarios } from "./dealer-hedge-stress";

function scenarioMap(scenarios: ReturnType<typeof buildDealerHedgeStressScenarios>) {
  return new Map(scenarios.map((scenario) => [scenario.scenarioType, scenario] as const));
}

test("P2 stress contract: deterministic fixture yields exact standardized stress outputs", () => {
  const sensitivity: DealerHedgeSensitivity = {
    gammaUsdPerDollar: 100_000,
    vannaUsdPerVolPoint: -50_000_000,
    vannaGrossAbsUsdPerVolPoint: 50_000_000,
    vannaDirectionalRatio: -1,
    charmUsdPerDay: -2_000_000,
    charmGrossAbsUsdPerDay: 2_000_000,
    charmDirectionalRatio: -1,
    vannaValidRows: 2,
    vannaTotalEligibleRows: 4,
    charmValidRows: 3,
    charmTotalEligibleRows: 6,
    source: "LIVE_DERIBIT",
  };

  const scenarios = scenarioMap(buildDealerHedgeStressScenarios({ spotPrice: 100_000, sensitivity }));

  assert.equal(scenarios.size, 4);

  assert.deepEqual(scenarios.get("SPOT_UP_1PCT"), {
    scenarioType: "SPOT_UP_1PCT",
    deltaSpotUsd: 1_000,
    deltaIvVolPoints: 0,
    deltaDays: 0,
    gammaOptionDeltaChangeUsd: 100_000_000,
    vannaOptionDeltaChangeUsd: 0,
    charmOptionDeltaChangeUsd: 0,
    optionDeltaChangeUsd: 100_000_000,
    requiredHedgeTradeUsd: -100_000_000,
    hedgeAction: "SELL",
    source: "LIVE_DERIBIT",
    vannaCoverage: 0.5,
    charmCoverage: 0.5,
  });

  assert.deepEqual(scenarios.get("SPOT_DOWN_1PCT"), {
    scenarioType: "SPOT_DOWN_1PCT",
    deltaSpotUsd: -1_000,
    deltaIvVolPoints: 0,
    deltaDays: 0,
    gammaOptionDeltaChangeUsd: -100_000_000,
    vannaOptionDeltaChangeUsd: 0,
    charmOptionDeltaChangeUsd: 0,
    optionDeltaChangeUsd: -100_000_000,
    requiredHedgeTradeUsd: 100_000_000,
    hedgeAction: "BUY",
    source: "LIVE_DERIBIT",
    vannaCoverage: 0.5,
    charmCoverage: 0.5,
  });

  assert.deepEqual(scenarios.get("VOL_UP_1PT"), {
    scenarioType: "VOL_UP_1PT",
    deltaSpotUsd: 0,
    deltaIvVolPoints: 1,
    deltaDays: 0,
    gammaOptionDeltaChangeUsd: 0,
    vannaOptionDeltaChangeUsd: -50_000_000,
    charmOptionDeltaChangeUsd: 0,
    optionDeltaChangeUsd: -50_000_000,
    requiredHedgeTradeUsd: 50_000_000,
    hedgeAction: "BUY",
    source: "LIVE_DERIBIT",
    vannaCoverage: 0.5,
    charmCoverage: 0.5,
  });

  assert.deepEqual(scenarios.get("TIME_DECAY_1D"), {
    scenarioType: "TIME_DECAY_1D",
    deltaSpotUsd: 0,
    deltaIvVolPoints: 0,
    deltaDays: 1,
    gammaOptionDeltaChangeUsd: 0,
    vannaOptionDeltaChangeUsd: 0,
    charmOptionDeltaChangeUsd: -2_000_000,
    optionDeltaChangeUsd: -2_000_000,
    requiredHedgeTradeUsd: 2_000_000,
    hedgeAction: "BUY",
    source: "LIVE_DERIBIT",
    vannaCoverage: 0.5,
    charmCoverage: 0.5,
  });

  assert.equal(scenarios.get("SPOT_UP_1PCT")?.vannaOptionDeltaChangeUsd, 0);
  assert.equal(scenarios.get("SPOT_UP_1PCT")?.charmOptionDeltaChangeUsd, 0);
  assert.equal(scenarios.get("SPOT_DOWN_1PCT")?.vannaOptionDeltaChangeUsd, 0);
  assert.equal(scenarios.get("SPOT_DOWN_1PCT")?.charmOptionDeltaChangeUsd, 0);
  assert.equal(scenarios.get("VOL_UP_1PT")?.gammaOptionDeltaChangeUsd, 0);
  assert.equal(scenarios.get("VOL_UP_1PT")?.charmOptionDeltaChangeUsd, 0);
  assert.equal(scenarios.get("TIME_DECAY_1D")?.gammaOptionDeltaChangeUsd, 0);
  assert.equal(scenarios.get("TIME_DECAY_1D")?.vannaOptionDeltaChangeUsd, 0);
});

test("P2 stress contract: zero fixture returns exact zero hedge and neutral action", () => {
  const sensitivity: DealerHedgeSensitivity = {
    gammaUsdPerDollar: 0,
    vannaUsdPerVolPoint: 0,
    vannaGrossAbsUsdPerVolPoint: 0,
    vannaDirectionalRatio: 0,
    charmUsdPerDay: 0,
    charmGrossAbsUsdPerDay: 0,
    charmDirectionalRatio: 0,
    vannaValidRows: 0,
    vannaTotalEligibleRows: 0,
    charmValidRows: 0,
    charmTotalEligibleRows: 0,
    source: "BOOTSTRAP",
  };

  for (const scenario of buildDealerHedgeStressScenarios({ spotPrice: 100_000, sensitivity })) {
    assert.ok(Math.abs(scenario.optionDeltaChangeUsd ?? 0) < 1e-12);
    assert.ok(Math.abs(scenario.requiredHedgeTradeUsd ?? 0) < 1e-12);
    assert.equal(scenario.hedgeAction, "NEUTRAL");
  }
});

test("P2 stress contract: null-sensitive fixture keeps unrelated scenarios live and targeted scenarios unavailable", () => {
  const sensitivity: DealerHedgeSensitivity = {
    gammaUsdPerDollar: null,
    vannaUsdPerVolPoint: -50_000_000,
    vannaGrossAbsUsdPerVolPoint: 50_000_000,
    vannaDirectionalRatio: -1,
    charmUsdPerDay: -2_000_000,
    charmGrossAbsUsdPerDay: 2_000_000,
    charmDirectionalRatio: -1,
    vannaValidRows: 2,
    vannaTotalEligibleRows: 4,
    charmValidRows: 3,
    charmTotalEligibleRows: 6,
    source: "LIVE_DERIBIT",
  };

  const scenarios = scenarioMap(buildDealerHedgeStressScenarios({ spotPrice: 100_000, sensitivity }));

  assert.equal(scenarios.get("SPOT_UP_1PCT")?.requiredHedgeTradeUsd, null);
  assert.equal(scenarios.get("SPOT_UP_1PCT")?.hedgeAction, null);
  assert.equal(scenarios.get("SPOT_DOWN_1PCT")?.optionDeltaChangeUsd, null);
  assert.equal(scenarios.get("VOL_UP_1PT")?.requiredHedgeTradeUsd, 50_000_000);
  assert.equal(scenarios.get("TIME_DECAY_1D")?.requiredHedgeTradeUsd, 2_000_000);
  assert.equal(scenarios.get("VOL_UP_1PT")?.gammaOptionDeltaChangeUsd, 0);
  assert.equal(scenarios.get("TIME_DECAY_1D")?.vannaOptionDeltaChangeUsd, 0);
});

test("P2 stress contract: all-null fixture stays unavailable without fabricating zeros", () => {
  const sensitivity: DealerHedgeSensitivity = {
    gammaUsdPerDollar: null,
    vannaUsdPerVolPoint: null,
    vannaGrossAbsUsdPerVolPoint: null,
    vannaDirectionalRatio: null,
    charmUsdPerDay: null,
    charmGrossAbsUsdPerDay: null,
    charmDirectionalRatio: null,
    vannaValidRows: null,
    vannaTotalEligibleRows: null,
    charmValidRows: null,
    charmTotalEligibleRows: null,
    source: "NO_DATA",
  };

  for (const scenario of buildDealerHedgeStressScenarios({ spotPrice: 100_000, sensitivity })) {
    assert.equal(scenario.optionDeltaChangeUsd, null);
    assert.equal(scenario.requiredHedgeTradeUsd, null);
    assert.equal(scenario.hedgeAction, null);
  }
});

test("P2 stress contract: doubling sensitivities doubles hedge magnitude and preserves shock definitions", () => {
  const base: DealerHedgeSensitivity = {
    gammaUsdPerDollar: 100_000,
    vannaUsdPerVolPoint: -50_000_000,
    vannaGrossAbsUsdPerVolPoint: 50_000_000,
    vannaDirectionalRatio: -1,
    charmUsdPerDay: -2_000_000,
    charmGrossAbsUsdPerDay: 2_000_000,
    charmDirectionalRatio: -1,
    vannaValidRows: 10,
    vannaTotalEligibleRows: 10,
    charmValidRows: 10,
    charmTotalEligibleRows: 10,
    source: "LIVE_DERIBIT",
  };
  const doubled: DealerHedgeSensitivity = {
    ...base,
    gammaUsdPerDollar: base.gammaUsdPerDollar! * 2,
    vannaUsdPerVolPoint: base.vannaUsdPerVolPoint! * 2,
    vannaGrossAbsUsdPerVolPoint: base.vannaGrossAbsUsdPerVolPoint! * 2,
    charmUsdPerDay: base.charmUsdPerDay! * 2,
    charmGrossAbsUsdPerDay: base.charmGrossAbsUsdPerDay! * 2,
  };

  const baseScenarios = scenarioMap(buildDealerHedgeStressScenarios({ spotPrice: 100_000, sensitivity: base }));
  const doubledScenarios = scenarioMap(buildDealerHedgeStressScenarios({ spotPrice: 100_000, sensitivity: doubled }));

  assert.equal(baseScenarios.get("SPOT_UP_1PCT")?.deltaSpotUsd, doubledScenarios.get("SPOT_UP_1PCT")?.deltaSpotUsd);
  assert.equal(baseScenarios.get("VOL_UP_1PT")?.deltaIvVolPoints, doubledScenarios.get("VOL_UP_1PT")?.deltaIvVolPoints);
  assert.equal(baseScenarios.get("TIME_DECAY_1D")?.deltaDays, doubledScenarios.get("TIME_DECAY_1D")?.deltaDays);
  assert.equal(doubledScenarios.get("SPOT_UP_1PCT")?.requiredHedgeTradeUsd, -200_000_000);
  assert.equal(doubledScenarios.get("VOL_UP_1PT")?.requiredHedgeTradeUsd, 100_000_000);
  assert.equal(doubledScenarios.get("TIME_DECAY_1D")?.requiredHedgeTradeUsd, 4_000_000);
});
