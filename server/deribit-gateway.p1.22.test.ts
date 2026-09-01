// @ts-nocheck

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DeribitOptionsGateway } from "./deribit-gateway";

const DERIBIT_URL = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option";
const SPOT = 65000;
const NOW_MS = Date.UTC(2026, 7, 30, 8, 0, 0);
const CONTRACT_SIZE = 1;
const EXPIRY_MS = Date.UTC(2026, 8, 27, 8, 0, 0);
const IV = 0.5;

function gexUnitFactor(strike: number): number {
  const T = (EXPIRY_MS - NOW_MS) / (365 * 24 * 60 * 60 * 1000);
  const sigma = IV;
  const moneyness = Math.log(SPOT / strike);
  const sqrtT = Math.sqrt(T);
  const d1 = (moneyness + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return (nd1 / (sigma * sqrtT)) * CONTRACT_SIZE;
}

function oiForTargetGex(strike: number, targetGex: number): number {
  return targetGex / gexUnitFactor(strike);
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    instrument_name: "BTC-27SEP26-65000-C",
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

function byStrike(summary: any) {
  return new Map((summary.gammaWallStrength ?? []).map((row: any) => [row.strike, row.strengthScore] as const));
}

function withinUnitInterval(value: number) {
  return Number.isFinite(value) && value >= 0 && value <= 1;
}

test("P1.22 gamma wall strength is a net strike GEX share and stays within [0,1]", async () => {
  const targetGex = 1000;
  const oi65000 = oiForTargetGex(65000, targetGex);
  const oi66000 = oiForTargetGex(66000, targetGex);

  const { summary, calls } = await runRealIngest([
    makeRow({ instrument_name: "BTC-27SEP26-65000-C", strike: 65000, open_interest: oi65000, mark_iv: 50, option_type: undefined }),
    makeRow({ instrument_name: "BTC-27SEP26-66000-C", strike: 66000, open_interest: oi66000, mark_iv: 50, option_type: undefined }),
  ], NOW_MS);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DERIBIT_URL);

  const wallScores = byStrike(summary);
  assert.equal(wallScores.size >= 2, true);
  assert.ok(withinUnitInterval(wallScores.get(65000) ?? -1));
  assert.ok(withinUnitInterval(wallScores.get(66000) ?? -1));
  assert.ok(Math.abs((wallScores.get(65000) ?? 0) - 0.5) < 1e-12);
  assert.ok(Math.abs((wallScores.get(66000) ?? 0) - 0.5) < 1e-12);
  assert.equal(summary.gammaWallStrength.every((row: any) => withinUnitInterval(row.strengthScore)), true);
});

test("P1.22 gamma wall strength survives uniform OI scaling and strike cancellation uses net exposure", async () => {
  const targetGex = 1000;
  const baseRows = [
    makeRow({ instrument_name: "BTC-27SEP26-65000-C", strike: 65000, open_interest: oiForTargetGex(65000, targetGex), mark_iv: 50, option_type: undefined }),
    makeRow({ instrument_name: "BTC-27SEP26-66000-C", strike: 66000, open_interest: oiForTargetGex(66000, targetGex), mark_iv: 50, option_type: undefined }),
    makeRow({ instrument_name: "BTC-27SEP26-67000-C", strike: 67000, open_interest: oiForTargetGex(67000, targetGex / 2), mark_iv: 50, option_type: undefined }),
    makeRow({ instrument_name: "BTC-27SEP26-67000-P", strike: 67000, open_interest: oiForTargetGex(67000, targetGex / 2), mark_iv: 50, option_type: undefined }),
  ];
  const scaledRows = baseRows.map((row) => ({ ...row, open_interest: Number(row.open_interest) * 2 }));

  const base = await runRealIngest(baseRows, NOW_MS);
  const scaled = await runRealIngest(scaledRows, NOW_MS);

  const baseScores = byStrike(base.summary);
  const scaledScores = byStrike(scaled.summary);

  assert.ok(Math.abs((baseScores.get(65000) ?? 0) - (scaledScores.get(65000) ?? 0)) < 1e-12);
  assert.ok(Math.abs((baseScores.get(66000) ?? 0) - (scaledScores.get(66000) ?? 0)) < 1e-12);
  assert.ok(Math.abs((baseScores.get(67000) ?? 0) - 0) < 1e-12);
  assert.ok(Math.abs((scaledScores.get(67000) ?? 0) - 0) < 1e-12);
  assert.ok(Math.abs((baseScores.get(65000) ?? 0) - 0.5) < 1e-12);
  assert.ok(Math.abs((baseScores.get(66000) ?? 0) - 0.5) < 1e-12);
  assert.ok(Math.abs((scaledScores.get(65000) ?? 0) - 0.5) < 1e-12);
  assert.ok(Math.abs((scaledScores.get(66000) ?? 0) - 0.5) < 1e-12);
  assert.equal(base.summary.gammaWallStrength.every((row: any) => withinUnitInterval(row.strengthScore)), true);
  assert.equal(scaled.summary.gammaWallStrength.every((row: any) => withinUnitInterval(row.strengthScore)), true);
});
