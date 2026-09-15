import assert from "node:assert/strict";
import { test } from "node:test";
import { reconcileBingXSubmission, reconcileBingXSubmissionForUser } from "./bingxSubmissionReconciliationService";
import type { BingXSubmissionObservation, BingXSubmissionReadResults } from "../exchanges/bingx/bingxSubmissionReconciliationReader";

const durable = { logicalOrderUid: "GT-ORD-1", brokerClientOrderId: "GT-CLIENT-1", symbol: "BTC-USDT", side: "buy" as const, quantity: "0.000000123456789", price: "65000.123456789" };
const emptyRead = (): BingXSubmissionReadResults => ({ OPEN_ORDERS: { status: "loaded", observations: [] }, ORDER_HISTORY: { status: "loaded", observations: [] }, FILL_HISTORY: { status: "loaded", observations: [] } });
const obs = (overrides: Partial<BingXSubmissionObservation> = {}): BingXSubmissionObservation => ({ source: "OPEN_ORDERS", clientOrderId: durable.brokerClientOrderId, symbol: durable.symbol, side: "BUY", quantity: durable.quantity, price: durable.price, observedAt: new Date().toISOString(), brokerOrderIdPrecisionTrusted: false, ...overrides });

test("matches exact client ID with high-precision corroborating strings", async () => {
  const result = await reconcileBingXSubmission({ durable, read: async () => ({ ...emptyRead(), OPEN_ORDERS: { status: "loaded", observations: [obs({ brokerOrderId: "9007199254740993123", brokerOrderIdPrecisionTrusted: true })] } }) });
  assert.equal(result.status, "MATCHED");
  assert.deepEqual(result.sources, ["OPEN_ORDERS"]);
  assert.equal(result.retryAuthorized, false);
});

test("matches history and aggregates consistent duplicate sources", async () => {
  const result = await reconcileBingXSubmission({ durable, read: async () => ({ ...emptyRead(), OPEN_ORDERS: { status: "loaded", observations: [obs()] }, ORDER_HISTORY: { status: "loaded", observations: [obs({ source: "ORDER_HISTORY", rawStatus: "NEW" })] } }) });
  assert.equal(result.status, "MATCHED");
  assert.deepEqual(result.sources, ["OPEN_ORDERS", "ORDER_HISTORY"]);
});

test("returns conflict for exact client ID with contradictory evidence", async () => {
  const result = await reconcileBingXSubmission({ durable, read: async () => ({ ...emptyRead(), OPEN_ORDERS: { status: "loaded", observations: [obs({ side: "SELL" })] } }) });
  assert.equal(result.status, "CONFLICT");
  assert.equal(result.retryAuthorized, false);
});

test("returns uncertain no-match and never proves absence", async () => {
  const result = await reconcileBingXSubmission({ durable, read: async () => emptyRead() });
  assert.equal(result.status, "NO_MATCH_IN_OBSERVED_WINDOW");
  assert.equal(result.absenceProven, false);
  assert.equal(result.retryAuthorized, false);
});

test("returns unresolved when any required source fails", async () => {
  const result = await reconcileBingXSubmission({ durable, read: async () => ({ ...emptyRead(), ORDER_HISTORY: { status: "failed", observations: [], errorCode: "BINGX_TIMEOUT" } }) });
  assert.equal(result.status, "UNRESOLVED");
  assert.equal(result.retryAuthorized, false);
});

test("returns unresolved when all reconciliation sources fail", async () => {
  const failed = { status: "failed" as const, observations: [], errorCode: "BINGX_REQUEST_FAILED" };
  const result = await reconcileBingXSubmission({ durable, read: async () => ({ OPEN_ORDERS: failed, ORDER_HISTORY: failed, FILL_HISTORY: failed }) });
  assert.equal(result.status, "UNRESOLVED");
  assert.equal(result.absenceProven, false);
  assert.equal(result.retryAuthorized, false);
});

test("ignores external observations without linking or creating durable state", async () => {
  const result = await reconcileBingXSubmission({ durable, read: async () => ({ ...emptyRead(), OPEN_ORDERS: { status: "loaded", observations: [obs({ clientOrderId: "EXTERNAL-1" })] } }) });
  assert.equal(result.status, "NO_MATCH_IN_OBSERVED_WINDOW");
  assert.equal(result.logicalOrderUid, durable.logicalOrderUid);
  assert.equal(result.observations.length, 0);
});

test("fails closed when the authenticated account context does not own the intent", async () => {
  let reads = 0;
  const result = await reconcileBingXSubmissionForUser(7, "GT-ORD-ACCOUNT", {
    getIntent: async () => ({ goodTradingAccountUid: "ACCOUNT-A", sourceNativeSymbol: "BTC-USDT", requestedSide: "buy", resolvedQuantity: "1", limitPrice: "2" } as never),
    listAttempts: async () => [{ attemptNumber: 1, brokerClientOrderId: "CLIENT-A", transportState: "RECONCILIATION_REQUIRED" } as never],
    getAccount: async () => ({ accountUid: "ACCOUNT-B" } as never),
    readSources: async () => { reads++; return emptyRead(); },
  });
  assert.equal(result.status, "UNRESOLVED");
  assert.deepEqual(result.errorCodes, ["ACCOUNT_CONTEXT_MISMATCH"]);
  assert.equal(reads, 0);
});
