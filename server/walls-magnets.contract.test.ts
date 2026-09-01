// @ts-nocheck

import { strict as assert } from "node:assert";
import { writeFileSync, mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { test } from "node:test";

import { calculateKeyLevels, detectWalls, parseOptionsCSV } from "./analytics";
import { DeribitOptionsGateway } from "./deribit-gateway";

const SPOT = 100000;
const NOW_MS = Date.UTC(2026, 7, 30, 8, 0, 0);
const EXPIRY_MS = Date.UTC(2026, 8, 27, 8, 0, 0);
const IV = 0.5;
const DERIBIT_URL = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option";

function gexUnitFactor(strike: number): number {
  const T = (EXPIRY_MS - NOW_MS) / (365 * 24 * 60 * 60 * 1000);
  const sigma = IV;
  const moneyness = Math.log(SPOT / strike);
  const sqrtT = Math.sqrt(T);
  const d1 = (moneyness + 0.5 * sigma * sigma * T) / (sigma * sqrtT);
  const nd1 = Math.exp(-0.5 * d1 * d1) / Math.sqrt(2 * Math.PI);
  return (nd1 / (sigma * sqrtT)) * 1;
}

function oiForTargetGex(strike: number, targetGex: number): number {
  return targetGex / gexUnitFactor(strike);
}

function writeCsv(rows: string[]): string {
  const dir = mkdtempSync(join(tmpdir(), "walls-magnets-contract-"));
  const file = join(dir, "fixture.csv");
  writeFileSync(file, ["instrument,gamma,open_interest,iv_bid,iv_ask", ...rows].join("\n"), "utf8");
  return file;
}

function resetLiveCache() {
  (DeribitOptionsGateway as unknown as { liveCache: unknown }).liveCache = null;
}

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    instrument_name: "BTC-27SEP26-100000-C",
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

function positiveBootstrapRows() {
  return [
    "BTC-27SEP26-98000-C,0.000010,100,50,50",
    "BTC-27SEP26-100000-C,0.000020,100,50,50",
    "BTC-27SEP26-102000-C,0.000015,100,50,50",
    "BTC-27SEP26-104000-C,0.000012,100,50,50",
    "BTC-27SEP26-106000-C,0.000011,100,50,50",
  ];
}

test("bootstrap gammaMagnets remain unavailable even when bootstrap BS GEX is positive", () => {
  const data = parseOptionsCSV(writeCsv([
    "BTC-27SEP26-98000-C,-0.000030,100,50,50",
    "BTC-27SEP26-100000-C,0.000020,100,50,50",
    "BTC-27SEP26-102000-C,0.000040,100,50,50",
    "BTC-27SEP26-104000-C,0.000010,100,50,50",
  ]), NOW_MS);

  const levels = calculateKeyLevels(data, SPOT);
  assert.deepEqual(levels.gammaMagnets, []);
});

test("bootstrap gammaMagnets are empty when all strikes are negative or zero", () => {
  const allNegative = calculateKeyLevels(parseOptionsCSV(writeCsv([
    "BTC-27SEP26-98000-C,-0.000030,100,50,50",
    "BTC-27SEP26-100000-C,-0.000020,100,50,50",
  ]), NOW_MS), SPOT);
  const allZero = calculateKeyLevels(parseOptionsCSV(writeCsv([
    "BTC-27SEP26-98000-C,0,100,50,50",
    "BTC-27SEP26-100000-C,0,100,50,50",
  ]), NOW_MS), SPOT);

  assert.deepEqual(allNegative.gammaMagnets, []);
  assert.deepEqual(allZero.gammaMagnets, []);
});

test("bootstrap gammaMagnets stay unavailable for all-positive equal GEX fixtures", () => {
  const data = parseOptionsCSV(writeCsv([
    "BTC-27SEP26-99000-C,0.00000025,1000,50,50",
    "BTC-27SEP26-101000-C,0.00000025,1000,50,50",
    "BTC-27SEP26-102000-C,0.00000025,1000,50,50",
    "BTC-27SEP26-103000-C,0.00000025,1000,50,50",
  ]), NOW_MS);

  const permuted = parseOptionsCSV(writeCsv([
    "BTC-27SEP26-103000-C,0.00000025,1000,50,50",
    "BTC-27SEP26-102000-C,0.00000025,1000,50,50",
    "BTC-27SEP26-101000-C,0.00000025,1000,50,50",
    "BTC-27SEP26-99000-C,0.00000025,1000,50,50",
  ]), NOW_MS);

  const levelsA = calculateKeyLevels(data, SPOT);
  const levelsB = calculateKeyLevels(permuted, SPOT);

  assert.deepEqual(levelsA.gammaMagnets, []);
  assert.deepEqual(levelsB.gammaMagnets, []);
});

test("live gammaMagnets stay positive-only and deterministic across permutations", async () => {
  const rowsA = [
    makeRow({ instrument_name: "BTC-27SEP26-99000-C", strike: 99000, open_interest: oiForTargetGex(99000, 2500), mark_iv: 50 }),
    makeRow({ instrument_name: "BTC-27SEP26-101000-C", strike: 101000, open_interest: oiForTargetGex(101000, 2500), mark_iv: 50 }),
    makeRow({ instrument_name: "BTC-27SEP26-102000-C", strike: 102000, open_interest: oiForTargetGex(102000, 1200), mark_iv: 50 }),
    makeRow({ instrument_name: "BTC-27SEP26-98000-C", strike: 98000, open_interest: oiForTargetGex(98000, -4000), mark_iv: 50 }),
  ];
  const rowsB = [...rowsA].reverse();

  const a = await runRealIngest(rowsA, NOW_MS);
  const b = await runRealIngest(rowsB, NOW_MS);

  assert.equal(a.calls.length, 1);
  assert.equal(a.calls[0].url, DERIBIT_URL);
  assert.deepEqual(a.summary.gammaMagnets, b.summary.gammaMagnets);
  assert.equal(a.summary.gammaMagnets.includes(98000), false);
  assert.equal(b.summary.gammaMagnets.includes(98000), false);
  assert.equal(a.summary.gammaMagnets.every((strike: number) => strike > 0), true);
});

test("wall selection is deterministic on equal OI ties and stable under permutations", () => {
  const rows = [
    { option_type: "CALL", open_interest: 100, strike: 99000, gamma: 1 },
    { option_type: "CALL", open_interest: 100, strike: 101000, gamma: 1 },
    { option_type: "PUT", open_interest: 120, strike: 99000, gamma: 1 },
    { option_type: "PUT", open_interest: 120, strike: 101000, gamma: 1 },
  ];
  const asc = detectWalls(rows as any, SPOT);
  const desc = detectWalls([...rows].reverse() as any, SPOT);
  const shuffled = detectWalls([rows[2], rows[0], rows[3], rows[1]] as any, SPOT);

  assert.deepEqual(asc, { callWall: 99000, putWall: 99000, oiConcentration: 99000, dealerPivot: 100000 });
  assert.deepEqual(desc, asc);
  assert.deepEqual(shuffled, asc);
});

test("live wall selection breaks equal OI ties by spot distance then lower strike", async () => {
  const rowsA = [
    makeRow({ instrument_name: "BTC-27SEP26-99000-C", strike: 99000, open_interest: 150, mark_iv: 50 }),
    makeRow({ instrument_name: "BTC-27SEP26-101000-C", strike: 101000, open_interest: 150, mark_iv: 50 }),
    makeRow({ instrument_name: "BTC-27SEP26-99000-P", strike: 99000, open_interest: 150, mark_iv: 50 }),
    makeRow({ instrument_name: "BTC-27SEP26-101000-P", strike: 101000, open_interest: 150, mark_iv: 50 }),
  ];
  const rowsB = [...rowsA].reverse();

  const a = await runRealIngest(rowsA, NOW_MS);
  const b = await runRealIngest(rowsB, NOW_MS);

  assert.equal(a.summary.callWall, 99000);
  assert.equal(a.summary.putWall, 99000);
  assert.equal(b.summary.callWall, 99000);
  assert.equal(b.summary.putWall, 99000);
});

test("bootstrap and live source transitions do not leak gammaMagnets across contracts", async () => {
  const live = await runRealIngest([
    makeRow({ instrument_name: "BTC-27SEP26-99000-C", strike: 99000, open_interest: oiForTargetGex(99000, 2500), mark_iv: 50 }),
    makeRow({ instrument_name: "BTC-27SEP26-101000-C", strike: 101000, open_interest: oiForTargetGex(101000, 2500), mark_iv: 50 }),
  ], NOW_MS);

  const bootstrapNegative = calculateKeyLevels(parseOptionsCSV(writeCsv([
    "BTC-27SEP26-99000-C,-0.000020,100,50,50",
    "BTC-27SEP26-101000-C,-0.000030,100,50,50",
  ]), NOW_MS), SPOT);

  const bootstrapZero = calculateKeyLevels(parseOptionsCSV(writeCsv([
    "BTC-27SEP26-99000-C,0,100,50,50",
    "BTC-27SEP26-101000-C,0,100,50,50",
  ]), NOW_MS), SPOT);

  assert.equal(live.summary.gammaMagnets.includes(98000), false);
  assert.equal(live.summary.gammaMagnets.every((strike: number) => strike > 0), true);
  assert.deepEqual(bootstrapNegative.gammaMagnets, []);
  assert.deepEqual(bootstrapZero.gammaMagnets, []);
});
