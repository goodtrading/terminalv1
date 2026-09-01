// @ts-nocheck

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { getTerminalState } from "./terminal-state";
import { storage } from "./storage";
import { DeribitOptionsGateway } from "./deribit-gateway";
import { MarketDataGateway } from "./market-gateway";

const BASE_STRESS_SCENARIOS = [
  {
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
  },
  {
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
  },
  {
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
  },
  {
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
  },
] as const;

function restoreMethod(target: any, key: string, original: unknown) {
  target[key] = original;
}

test("P2 stress contract: terminal state propagates dealerHedgeStressScenarios", async () => {
  const original = {
    marketState: storage.getMarketState,
    dealerExposure: storage.getDealerExposure,
    dealerHedgeSensitivity: storage.getDealerHedgeSensitivity,
    dealerHedgeState: storage.getDealerHedgeState,
    dealerHedgeStressScenarios: storage.getDealerHedgeStressScenarios,
    optionsPositioning: storage.getOptionsPositioning,
    keyLevels: storage.getKeyLevels,
    tradingScenarios: storage.getTradingScenarios,
    optionsLastUpdated: storage.getOptionsLastUpdated,
    ingestOptions: DeribitOptionsGateway.ingestOptions,
    getCachedTicker: MarketDataGateway.getCachedTicker,
  } as const;

  try {
    (storage as any).getMarketState = async () => ({
      gammaFlip: 64_000,
      distanceToFlip: 1,
      transitionZoneStart: 63_200,
      transitionZoneEnd: 64_800,
      gammaRegime: "LONG GAMMA",
      totalGex: 123,
      gammaAcceleration: "NEUTRAL",
      timestamp: new Date("2026-08-30T00:00:00Z"),
    });
    (storage as any).getDealerExposure = async () => ({ bias: "NEUTRAL" });
    (storage as any).getDealerHedgeSensitivity = async () => ({ source: "LIVE_DERIBIT", gammaUsdPerDollar: 123 });
    (storage as any).getDealerHedgeState = async () => ({
      source: "LIVE_DERIBIT",
      sensitivity: { source: "LIVE_DERIBIT", gammaUsdPerDollar: 123 },
      standardizedStress: BASE_STRESS_SCENARIOS,
      structuralPressure: null,
      metadata: {
        structuralPositioningProxy: true,
        observedDealerFlow: false,
        expectedFlowForecast: false,
      },
    });
    (storage as any).getDealerHedgeStressScenarios = async () => BASE_STRESS_SCENARIOS;
    (storage as any).getOptionsPositioning = async () => ({ callWall: 66_000, putWall: 62_000, dealerPivot: 64_000 });
    (storage as any).getKeyLevels = async () => ({ gammaMagnets: [65_000], shortGammaPocketStart: 63_200, shortGammaPocketEnd: 64_700 });
    (storage as any).getTradingScenarios = async () => [];
    (storage as any).getOptionsLastUpdated = () => 1_725_000_000_000;
    (DeribitOptionsGateway as any).ingestOptions = async () => ({ options: [], source: "NO_DATA" });
    (MarketDataGateway as any).getCachedTicker = () => null;

    const state = await getTerminalState();

    assert.equal(state.dealerHedgeSensitivity?.source, "LIVE_DERIBIT");
    assert.equal(state.dealerHedgeStressScenarios?.length, 4);
    assert.equal(state.dealerHedgeState?.source, "LIVE_DERIBIT");
    assert.deepEqual(state.dealerHedgeState?.standardizedStress, BASE_STRESS_SCENARIOS);
    assert.equal(state.dealerHedgeState?.structuralPressure, null);
    assert.equal(state.dealerHedgeStressScenarios?.find((scenario: any) => scenario.scenarioType === "SPOT_UP_1PCT")?.requiredHedgeTradeUsd, -100_000_000);
    assert.equal(state.dealerHedgeStressScenarios?.find((scenario: any) => scenario.scenarioType === "VOL_UP_1PT")?.requiredHedgeTradeUsd, 50_000_000);
    assert.equal(state.dealerHedgeStressScenarios?.find((scenario: any) => scenario.scenarioType === "TIME_DECAY_1D")?.hedgeAction, "BUY");
    assert.deepEqual(state.dealerHedgeStressScenarios, BASE_STRESS_SCENARIOS);
    assert.equal(state.market?.gammaFlip, 64_000);
    assert.equal(state.positioning?.dealerPivot, 64_000);
  } finally {
    restoreMethod(storage as any, "getMarketState", original.marketState);
    restoreMethod(storage as any, "getDealerExposure", original.dealerExposure);
    restoreMethod(storage as any, "getDealerHedgeSensitivity", original.dealerHedgeSensitivity);
    restoreMethod(storage as any, "getDealerHedgeState", original.dealerHedgeState);
    restoreMethod(storage as any, "getDealerHedgeStressScenarios", original.dealerHedgeStressScenarios);
    restoreMethod(storage as any, "getOptionsPositioning", original.optionsPositioning);
    restoreMethod(storage as any, "getKeyLevels", original.keyLevels);
    restoreMethod(storage as any, "getTradingScenarios", original.tradingScenarios);
    restoreMethod(storage as any, "getOptionsLastUpdated", original.optionsLastUpdated);
    restoreMethod(DeribitOptionsGateway as any, "ingestOptions", original.ingestOptions);
    restoreMethod(MarketDataGateway as any, "getCachedTicker", original.getCachedTicker);
  }
});

