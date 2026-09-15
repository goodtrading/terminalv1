import assert from "node:assert/strict";
import { test } from "node:test";
import {
  createBrokerIdentity,
  createReconciliationRunInput,
  type BrokerObservationSnapshot,
} from "./durableOrderReconciliation";

test("accepts only factual reliable identities", () => {
  assert.equal(createBrokerIdentity({ kind: "CLIENT_ORDER_ID", value: "GT-ABC" }).kind, "CLIENT_ORDER_ID");
  assert.equal(createBrokerIdentity({ kind: "TRUSTED_BROKER_ORDER_ID", value: "987654321012345678", precisionTrusted: true }).kind, "TRUSTED_BROKER_ORDER_ID");
  assert.throws(() => createBrokerIdentity({ kind: "TRUSTED_BROKER_ORDER_ID", value: "123", precisionTrusted: false }));
  assert.throws(() => createBrokerIdentity({ kind: "EXECUTION_ID", value: "" }));
});

test("preserves decimal evidence as strings", () => {
  const snapshot: BrokerObservationSnapshot = { source: "ORDER_HISTORY", symbol: "BTC-USDT", side: "BUY", quantity: "0.000000000000000123", price: "65000.123456789012345", brokerOrderIdPrecisionTrusted: false, observedAt: new Date("2026-01-01T00:00:00Z") };
  assert.equal(snapshot.quantity, "0.000000000000000123");
  assert.equal(snapshot.price, "65000.123456789012345");
});

test("requires V1 safety flags to remain false", () => {
  assert.equal(createReconciliationRunInput({ attemptId: "a", intentId: "i", logicalOrderUid: "o", runKey: "run-1", queriedSources: ["OPEN_ORDERS"] }).absenceProven, false);
  assert.throws(() => createReconciliationRunInput({ attemptId: "a", intentId: "i", logicalOrderUid: "o", runKey: "run-1", queriedSources: [], absenceProven: true } as never));
});
