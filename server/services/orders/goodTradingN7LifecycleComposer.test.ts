import assert from "node:assert/strict";
import test from "node:test";
import { composeGoodTradingN7Lifecycle, type DurableBrokerEvidenceSnapshot } from "./goodTradingN7LifecycleComposer";

const intent = {
  logicalOrderUid: "GT-ORD-COMPOSE-1",
  goodTradingAccountUid: "GT-ACCOUNT-1",
  executionBroker: "BINGX",
  executionEnvironment: "LIVE",
  executionMarketInstrument: "BTC-USDT",
  executionMarketVenue: "BINGX",
  executionMarketType: "Perpetual" as const,
  canonicalBaseAsset: "BTC",
  canonicalQuoteAsset: "USDT",
  canonicalSettlementAsset: "USDT",
  canonicalProductType: "Perpetual" as const,
  canonicalContractStyle: "Linear" as const,
  canonicalExpiry: null,
  sourceNativeSymbol: "BTC-USDT",
  sourceNativeInstrumentId: null,
  marketMetadataSource: "server-owned-v1-registry",
  marketMappingPolicy: "EXACT_V1_REGISTRY",
  requestedSide: "buy" as const,
  orderType: "LIMIT" as const,
  requestedSize: "1",
  requestedSizeUnit: "BTC" as const,
  requestedSizingMode: "quantity" as const,
  resolvedQuantity: "1",
  resolvedQuantityUnit: "BTC" as const,
  limitPrice: "65000",
  stopLossPrice: null,
  takeProfitPrice: null,
  timeInForce: "GTC" as const,
  postOnly: false,
  reduceOnly: false,
  requestIdempotencyKey: "compose-key-1",
};

const attempt = {
  attemptId: "GT-ATT-COMPOSE-1",
  intentId: intent.logicalOrderUid,
  attemptNumber: 1,
  brokerClientOrderId: "GT-CLIENT-COMPOSE-1",
  submittedQuantity: "1",
  transportState: "SUBMISSION_RESPONSE_OBSERVED" as const,
  startedAt: null,
  responseAt: null,
  outcomeAt: null,
  reconciliationRequiredAt: null,
  brokerOrderId: "987654321",
  rawBrokerStatus: "FILLED",
  httpStatus: 200,
  errorCode: null,
  errorClass: null,
};

function snapshot(overrides: Partial<DurableBrokerEvidenceSnapshot> = {}): DurableBrokerEvidenceSnapshot {
  return {
    id: "SNAP-1",
    brokerObjectId: "BROKER-1",
    classification: "GT_LINKED",
    brokerAccountIdentity: intent.goodTradingAccountUid,
    source: "ORDER_HISTORY",
    clientOrderId: attempt.brokerClientOrderId,
    brokerOrderId: attempt.brokerOrderId,
    brokerOrderIdPrecisionTrusted: true,
    executionId: null,
    symbol: "BTC-USDT",
    side: "BUY",
    quantity: "1",
    price: "65000",
    rawBrokerStatus: "FILLED",
    sourceTimestamp: new Date("2026-01-01T00:00:01Z"),
    observedAt: new Date("2026-01-01T00:00:02Z"),
    ...overrides,
  };
}

test("composes durable GT intent and linked broker evidence into N7 state and stream", () => {
  const result = composeGoodTradingN7Lifecycle({ intent, attempt, brokerObjectId: "BROKER-1", snapshots: [snapshot()] });
  assert.equal(result.state.identity.canonicalOrderId, intent.logicalOrderUid);
  assert.equal(result.state.identity.clientOrderId, attempt.brokerClientOrderId);
  assert.equal(result.state.identity.venueOrderId, attempt.brokerOrderId);
  assert.equal(result.state.status, "FILLED");
  assert.equal(result.state.filledQuantity, 1);
  assert.equal(result.state.remainingQuantity, 0);
  assert.equal(result.eventStream.events.length, 1);
  assert.equal(result.eventStream.events[0]?.event.eventType, "ORDER_FILLED");
  assert.equal(result.eventStream.events[0]?.evidence.origin, "SNAPSHOT_DERIVED");
});

test("preserves distinct factual executions and their EconomicFill identity", () => {
  const result = composeGoodTradingN7Lifecycle({
    intent,
    attempt,
    brokerObjectId: "BROKER-1",
    snapshots: [
      snapshot({ id: "SNAP-FILL-1", source: "FILL_HISTORY", executionId: "TRADE-1", rawBrokerStatus: "FILLED", observedAt: new Date("2026-01-01T00:00:03Z") }),
      snapshot({ id: "SNAP-FILL-2", source: "FILL_HISTORY", executionId: "TRADE-2", quantity: "0.5", price: "65001", rawBrokerStatus: "FILLED", observedAt: new Date("2026-01-01T00:00:04Z") }),
    ],
  });
  assert.equal(result.economicFills.length, 2);
  assert.notEqual(result.economicFills[0]?.executionId, result.economicFills[1]?.executionId);
  assert.equal(new Set(result.economicFillIdentityKeys).size, 2);
});

