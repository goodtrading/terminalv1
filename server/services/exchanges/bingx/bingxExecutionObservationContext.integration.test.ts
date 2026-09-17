import assert from "node:assert/strict";
import test from "node:test";
import { pool } from "../../../db";
import { insertBingXBboEvent, findLatestBingXBboObservedAtOrBefore } from "./bingxBboHistoryRepository";
import type { BingXBookTickerBboEvent } from "./bingxBookTicker";

const event = (observedAt: string, source: number): BingXBookTickerBboEvent => ({ canonicalMarket: { venue: "BINGX", marketType: "Perpetual", symbol: "BTC-USDT" }, venue: "BINGX", product: "Perpetual", nativeSymbol: "BTC-USDT", marketSource: "BINGX_BOOK_TICKER", marketSourceTimestampMs: source, observedAt: new Date(observedAt), bestBid: "1.000000000000000001", bestAsk: "2.000000000000000002", bestBidQuantity: "0.000000000000000123", bestAskQuantity: "3.000000000000000456", providerSequence: null, sourceAgeAtObservationMs: 0, sourceAgeDiagnostic: null, provenance: { source: "BINGX_PUBLIC_WS", endpoint: "wss://open-api-swap.bingx.com/swap-market", subscription: "BTC-USDT@bookTicker" } });

test("observed-at repository lookup is durable, deterministic, and indexed", { skip: !pool, timeout: 120000 }, async () => {
  const index = await pool!.query("SELECT to_regclass('goodtrading_market_bbo_observed_lookup_idx') AS name");
  assert.equal(index.rows[0].name, "goodtrading_market_bbo_observed_lookup_idx");
  const rows = await Promise.all([event("2026-01-01T00:00:01.000Z", 3000), event("2026-01-01T00:00:05.000Z", 1000), event("2026-01-01T00:00:03.000Z", 2000), event("2026-01-01T00:00:05.000Z", 4000)].map(insertBingXBboEvent));
  try {
    const selected = await findLatestBingXBboObservedAtOrBefore(new Date("2026-01-01T00:00:05.000Z"));
    assert.equal(selected?.marketSourceTimestampMs, 4000);
    assert.equal(selected?.bestBid, "1.000000000000000001");
    assert.equal(selected?.bestAskQuantity, "3.000000000000000456");
    const futureOnly = await findLatestBingXBboObservedAtOrBefore(new Date("2025-12-31T23:59:59.000Z"));
    assert.equal(futureOnly, null);
    const plan = await pool!.query(`EXPLAIN SELECT id FROM goodtrading_market_bbo_events WHERE venue='BINGX' AND market_type='Perpetual' AND native_symbol='BTC-USDT' AND observed_at <= $1 ORDER BY observed_at DESC, market_source_timestamp_ms DESC, id DESC LIMIT 1`, [new Date("2026-01-01T00:00:05.000Z")]);
    assert.match(plan.rows.map(r => String(r["QUERY PLAN"])).join("\n"), /goodtrading_market_bbo_observed_lookup_idx|Index Scan/);
  } finally {
    await pool!.query("DELETE FROM goodtrading_market_bbo_events WHERE id = ANY($1::text[])", [rows.map(row => row.id)]);
  }
});
