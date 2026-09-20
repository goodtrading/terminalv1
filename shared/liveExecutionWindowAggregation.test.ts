import assert from "node:assert/strict";
import test from "node:test";
import { aggregateLiveExecutionWindow, type LiveExecutionWindowFinancialAggregation } from "./liveExecutionWindowAggregation";
import type { LiveExecutionEvidenceRow, LiveExecutionWindowCompleteSelection } from "../server/services/orders/goodTradingLiveExecutionWindowRepository";

const window = { startInclusive: "2026-09-16T10:00:00.000Z", endExclusive: "2026-09-16T11:00:00.000Z", timestampPolicy: "PROVIDER_REPORTED_TIMESTAMP" as const };
const row = (overrides: Partial<LiveExecutionEvidenceRow> = {}): LiveExecutionEvidenceRow => ({
  scopeKey: "acct\u001fLIVE\u001fBINGX\u001fBTC-USDT\u001fBINGX\u001fSpot\u001forder-1\u001ffill-1",
  accountUid: "acct", environment: "LIVE", broker: "BINGX", source: "FILL_HISTORY",
  marketInstrument: "BTC-USDT", marketVenue: "BINGX", marketType: "Spot", logicalOrderUid: "order-1",
  executionId: "fill-1", side: "BUY", quantity: "0.000000000000000123", price: "1.000000000000000001",
  feeAmount: "0.000000000000000007", feeAsset: "USDT", feeConflict: false,
  sourceTimestamp: "2026-09-16T10:00:00.001000Z", observedAt: "2026-09-16T10:00:00.002000Z",
  clientOrderId: "client-1", brokerOrderId: "broker-1", windowMembershipTimestamp: "2026-09-16T10:00:00.001000Z", ...overrides,
});
const selection = (rows: readonly LiveExecutionEvidenceRow[], overrides: Partial<LiveExecutionWindowCompleteSelection> = {}): LiveExecutionWindowCompleteSelection => ({
  window, accountUid: "acct", eligibleExecutions: rows, conflicts: [], candidateCount: rows.length,
  unavailable: { missingSelectedTimestamp: 0 }, retrievalCoverage: "COMPLETE", financialEvidence: "COMPLETE", ...overrides,
});

function group(result: LiveExecutionWindowFinancialAggregation) {
  assert.equal(result.groups.length, 1);
  return result.groups[0]!;
}

test("aggregates exact quantity, weighted numerator, and explicitly scaled VWAP", () => {
  const result = aggregateLiveExecutionWindow(selection([
    row(),
    row({ scopeKey: "acct\u001fLIVE\u001fBINGX\u001fBTC-USDT\u001fBINGX\u001fSpot\u001forder-1\u001ffill-2", executionId: "fill-2", quantity: "0.1", price: "2.50", feeAmount: "0" }),
  ]));
  const metrics = group(result);
  assert.equal(metrics.executionCount, 2);
  assert.deepEqual(metrics.executedQuantity, { availability: "AVAILABLE", value: "0.100000000000000123", unit: null, unitAvailability: "NOT_PERSISTED" });
  assert.equal(metrics.weightedPriceNumerator.value, "0.250000000000000123000000000000000123");
  assert.equal(metrics.selectedExecutionVwap.value, "2.499999999999998155");
  assert.equal(metrics.selectedExecutionVwap.outputScale, 18);
  assert.equal(metrics.selectedExecutionVwap.rounding, "TRUNCATE_TOWARD_ZERO");
  assert.deepEqual(metrics.fees, [{ asset: "USDT", amount: "0.000000000000000007", availability: "COMPLETE" }]);
  assert.equal(metrics.unavailableFeeExecutionCount, 0);
});

