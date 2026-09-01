import { strict as assert } from "node:assert";
import { test } from "node:test";

import { calculateVanna, type OptionsEntry } from "./analytics";
import { calculateBlackScholesRawVanna, deriveDeribitTimeToExpiryYears } from "./deribit-gateway";

type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";
type FlowBias = "BUYING" | "SELLING" | "NEUTRAL";
type FlowIntensity = "LOW" | "MEDIUM" | "HIGH";

const SPOT = 65_000;
const STRIKE = 65_000;
const SIGMA = 0.45;
const PIVOT = 64_000;
const LIVE_NOW_28D = Date.UTC(2026, 7, 30, 8, 0, 0);
const LIVE_NOW_2D = Date.UTC(2026, 7, 13, 8, 0, 0);
const LIVE_NOW_6H = Date.UTC(2026, 7, 15, 2, 0, 0);
const LIVE_NOW_1H = Date.UTC(2026, 7, 15, 7, 0, 0);

function approx(actual: number, expected: number, tol = 1e-12): void {
  assert.ok(Number.isFinite(actual), `expected finite value, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${actual} ≈ ${expected} (tol=${tol})`);
}

function classifyBias(value: number): Bias {
  if (value > 0.05) return "BULLISH";
  if (value < -0.05) return "BEARISH";
  return "NEUTRAL";
}

function heuristicRow(strike: number, gamma: number, optionType: OptionsEntry["option_type"]): OptionsEntry {
  return {
    strike,
    gamma,
    open_interest: 100,
    implied_volatility: 0.5,
    option_type: optionType,
    expiration: "7MAR26",
    dte: 1,
  };
}

function liveVannaExposure(openInterest: number, expiry: string, nowMs: number, optionType: "call" | "put"): number {
  const T = deriveDeribitTimeToExpiryYears(expiry, nowMs);
  assert.ok(T != null, `expected valid time-to-expiry for ${expiry}`);
  const rawVanna = calculateBlackScholesRawVanna(SPOT, STRIKE, SIGMA, T!);
  const dealerSign = optionType === "call" ? 1 : -1;
  return dealerSign * rawVanna * openInterest * SPOT * 0.01;
}

function evaluateStorageVannaFlow(totalVanna: number, totalCharm = 0): {
  vannaBias: Bias;
  charmBias: Bias;
  flowScore: number;
  hedgeFlowBias: FlowBias;
  hedgeFlowIntensity: FlowIntensity;
  totalExposure: number;
  strongAlignment: boolean;
} {
  const vannaBias = classifyBias(totalVanna);
  const charmBias = classifyBias(totalCharm);
  const vannaAbs = Math.abs(totalVanna);
  const charmAbs = Math.abs(totalCharm);

  let flowScore = 0;
  const isLongGamma = false;
  flowScore += isLongGamma ? 1 : -1;

  if (vannaBias === "BULLISH") flowScore += vannaAbs > 0.5 ? 2 : 1;
  if (vannaBias === "BEARISH") flowScore -= vannaAbs > 0.5 ? 2 : 1;

  if (charmBias === "BULLISH") flowScore += charmAbs > 0.5 ? 2 : 1;
  if (charmBias === "BEARISH") flowScore -= charmAbs > 0.5 ? 2 : 1;

  const isAbovePivot = SPOT > PIVOT;
  flowScore += isAbovePivot ? 1 : -1;

  const hedgeFlowBias: FlowBias = flowScore >= 2 ? "BUYING" : flowScore <= -2 ? "SELLING" : "NEUTRAL";

  const totalExposure = vannaAbs + charmAbs;
  const distToFlip = Infinity;
  const distToPivot = Math.abs(SPOT - PIVOT) / SPOT;

  let intensityScore = 0;
  if (totalExposure > 1.0) intensityScore += 2;
  else if (totalExposure > 0.4) intensityScore += 1;
  if (distToFlip < 0.01) intensityScore += 1;
  if (distToPivot < 0.005) intensityScore += 1;

  const hedgeFlowIntensity: FlowIntensity = intensityScore >= 3 ? "HIGH" : intensityScore >= 1 ? "MEDIUM" : "LOW";
  const strongAlignment = vannaBias === charmBias && vannaAbs + charmAbs > 0.8;

  return { vannaBias, charmBias, flowScore, hedgeFlowBias, hedgeFlowIntensity, totalExposure, strongAlignment };
}

