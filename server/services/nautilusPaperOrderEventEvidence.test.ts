import assert from "node:assert/strict";
import test from "node:test";
import { validateNautilusPaperOrderEventEvidence } from "./nautilusPaperOrderEventEvidence";

const base = {
  eventId: "native-event-1", eventType: "OrderFilled",
  tsEventNs: "1700000000000000000", tsInitNs: "1699999999999999999",
  environment: "PAPER", source: "NAUTILUS_PAPER",
  quantity: "0.000100000000000001", price: "75000.123456789012345678", triggerPrice: "0.000000000000000001",
  reduceOnly: true, reduceOnlySource: "EVENT_FACTUAL", tags: ["GT_PROTECTION=STOP_LOSS"], tagsSource: "EVENT_FACTUAL",
  linkedOrderIds: [],
};

test("R1W contract preserves nanoseconds, decimals and factual metadata", () => {
  const result = validateNautilusPaperOrderEventEvidence(base);
  assert.equal(result.tsEventNs, base.tsEventNs);
  assert.equal(result.tsInitNs, base.tsInitNs);
  assert.equal(result.quantity, base.quantity);
  assert.equal(result.price, base.price);
  assert.equal(result.triggerPrice, base.triggerPrice);
  assert.deepEqual(result.tags, base.tags);
  assert.deepEqual(result.linkedOrderIds, []);
});

test("R1W contract permits independent same-nanosecond native events", () => {
  const first = validateNautilusPaperOrderEventEvidence(base);
  const second = validateNautilusPaperOrderEventEvidence({ ...base, eventId: "native-event-2" });
  assert.equal(first.tsEventNs, second.tsEventNs);
  assert.notEqual(first.eventId, second.eventId);
});

test("R1W contract rejects non-Nautilus provenance and numeric precision loss", () => {
  assert.throws(() => validateNautilusPaperOrderEventEvidence({ ...base, source: "GOODTRADING" }), /PROVENANCE/);
  assert.throws(() => validateNautilusPaperOrderEventEvidence({ ...base, tsEventNs: 1700000000000 }), /INVALID_tsEventNs/);
  assert.throws(() => validateNautilusPaperOrderEventEvidence({ ...base, price: "75000.1e2" }), /INVALID_price/);
});
