import assert from "node:assert/strict";
import test from "node:test";
import type { DurableBingXBboEvent } from "./bingxBboHistory";
import { resolveBingXObservedAtOrBefore, type DurableExecutionObservation } from "./bingxExecutionObservationContext";

const bbo = (id: string, observedAt: string, sourceTimestamp = 1_700_000_000_000): DurableBingXBboEvent => ({
  id,
  canonicalMarket: { venue: "BINGX", marketType: "Perpetual", symbol: "BTC-USDT" },
  venue: "BINGX", product: "Perpetual", nativeSymbol: "BTC-USDT", marketSource: "BINGX_BOOK_TICKER",
  marketSourceTimestampMs: sourceTimestamp, observedAt: new Date(observedAt), sourceAgeAtObservationMs: 0,
  sourceAgeDiagnostic: null, bestBid: "65000.000000000000001", bestAsk: "65001.000000000000002",
  bestBidQuantity: "0.000000000000000123", bestAskQuantity: "2.000000000000000456", providerSequence: "99",
  provenance: { source: "BINGX_PUBLIC_WS", endpoint: "wss://open-api-swap.bingx.com/swap-market", subscription: "BTC-USDT@bookTicker" },
});
const execution = (executionId: string, observedAt: string, overrides: Partial<DurableExecutionObservation> = {}): DurableExecutionObservation => ({
  executionId, symbol: "BTC-USDT", observedAt: new Date(observedAt), side: "BUY", quantity: "1", price: "65000", classification: "BROKER_OBSERVED_ONLY", ...overrides,
});
const resolve = (observations: DurableExecutionObservation[], events: DurableBingXBboEvent[]) => resolveBingXObservedAtOrBefore({ executionId: observations[0]?.executionId ?? "missing", observations, bboEvents: events });

test("selects the latest BBO observed at or before earliest execution knowledge", () => {
  const result = resolve([execution("x", "2026-01-01T00:00:05.000Z"), execution("x", "2026-01-01T00:01:00.000Z")], [bbo("old", "2026-01-01T00:00:01.000Z"), bbo("prior", "2026-01-01T00:00:05.000Z"), bbo("future", "2026-01-01T00:00:06.000Z")]);
  assert.equal(result.quality, "OBSERVED_AT_OR_BEFORE"); assert.equal(result.bboEventId, "prior"); assert.equal(result.executionKnowledgeAt.toISOString(), "2026-01-01T00:00:05.000Z"); assert.equal(result.observationAgeMs, 0);
});
test("excludes a provider-old BBO observed after execution knowledge", () => {
  const result = resolve([execution("x", "2026-01-01T00:00:05.000Z")], [bbo("future", "2026-01-01T00:00:06.000Z", 1_600_000_000_000)]);
  assert.equal(result.quality, "UNAVAILABLE");
});
test("earliest observation remains the replay boundary", () => {
  const result = resolve([execution("x", "2026-01-01T00:00:05.000Z"), execution("x", "2026-01-01T00:01:00.000Z")], [bbo("at-original", "2026-01-01T00:00:05.000Z"), bbo("replay-only", "2026-01-01T00:00:30.000Z")]);
  assert.equal(result.bboEventId, "at-original");
});
test("resolves partial executions independently", () => {
  const a = resolve([execution("a", "2026-01-01T00:00:05.000Z")], [bbo("a-bbo", "2026-01-01T00:00:04.000Z"), bbo("b-bbo", "2026-01-01T00:00:07.000Z")]);
  const b = resolve([execution("b", "2026-01-01T00:00:08.000Z")], [bbo("a-bbo", "2026-01-01T00:00:04.000Z"), bbo("b-bbo", "2026-01-01T00:00:07.000Z")]);
  assert.equal(a.bboEventId, "a-bbo"); assert.equal(b.bboEventId, "b-bbo");
});
test("same observedAt uses source timestamp then id deterministically", () => {
  const result = resolve([execution("x", "2026-01-01T00:00:05.000Z")], [bbo("low", "2026-01-01T00:00:05.000Z", 100), bbo("high", "2026-01-01T00:00:05.000Z", 200)]);
  assert.equal(result.bboEventId, "high");
});
test("fails closed on contradictory execution economics", () => {
  const result = resolve([execution("x", "2026-01-01T00:00:05.000Z"), execution("x", "2026-01-01T00:00:06.000Z", { price: "65001" })], [bbo("prior", "2026-01-01T00:00:04.000Z")]);
  assert.equal(result.quality, "CONFLICT");
});
test("does not promote broker-only evidence", () => {
  const result = resolve([execution("x", "2026-01-01T00:00:05.000Z")], [bbo("prior", "2026-01-01T00:00:04.000Z")]);
  assert.equal(result.brokerClassification, "BROKER_OBSERVED_ONLY");
});
test("fails closed on malformed durable BBO evidence", () => {
  const crossed = { ...bbo("crossed", "2026-01-01T00:00:04.000Z"), bestBid: "3", bestAsk: "2" };
  const result = resolve([execution("x", "2026-01-01T00:00:05.000Z")], [crossed]);
  assert.equal(result.quality, "CONFLICT");
});
test("broker-only remains broker-only across replay classifications", () => {
  const result = resolve([execution("x", "2026-01-01T00:00:05.000Z", { classification: "GT_LINKED" }), execution("x", "2026-01-01T00:00:06.000Z", { classification: "BROKER_OBSERVED_ONLY" })], [bbo("prior", "2026-01-01T00:00:04.000Z")]);
  assert.equal(result.brokerClassification, "BROKER_OBSERVED_ONLY");
});
test("preserves exact BBO evidence and nonnegative age", () => {
  const result = resolve([execution("x", "2026-01-01T00:00:05.000Z")], [bbo("prior", "2026-01-01T00:00:01.000Z")]);
  assert.equal(result.bestBid, "65000.000000000000001"); assert.equal(result.bestAskQuantity, "2.000000000000000456"); assert.equal(result.observationAgeMs, 4000);
});
