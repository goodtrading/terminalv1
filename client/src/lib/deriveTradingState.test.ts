import assert from "node:assert/strict";
import test from "node:test";
import {
  buildTradingStateInput,
  buildTradingStateReason,
  deriveTradingState,
  formatTradeStateDriver,
  type TradingStateInput,
} from "./deriveTradingState.ts";

const base: TradingStateInput = {
  spot: 70_000,
  gammaRegime: "LONG GAMMA",
  globalFlip: 68_000,
  localFlip: 69_500,
  dealerPivot: 69_800,
  callWall: 72_000,
  putWall: 67_000,
  scenarioBias: "NEUTRAL",
  volatilityRisk: "MEDIUM",
  marketMode: "MEAN_REVERSION",
  marketModeConfidence: 72,
  dataQuality: "complete",
};

test("incomplete data → WAIT / NEUTRAL / NO TRADE / LOW", () => {
  const r = deriveTradingState({ dataQuality: "incomplete" });
  assert.equal(r.status, "WAIT");
  assert.equal(r.bias, "NEUTRAL");
  assert.equal(r.execution, "NO TRADE");
  assert.equal(r.confidence, "LOW");
  assert.equal(r.waitingForClarity, true);
  assert.match(r.reason, /complete market data/i);
});

test("clear bullish alignment → LONG bias", () => {
  const r = deriveTradingState({
    ...base,
    spot: 71_000,
    scenarioBias: "BULLISH",
    localFlip: 69_000,
    globalFlip: 68_000,
    dealerPivot: 70_000,
    marketModeConfidence: 75,
    gammaPressurePositive: true,
  });
  assert.equal(r.bias, "LONG");
  assert.ok(["WATCH", "READY", "ACTIVE"].includes(r.status));
});

test("clear bearish alignment → SHORT bias", () => {
  const r = deriveTradingState({
    ...base,
    spot: 66_000,
    scenarioBias: "BEARISH",
    localFlip: 69_000,
    globalFlip: 68_000,
    dealerPivot: 67_500,
    gammaRegime: "SHORT GAMMA",
    volatilityRisk: "HIGH",
  });
  assert.equal(r.bias, "SHORT");
});

test("conflicting signals → NEUTRAL and reduced confidence", () => {
  const r = deriveTradingState({
    ...base,
    spot: 70_000,
    scenarioBias: "BULLISH",
    localFlip: 70_000,
    globalFlip: 70_000,
    dealerPivot: 70_000,
    vannaBias: "BEARISH",
    marketModeConfidence: 35,
  });
  assert.equal(r.bias, "NEUTRAL");
  assert.equal(r.confidence, "LOW");
});

test("short gamma with bullish bias → LONG + elevated risk (not auto SHORT)", () => {
  const r = deriveTradingState({
    ...base,
    gammaRegime: "SHORT GAMMA",
    scenarioBias: "BULLISH",
    spot: 71_000,
    localFlip: 69_000,
    volatilityRisk: "HIGH",
    marketModeConfidence: 55,
  });
  assert.equal(r.bias, "LONG");
  assert.ok(r.risk === "HIGH" || r.risk === "EXTREME");
  assert.notEqual(r.bias, "SHORT");
});

test("long gamma with bearish bias → SHORT + moderate risk", () => {
  const r = deriveTradingState({
    ...base,
    gammaRegime: "LONG GAMMA",
    scenarioBias: "BEARISH",
    spot: 66_000,
    localFlip: 69_000,
    volatilityRisk: "MEDIUM",
    marketModeConfidence: 55,
  });
  assert.equal(r.bias, "SHORT");
});

test("price inside transition zone → not READY", () => {
  const r = deriveTradingState({
    ...base,
    spot: 69_000,
    transitionZoneStart: 68_800,
    transitionZoneEnd: 69_200,
    scenarioBias: "BULLISH",
    localFlip: 68_000,
    marketModeConfidence: 80,
  });
  assert.notEqual(r.status, "READY");
  assert.notEqual(r.status, "ACTIVE");
});