test("terminal state gammaMagnets reset from LIVE_DERIBIT to BOOTSTRAP and NO_DATA", async () => {
  const original = {
    marketState: storage.getMarketState,
    dealerExposure: storage.getDealerExposure,
    dealerHedgeSensitivity: storage.getDealerHedgeSensitivity,
    dealerHedgeState: storage.getDealerHedgeState,
    dealerHedgeStressScenarios: storage.getDealerHedgeStressScenarios,
    optionsPositioning: storage.getOptionsPositioning,
    keyLevels: storage.getKeyLevels,
    tradingScenarios: storage.getTradingScenarios,
    optionsLastUpdated: storage.getOptionsLastUpdated,
    ingestOptions: DeribitOptionsGateway.ingestOptions,
    getCachedTicker: MarketDataGateway.getCachedTicker,
  } as const;

  const levelsBySource = {
    LIVE_DERIBIT: {
      gammaMagnets: [82_000, 85_000, 80_000],
      shortGammaPocketStart: 63_200,
      shortGammaPocketEnd: 64_700,
    },
    BOOTSTRAP: {
      gammaMagnets: [],
      shortGammaPocketStart: null,
      shortGammaPocketEnd: null,
    },
    NO_DATA: {
      gammaMagnets: [],
      shortGammaPocketStart: null,
      shortGammaPocketEnd: null,
    },
  } as const;

  const sources = ["LIVE_DERIBIT", "BOOTSTRAP", "NO_DATA"] as const;
  let callIndex = 0;

  try {
    (storage as any).getMarketState = async () => ({
      gammaFlip: 64_000,
      distanceToFlip: 1,
      transitionZoneStart: 63_200,
      transitionZoneEnd: 64_800,
      gammaRegime: "LONG GAMMA",
      totalGex: 123,
      gammaAcceleration: "NEUTRAL",
      timestamp: new Date("2026-08-30T00:00:00Z"),
    });
    (storage as any).getDealerExposure = async () => ({ bias: "NEUTRAL" });
    (storage as any).getDealerHedgeSensitivity = async () => ({ source: "LIVE_DERIBIT", gammaUsdPerDollar: 123 });
    (storage as any).getDealerHedgeState = async () => null;
    (storage as any).getDealerHedgeStressScenarios = async () => [];
    (storage as any).getOptionsPositioning = async () => ({ callWall: 66_000, putWall: 62_000, dealerPivot: 64_000 });
    (storage as any).getTradingScenarios = async () => [];
    (storage as any).getOptionsLastUpdated = () => 1_725_000_000_000;
    (MarketDataGateway as any).getCachedTicker = () => null;
    (DeribitOptionsGateway as any).ingestOptions = async () => ({ options: [], source: sources[Math.min(callIndex, sources.length - 1)] });
    (storage as any).getKeyLevels = async () => {
      const source = sources[Math.min(callIndex, sources.length - 1)];
      callIndex += 1;
      return levelsBySource[source];
    };

    const live = await getTerminalState();
    const bootstrap = await getTerminalState();
    const noData = await getTerminalState();

    assert.deepEqual(live.levels?.gammaMagnets, [82_000, 85_000, 80_000]);
    assert.equal(live.levels?.shortGammaPocketStart, 63_200);
    assert.equal(live.levels?.shortGammaPocketEnd, 64_700);

    assert.deepEqual(bootstrap.levels?.gammaMagnets, []);
    assert.equal(bootstrap.levels?.shortGammaPocketStart, null);
    assert.equal(bootstrap.levels?.shortGammaPocketEnd, null);

    assert.deepEqual(noData.levels?.gammaMagnets, []);
    assert.equal(noData.levels?.shortGammaPocketStart, null);
    assert.equal(noData.levels?.shortGammaPocketEnd, null);
  } finally {
    restoreMethod(storage as any, "getMarketState", original.marketState);
    restoreMethod(storage as any, "getDealerExposure", original.dealerExposure);
    restoreMethod(storage as any, "getDealerHedgeSensitivity", original.dealerHedgeSensitivity);
    restoreMethod(storage as any, "getDealerHedgeState", original.dealerHedgeState);
    restoreMethod(storage as any, "getDealerHedgeStressScenarios", original.dealerHedgeStressScenarios);
    restoreMethod(storage as any, "getOptionsPositioning", original.optionsPositioning);
    restoreMethod(storage as any, "getKeyLevels", original.keyLevels);
    restoreMethod(storage as any, "getTradingScenarios", original.tradingScenarios);
    restoreMethod(storage as any, "getOptionsLastUpdated", original.optionsLastUpdated);
    restoreMethod(DeribitOptionsGateway as any, "ingestOptions", original.ingestOptions);
    restoreMethod(MarketDataGateway as any, "getCachedTicker", original.getCachedTicker);
  }
});