test("is deterministic, separates BUY and SELL and isolates identity groups", () => {
  const sell = row({ scopeKey: "other\u001fLIVE\u001fOTHER\u001fETH-USDT\u001fOTHER\u001fPerpetual\u001forder-2\u001ffill-3", accountUid: "acct", broker: "OTHER", source: "OTHER", marketInstrument: "ETH-USDT", marketVenue: "OTHER", marketType: "Perpetual", logicalOrderUid: "order-2", executionId: "fill-3", side: "SELL", quantity: "2", price: "10", feeAmount: "1", feeAsset: "BTC" });
  const a = aggregateLiveExecutionWindow(selection([sell, row(), row({ scopeKey: "acct\u001fLIVE\u001fBINGX\u001fBTC-USDT\u001fBINGX\u001fSpot\u001forder-1\u001ffill-2", executionId: "fill-2", side: "SELL", quantity: "1", price: "3", feeAmount: null, feeAsset: null })]));
  const b = aggregateLiveExecutionWindow(selection([row({ scopeKey: "acct\u001fLIVE\u001fBINGX\u001fBTC-USDT\u001fBINGX\u001fSpot\u001forder-1\u001ffill-2", executionId: "fill-2", side: "SELL", quantity: "1", price: "3", feeAmount: null, feeAsset: null }), row(), sell]));
  assert.deepEqual(a, b);
  assert.equal(a.groups.length, 3);
});

test("does not sum unlike fee assets and preserves missing and zero fees", () => {
  const result = aggregateLiveExecutionWindow(selection([
    row({ feeAmount: "0", feeAsset: "USDT" }),
    row({ scopeKey: "acct\u001fLIVE\u001fBINGX\u001fBTC-USDT\u001fBINGX\u001fSpot\u001forder-1\u001ffill-2", executionId: "fill-2", feeAmount: "2", feeAsset: "BTC" }),
    row({ scopeKey: "acct\u001fLIVE\u001fBINGX\u001fBTC-USDT\u001fBINGX\u001fSpot\u001forder-1\u001ffill-3", executionId: "fill-3", feeAmount: null, feeAsset: null }),
  ]));
  const metrics = group(result);
  assert.deepEqual(metrics.fees, [{ asset: "BTC", amount: "2", availability: "PARTIAL" }, { asset: "USDT", amount: "0", availability: "PARTIAL" }]);
  assert.equal(metrics.unavailableFeeExecutionCount, 1);
});

test("deduplicates repeated factual observations, excludes conflicts, and marks eligible subtotals", () => {
  const duplicate = row();
  const result = aggregateLiveExecutionWindow(selection([duplicate, duplicate, row({ scopeKey: "acct\u001fLIVE\u001fBINGX\u001fBTC-USDT\u001fBINGX\u001fSpot\u001forder-1\u001ffill-2", executionId: "fill-2", price: "9" })], {
    conflicts: [{ scopeKey: "conflict", executionId: "conflict-fill", observationCount: 2 }], candidateCount: 3, financialEvidence: "CONFLICT",
  }));
  const metrics = group(result);
  assert.equal(metrics.executionCount, 2);
  assert.equal(result.coverage, "ELIGIBLE_SUBTOTAL_ONLY");
  assert.equal(result.conflictCount, 1);
  assert.deepEqual(result.conflicts, [{ scopeKey: "conflict", executionId: "conflict-fill", observationCount: 2 }]);
});

test("fails closed unless the existing complete retrieval authority is present", () => {
  assert.throws(() => aggregateLiveExecutionWindow(selection([row()], { retrievalCoverage: "INCOMPLETE" as never })), /COMPLETE retrieval/);
  assert.throws(() => aggregateLiveExecutionWindow({ ...selection([row()]), retrievalCoverage: "COMPLETE", candidateCount: 2 }), /candidate/);
  assert.throws(() => aggregateLiveExecutionWindow(selection([row({ quantity: "not-a-decimal" })])), /exact decimal/);
  assert.throws(() => aggregateLiveExecutionWindow(selection([row({ quantity: `0.${"1".repeat(19)}` })])), /precision/);
});

test("does not claim economic notional or complete order history", () => {
  const result = aggregateLiveExecutionWindow(selection([row()]));
  const metrics = group(result);
  assert.equal(metrics.weightedPriceNumerator.kind, "MATHEMATICAL_PRICE_TIMES_QUANTITY");
  assert.equal(result.orderHistoryCoverage, "NOT_ESTABLISHED");
  assert.equal(result.completeOrderMetrics, "UNAVAILABLE");
});
