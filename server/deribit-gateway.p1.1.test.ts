// @ts-nocheck

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { deriveDeribitTimeToExpiryYears } from "./deribit-gateway";

const YEAR_MS = 365 * 24 * 60 * 60 * 1000;

function legacyTimeToExpiryYears(expiry: string): number {
  const dteMatch = expiry.match(/(\d+)/);
  const roughDte = dteMatch ? Math.max(1, parseInt(dteMatch[0], 10)) : 30;
  return roughDte / 365;
}

function computeVannaCharm(spot: number, strike: number, optionType: "call" | "put", openInterest: number, iv: number, timeToExpiryYears: number) {
  const moneyness = Math.log(spot / strike);
  const sigma = iv > 0 ? iv : 0.5;
  const sqrtT = Math.sqrt(timeToExpiryYears);
  const d1 = (moneyness + 0.5 * sigma * sigma * timeToExpiryYears) / (sigma * sqrtT);
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  const dealerSign = optionType === "call" ? 1 : -1;
  const dVannaDvol = d1 * nd1 / sigma;
  const vannaExposure = dealerSign * dVannaDvol * openInterest * spot * 0.01;
  const charmVal = -nd1 * (2 * 0.02 * timeToExpiryYears - d1 * sigma * sqrtT) / (2 * timeToExpiryYears * sigma * sqrtT);
  const charmExposure = dealerSign * charmVal * openInterest * spot / 365;
  return { d1, vannaExposure, charmExposure };
}

test("P1.1 derives actual remaining time-to-expiry from Deribit expiry timestamp", () => {
  const now1 = Date.UTC(2026, 7, 13, 8, 0, 0);
  const now2 = Date.UTC(2026, 7, 30, 8, 0, 0);

  assert.ok(Math.abs(deriveDeribitTimeToExpiryYears("15AUG26", now1) - (2 / 365)) < 1e-12);
  assert.ok(Math.abs(deriveDeribitTimeToExpiryYears("30AUG26", now1) - (17 / 365)) < 1e-12);
  assert.ok(Math.abs(deriveDeribitTimeToExpiryYears("27SEP26", now2) - (28 / 365)) < 1e-12);
});

test("P1.1 time-to-expiry stays non-negative and numerically safe near expiry", () => {
  const nearExpiryNow = Date.UTC(2026, 7, 15, 7, 59, 59);
  const t = deriveDeribitTimeToExpiryYears("15AUG26", nearExpiryNow);

  assert.ok(t !== null);
  assert.ok(Number.isFinite(t));
  assert.ok(t >= 0);
  assert.ok(t < (2 / 365));
});

test("P1.1 corrected time-to-expiry changes Vanna / Charm impact without using day-of-month as DTE", () => {
  const spot = 65000;
  const strike = 65000;
  const openInterest = 100;
  const iv = 0.5;

  const nearNow = Date.UTC(2026, 7, 13, 8, 0, 0);
  const nearExpiry = "15AUG26";
  const nearLegacyT = legacyTimeToExpiryYears(nearExpiry);
  const nearActualT = deriveDeribitTimeToExpiryYears(nearExpiry, nearNow)!;
  const nearLegacy = computeVannaCharm(spot, strike, "call", openInterest, iv, nearLegacyT);
  const nearActual = computeVannaCharm(spot, strike, "call", openInterest, iv, nearActualT);

  assert.equal(nearLegacyT, 15 / 365);
  assert.equal(nearActualT, 2 / 365);
  assert.notEqual(nearLegacy.vannaExposure, nearActual.vannaExposure);
  assert.notEqual(nearLegacy.charmExposure, nearActual.charmExposure);

  const farNow = Date.UTC(2026, 7, 30, 8, 0, 0);
  const farExpiry = "27SEP26";
  const farLegacyT = legacyTimeToExpiryYears(farExpiry);
  const farActualT = deriveDeribitTimeToExpiryYears(farExpiry, farNow)!;
  const farLegacy = computeVannaCharm(spot, strike, "put", openInterest, iv, farLegacyT);
  const farActual = computeVannaCharm(spot, strike, "put", openInterest, iv, farActualT);

  assert.equal(farLegacyT, 27 / 365);
  assert.equal(farActualT, 28 / 365);
  assert.notEqual(farLegacy.vannaExposure, farActual.vannaExposure);
  assert.notEqual(farLegacy.charmExposure, farActual.charmExposure);

  assert.ok(Math.abs(nearActualT * YEAR_MS - 2 * 24 * 60 * 60 * 1000) < 1e-6);
  assert.ok(Math.abs(farActualT * YEAR_MS - 28 * 24 * 60 * 60 * 1000) < 1e-6);
});
