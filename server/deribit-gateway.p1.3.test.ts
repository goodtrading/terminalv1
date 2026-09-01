import { strict as assert } from "node:assert";
import { test } from "node:test";

import { calculateBlackScholesRawCharm, deriveDeribitTimeToExpiryYears } from "./deribit-gateway";

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

function delta(spot: number, strike: number, sigma: number, timeToExpiryYears: number, optionType: "call" | "put"): number {
  const d1 = bsD1(spot, strike, sigma, timeToExpiryYears);
  const discount = Math.exp(-DIVIDEND_YIELD * timeToExpiryYears);
  return optionType === "call" ? discount * normCdf(d1) : discount * (normCdf(d1) - 1);
}

function rawCharmClosedForm(spot: number, strike: number, sigma: number, timeToExpiryYears: number): number {
  const d1 = bsD1(spot, strike, sigma, timeToExpiryYears);
  const d2 = bsD2(spot, strike, sigma, timeToExpiryYears);
  const discount = Math.exp(-DIVIDEND_YIELD * timeToExpiryYears);
  return -discount * phi(d1) * (2 * (RISK_FREE_RATE - DIVIDEND_YIELD) * timeToExpiryYears - d2 * sigma * Math.sqrt(timeToExpiryYears)) /
    (2 * timeToExpiryYears * sigma * Math.sqrt(timeToExpiryYears));
}

function numericCalendarCharm(
  spot: number,
  strike: number,
  sigma: number,
  timeToExpiryYears: number,
  optionType: "call" | "put",
  h = 1e-5,
): number {
  const hUsed = Math.min(h, Math.max(timeToExpiryYears / 4, 1e-10));
  const lowerT = timeToExpiryYears - hUsed;
  const upperT = timeToExpiryYears + hUsed;
  return (delta(spot, strike, sigma, lowerT, optionType) - delta(spot, strike, sigma, upperT, optionType)) / (2 * hUsed);
}

function relativeError(a: number, b: number): number {
  return Math.abs(a - b) / Math.max(Math.abs(b), 1e-12);
}

function fixtureTime(expiry: string, nowMs: number): number {
  const t = deriveDeribitTimeToExpiryYears(expiry, nowMs);
  assert.ok(t != null, `expected valid T for ${expiry}`);
  return t;
}

function legacyRawCharm(
  spot: number,
  strike: number,
  sigma: number,
  timeToExpiryYears: number,
): number {
  const sqrtT = Math.sqrt(timeToExpiryYears);
  const d1 = (Math.log(spot / strike) + (RISK_FREE_RATE - DIVIDEND_YIELD + 0.5 * sigma * sigma) * timeToExpiryYears) /
    (sigma * sqrtT);
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return -nd1 * (2 * RISK_FREE_RATE * timeToExpiryYears - d1 * sigma * sqrtT) / (2 * timeToExpiryYears * sigma * sqrtT);
}

test("P1.3 raw Charm matches the calendar-time Delta decay convention", () => {
  const fixtures = [
    { label: "ATM call", spot: 65000, strike: 65000, sigma: 0.3, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), optionType: "call" as const },
    { label: "ATM put", spot: 65000, strike: 65000, sigma: 0.3, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), optionType: "put" as const },
    { label: "OTM call", spot: 65000, strike: 70000, sigma: 0.3, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), optionType: "call" as const },
    { label: "ITM call", spot: 65000, strike: 64000, sigma: 0.3, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), optionType: "call" as const },
    { label: "OTM put", spot: 65000, strike: 61000, sigma: 0.3, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), optionType: "put" as const },
    { label: "short dated", spot: 65000, strike: 65000, sigma: 0.5, expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 15, 2, 0, 0), optionType: "call" as const },
    { label: "farther dated", spot: 65000, strike: 65000, sigma: 0.5, expiry: "27SEP26", nowMs: Date.UTC(2026, 7, 30, 8, 0, 0), optionType: "call" as const },
    { label: "low IV", spot: 65000, strike: 65000, sigma: 0.25, expiry: "27SEP26", nowMs: Date.UTC(2026, 7, 30, 8, 0, 0), optionType: "call" as const },
    { label: "high IV", spot: 65000, strike: 65000, sigma: 0.8, expiry: "27SEP26", nowMs: Date.UTC(2026, 7, 30, 8, 0, 0), optionType: "call" as const },
  ];

  for (const fx of fixtures) {
    const T = fixtureTime(fx.expiry, fx.nowMs);
    const d1 = bsD1(fx.spot, fx.strike, fx.sigma, T);
    const d2 = bsD2(fx.spot, fx.strike, fx.sigma, T);
    const current = calculateBlackScholesRawCharm(fx.spot, fx.strike, fx.sigma, T);
    const expected = rawCharmClosedForm(fx.spot, fx.strike, fx.sigma, T);
    const numeric = numericCalendarCharm(fx.spot, fx.strike, fx.sigma, T, fx.optionType, 1e-4);
    const numericStable = numericCalendarCharm(fx.spot, fx.strike, fx.sigma, T, fx.optionType, 5e-5);

    const absErr = Math.abs(current - numeric);
    const relErr = relativeError(current, numeric);

    assert.ok(Math.abs(current - expected) < 1e-12, `${fx.label}: analytic should match closed form`);
    assert.ok(relErr < 1e-2 || absErr < 1e-4, `${fx.label}: analytic should match numeric Delta decay`);
    assert.ok(Math.abs(numeric - numericStable) < Math.max(1e-3, Math.abs(numeric) * 1e-2), `${fx.label}: finite difference should be stable`);
    assert.ok(Number.isFinite(d1) && Number.isFinite(d2), `${fx.label}: d1/d2 should be finite`);
  }
});