test("extreme volatility → AVOID or HIGH/EXTREME risk", () => {
  const r = deriveTradingState({
    ...base,
    gammaRegime: "SHORT GAMMA",
    volatilityRisk: "HIGH",
    gammaAcceleration: "HIGH",
    hedgeFlowIntensity: "HIGH",
    vacuumRisk: "EXTREME",
    transitionZoneStart: 69_900,
    transitionZoneEnd: 70_100,
    spot: 70_000,
    marketMode: "FRAGILE_TRANSITION",
    marketModeConfidence: 30,
  });
  assert.ok(r.risk === "HIGH" || r.risk === "EXTREME");
});

test("stale data caps confidence", () => {
  const r = deriveTradingState({
    ...base,
    spot: 71_000,
    scenarioBias: "BULLISH",
    localFlip: 69_000,
    globalFlip: 68_000,
    dataQuality: "stale",
    marketModeConfidence: 85,
  });
  assert.notEqual(r.confidence, "HIGH");
});

test("deterministic — same input, same output", () => {
  const input = { ...base, spot: 70_050, scenarioBias: "BULLISH" as const };
  const a = deriveTradingState(input);
  const b = deriveTradingState(input);
  assert.deepEqual(a, b);
});

test("capture-like snapshot: fragile + developing + high vol + 53% → WATCH not READY", () => {
  const r = deriveTradingState({
    spot: 66_500,
    gammaRegime: "SHORT GAMMA",
    globalFlip: 68_000,
    localFlip: 69_500,
    dealerPivot: 69_000,
    scenarioBias: "BEARISH",
    volatilityRisk: "HIGH",
    marketMode: "FRAGILE_TRANSITION",
    marketModeConfidence: 53,
    institutionalBias: "FRAGILE_TRANSITION",
    gammaPressurePositive: false,
    dataQuality: "complete",
  });
  assert.equal(r.bias, "SHORT");
  assert.equal(r.status, "WATCH");
  assert.equal(r.risk, "HIGH");
  assert.equal(r.execution, "PROBE ONLY");
  assert.equal(r.confidence, "MEDIUM");
  assert.equal(r.marketCondition, "DEVELOPING");
  assert.equal(r.flowState, "VOLATILE");
  assert.equal(r.componentVolatilityRisk, "HIGH");
  assert.equal(r.waitingForClarity, true);
  assert.ok(r.drivers.some((d) => /Trade state: WATCH — waiting for confirmation/.test(d)));
  assert.equal(
    r.reason,
    "Bearish below both flips, but fragile transition and high volatility require confirmation.",
  );
  assert.notEqual(r.status, "READY");
  assert.notEqual(r.status, "ACTIVE");
});

test("coherence: fragileTransition + waitingForClarity forbids READY/ACTIVE", () => {
  const r = deriveTradingState({
    ...base,
    spot: 69_820,
    dealerPivot: 69_800,
    scenarioBias: "BULLISH",
    marketMode: "FRAGILE_TRANSITION",
    marketModeConfidence: 53,
    volatilityRisk: "HIGH",
  });
  assert.notEqual(r.status, "READY");
  assert.notEqual(r.status, "ACTIVE");
  assert.equal(r.waitingForClarity, true);
});

test("coherence: marketCondition DEVELOPING caps status at WATCH without trigger", () => {
  const r = deriveTradingState({
    ...base,
    spot: 69_820,
    dealerPivot: 69_800,
    scenarioBias: "BULLISH",
    gammaPressurePositive: false,
    marketModeConfidence: 55,
  });
  assert.equal(r.marketCondition, "DEVELOPING");
  assert.notEqual(r.status, "READY");
});

test("coherence: volatilityRisk HIGH prevents aggregate MEDIUM", () => {
  const r = deriveTradingState({
    ...base,
    gammaRegime: "SHORT GAMMA",
    volatilityRisk: "HIGH",
    marketModeConfidence: 53,
  });
  assert.notEqual(r.risk, "LOW");
  assert.notEqual(r.risk, "MEDIUM");
});

