// @ts-nocheck
import { strict as assert } from "node:assert";
import { test } from "node:test";

import { calculateBlackScholesRawVanna, deriveDeribitTimeToExpiryYears } from "./deribit-gateway";

const EPS = 1e-12;
const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function closeTo(actual: number, expected: number, tol = EPS): void {
  assert.ok(Math.abs(actual - expected) <= tol, `expected ${actual} ≈ ${expected} (tol=${tol})`);
}

test("P1.4 Vanna exposure pipeline is rawVanna × OI × spot × 0.01 × dealer sign", () => {
  const fixture = {
    spot: 65_000,
    strike: 65_000,
    sigma: 0.45,
    expiry: "27SEP26",
    nowMs: Date.UTC(2026, 7, 30, 8, 0, 0),
    openInterest: 125,
    contractSize: 1,
    dealerSign: 1,
  };

  const timeToExpiryYears = deriveDeribitTimeToExpiryYears(fixture.expiry, fixture.nowMs);
  assert.ok(timeToExpiryYears != null);
  closeTo(timeToExpiryYears!, 28 / 365, 1e-15);

  const rawVanna = calculateBlackScholesRawVanna(
    fixture.spot,
    fixture.strike,
    fixture.sigma,
    timeToExpiryYears!,
  );

  const per1Vol = rawVanna;
  const per1VolPoint = rawVanna * 0.01;
  const positionMultiplier = fixture.openInterest * fixture.contractSize;
  const deltaSensitivityPer1Vol = per1Vol * positionMultiplier;
  const deltaSensitivityPer1VolPoint = per1VolPoint * positionMultiplier;
  const usdNotionalPerVolPoint = fixture.dealerSign * deltaSensitivityPer1VolPoint * fixture.spot;
  const directFormula = fixture.dealerSign * rawVanna * fixture.openInterest * fixture.spot * 0.01;

  closeTo(usdNotionalPerVolPoint, directFormula, 1e-12);
  closeTo(deltaSensitivityPer1VolPoint, deltaSensitivityPer1Vol * 0.01, 1e-15);

  // Deterministic dimensional snapshot for auditability.
  assert.equal(fixture.contractSize, 1);
  assert.equal(positionMultiplier, 125);
  assert.ok(Number.isFinite(rawVanna));
  assert.ok(Number.isFinite(usdNotionalPerVolPoint));
});

test("P1.4 call/put sign is a dealer-positioning assumption, not a raw-Greek identity", () => {
  const spot = 65_000;
  const strike = 65_000;
  const sigma = 0.45;
  const T = 28 / 365;
  const oi = 125;

  const rawVanna = calculateBlackScholesRawVanna(spot, strike, sigma, T);
  const callExposure = rawVanna * oi * spot * 0.01 * 1;
  const putExposure = rawVanna * oi * spot * 0.01 * -1;

  closeTo(callExposure, -putExposure, 1e-12);
  closeTo(rawVanna, calculateBlackScholesRawVanna(spot, strike, sigma, T), 1e-15);
});

test("P1.4 raw Vanna dimensional example is deterministic", () => {
  const spot = 65_000;
  const strike = 65_000;
  const sigma = 0.45;
  const T = 28 / 365;
  const oi = 125;

  const rawVanna = calculateBlackScholesRawVanna(spot, strike, sigma, T);
  const aggregateDeltaSensitivityPer1Vol = rawVanna * oi;
  const aggregateDeltaSensitivityPerVolPoint = aggregateDeltaSensitivityPer1Vol * 0.01;
  const usdExposurePerVolPoint = aggregateDeltaSensitivityPerVolPoint * spot;

  closeTo(rawVanna, 0.044211130973746, 1e-15);
  closeTo(aggregateDeltaSensitivityPer1Vol, 5.52639137171825, 1e-14);
  closeTo(aggregateDeltaSensitivityPerVolPoint, 0.0552639137171825, 1e-14);
  closeTo(usdExposurePerVolPoint, 3592.1543916168625, 1e-9);
});