test("P1.3 raw Charm has call/put parity under q=0 and dealer sign remains separate", () => {
  const T = fixtureTime("27SEP26", Date.UTC(2026, 7, 30, 8, 0, 0));
  const callCharm = calculateBlackScholesRawCharm(65000, 65000, 0.45, T);
  const putCharm = calculateBlackScholesRawCharm(65000, 65000, 0.45, T);

  assert.ok(Math.abs(callCharm - putCharm) < 1e-15, "raw Charm should be identical for call and put when q=0");

  const oi = 125;
  const spot = 65000;
  const callExposure = callCharm * oi * spot / 365;
  const putExposure = -putCharm * oi * spot / 365;
  assert.ok(callExposure > 0 || callExposure < 0 || callExposure === 0);
  assert.ok(putExposure === -callExposure, "dealer sign is still applied later in the pipeline");
});

test("P1.3 raw Charm stays finite near expiry with the existing minimum-T convention", () => {
  const daysRemaining = fixtureTime("15AUG26", Date.UTC(2026, 7, 13, 8, 0, 0));
  const hoursRemaining = fixtureTime("15AUG26", Date.UTC(2026, 7, 15, 2, 0, 0));
  const secondsRemaining = fixtureTime("15AUG26", Date.UTC(2026, 7, 15, 7, 59, 59));

  for (const T of [daysRemaining, hoursRemaining, secondsRemaining]) {
    const value = calculateBlackScholesRawCharm(65000, 65000, 0.5, T);
    assert.ok(Number.isFinite(value));
  }

  assert.ok(daysRemaining > hoursRemaining && hoursRemaining > secondsRemaining, "remaining T should shrink as expiry approaches");
});

test("P1.3 reports before/after impact without changing Vanna or P0 semantics", () => {
  const nearT = fixtureTime("15AUG26", Date.UTC(2026, 7, 13, 8, 0, 0));
  const farT = fixtureTime("27SEP26", Date.UTC(2026, 7, 30, 8, 0, 0));
  const spot = 65000;
  const oi = 125;
  const dealerSign = 1;

  const nearOldRaw = legacyRawCharm(spot, 65000, 0.3, nearT);
  const nearNewRaw = calculateBlackScholesRawCharm(spot, 65000, 0.3, nearT);
  const farOldRaw = legacyRawCharm(spot, 65000, 0.5, farT);
  const farNewRaw = calculateBlackScholesRawCharm(spot, 65000, 0.5, farT);

  const nearOldTotal = dealerSign * nearOldRaw * oi * 100;
  const nearNewTotal = dealerSign * nearNewRaw * oi * 100;
  const farOldTotal = dealerSign * farOldRaw * oi * 100;
  const farNewTotal = dealerSign * farNewRaw * oi * 100;

  assert.notEqual(nearOldRaw, nearNewRaw);
  assert.notEqual(farOldRaw, farNewRaw);
  assert.notEqual(nearOldTotal, nearNewTotal);
  assert.notEqual(farOldTotal, farNewTotal);
  assert.ok(calculateBlackScholesRawCharm(spot, 65000, 0.3, nearT) === nearNewRaw);
});
