import { strict as assert } from "node:assert";
import { test } from "node:test";

import { calculateCharm, type OptionsEntry } from "./analytics";
import { calculateBlackScholesRawCharm, deriveDeribitTimeToExpiryYears } from "./deribit-gateway";

type Bias = "BULLISH" | "BEARISH" | "NEUTRAL";
type FlowBias = "BUYING" | "SELLING" | "NEUTRAL";
type FlowIntensity = "LOW" | "MEDIUM" | "HIGH";

const SPOT = 65_000;
const STRIKE = 65_000;
const SIGMA = 0.45;
const LIVE_OI = 125;
const LIVE_NOW_28D = Date.UTC(2026, 7, 30, 8, 0, 0);
const LIVE_NOW_2D = Date.UTC(2026, 7, 13, 8, 0, 0);
const LIVE_NOW_6H = Date.UTC(2026, 7, 15, 2, 0, 0);
const LIVE_NOW_1H = Date.UTC(2026, 7, 15, 7, 0, 0);

function approx(actual: number, expected: number, tol = 1e-12): void {
  assert.ok(Number.isFinite(actual), `expected finite value, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${actual} ≈ ${expected} (tol=${tol})`);
}

function heuristicRow(strike: number, gamma: number): OptionsEntry {
  return {
    strike,
    gamma,
    open_interest: 100,
    implied_volatility: 0.5,
    option_type: strike >= SPOT ? "CALL" : "PUT",
    expiration: "7MAR26",
    dte: 1,
  };
}

function liveCharmPut(openInterest: number, expiry: string, nowMs: number): number {
  const T = deriveDeribitTimeToExpiryYears(expiry, nowMs);
  assert.ok(T != null, `expected valid time-to-expiry for ${expiry}`);
  return -calculateBlackScholesRawCharm(SPOT, STRIKE, SIGMA, T!) * openInterest * SPOT / 365;
}

function classifyBias(value: number): Bias {
  if (value > 0.05) return "BULLISH";
  if (value < -0.05) return "BEARISH";
  return "NEUTRAL";
}

function evaluateCharmConsumers(totalCharm: number, totalVanna = 0): {
  vannaBias: Bias;
  charmBias: Bias;
  hedgeFlowBias: FlowBias;
  hedgeFlowIntensity: FlowIntensity;
  flowScore: number;
  intensityScore: number;
  totalExposure: number;
} {
  const vannaBias = classifyBias(totalVanna);
  const charmBias = classifyBias(totalCharm);
  const vannaAbs = Math.abs(totalVanna);
  const charmAbs = Math.abs(totalCharm);

  let flowScore = 0;
  flowScore += false ? 1 : -1; // SHORT GAMMA baseline for the fixed audit state

  if (vannaBias === "BULLISH") flowScore += vannaAbs > 0.5 ? 2 : 1;
  if (vannaBias === "BEARISH") flowScore -= vannaAbs > 0.5 ? 2 : 1;

  if (charmBias === "BULLISH") flowScore += charmAbs > 0.5 ? 2 : 1;
  if (charmBias === "BEARISH") flowScore -= charmAbs > 0.5 ? 2 : 1;

  flowScore += true ? 1 : -1; // spot above pivot for the fixed audit state

  const hedgeFlowBias: FlowBias = flowScore >= 2 ? "BUYING" : flowScore <= -2 ? "SELLING" : "NEUTRAL";

  const totalExposure = vannaAbs + charmAbs;
  const distToPivot = Math.abs(SPOT - 64_500) / SPOT;

  let intensityScore = 0;
  if (totalExposure > 1.0) intensityScore += 2;
  else if (totalExposure > 0.4) intensityScore += 1;
  if (distToPivot < 0.005) intensityScore += 1;

  const hedgeFlowIntensity: FlowIntensity = intensityScore >= 3 ? "HIGH" : intensityScore >= 1 ? "MEDIUM" : "LOW";

  return { vannaBias, charmBias, hedgeFlowBias, hedgeFlowIntensity, flowScore, intensityScore, totalExposure };
}