test("P1.7 heuristic Vanna is a bounded proxy score, not a unitful exposure", () => {
  const fixtures = [
    { label: "near zero", row: heuristicRow(65_000, 1e-8, "CALL"), expected: 0 },
    { label: "mild positive", row: heuristicRow(64_000, 1e-5, "PUT"), expected: 1.6003846153846155 },
    { label: "strong positive", row: heuristicRow(64_000, 1e-4, "PUT"), expected: 9.99 },
    { label: "clamp positive", row: heuristicRow(64_000, 0.00115, "PUT"), expected: 9.99 },
    { label: "mild negative", row: heuristicRow(66_000, 1e-5, "CALL"), expected: -1.6003846153846155 },
    { label: "strong negative", row: heuristicRow(66_000, 1e-4, "CALL"), expected: -9.99 },
    { label: "clamp negative", row: heuristicRow(66_000, 0.00115, "CALL"), expected: -9.99 },
  ] as const;

  for (const fx of fixtures) {
    const value = calculateVanna([fx.row], SPOT);
    approx(value, fx.expected);
    assert.ok(Math.abs(value) <= 9.99, `${fx.label}: heuristic Vanna should remain clamped to ±9.99`);
  }
});

test("P1.7 live Vanna is unitful and alone saturates the current normalized exposure thresholds", () => {
  const fixtures = [
    { label: "low OI / far expiry", value: liveVannaExposure(1, "27SEP26", LIVE_NOW_28D, "call"), expected: 28.737235132934902 },
    { label: "medium OI / 28d", value: liveVannaExposure(125, "27SEP26", LIVE_NOW_28D, "call"), expected: 3592.154391616863 },
    { label: "medium OI / 2d", value: liveVannaExposure(125, "15AUG26", LIVE_NOW_2D, "call"), expected: 962.5293028173828 },
    { label: "medium OI / 6h", value: liveVannaExposure(125, "15AUG26", LIVE_NOW_6H, "call"), expected: 340.36473110448327 },
    { label: "high OI / near expiry", value: liveVannaExposure(1_000, "15AUG26", LIVE_NOW_1H, "call"), expected: 1111.6495891858954 },
  ] as const;

  for (const fx of fixtures) {
    approx(fx.value, fx.expected, 1e-9);
    const state = evaluateStorageVannaFlow(fx.value, 0);

    assert.equal(state.vannaBias, "BULLISH");
    assert.equal(state.flowScore, 2);
    assert.equal(state.hedgeFlowBias, "BUYING");
    assert.equal(state.hedgeFlowIntensity, "MEDIUM");
    assert.equal(state.strongAlignment, false);
    assert.ok(state.totalExposure > 0.4, `${fx.label}: should clear the 0.4 exposure threshold`);
    assert.ok(state.totalExposure > 0.8, `${fx.label}: should clear the 0.8 exposure threshold`);
    assert.ok(state.totalExposure > 1.0, `${fx.label}: should clear the 1.0 exposure threshold`);
    assert.ok(fx.value > 0.5, `${fx.label}: should clear the Vanna strong threshold`);
  }
});

test("P1.7 heuristic vs live Vanna source switch now clears the same flow threshold", () => {
  const heuristicMild = calculateVanna([
    heuristicRow(64_000, 1e-5, "PUT"),
  ], SPOT); // 1.6003846153846155
  const liveFarExpiry = liveVannaExposure(1, "27SEP26", LIVE_NOW_28D, "call"); // 28.737235132934902

  const heuristicState = evaluateStorageVannaFlow(heuristicMild, 0);
  const liveState = evaluateStorageVannaFlow(liveFarExpiry, 0);

  assert.equal(heuristicState.vannaBias, "BULLISH");
  assert.equal(heuristicState.flowScore, 2);
  assert.equal(heuristicState.hedgeFlowBias, "BUYING");
  assert.equal(heuristicState.hedgeFlowIntensity, "MEDIUM");
  assert.ok(heuristicState.totalExposure > 1.0, "heuristic mild Vanna should now clear the exposure threshold");

  assert.equal(liveState.vannaBias, "BULLISH");
  assert.equal(liveState.flowScore, 2);
  assert.equal(liveState.hedgeFlowBias, "BUYING");
  assert.equal(liveState.hedgeFlowIntensity, "MEDIUM");
  assert.ok(liveState.totalExposure > 1.0, "live Vanna should clear the exposure threshold");
  assert.ok(liveFarExpiry > heuristicMild * 10, "live Vanna is still much larger than the heuristic mild proxy");
});