test("coherence: confidence 53% is MEDIUM band and does not alone enable READY", () => {
  const r = deriveTradingState({
    ...base,
    spot: 69_820,
    dealerPivot: 69_800,
    scenarioBias: "BEARISH",
    localFlip: 70_000,
    globalFlip: 71_000,
    marketMode: "FRAGILE_TRANSITION",
    marketModeConfidence: 53,
    volatilityRisk: "HIGH",
  });
  assert.equal(r.confidenceBand, "MEDIUM");
  assert.equal(r.confidence, "MEDIUM");
  assert.notEqual(r.status, "READY");
});

test("coherence: bearish below flips with blockers → WATCH not READY", () => {
  const r = deriveTradingState({
    spot: 66_000,
    gammaRegime: "SHORT GAMMA",
    globalFlip: 68_000,
    localFlip: 69_000,
    scenarioBias: "BEARISH",
    volatilityRisk: "HIGH",
    marketMode: "FRAGILE_TRANSITION",
    marketModeConfidence: 53,
    dataQuality: "complete",
  });
  assert.equal(r.bias, "SHORT");
  assert.equal(r.status, "WATCH");
});

test("coherence: confirmed trigger can allow READY", () => {
  const r = deriveTradingState({
    ...base,
    spot: 69_803,
    dealerPivot: 69_800,
    scenarioBias: "BULLISH",
    localFlip: 69_000,
    globalFlip: 68_000,
    marketMode: "MEAN_REVERSION",
    marketModeConfidence: 78,
    gammaPressurePositive: true,
    volatilityRisk: "LOW",
  });
  assert.ok(["READY", "ACTIVE"].includes(r.status));
  assert.equal(r.waitingForClarity, false);
});

test("coherence: drivers never say waiting for clarity with READY/ACTIVE", () => {
  const inputs: TradingStateInput[] = [
    {
      ...base,
      spot: 69_803,
      dealerPivot: 69_800,
      scenarioBias: "BULLISH",
      localFlip: 69_000,
      globalFlip: 68_000,
      marketModeConfidence: 78,
      gammaPressurePositive: true,
      volatilityRisk: "LOW",
      marketMode: "MEAN_REVERSION",
    },
    {
      spot: 66_000,
      gammaRegime: "SHORT GAMMA",
      scenarioBias: "BEARISH",
      localFlip: 69_000,
      globalFlip: 68_000,
      marketMode: "FRAGILE_TRANSITION",
      marketModeConfidence: 53,
      volatilityRisk: "HIGH",
      dataQuality: "complete",
    },
  ];
  for (const input of inputs) {
    const r = deriveTradingState(input);
    if (r.status === "READY" || r.status === "ACTIVE") {
      assert.ok(!r.drivers.some((d) => /waiting for clarity/i.test(d)));
      assert.ok(!r.drivers.some((d) => /waiting for confirmation/i.test(d)));
      assert.equal(r.waitingForClarity, false);
    }
  }
});

test("text: WAIT produces waiting for clarity driver", () => {
  const r = deriveTradingState({ dataQuality: "incomplete" });
  assert.equal(r.status, "WAIT");
  assert.equal(r.drivers[0], "Trade state: WAIT — waiting for clarity");
});

test("text: formatTradeStateDriver uses real status enums", () => {
  assert.equal(formatTradeStateDriver("WAIT"), "Trade state: WAIT — waiting for clarity");
  assert.equal(formatTradeStateDriver("WATCH"), "Trade state: WATCH — waiting for confirmation");
  assert.equal(formatTradeStateDriver("READY"), "Trade state: READY — conditions aligned");
  assert.equal(formatTradeStateDriver("ACTIVE"), "Trade state: ACTIVE — setup in progress");
  assert.equal(formatTradeStateDriver("AVOID"), "Trade state: AVOID — conditions unfavorable");
});

