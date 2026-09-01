// @ts-nocheck

import { strict as assert } from "node:assert";
import { test } from "node:test";

import { DeribitOptionsGateway } from "./deribit-gateway";

const DERIBIT_URL = "https://www.deribit.com/api/v2/public/get_book_summary_by_currency?currency=BTC&kind=option";
const SPOT = 65_000;
const NOW_MS = Date.UTC(2026, 7, 30, 8, 0, 0);

function makeRow(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    instrument_name: "BTC-27SEP26-65000-P",
    open_interest: 2_000_000,
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

test("P1.21 live short gamma pocket still appears from signed negative GEX rows", async () => {
  const { ingestion, summary, calls } = await runRealIngest([
    makeRow({
      instrument_name: "BTC-27SEP26-65000-P",
      open_interest: 2_000_000,
      mark_iv: 50,
    }),
    makeRow({
      instrument_name: "BTC-27SEP26-66000-C",
      option_type: "call",
      open_interest: 100_000,
      mark_iv: 50,
      strike: 66_000,
    }),
  ], NOW_MS);

  assert.equal(calls.length, 1);
  assert.equal(calls[0].url, DERIBIT_URL);
  assert.equal(ingestion.source, "LIVE_DERIBIT");
  assert.equal(summary.source, "LIVE_DERIBIT");
  assert.equal(summary.gammaState, "SHORT GAMMA");
  assert.ok(summary.totalGex < 0);
  assert.ok(Array.isArray(summary.shortGammaPockets));
  assert.ok((summary.shortGammaPockets?.length ?? 0) > 0);
  assert.equal(summary.shortGammaPockets[0].start, summary.shortGammaPockets[0].end);
});
