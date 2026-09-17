import assert from "node:assert/strict";
import test from "node:test";
import { parseBingXBookTickerMessage } from "./bingxBookTicker";

const base = (overrides: Record<string, unknown> = {}) => JSON.stringify({ data: { s: "BTC-USDT", b: "65000.123456789012345678", B: "0.000000000123456789", a: "65000.223456789012345678", A: "1.000000000000000001", T: 1700000000000, ...overrides } });
const observedAt = new Date("2023-11-14T22:13:21.000Z");

test("parses one atomic exact BTC-USDT bookTicker event", () => {
  const result = parseBingXBookTickerMessage(base(), observedAt);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.event.bestBid, "65000.123456789012345678");
  assert.equal(result.event.bestAsk, "65000.223456789012345678");
  assert.equal(result.event.bestBidQuantity, "0.000000000123456789");
  assert.equal(result.event.bestAskQuantity, "1.000000000000000001");
  assert.equal(result.event.marketSourceTimestampMs, 1700000000000);
  assert.equal(result.event.observedAt, observedAt);
  assert.equal(result.event.sourceAgeAtObservationMs, 1000);
  assert.equal(result.event.providerSequence, null);
});

test("rejects wrong symbol, missing fields, malformed decimals, nonpositive prices, and crossed books", () => {
  for (const [name, override, code] of [
    ["wrong symbol", { s: "BTC-USD" }, "WRONG_SYMBOL"],
    ["missing bid", { b: undefined }, "INVALID_PAYLOAD"],
    ["missing ask", { a: undefined }, "INVALID_PAYLOAD"],
    ["missing timestamp", { T: undefined }, "INVALID_PAYLOAD"],
    ["invalid decimal", { b: "1e3" }, "INVALID_DECIMAL"],
    ["zero price", { b: "0" }, "INVALID_PRICE"],
    ["negative price", { a: "-1" }, "INVALID_PRICE"],
    ["crossed", { b: "3", a: "2" }, "CROSSED_BBO"],
  ] as const) {
    const result = parseBingXBookTickerMessage(base(override), observedAt);
    assert.equal(result.ok, false, name);
    if (result.ok) continue;
    assert.equal(result.code, code, name);
  }
});

test("accepts equal prices and zero quantities, and preserves future source timestamps", () => {
  const result = parseBingXBookTickerMessage(base({ b: "2", a: "2", B: "0", A: "0", T: 1700000002000 }), observedAt);
  assert.equal(result.ok, true);
  if (!result.ok) return;
  assert.equal(result.event.sourceAgeAtObservationMs, -1000);
  assert.equal(result.event.sourceAgeDiagnostic, "SOURCE_TIMESTAMP_AFTER_OBSERVED_AT");
});

test("rejects malformed JSON and non-string canonical numeric fields", () => {
  const malformed = parseBingXBookTickerMessage("{", observedAt);
  assert.equal(malformed.ok, false);
  assert.equal(malformed.code, "MALFORMED_JSON");
  const numeric = parseBingXBookTickerMessage(base({ b: 1 }), observedAt);
  assert.equal(numeric.ok, false);
  assert.equal(numeric.code, "INVALID_DECIMAL");
});
