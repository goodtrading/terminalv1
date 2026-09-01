// @ts-nocheck

import { strict as assert } from "node:assert";
import { test } from "node:test";

import {
  DeribitOptionsGateway,
  computeLiveGreekFields,
  deriveDeribitTimeToExpiryYears,
} from "./deribit-gateway";

const DERIBIT_URL = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option";
const SPOT = 65000;
const STRIKE = 65000;
const SIGMA = 0.5;
const FIXED_NOW_A = Date.UTC(2026, 7, 13, 8, 0, 0);
const FIXED_NOW_C = Date.UTC(2026, 7, 30, 8, 0, 0);

function legacyTimeToExpiryYears(expiry: string): number {
  const dteMatch = expiry.match(/(\d+)/);
  const roughDte = dteMatch ? Math.max(1, parseInt(dteMatch[0], 10)) : 30;
  return roughDte / 365;
}

function gammaHint(spot: number, strike: number, sigma: number, t: number): number {
  const sqrtT = Math.sqrt(t);
  const d1 = (Math.log(spot / strike) + 0.5 * sigma * sigma * t) / (sigma * sqrtT);
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return nd1 / (spot * sigma * sqrtT);
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    instrument_name: "BTC-15AUG26-65000-C",
    open_interest: 100,
    underlying_price: SPOT,
    mark_price: SPOT,
    bid_iv: undefined,
    ask_iv: undefined,
    mark_iv: 50,
    best_bid_price: 100,
    best_ask_price: 110,
    best_bid_amount: 5,
    best_ask_amount: 6,
    ...overrides,
  };
}

function resetLiveCache() {
  (DeribitOptionsGateway as unknown as { liveCache: unknown }).liveCache = null;
}

function installMockFetch(result: Record<string, unknown>[], nowMs: number) {
  const originalFetch = globalThis.fetch;
  const originalDateNow = Date.now;
  const calls: Array<{ url: string; init?: RequestInit }> = [];

  (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = (async (url: string, init?: RequestInit) => {
    calls.push({ url, init });
    return {
      ok: true,
      status: 200,
      statusText: "OK",
      json: async () => ({ result }),
    } as Response;
  }) as typeof fetch;

  (Date as unknown as { now: () => number }).now = () => nowMs;
  resetLiveCache();

  return {
    calls,
    restore() {
      (globalThis as typeof globalThis & { fetch: typeof fetch }).fetch = originalFetch;
      (Date as unknown as { now: () => number }).now = originalDateNow;
      resetLiveCache();
    },
  };
}

async function runRealIngest(result: Record<string, unknown>[], nowMs: number) {
  const mock = installMockFetch(result, nowMs);
  try {
    const ingestion = await DeribitOptionsGateway.ingestOptions();
    const summary: any = await DeribitOptionsGateway.getSummary(ingestion.options, SPOT, ingestion.source);
    return { ingestion, summary, calls: mock.calls };
  } finally {
    mock.restore();
  }
}

function replaceGammaWithLegacy(options: any[]) {
  return options.map(opt => {
    const legacyT = legacyTimeToExpiryYears(opt.expiry);
    const iv = opt.ivMark ?? opt.ivBid ?? opt.ivAsk ?? 0.5;
    return {
      ...opt,
      gammaExposure: gammaHint(SPOT, opt.strike, iv, legacyT) * (opt.openInterest ?? 1),
    };
  });
}

test("P1.11 exact expiry time replaces day-of-month rough DTE in the live raw gamma hint", () => {
  const nearNow = FIXED_NOW_A;
  const farNow = FIXED_NOW_C;

  const near = deriveDeribitTimeToExpiryYears("15AUG26", nearNow);
  const mid = deriveDeribitTimeToExpiryYears("30AUG26", nearNow);
  const far = deriveDeribitTimeToExpiryYears("27SEP26", farNow);

  assert.ok(near != null && Math.abs(near - (2 / 365)) < 1e-12);
  assert.ok(mid != null && Math.abs(mid - (17 / 365)) < 1e-12);
  assert.ok(far != null && Math.abs(far - (28 / 365)) < 1e-12);

  const legacyNear = legacyTimeToExpiryYears("15AUG26");
  const legacyMid = legacyTimeToExpiryYears("30AUG26");
  const legacyFar = legacyTimeToExpiryYears("27SEP26");

  assert.equal(legacyNear, 15 / 365);
  assert.equal(legacyMid, 30 / 365);
  assert.equal(legacyFar, 27 / 365);

  const exactNearGamma = gammaHint(SPOT, STRIKE, SIGMA, near!);
  const exactMidGamma = gammaHint(SPOT, STRIKE, SIGMA, mid!);
  const exactFarGamma = gammaHint(SPOT, STRIKE, SIGMA, far!);

  const legacyNearGamma = gammaHint(SPOT, STRIKE, SIGMA, legacyNear);
  const legacyMidGamma = gammaHint(SPOT, STRIKE, SIGMA, legacyMid);
  const legacyFarGamma = gammaHint(SPOT, STRIKE, SIGMA, legacyFar);

  assert.notEqual(exactNearGamma, legacyNearGamma);
  assert.notEqual(exactMidGamma, legacyMidGamma);
  assert.notEqual(exactFarGamma, legacyFarGamma);
});

test("P1.11 near-expiry live gamma hint stays finite under minimum-T behavior", () => {
  const now = Date.UTC(2026, 7, 15, 7, 59, 59);
  const live = computeLiveGreekFields(SPOT, STRIKE, "call", 100, "15AUG26", now, 50, undefined, undefined);

  assert.ok(live.sigma === 0.5);
  assert.ok(live.gammaExposure != null && Number.isFinite(live.gammaExposure));
  assert.ok(live.vannaExposure != null && Number.isFinite(live.vannaExposure));
  assert.ok(live.charmExposure != null && Number.isFinite(live.charmExposure));
});

test("P1.11 invalid expiry leaves the live gamma hint unavailable", () => {
  const live = computeLiveGreekFields(SPOT, STRIKE, "call", 100, "BAD-EXPIRY", FIXED_NOW_A, 50, undefined, undefined);

  assert.equal(live.gammaExposure, undefined);
  assert.equal(live.vannaExposure, undefined);
  assert.equal(live.charmExposure, undefined);
});

test("P1.11 real ingest uses exact expiry time for gammaExposure and preserves P1.10 IV semantics", async () => {
  const { ingestion, summary, calls } = await runRealIngest([
    makeRow({
      instrument_name: "BTC-15AUG26-65000-C",
      mark_iv: 50,
    }),
  ], FIXED_NOW_A);

  const exactT = deriveDeribitTimeToExpiryYears("15AUG26", FIXED_NOW_A)!;
  const expectedGamma = gammaHint(SPOT, STRIKE, SIGMA, exactT) * 100;

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DERIBIT_URL);
  assert.equal(ingestion.source, "LIVE_DERIBIT");
  assert.equal(ingestion.options.length, 1);
  assert.equal(ingestion.options[0].ivMark, 0.5);
  assert.ok(Math.abs(ingestion.options[0].gammaExposure! - expectedGamma) < 1e-5);
  assert.ok(ingestion.options[0].vannaExposure != null);
  assert.ok(ingestion.options[0].charmExposure != null);
  assert.ok(summary.totalVanna != null);
  assert.ok(summary.totalCharm != null);
});

