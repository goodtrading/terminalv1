import type { TerminalState } from "../../terminal-state";

/** Fixed epoch for deterministic contract snapshots (2026-06-18T12:00:00Z). */
export const FIXTURE_EPOCH_MS = 1_780_800_000_000;
const NOW = FIXTURE_EPOCH_MS;

export function makeTerminalStateFixture(
  overrides: Partial<TerminalState> = {},
): TerminalState {
  const base: TerminalState = {
    market: {
      gammaRegime: "LONG GAMMA",
      totalGex: 12_500_000,
      gammaFlip: 68_000,
      distanceToFlip: 1.2,
      transitionZoneStart: 67_500,
      transitionZoneEnd: 68_500,
      gammaAcceleration: "LOW",
      timestamp: new Date(),
      id: 1,
    },
    exposure: null,
    positioning: {
      callWall: 72_000,
      putWall: 64_000,
      dealerPivot: 68_500,
      oiConcentration: 0.4,
      id: 1,
      timestamp: new Date(),
      institutionalBiasEngine: {
        institutionalBias: "BULLISH_COMPRESSION",
        biasConfidence: 72,
        biasDrivers: ["Positive gamma near spot", "Call wall overhead"],
        biasInvalidation: "Break below 66500",
        biasHorizon: "INTRADAY",
      },
      liquidityCascadeEngine: {
        cascadeRisk: "MEDIUM",
        cascadeDirection: "DOWN",
        cascadeTrigger: "Put wall breach",
        liquidationPocket: "64000-64500",
        cascadeDrivers: ["Dealer short gamma"],
      },
      squeezeProbabilityEngine: {
        squeezeProbability: 53,
        squeezeDirection: "UP",
        squeezeType: "GAMMA_SQUEEZE",
        squeezeTrigger: "Approach call wall",
        squeezeTarget: "72000",
        squeezeDrivers: ["OI concentration"],
      },
      gammaCurveEngine: {
        dealerRegime: "LONG_GAMMA",
      },
      marketModeEngine: {
        marketMode: "GAMMA_PIN",
        marketModeConfidence: 84,
        marketModeReason: ["Between gamma regimes", "Pinned near flip"],
      },
      tradeDecisionEngine: {
        tradeState: "WAIT",
        tradeDirection: "NEUTRAL",
        entryCondition: "Hold for flip resolution",
        riskLevel: "MEDIUM",
        positionSizeSuggestion: "REDUCED",
        executionReason: ["Regime transition risk"],
      },
      dominantExpiry: "26JUN26",
    },
    levels: {
      gammaMagnets: [69_000, 70_000, 71_000],
      shortGammaPocketStart: 69_500,
      shortGammaPocketEnd: 70_500,
      deepRiskPocketStart: 62_000,
      deepRiskPocketEnd: 63_000,
      id: 1,
      timestamp: new Date(),
    },
    scenarios: [
      {
        id: 1,
        type: "BASE",
        probability: 55,
        thesis: "Range trade between put wall and call wall",
        levels: ["64000", "72000"],
        confirmation: ["Hold above 66500"],
        invalidation: "Close below 64000",
        timestamp: new Date(NOW - 60_000),
      },
      {
        id: 2,
        type: "ALT",
        probability: 30,
        thesis: "Breakout above call wall",
        levels: ["72000", "75000"],
        confirmation: ["Sustained acceptance above 72000"],
        invalidation: "",
        timestamp: new Date(NOW - 60_000),
      },
      {
        id: 3,
        type: "VOL",
        probability: 20,
        thesis: "Vol expansion tail",
        levels: ["60000", "78000"],
        confirmation: ["IV spike"],
        invalidation: "Vol crush",
        timestamp: new Date(NOW - 60_000),
      },
    ],
    ticker: {
      price: 69_500,
      timestamp: NOW - 2_000,
      exchange: "deribit_index",
      source: "market_gateway",
    },
    tickerStatus: "fresh",
    timestamp: NOW,
    optionsLastUpdated: NOW - 5_000,
    options: {
      asOf: NOW,
      spot: 69_500,
      totalGex: 12_500_000,
      gammaRegime: "LONG GAMMA",
      gammaFlipGlobal: 68_000,
      gammaFlipGlobalSource: "fresh_snapshot",
      gammaFlipLocal: 69_800,
      gammaRegimeLocal: "SHORT GAMMA",
      localTransitionZoneStart: 69_600,
      localTransitionZoneEnd: 70_000,
      localFlipReason: "LOCAL_CROSS",
      callWallUsd: 72_100,
      putWallUsd: 63_900,
      dealerPivot: 68_500,
      dominantExpiry: "26JUN26",
      source: "LIVE_DERIBIT",
    },
    shortGammaPockets: {
      status: "WATCH",
      nearest: null,
      pockets: [
        {
          id: "pocket-1",
          direction: "UPPER",
          rangeLow: 69_500,
          rangeHigh: 70_500,
          status: "WATCH",
          risk: "MEDIUM",
          confidence: 0.72,
          relationToFlip: "NEAR_FLIP",
          relatedWall: "CALL_WALL",
          explanation: "Short gamma pocket above spot",
          activationCondition: "Acceptance above 69500",
        },
        {
          id: "pocket-2",
          direction: "LOWER",
          rangeLow: 68_800,
          rangeHigh: 69_200,
          status: "IDLE",
          risk: "LOW",
          confidence: 0.55,
          relationToFlip: "BELOW_FLIP",
          relatedWall: null,
          explanation: "Lower pocket",
          activationCondition: "Break below 69000",
        },
      ],
      summary: "2 pockets detected",
    },
    gravityMap: null,
    timeline: [],
    timelineSummary: null,
    coherence: {
      score: 0.78,
      warnings: [],
    },
  };

  return { ...base, ...overrides };
}

export function makeStaleTickerFixture(): TerminalState {
  return makeTerminalStateFixture({
    tickerStatus: "stale",
    ticker: {
      price: 69_500,
      timestamp: Date.now() - 120_000,
      exchange: "deribit_index",
      source: "market_gateway",
    },
  });
}

export function makeStaleOptionsFixture(): TerminalState {
  return makeTerminalStateFixture({
    optionsLastUpdated: Date.now() - 120_000,
  });
}

export function makeUnavailableFlipsFixture(): TerminalState {
  return makeTerminalStateFixture({
    options: {
      ...(makeTerminalStateFixture().options as object),
      gammaFlipLocal: null,
      gammaFlipGlobal: null,
      gammaFlipGlobalSource: "none",
    },
  });
}
