import assert from "node:assert/strict";
import test from "node:test";
import type { BingXObservationContextResult } from "../server/services/exchanges/bingx/bingxExecutionObservationContext";
import { deriveBingXObservationContextMetrics } from "./bingxObservationContextMetrics";

const available = (bid: string, ask: string, age = 0): BingXObservationContextResult => ({
  quality: "OBSERVED_AT_OR_BEFORE", executionId: "fill-1", executionKnowledgeAt: new Date("2026-01-01T00:00:05.000Z"),
  bboEventId: "bbo-1", bboObservedAt: new Date(new Date("2026-01-01T00:00:05.000Z").getTime() - age), marketSource: "BINGX_BOOK_TICKER", marketSourceTimestampMs: 1_700_000_000_000,
  bestBid: bid, bestAsk: ask, bestBidQuantity: "1", bestAskQuantity: "2", providerUpdateId: null, observationAgeMs: age,
  brokerClassification: "BROKER_OBSERVED_ONLY",
});

test("derives exact observational spread and midpoint", () => {
  const result = deriveBingXObservationContextMetrics(available("100", "101"));
  assert.equal(result.status, "AVAILABLE"); assert.equal(result.observedContextSpread, "1"); assert.equal(result.observedContextMid, "100.5");
});
test("preserves high precision and mixed decimal scales", () => {
  const high = deriveBingXObservationContextMetrics(available("1.000000000000000001", "1.000000000000000003"));
  assert.equal(high.observedContextSpread, "0.000000000000000002"); assert.equal(high.observedContextMid, "1.000000000000000002");
  const mixed = deriveBingXObservationContextMetrics(available("0.1", "0.100000000000000001"));
  assert.equal(mixed.observedContextSpread, "0.000000000000000001"); assert.equal(mixed.observedContextMid, "0.1000000000000000005");
});
test("supports zero spread and observation age zero", () => {
  const result = deriveBingXObservationContextMetrics(available("42.000", "42", 0));
  assert.equal(result.status, "AVAILABLE"); assert.equal(result.observedContextSpread, "0"); assert.equal(result.observedContextMid, "42"); assert.equal(result.observationAgeMs, 0);
});
test("supports very large values and large factual age", () => {
  const result = deriveBingXObservationContextMetrics(available("100000000000000000000.000000000000000001", "100000000000000000001.000000000000000003", 300_000));
  assert.equal(result.observedContextSpread, "1.000000000000000002"); assert.equal(result.observedContextMid, "100000000000000000000.500000000000000002"); assert.equal(result.observationAgeMs, 300_000);
});
test("propagates unavailable and conflict without zero fabrication", () => {
  const unavailable = deriveBingXObservationContextMetrics({ quality: "UNAVAILABLE", executionId: "old", executionKnowledgeAt: null, brokerClassification: null });
  const conflict = deriveBingXObservationContextMetrics({ quality: "CONFLICT", executionId: "bad", executionKnowledgeAt: null, brokerClassification: null });
  assert.equal(unavailable.status, "UNAVAILABLE"); assert.equal(conflict.status, "CONFLICT"); assert.equal((unavailable as any).observedContextSpread, undefined); assert.equal((conflict as any).observedContextMid, undefined);
});
test("rejects crossed and malformed observational BBO defensively", () => {
  const crossed = deriveBingXObservationContextMetrics(available("101", "100"));
  const malformed = deriveBingXObservationContextMetrics(available("NaN", "100"));
  const negative = deriveBingXObservationContextMetrics(available("-1", "1"));
  assert.equal(crossed.status, "CONFLICT"); assert.equal(malformed.status, "CONFLICT"); assert.equal(negative.status, "CONFLICT");
});
test("keeps per-execution identity and produces deterministic replay", () => {
  const a = deriveBingXObservationContextMetrics({ ...available("10", "11"), executionId: "A" });
  const b = deriveBingXObservationContextMetrics({ ...available("10", "11"), executionId: "B", observationAgeMs: 5 });
  assert.equal(a.executionId, "A"); assert.equal(b.executionId, "B"); assert.notEqual(a.observationAgeMs, b.observationAgeMs);
  assert.deepEqual(deriveBingXObservationContextMetrics(available("10", "11")), deriveBingXObservationContextMetrics(available("10", "11")));
});
test("rejects inconsistent supplied observation age", () => {
  const result = deriveBingXObservationContextMetrics({ ...available("10", "11", 5), observationAgeMs: 6 });
  assert.equal(result.status, "CONFLICT");
});
test("does not accept provider-only or execution-price inputs", () => {
  const result = deriveBingXObservationContextMetrics(available("10", "11"));
  assert.equal(result.status, "AVAILABLE"); assert.equal(result.observedContextSpread, "1");
});