test("P1.11 real ingest keeps missing IV unavailable even with valid expiry", async () => {
  const { ingestion, summary } = await runRealIngest([
    makeRow({
      instrument_name: "BTC-15AUG26-65000-C",
      mark_iv: undefined,
      bid_iv: undefined,
      ask_iv: undefined,
    }),
  ], FIXED_NOW_A);

  assert.equal(ingestion.options.length, 1);
  assert.equal(ingestion.options[0].gammaExposure, undefined);
  assert.equal(ingestion.options[0].vannaExposure, undefined);
  assert.equal(ingestion.options[0].charmExposure, undefined);
  assert.equal(summary.totalVanna, null);
  assert.equal(summary.totalCharm, null);
});

test("P1.11 real ingest keeps invalid expiry unavailable even with valid IV", async () => {
  const { ingestion, summary } = await runRealIngest([
    makeRow({
      instrument_name: "BTC-BAD-65000-C",
      mark_iv: 50,
    }),
  ], FIXED_NOW_A);

  assert.equal(ingestion.options.length, 1);
  assert.equal(ingestion.options[0].gammaExposure, undefined);
  assert.equal(ingestion.options[0].vannaExposure, undefined);
  assert.equal(ingestion.options[0].charmExposure, undefined);
  assert.equal(summary.totalVanna, null);
  assert.equal(summary.totalCharm, null);
});

test("P1.11 downstream wall/pinning outputs change only through corrected raw gamma hint, while GEX / flip / Vanna / Charm stay frozen", async () => {
  const { ingestion, summary } = await runRealIngest([
    makeRow({
      instrument_name: "BTC-15AUG26-65000-C",
      mark_iv: 50,
    }),
    makeRow({
      instrument_name: "BTC-27SEP26-72000-P",
      mark_iv: 50,
      strike: 72000,
      open_interest: 120,
      option_type: undefined,
    }),
  ], FIXED_NOW_A);

  const legacyOptions = replaceGammaWithLegacy(ingestion.options);
  const legacySummary: any = await DeribitOptionsGateway.getSummary(legacyOptions, SPOT, ingestion.source);

  assert.equal(summary.totalVanna, legacySummary.totalVanna);
  assert.equal(summary.totalCharm, legacySummary.totalCharm);
  assert.notDeepEqual(summary.gammaWallStrength, legacySummary.gammaWallStrength);
  assert.notEqual(summary.pinningStrength, legacySummary.pinningStrength);
  assert.equal(Array.isArray(summary.gammaWallStrength), true);
  assert.equal(summary.pinningStrength > 0, true);
});