test("rejects missing canonical flags and incomplete partial quantity facts", () => {
  assert.throws(() => composeGoodTradingN7Lifecycle({ intent: { ...intent, timeInForce: null }, attempt, brokerObjectId: "BROKER-1", snapshots: [snapshot()] }), /N7_REQUIRES_EXPLICIT_GTC/);
  assert.throws(() => composeGoodTradingN7Lifecycle({ intent: { ...intent, postOnly: null }, attempt, brokerObjectId: "BROKER-1", snapshots: [snapshot()] }), /N7_REQUIRES_EXPLICIT_FLAGS/);
  assert.throws(() => composeGoodTradingN7Lifecycle({ intent, attempt, brokerObjectId: "BROKER-1", snapshots: [snapshot({ rawBrokerStatus: "PARTIALLY_FILLED" })] }), /PARTIAL_FILL_FACTS_INCOMPLETE/);
});

test("composes a factual partial fill before terminal fill", () => {
  const partial = composeGoodTradingN7Lifecycle({ intent, attempt, brokerObjectId: "BROKER-1", snapshots: [snapshot({ id: "OPEN", rawBrokerStatus: "OPEN" }), snapshot({ id: "PARTIAL", rawBrokerStatus: "PARTIALLY_FILLED", quantity: "0.5", price: "65000", sourceTimestamp: new Date("2026-01-01T00:00:03Z") })] });
  assert.equal(partial.state.status, "PARTIALLY_FILLED");
  assert.equal(partial.state.filledQuantity, 0.5);
  assert.equal(partial.state.remainingQuantity, 0.5);
});
test("deduplicates repeated lifecycle status and does not reopen after terminal evidence", () => {
  const result = composeGoodTradingN7Lifecycle({ intent, attempt, brokerObjectId: "BROKER-1", snapshots: [
    snapshot({ id: "FILLED", rawBrokerStatus: "FILLED", sourceTimestamp: new Date("2026-01-01T00:00:03Z") }),
    snapshot({ id: "OPEN-LATE", rawBrokerStatus: "OPEN", sourceTimestamp: new Date("2026-01-01T00:00:04Z") }),
    snapshot({ id: "FILLED-DUP", rawBrokerStatus: "FILLED", sourceTimestamp: new Date("2026-01-01T00:00:03Z") }),
  ] });
  assert.equal(result.state.status, "FILLED");
  assert.equal(result.eventStream.events.length, 1);
  assert.equal(result.eventStream.events[0]?.event.eventType, "ORDER_FILLED");
});

test("deduplicates same execution ID while preserving same-economics distinct executions", () => {
  const one = snapshot({ id: "E1-A", source: "FILL_HISTORY", executionId: "E1", rawBrokerStatus: "FILLED" });
  const result = composeGoodTradingN7Lifecycle({ intent, attempt, brokerObjectId: "BROKER-1", snapshots: [one, { ...one, id: "E1-B" }, { ...one, id: "E2", executionId: "E2" }] });
  assert.equal(result.economicFills.length, 2);
  assert.deepEqual(result.economicFills.map(fill => fill.executionId), ["E1", "E2"]);
});

test("missing execution ID produces no EconomicFill even in fill history", () => {
  const result = composeGoodTradingN7Lifecycle({ intent, attempt, brokerObjectId: "BROKER-1", snapshots: [snapshot({ source: "FILL_HISTORY", executionId: null, rawBrokerStatus: "FILLED" })] });
  assert.equal(result.economicFills.length, 0);
});

test("rejects unlinked or mismatched evidence and never infers a broker order id", () => {
  assert.throws(() => composeGoodTradingN7Lifecycle({ intent, attempt, brokerObjectId: "OTHER", snapshots: [snapshot()] }), /BROKER_EVIDENCE_SCOPE_MISMATCH/);
  assert.throws(() => composeGoodTradingN7Lifecycle({ intent, attempt: { ...attempt, brokerOrderId: null }, brokerObjectId: "BROKER-1", snapshots: [snapshot({ brokerOrderId: null })] }), /BROKER_ORDER_ID_REQUIRED/);
  assert.throws(() => composeGoodTradingN7Lifecycle({ intent, attempt, brokerObjectId: "BROKER-1", snapshots: [snapshot({ classification: "BROKER_OBSERVED_ONLY" })] }), /BROKER_EVIDENCE_NOT_GT_LINKED/);
});
