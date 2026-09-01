import { strict as assert } from "node:assert";
import { mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { calculateBlackScholesRawCharm, calculateBlackScholesRawVanna, deriveDeribitTimeToExpiryYears } from "./deribit-gateway";
import { parseDTE, parseOptionsCSV } from "./analytics";

const S = 65_000;
const K = 65_000;
const SIGMA = 0.5;
const CALL = "call" as const;
const NOW_MS = Date.UTC(2026, 7, 13, 8, 0, 0);
const EXPIRY = "15AUG26";
const T = deriveDeribitTimeToExpiryYears(EXPIRY, NOW_MS)!;

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

function phi(x: number): number {
  return Math.exp(-0.5 * x * x) / Math.sqrt(2 * Math.PI);
}

function normCdf(x: number): number {
  return 0.5 * (1 + erf(x / Math.SQRT2));
}

function bsD1(spot: number, strike: number, sigma: number, timeToExpiryYears: number, r: number, q: number): number {
  return (Math.log(spot / strike) + (r - q + 0.5 * sigma * sigma) * timeToExpiryYears) / (sigma * Math.sqrt(timeToExpiryYears));
}

function bsD2(spot: number, strike: number, sigma: number, timeToExpiryYears: number, r: number, q: number): number {
  return bsD1(spot, strike, sigma, timeToExpiryYears, r, q) - sigma * Math.sqrt(timeToExpiryYears);
}

function bsGamma(spot: number, strike: number, sigma: number, timeToExpiryYears: number, r: number, q: number): number {
  const d1 = bsD1(spot, strike, sigma, timeToExpiryYears, r, q);
  return Math.exp(-q * timeToExpiryYears) * phi(d1) / (spot * sigma * Math.sqrt(timeToExpiryYears));
}

function delta(spot: number, strike: number, sigma: number, timeToExpiryYears: number, r: number, q: number, optionType: "call" | "put"): number {
  const d1 = bsD1(spot, strike, sigma, timeToExpiryYears, r, q);
  const discount = Math.exp(-q * timeToExpiryYears);
  return optionType === "call" ? discount * normCdf(d1) : discount * (normCdf(d1) - 1);
}

function bsVanna(spot: number, strike: number, sigma: number, timeToExpiryYears: number, r: number, q: number): number {
  const d1 = bsD1(spot, strike, sigma, timeToExpiryYears, r, q);
  const d2 = bsD2(spot, strike, sigma, timeToExpiryYears, r, q);
  return -Math.exp(-q * timeToExpiryYears) * phi(d1) * d2 / sigma;
}

function bsCharm(spot: number, strike: number, sigma: number, timeToExpiryYears: number, r: number, q: number): number {
  const d1 = bsD1(spot, strike, sigma, timeToExpiryYears, r, q);
  const d2 = bsD2(spot, strike, sigma, timeToExpiryYears, r, q);
  return -Math.exp(-q * timeToExpiryYears) * phi(d1) * (2 * (r - q) * timeToExpiryYears - d2 * sigma * Math.sqrt(timeToExpiryYears)) /
    (2 * timeToExpiryYears * sigma * Math.sqrt(timeToExpiryYears));
}

function finiteDiffGamma(spot: number, strike: number, sigma: number, timeToExpiryYears: number, r: number, q: number): number {
  const h = Math.max(spot * 1e-5, 1e-4);
  return (delta(spot + h, strike, sigma, timeToExpiryYears, r, q, CALL) - delta(spot - h, strike, sigma, timeToExpiryYears, r, q, CALL)) / (2 * h);
}

function finiteDiffVanna(spot: number, strike: number, sigma: number, timeToExpiryYears: number, r: number, q: number): number {
  const h = Math.max(sigma * 1e-5, 1e-6);
  return (delta(spot, strike, sigma + h, timeToExpiryYears, r, q, CALL) - delta(spot, strike, sigma - h, timeToExpiryYears, r, q, CALL)) / (2 * h);
}

function finiteDiffCharm(spot: number, strike: number, sigma: number, timeToExpiryYears: number, r: number, q: number): number {
  const h = Math.min(timeToExpiryYears / 4, 1e-5);
  return (delta(spot, strike, sigma, timeToExpiryYears - h, r, q, CALL) - delta(spot, strike, sigma, timeToExpiryYears + h, r, q, CALL)) / (2 * h);
}

function closeTo(actual: number, expected: number, tol: number, label: string) {
  const diff = Math.abs(actual - expected);
  assert.ok(diff <= tol, `${label}: expected ${expected}, got ${actual} (diff ${diff})`);
}

test("P1.9 common-convention control: Gamma, Vanna, and Charm agree with finite differences", () => {
  const r = 0.02;
  const q = 0;

  const gamma = bsGamma(S, K, SIGMA, T, r, q);
  const vanna = bsVanna(S, K, SIGMA, T, r, q);
  const charm = bsCharm(S, K, SIGMA, T, r, q);

  const fdGamma = finiteDiffGamma(S, K, SIGMA, T, r, q);
  const fdVanna = finiteDiffVanna(S, K, SIGMA, T, r, q);
  const fdCharm = finiteDiffCharm(S, K, SIGMA, T, r, q);

  closeTo(gamma, fdGamma, 1e-8, "Gamma finite-diff control");
  closeTo(vanna, fdVanna, 1e-7, "Vanna finite-diff control");
  closeTo(charm, fdCharm, 1e-5, "Charm finite-diff control");

  console.log(JSON.stringify({
    control: {
      T,
      r,
      q,
      d1: bsD1(S, K, SIGMA, T, r, q),
      d2: bsD2(S, K, SIGMA, T, r, q),
      gamma,
      vanna,
      charm,
      fdGamma,
      fdVanna,
      fdCharm,
    },
  }, null, 2));
});

test("P1.9 live-path audit fixture: production uses actual Deribit settlement time and r=0.02 only for Vanna/Charm", () => {
  const rGamma = 0;
  const rGreeks = 0.02;
  const q = 0;

  const gammaCurrent = bsGamma(S, K, SIGMA, T, rGamma, q);
  const gammaAlt = bsGamma(S, K, SIGMA, T, rGreeks, q);
  const vannaProduction = calculateBlackScholesRawVanna(S, K, SIGMA, T);
  const charmProduction = calculateBlackScholesRawCharm(S, K, SIGMA, T);

  closeTo(vannaProduction, bsVanna(S, K, SIGMA, T, rGreeks, q), 1e-15, "Production Vanna convention");
  closeTo(charmProduction, bsCharm(S, K, SIGMA, T, rGreeks, q), 1e-15, "Production Charm convention");
  assert.notEqual(gammaCurrent, gammaAlt);

  console.log(JSON.stringify({
    currentProductionConvention: {
      T,
      gamma_r0: gammaCurrent,
      gamma_r0p02: gammaAlt,
      vanna_r0p02: vannaProduction,
      charm_r0p02: charmProduction,
      gamma_rel_diff_pct: ((gammaAlt - gammaCurrent) / gammaAlt) * 100,
    },
  }, null, 2));
});

test("P1.9 legacy CSV bootstrap preserves fractional DTE and nullable IV semantics", () => {
  const dir = mkdtempSync(join(tmpdir(), "p1-9-csv-"));
  const file = join(dir, "fixture.csv");
  writeFileSync(
    file,
    [
      "instrument,gamma,open_interest,iv_bid,iv_ask",
      "BTC-15AUG26-65000-C,0.0001,7,,",
    ].join("\n"),
  );

  const nowMs = Date.UTC(2026, 7, 1, 0, 0, 0);
  const parsed = parseOptionsCSV(file, nowMs);
  assert.equal(parsed.length, 1);
  assert.equal(parsed[0]?.expiration, "15AUG26");
  assert.equal(parsed[0]?.dte, parseDTE("15AUG26", nowMs));
  assert.equal(parsed[0]?.implied_volatility, null);

  console.log(JSON.stringify({
    legacyCsvBootstrap: {
      expiration: parsed[0]?.expiration,
      dte: parsed[0]?.dte,
      impliedVolatility: parsed[0]?.implied_volatility,
    },
  }, null, 2));
});