test("text: WATCH snapshot driver and reason", () => {
  const r = deriveTradingState({
    spot: 66_500,
    gammaRegime: "SHORT GAMMA",
    globalFlip: 68_000,
    localFlip: 69_500,
    scenarioBias: "BEARISH",
    volatilityRisk: "HIGH",
    marketMode: "FRAGILE_TRANSITION",
    marketModeConfidence: 53,
    dataQuality: "complete",
  });
  assert.equal(r.drivers[0], "Trade state: WATCH — waiting for confirmation");
  assert.match(r.reason, /^Bearish below both flips, but .+ require confirmation\.$/);
  assert.ok(!r.reason.includes("regime, market condition developing, still"));
  assert.ok(!r.reason.includes("undefined"));
});

test("text: LONG reason is bullish and grammatical", () => {
  const reason = buildTradingStateReason({
    bias: "LONG",
    status: "WATCH",
    blockers: ["Fragile transition regime", "Volatility risk high"],
    supportiveFactors: ["Price above local flip", "Price above global flip"],
    componentVolatilityRisk: "HIGH",
    fragile: true,
  });
  assert.equal(
    reason,
    "Bullish above both flips, but fragile transition and high volatility require confirmation.",
  );
  assert.ok(!/bearish/i.test(reason));
});

test("text: NEUTRAL reason avoids directional wording", () => {
  const reason = buildTradingStateReason({
    bias: "NEUTRAL",
    status: "WATCH",
    blockers: ["Volatility risk high"],
    supportiveFactors: [],
    componentVolatilityRisk: "HIGH",
    fragile: false,
  });
  assert.equal(reason, "Conflicting signals and high volatility require confirmation.");
  assert.ok(!/bullish|bearish/i.test(reason));
});

test("text: READY driver does not mention waiting", () => {
  const r = deriveTradingState({
    ...base,
    spot: 69_803,
    dealerPivot: 69_800,
    scenarioBias: "BULLISH",
    localFlip: 69_000,
    globalFlip: 68_000,
    marketMode: "MEAN_REVERSION",
    marketModeConfidence: 78,
    gammaPressurePositive: true,
    volatilityRisk: "LOW",
  });
  if (r.status === "READY" || r.status === "ACTIVE") {
    assert.ok(!r.drivers.join(" ").match(/waiting for clarity|waiting for confirmation/i));
    assert.ok(!r.reason.match(/waiting for clarity|waiting for confirmation/i));
  }
});

test("buildTradingStateInput maps snapshot fields", () => {
  const input = buildTradingStateInput({
    market: {
      gammaRegime: "SHORT GAMMA",
      totalGex: -170_700,
      gammaFlip: 68_000,
      transitionZoneStart: 67_500,
      transitionZoneEnd: 68_500,
      gammaAcceleration: "LOW",
    },
    exposure: { vannaBias: "BEARISH", gammaPressure: "+0.8" },
    positioning: {
      dealerPivot: 69_000,
      callWall: 72_000,
      putWall: 66_000,
      tradingPlaybook: { currentPlaybook: { volatilityRisk: "HIGH", directionalBias: "SHORT" } },
      marketModeEngine: { marketMode: "FRAGILE_TRANSITION", marketModeConfidence: 53 },
      institutionalBiasEngine: { institutionalBias: "FRAGILE_TRANSITION" },
    },
    options: {
      totalGex: -170_700,
      gammaFlipGlobal: 68_000,
      gammaFlipLocal: 69_500,
    },
    ticker: { price: 66_500 },
    tickerStatus: "fresh",
    scenarios: [{ type: "BASE", probability: 60, thesis: "Break below support targets downside" }],
    vacuumRisk: "HIGH",
  });
  assert.equal(input.spot, 66_500);
  assert.equal(input.scenarioBias, "BEARISH");
  assert.equal(input.marketModeConfidence, 53);
  assert.equal(input.vacuumRisk, "HIGH");
});
