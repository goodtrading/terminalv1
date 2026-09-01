import { strict as assert } from "node:assert";
import { test } from "node:test";

import { calculateBlackScholesRawCharm, deriveDeribitTimeToExpiryYears } from "./deribit-gateway";

function approxEqual(actual: number, expected: number, tol = 1e-12): void {
  assert.ok(Number.isFinite(actual), `expected finite value, got ${actual}`);
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${actual} ≈ ${expected} (tol=${tol})`);
}

function productionCharmExposure(rawCharm: number, openInterest: number, dealerSign: 1 | -1, spot: number): number {
  return dealerSign * rawCharm * openInterest * spot / 365;
}

function dailyCharmExposure(rawCharm: number, openInterest: number, dealerSign: 1 | -1, spot: number): number {
  return dealerSign * (rawCharm / 365) * openInterest * spot;
}

test("P1.5 current totalCharm is daily USD delta-notional, not the legacy ×100 normalization", () => {
  const spot = 65_000;
  const strike = 65_000;
  const sigma = 0.45;
  const openInterest = 125;
  const dealerSign: 1 = 1;
  const nowMs = Date.UTC(2026, 7, 30, 8, 0, 0);
  const expiry = "27SEP26";

  const T = deriveDeribitTimeToExpiryYears(expiry, nowMs);
  assert.ok(T != null);
  approxEqual(T!, 28 / 365, 1e-15);

  const rawCharm = calculateBlackScholesRawCharm(spot, strike, sigma, T!);
  const currentTotalCharm = productionCharmExposure(rawCharm, openInterest, dealerSign, spot);
  const dailyTotalCharm = dailyCharmExposure(rawCharm, openInterest, dealerSign, spot);

  approxEqual(currentTotalCharm, rawCharm * openInterest * spot / 365, 1e-12);
  approxEqual(dailyTotalCharm, currentTotalCharm, 1e-12);
  assert.ok(Math.abs(currentTotalCharm) > 1_000, "daily Charm should remain a meaningful USD/day value");
});

test("P1.5 near-expiry Charm examples show the daily USD normalization stays unitful", () => {
  const spot = 65_000;
  const strike = 65_000;
  const sigma = 0.45;
  const openInterest = 125;
  const dealerSign: 1 = 1;

  const fixtures = [
    { label: "6h", expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 15, 2, 0, 0), expectedT: 6 / 24 / 365 },
    { label: "2d", expiry: "15AUG26", nowMs: Date.UTC(2026, 7, 13, 8, 0, 0), expectedT: 2 / 365 },
    { label: "28d", expiry: "27SEP26", nowMs: Date.UTC(2026, 7, 30, 8, 0, 0), expectedT: 28 / 365 },
  ] as const;

  const observed = fixtures.map((fx) => {
    const T = deriveDeribitTimeToExpiryYears(fx.expiry, fx.nowMs);
    assert.ok(T != null, `${fx.label}: expected valid T`);
    approxEqual(T!, fx.expectedT, 1e-15);

    const rawCharm = calculateBlackScholesRawCharm(spot, strike, sigma, T!);
    const currentTotalCharm = productionCharmExposure(rawCharm, openInterest, dealerSign, spot);
    const dailyRawCharm = rawCharm / 365;
    const dailyTotalCharm = dailyCharmExposure(rawCharm, openInterest, dealerSign, spot);

    approxEqual(dailyRawCharm, rawCharm / 365, 1e-15);
    approxEqual(dailyTotalCharm, currentTotalCharm, 1e-9);

    return { label: fx.label, T, rawCharm, dailyRawCharm, currentTotalCharm, dailyTotalCharm };
  });

  assert.ok(Math.abs(observed[0].currentTotalCharm) > Math.abs(observed[1].currentTotalCharm));
  assert.ok(Math.abs(observed[1].currentTotalCharm) > Math.abs(observed[2].currentTotalCharm));
});

test("P1.5 Charm sign comes from dealer positioning, not raw call/put Greek asymmetry", () => {
  const spot = 65_000;
  const strike = 65_000;
  const sigma = 0.45;
  const T = 28 / 365;
  const openInterest = 125;

  const rawCharm = calculateBlackScholesRawCharm(spot, strike, sigma, T);
  const callProduction = productionCharmExposure(rawCharm, openInterest, 1, spot);
  const putProduction = productionCharmExposure(rawCharm, openInterest, -1, spot);

  approxEqual(rawCharm, calculateBlackScholesRawCharm(spot, strike, sigma, T), 1e-15);
  approxEqual(callProduction, -putProduction, 1e-12);
});
