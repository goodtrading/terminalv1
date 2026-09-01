import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DeribitOptionsGateway } from "./deribit-gateway";

const DERIBIT_URL = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option";
const FIXED_NOW = Date.UTC(2026, 7, 13, 8, 0, 0);
const SPOT = 65000;

type DeribitRow = Record<string, unknown>;

function resetLiveCache() {
  (DeribitOptionsGateway as unknown as { liveCache: unknown }).liveCache = null;
}

function makeRow(overrides: Partial<DeribitRow> = {}): DeribitRow {
  return {
    instrument_name: "BTC-31DEC26-65000-C",
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

function installMockFetch(result: DeribitRow[]) {
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

  (Date as unknown as { now: () => number }).now = () => FIXED_NOW;
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

async function runRealIngest(result: DeribitRow[]) {
  const mock = installMockFetch(result);
  try {
    const ingestion = await DeribitOptionsGateway.ingestOptions();
    const summary: any = await DeribitOptionsGateway.getSummary(ingestion.options, SPOT, ingestion.source);
    return { ingestion, summary, calls: mock.calls };
  } finally {
    mock.restore();
  }
}

test("P1.10.1 live ingest executes the real public ingest path and preserves valid-IV semantics", async () => {
  const { ingestion, summary, calls } = await runRealIngest([
    makeRow({
      instrument_name: "BTC-31DEC26-65000-C",
      mark_iv: 50,
      bid_iv: undefined,
      ask_iv: undefined,
    }),
  ]);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DERIBIT_URL);
  assert.equal(ingestion.source, "LIVE_DERIBIT");
  assert.equal(ingestion.options.length, 1);
  assert.equal(ingestion.options[0].ivMark, 0.5);
  assert.ok(ingestion.options[0].gammaExposure != null);
  assert.ok(ingestion.options[0].vannaExposure != null);
  assert.ok(ingestion.options[0].charmExposure != null);
  assert.ok(summary.totalVanna != null);
  assert.ok(summary.totalCharm != null);
});

test("P1.10.1 live ingest leaves missing/null/zero/malformed IV unavailable", async () => {
  const cases = [
    ["missing", makeRow({ mark_iv: undefined, bid_iv: undefined, ask_iv: undefined })],
    ["null", makeRow({ mark_iv: null, bid_iv: undefined, ask_iv: undefined })],
    ["zero", makeRow({ mark_iv: 0, bid_iv: undefined, ask_iv: undefined })],
    ["malformed", makeRow({ mark_iv: "bad", bid_iv: undefined, ask_iv: undefined })],
  ] as const;

  for (const [label, row] of cases) {
    const { ingestion, summary } = await runRealIngest([row]);
    assert.equal(ingestion.source, "LIVE_DERIBIT", `${label}: ingestion source`);
    assert.equal(ingestion.options.length, 1, `${label}: parsed option count`);
    assert.equal(ingestion.options[0].gammaExposure, undefined, `${label}: gammaExposure`);
    assert.equal(ingestion.options[0].vannaExposure, undefined, `${label}: vannaExposure`);
    assert.equal(ingestion.options[0].charmExposure, undefined, `${label}: charmExposure`);
    assert.equal(summary.totalVanna, null, `${label}: totalVanna`);
    assert.equal(summary.totalCharm, null, `${label}: totalCharm`);
  }
});

test("P1.10.1 live ingest accepts bid/ask-only IV evidence and averages it in production", async () => {
  const bidAskOnly = await runRealIngest([
    makeRow({
      instrument_name: "BTC-31DEC26-65000-C",
      mark_iv: undefined,
      bid_iv: 50,
      ask_iv: 60,
    }),
  ]);

  assert.equal(bidAskOnly.ingestion.source, "LIVE_DERIBIT");
  assert.equal(bidAskOnly.ingestion.options[0].ivBid, 0.5);
  assert.equal(bidAskOnly.ingestion.options[0].ivAsk, 0.6);
  assert.equal(bidAskOnly.ingestion.options[0].ivMark, undefined);
  assert.equal(bidAskOnly.ingestion.options[0].gammaExposure != null, true);
  assert.equal(bidAskOnly.ingestion.options[0].vannaExposure != null, true);
  assert.equal(bidAskOnly.ingestion.options[0].charmExposure != null, true);
  assert.equal(bidAskOnly.summary.totalVanna != null, true);
  assert.equal(bidAskOnly.summary.totalCharm != null, true);
});

test("P1.10.1 mixed live universe keeps the missing-IV row from contaminating summary totals", async () => {
  const validOnly = await runRealIngest([
    makeRow({
      instrument_name: "BTC-31DEC26-65000-C",
      mark_iv: 50,
      bid_iv: undefined,
      ask_iv: undefined,
    }),
  ]);

  const mixed = await runRealIngest([
    makeRow({
      instrument_name: "BTC-31DEC26-65000-C",
      mark_iv: 50,
      bid_iv: undefined,
      ask_iv: undefined,
    }),
    makeRow({
      instrument_name: "BTC-31DEC26-72000-P",
      mark_iv: undefined,
      bid_iv: undefined,
      ask_iv: undefined,
      open_interest: 1,
    }),
  ]);

  assert.equal(mixed.ingestion.source, "LIVE_DERIBIT");
  assert.equal(mixed.ingestion.options.length, 2);
  assert.equal(mixed.ingestion.options[1].gammaExposure, undefined);
  assert.equal(mixed.ingestion.options[1].vannaExposure, undefined);
  assert.equal(mixed.ingestion.options[1].charmExposure, undefined);
  assert.equal(mixed.summary.totalVanna, validOnly.summary.totalVanna);
  assert.equal(mixed.summary.totalCharm, validOnly.summary.totalCharm);
});