test("P1.6 heuristic Charm is bounded to ±9.99 and uses a normalized score scale", () => {
  const fixtures = [
    { label: "near zero +", row: heuristicRow(66_000, 1e-8), expected: 0.003200769230769231 },
    { label: "mild +", row: heuristicRow(66_000, 1e-5), expected: 3.2007692307692307 },
    { label: "strong +", row: heuristicRow(66_000, 1e-4), expected: 9.99 },
    { label: "clamp +", row: heuristicRow(66_000, 0.001), expected: 9.99 },
    { label: "mild -", row: heuristicRow(64_000, 1e-5), expected: -3.2007692307692307 },
    { label: "strong -", row: heuristicRow(64_000, 1e-4), expected: -9.99 },
    { label: "clamp -", row: heuristicRow(64_000, 0.001), expected: -9.99 },
  ] as const;

  for (const fx of fixtures) {
    const value = calculateCharm([fx.row], SPOT);
    approx(value, fx.expected);
    assert.ok(Math.abs(value) <= 9.99, `${fx.label}: heuristic output should stay within clamp`);
  }
});

test("P1.6 live Charm is daily USD-denominated and still clears the flow threshold", () => {
  const fixtures = [
    { label: "low OI far expiry", value: liveCharmPut(1, "27DEC26", LIVE_NOW_28D) },
    { label: "medium OI 28d", value: liveCharmPut(LIVE_OI, "27SEP26", LIVE_NOW_28D) },
    { label: "medium OI 2d", value: liveCharmPut(LIVE_OI, "15AUG26", LIVE_NOW_2D) },
    { label: "medium OI 6h", value: liveCharmPut(LIVE_OI, "15AUG26", LIVE_NOW_6H) },
    { label: "high OI near expiry", value: liveCharmPut(1_000, "15AUG26", LIVE_NOW_1H) },
  ] as const;

  for (const fx of fixtures) {
    assert.ok(Number.isFinite(fx.value), `${fx.label}: live Charm should be finite`);
    assert.ok(fx.value > 0.5, `${fx.label}: live Charm magnitude should exceed the current strong threshold`);

    const consumerState = evaluateCharmConsumers(fx.value);
    assert.equal(consumerState.charmBias, "BULLISH");
    assert.equal(consumerState.hedgeFlowBias, "BUYING");
    assert.equal(consumerState.hedgeFlowIntensity, "MEDIUM");
  }

  const bearish = evaluateCharmConsumers(-fixtures[0]!.value);
  assert.equal(bearish.charmBias, "BEARISH");
  assert.equal(bearish.hedgeFlowBias, "SELLING");
  assert.equal(bearish.hedgeFlowIntensity, "MEDIUM");
});

test("P1.6 source switch: short-expiry heuristic Charm now also clears the flow threshold", () => {
  const heuristicMild = calculateCharm([heuristicRow(66_000, 1e-5)], SPOT); // 3.2007692307692307
  const heuristicStrong = calculateCharm([heuristicRow(66_000, 1e-4)], SPOT); // 9.99
  const liveFarExpiry = liveCharmPut(1, "27DEC26", LIVE_NOW_28D); // 9.302130916123783

  const mildState = evaluateCharmConsumers(heuristicMild);
  const strongState = evaluateCharmConsumers(heuristicStrong);
  const liveState = evaluateCharmConsumers(liveFarExpiry);

  assert.equal(mildState.charmBias, "BULLISH");
  assert.equal(mildState.hedgeFlowBias, "BUYING");
  assert.equal(mildState.hedgeFlowIntensity, "MEDIUM");

  assert.equal(strongState.charmBias, "BULLISH");
  assert.equal(strongState.hedgeFlowBias, "BUYING");
  assert.equal(strongState.hedgeFlowIntensity, "MEDIUM");

  assert.equal(liveState.charmBias, "BULLISH");
  assert.equal(liveState.hedgeFlowBias, "BUYING");
  assert.equal(liveState.hedgeFlowIntensity, "MEDIUM");
  assert.ok(liveFarExpiry > heuristicMild * 2, "live Charm is still larger than the heuristic mild proxy");
});
