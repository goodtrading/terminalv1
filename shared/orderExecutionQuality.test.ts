import assert from "node:assert/strict";
import test from "node:test";
import { buildOrderExecutionQuality, type OrderExecutionQualityInput } from "./orderExecutionQuality";

const intent = {
  requestedSize: "2", requestedSizeUnit: "BTC", resolvedQuantity: "2", limitPrice: "100", requestedSide: "buy",
  decisionEvidence: { decisionAt: new Date("2026-09-16T10:00:00.000Z"), marketSource: "UNAVAILABLE", marketSourceTimestamp: null, bestBid: null, bestAsk: null, marketEvidenceQuality: "UNAVAILABLE" },
} as OrderExecutionQualityInput["intent"];
const attempt = (startedAt: Date | null, responseAt: Date | null, submittedQuantity = "2") => ({ attemptNumber: 1, submittedQuantity, startedAt, responseAt });
const fill = (executionId: string, quantity: number, price: number, eventTime: number, fee?: { value: number; currency: string }) => ({ executionId, accountIdentity: { accountId: "a", broker: "bingx", environment: "LIVE", baseCurrency: "USDT" }, marketIdentity: { instrument: "BTC-USDT", venue: "BingX", marketType: "Spot" }, side: "BUY", quantity, price, eventTime, fee, provenance: { source: "test", executionId } });
const base = (overrides: Partial<OrderExecutionQualityInput> = {}) => ({ intent, attempts: [attempt(new Date("2026-09-16T10:00:01.000Z"), new Date("2026-09-16T10:00:03.000Z"))], lifecycleStatus: "FILLED" as const, fills: [fill("e1", 1, 99, Date.parse("2026-09-16T10:00:04.000Z")), fill("e2", 1, 101, Date.parse("2026-09-16T10:00:05.000Z"))], fillCompleteness: "COMPLETE" as const, ...overrides });

test("derives complete order metrics from authoritative evidence", () => {
  const result = buildOrderExecutionQuality(base({ fills: [fill("e1", 1, 99, Date.parse("2026-09-16T10:00:04.000Z"), { value: 0.1, currency: "USDT" }), fill("e2", 1, 101, Date.parse("2026-09-16T10:00:05.000Z"), { value: 0.2, currency: "USDT" })] }));
  assert.deepEqual(result.latencyMs, { decisionToSubmissionStart: 1000, submissionStartToBrokerResponse: 2000, decisionToBrokerResponse: 3000, decisionToFirstFill: 4000, decisionToTerminalFill: 5000 });
  assert.deepEqual(result.quantities, { requested: "2", submitted: "2", factualFilled: "2" });
  assert.equal(result.factualExecutionVwap, "100");
  assert.deepEqual(result.vwapVsRequestedLimit, { absolute: "0", percent: "0" });
  assert.deepEqual(result.fees, { perFill: [{ executionId: "e1", amount: "0.1", asset: "USDT" }, { executionId: "e2", amount: "0.2", asset: "USDT" }], aggregates: [{ asset: "USDT", amount: "0.3" }], evidence: "FACTUAL" });
  assert.equal(result.fillCompleteness, "COMPLETE"); assert.equal(result.evidenceStatus, "COMPLETE"); assert.deepEqual(result.evidenceGaps, []);
});

test("deduplicates identical execution replay and rejects conflicting execution identity", () => {
  const one = fill("e1", 1, 100, Date.parse("2026-09-16T10:00:04.000Z"));
  const deduped = buildOrderExecutionQuality(base({ fills: [one, one] }));
  assert.equal(deduped.quantities.factualFilled, "1"); assert.equal(deduped.factualExecutionVwap, "100");
  const conflict = buildOrderExecutionQuality(base({ fills: [one, fill("e1", 1, 101, one.eventTime)] }));
  assert.equal(conflict.fillCompleteness, "CONFLICT"); assert.equal(conflict.factualExecutionVwap, null); assert.ok(conflict.evidenceGaps.includes("CONFLICTING_EXECUTION_ID:e1"));
});

