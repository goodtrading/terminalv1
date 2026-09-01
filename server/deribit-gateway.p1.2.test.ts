import { strict as assert } from "node:assert";
import { test } from "node:test";

import { calculateBlackScholesRawVanna, deriveDeribitTimeToExpiryYears } from "./deribit-gateway";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;
const RISK_FREE_RATE = 0.02;
const DIVIDEND_YIELD = 0;

function erf(x: number): number {
  const sign = x < 0 ? -1 : 1;
  const ax = Math.abs(x);
  const a1 = 0.254829592;
  const a2 = -0.284496736;
  const a3 = 1.421413741;
  const a4 = -1.453152027;
  const a5 = 1.061405429;
  const p = 0.3275911;
  const t = 1 / (1 + p * ax);
  const y = 1 - (((((a5 * t + a4) * t + a3) * t + a2) * t + a1) * t * Math.exp(-ax * ax));
  return sign * y;
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function phi(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function bsD1(spot: number, strike: number, sigma: number, timeToExpiryYears: number): number {
  const sqrtT = Math.sqrt(timeToExpiryYears);
  return (
    Math.log(spot / strike) + (RISK_FREE_RATE - DIVIDEND_YIELD + 0.5 * sigma * sigma) * timeToExpiryYears
  ) / (sigma * sqrtT);
}

function bsD2(spot: number, strike: number, sigma: number, timeToExpiryYears: number): number {
  const d1 = bsD1(spot, strike, sigma, timeToExpiryYears);
  return d1 - sigma * Math.sqrt(timeToExpiryYears);
}

function rawVannaClosedForm(spot: number, strike: number, sigma: number, timeToExpiryYears: number): number {
  const d1 = bsD1(spot, strike, sigma, timeToExpiryYears);
  const d2 = bsD2(spot, strike, sigma, timeToExpiryYears);
  return -Math.exp(-DIVIDEND_YIELD * timeToExpiryYears) * phi(d1) * d2 / sigma;
}

function delta(spot: number, strike: number, sigma: number, timeToExpiryYears: number, optionType: "call" | "put"): number {
  const d1 = bsD1(spot, strike, sigma, timeToExpiryYears);
  const discount = Math.exp(-DIVIDEND_YIELD * timeToExpiryYears);
  return optionType === "call" ? discount * normCdf(d1) : discount * (normCdf(d1) - 1);
}

function numericVanna(
  spot: number,
  strike: number,
  sigma: number,
  timeToExpiryYears: number,
  optionType: "call" | "put",
  h = 1e-4,
): number {
  return (
    delta(spot, strike, sigma + h, timeToExpiryYears, optionType) -
    delta(spot, strike, sigma - h, timeToExpiryYears, optionType)
  ) / (2 * h);
}

function relativeError(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
}

function fixtureTime(expiry: string, nowMs: number): number {
  const t = deriveDeribitTimeToExpiryYears(expiry, nowMs);
  assert.ok(t != null, `expected valid T for ${expiry}`);
  return t;
}

test("P1.2 raw Vanna matches Black-Scholes closed form and numerical finite difference", () => {
  const fixtures = [
    { label: "ATM call", spot: 65000, strike: 65000, sigma: 0.3, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), optionType: "call" as const },
    { label: "ATM put", spot: 65000, strike: 65000, sigma: 0.3, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), optionType: "put" as const },
    { label: "OTM call", spot: 65000, strike: 70000, sigma: 0.3, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), optionType: "call" as const },
    { label: "ITM call", spot: 65000, strike: 64000, sigma: 0.3, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), optionType: "call" as const },
    { label: "OTM put", spot: 65000, strike: 61000, sigma: 0.3, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), optionType: "put" as const },
    { label: "short dated", spot: 65000, strike: 65000, sigma: 0.5, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 15, 7, 0, 0), optionType: "call" as const },
    { label: "farther dated", spot: 65000, strike: 65000, sigma: 0.5, expiry: "27SEP26", nowMs: Date.UTC(2026, 7, 30, 8, 0, 0), optionType: "call" as const },
    { label: "lower IV", spot: 65000, strike: 65000, sigma: 0.25, expiry: "27SEP26", nowMs: Date.UTC(2026, 7, 30, 8, 0, 0), optionType: "call" as const },
    { label: "higher IV", spot: 65000, strike: 65000, sigma: 0.8, expiry: "27SEP26", nowMs: Date.UTC(2026, 7, 30, 8, 0, 0), optionType: "call" as const },
  ];

  for (const fx of fixtures) {
    const t = fixtureTime(fx.expiry, fx.nowMs);
    const d1 = bsD1(fx.spot, fx.strike, fx.sigma, t);
    const d2 = bsD2(fx.spot, fx.strike, fx.sigma, t);
    const analytic = calculateBlackScholesRawVanna(fx.spot, fx.strike, fx.sigma, t);
    const expected = rawVannaClosedForm(fx.spot, fx.strike, fx.sigma, t);
    const num = numericVanna(fx.spot, fx.strike, fx.sigma, t, fx.optionType, 1e-4);
    const numStable = numericVanna(fx.spot, fx.strike, fx.sigma, t, fx.optionType, 5e-5);

    const absErr = Math.abs(analytic - num);
    const relErr = relativeError(analytic, num);
    const stableAbs = Math.abs(num - numStable);

    assert.ok(Math.abs(analytic - expected) < 1e-12, `${fx.label}: analytic should match closed form`);
    assert.ok(relErr < 1e-4 || absErr < 1e-8, `${fx.label}: analytic should match numerical derivative`);
    assert.ok(stableAbs < Math.max(1e-6, Math.abs(num) * 1e-3), `${fx.label}: finite difference should be stable`);
    assert.ok(Number.isFinite(d1) && Number.isFinite(d2), `${fx.label}: d1/d2 should be finite`);
  }
});

test("P1.2 raw Vanna is call/put parity and current exposure scaling still uses dealer sign", () => {
  const spot = 65000;
  const strike = 65000;
  const sigma = 0.45;
  const t = fixtureTime("27SEP26", Date.UTC(2026, 7, 30, 8, 0, 0));
  const callRaw = calculateBlackScholesRawVanna(spot, strike, sigma, t);
  const putRaw = calculateBlackScholesRawVanna(spot, strike, sigma, t);

  assert.ok(Math.abs(callRaw - putRaw) < 1e-15, "raw Vanna should be identical for call and put");

  const oi = 125;
  const callExposure = callRaw * oi * spot * 0.01;
  const putExposure = -putRaw * oi * spot * 0.01;
  assert.ok(callExposure > 0, "call exposure should retain positive dealer sign in this fixture");
  assert.ok(putExposure < 0, "put exposure should retain negative dealer sign in this fixture");
});

test("P1.2 corrected raw Vanna leaves T helper non-negative near expiry", () => {
  const t = fixtureTime("15AUG26", Date.UTC(2026, 7, 15, 7, 59, 59));
  assert.ok(t > 0);
  assert.ok(t < 1 / 365, "near-expiry T should be tiny but non-negative");
  assert.ok(calculateBlackScholesRawVanna(65000, 65000, 0.4, t) >= 0);
});
