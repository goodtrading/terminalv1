import assert from "node:assert/strict";
import { test } from "node:test";
import { normalizeBingXSubmissionObservations } from "./bingxSubmissionReconciliationReader";

test("preserves exact client IDs and distinguishes string and numeric broker IDs", () => {
  const rows = normalizeBingXSubmissionObservations("OPEN_ORDERS", {
    orders: [
      { clientOrderId: "GT-CLIENT-exact", orderId: "9007199254740993123", symbol: "BTC-USDT", side: "BUY", quantity: "0.000000123456789", price: "65000.123456789", status: "NEW" },
      { clientOrderId: "GT-CLIENT-number", orderId: 9007199254740993, symbol: "BTC-USDT", side: "BUY", quantity: 0.001, price: 65000, status: "NEW" },
    ],
  });
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.clientOrderId, "GT-CLIENT-exact");
  assert.equal(rows[0]?.brokerOrderId, "9007199254740993123");
  assert.equal(rows[0]?.brokerOrderIdPrecisionTrusted, true);
  assert.equal(rows[0]?.quantity, "0.000000123456789");
  assert.equal(rows[0]?.price, "65000.123456789");
  assert.equal(rows[1]?.brokerOrderIdPrecisionTrusted, false);
  assert.equal(rows[1]?.quantity, undefined);
  assert.equal(rows[1]?.price, undefined);
});

test("accepts clientOrderID spelling and ignores observations without a string client ID", () => {
  const rows = normalizeBingXSubmissionObservations("ORDER_HISTORY", [
    { clientOrderID: "GT-CLIENT-alias", orderId: "order-1", symbol: "BTC-USDT", side: "SELL", origQty: "1", price: "99", status: "FILLED" },
    { orderId: "external", symbol: "BTC-USDT", side: "BUY" },
  ]);
  assert.equal(rows.length, 2);
  assert.equal(rows[0]?.clientOrderId, "GT-CLIENT-alias");
  assert.equal(rows[1]?.clientOrderId, undefined);
});