test("fails closed for partial or unproven fill history", () => {
  const partial = buildOrderExecutionQuality(base({ lifecycleStatus: "PARTIALLY_FILLED", fills: [fill("e1", 1, 99, Date.parse("2026-09-16T10:00:04.000Z"), { value: 0.1, currency: "USDT" })], fillCompleteness: "PARTIAL" }));
  assert.equal(partial.quantities.factualFilled, "1"); assert.equal(partial.factualExecutionVwap, null); assert.deepEqual(partial.vwapVsRequestedLimit, { absolute: null, percent: null }); assert.equal(partial.latencyMs.decisionToFirstFill, null); assert.equal(partial.latencyMs.decisionToTerminalFill, null); assert.equal(partial.fillCompleteness, "PARTIAL"); assert.equal(partial.fees.evidence, "PARTIAL");
  const none = buildOrderExecutionQuality(base({ lifecycleStatus: "OPEN", fills: [], fillCompleteness: "UNAVAILABLE" }));
  assert.equal(none.factualExecutionVwap, null); assert.equal(none.fillCompleteness, "UNAVAILABLE"); assert.equal(none.latencyMs.decisionToFirstFill, null);
});

test("keeps multiple partial fills factual for quantity but unavailable for order economics", () => {
  const result = buildOrderExecutionQuality(base({ lifecycleStatus: "PARTIALLY_FILLED", fills: [fill("p1", 0.4, 99, Date.parse("2026-09-16T10:00:04.000Z")), fill("p2", 0.6, 100, Date.parse("2026-09-16T10:00:05.000Z"))], fillCompleteness: "PARTIAL" }));
  assert.equal(result.quantities.factualFilled, "1"); assert.equal(result.factualExecutionVwap, null); assert.equal(result.fillCompleteness, "PARTIAL");
});

test("uses signed VWAP minus requested limit for both sides", () => {
  const buy = buildOrderExecutionQuality(base({ fills: [fill("b", 1, 101, Date.parse("2026-09-16T10:00:04.000Z"))] }));
  const sell = buildOrderExecutionQuality(base({ intent: { ...intent, requestedSide: "sell" }, fills: [fill("s", 1, 99, Date.parse("2026-09-16T10:00:04.000Z"))] }));
  assert.deepEqual(buy.vwapVsRequestedLimit, { absolute: "1", percent: "1" }); assert.deepEqual(sell.vwapVsRequestedLimit, { absolute: "-1", percent: "-1" });
});

test("groups unlike fee assets and marks missing fees partial", () => {
  const result = buildOrderExecutionQuality(base({ fills: [fill("e1", 1, 99, Date.parse("2026-09-16T10:00:04.000Z"), { value: 0.0001, currency: "BTC" }), fill("e2", 1, 101, Date.parse("2026-09-16T10:00:05.000Z"), { value: 2, currency: "USDT" })] }));
  assert.deepEqual(result.fees.aggregates, [{ asset: "BTC", amount: "0.0001" }, { asset: "USDT", amount: "2" }]); assert.equal(result.fees.evidence, "FACTUAL");
  const missing = buildOrderExecutionQuality(base({ fills: [fill("e1", 1, 99, 4, { value: 0.1, currency: "USDT" }), fill("e2", 1, 101, 5)] })); assert.equal(missing.fees.evidence, "PARTIAL"); assert.deepEqual(missing.fees.aggregates, [{ asset: "USDT", amount: "0.1" }]);
});

test("does not fabricate latency and reports impossible timestamp evidence", () => {
  const historical = buildOrderExecutionQuality(base({ intent: { ...intent, decisionEvidence: null }, attempts: [attempt(null, null)], fills: [] }));
  assert.equal(historical.latencyMs.decisionToSubmissionStart, null); assert.equal(historical.evidenceStatus, "UNAVAILABLE"); assert.ok(historical.evidenceGaps.includes("MISSING_DECISION_AT"));
  const impossible = buildOrderExecutionQuality(base({ attempts: [attempt(new Date("2026-09-16T09:59:59.000Z"), new Date("2026-09-16T09:59:58.000Z"))], fills: [] }));
  assert.equal(impossible.latencyMs.submissionStartToBrokerResponse, null); assert.equal(impossible.evidenceStatus, "CONFLICT"); assert.ok(impossible.evidenceGaps.includes("INVALID_TIMESTAMP_ORDER"));
});

test("is deterministic for high precision decimal inputs and repeated replay", () => {
  const input = base({ intent: { ...intent, resolvedQuantity: "0.00000003", limitPrice: "12345.678901234567" }, attempts: [attempt(new Date("2026-09-16T10:00:01.000Z"), new Date("2026-09-16T10:00:03.000Z"), "0.00000003")], fills: [fill("p1", 0.00000001, 12345.678901234567, Date.parse("2026-09-16T10:00:04.000Z")), fill("p2", 0.00000002, 12345.678901234567, Date.parse("2026-09-16T10:00:05.000Z"))] });
  const a = buildOrderExecutionQuality(input); const b = buildOrderExecutionQuality(input); assert.deepEqual(a, b); assert.equal(a.factualExecutionVwap, "12345.678901234567");
});
