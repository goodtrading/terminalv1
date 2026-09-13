import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalL2BookOwner } from "./canonicalL2Book";

const identity = { instrument: "BTCUSDT", venue: "Binance" as const, marketType: "Spot" as const };
const meta = { sequence: 10, snapshotId: 10, eventTime: 100, receiveTime: 110, source: "rest" as const, quality: "VALID" as const };
const snapshot = { ...meta, bids: [{ price: 100, quantity: 2 }, { price: 99, quantity: 1 }], asks: [{ price: 101, quantity: 3 }, { price: 102, quantity: 1 }] };

test("Spot and Perpetual owners are independent", () => {
  const spot = new CanonicalL2BookOwner(identity);
  const perp = new CanonicalL2BookOwner({ ...identity, marketType: "Perpetual" });
  spot.applySnapshot(snapshot);
  assert.equal(perp.getBook().bids.length, 0);
  assert.equal(spot.getBook().marketType, "Spot");
  assert.equal(perp.getBook().marketType, "Perpetual");
});

test("snapshot and deltas deterministically add, update, and delete", () => {
  const owner = new CanonicalL2BookOwner(identity);
  owner.applySnapshot(snapshot);
  owner.applyDelta({ ...meta, source: "websocket", sequence: 11, bids: [{ price: 98, quantity: 4 }], asks: [] });
  owner.applyDelta({ ...meta, source: "websocket", sequence: 12, bids: [{ price: 100, quantity: 5 }], asks: [{ price: 101, quantity: 0 }] });
  const book = owner.applyDelta({ ...meta, source: "websocket", sequence: 13, bids: [{ price: 99, quantity: 0 }], asks: [{ price: 103, quantity: 2 }] }).book;
  assert.deepEqual(book.bids, [{ price: 100, quantity: 5 }, { price: 98, quantity: 4 }]);
  assert.deepEqual(book.asks, [{ price: 102, quantity: 1 }, { price: 103, quantity: 2 }]);
  assert.deepEqual(book.bbo, { bid: 100, ask: 102 });
  assert.equal(book.spread, 2);
  assert.equal(book.mid, 101);
});

test("crossed or incomplete book is never VALID", () => {
  const owner = new CanonicalL2BookOwner(identity);
  const crossed = owner.applySnapshot({ ...meta, bids: [{ price: 102, quantity: 1 }], asks: [{ price: 101, quantity: 1 }] });
  assert.equal(crossed.quality, "PARTIAL");
  assert.equal(crossed.mid, null);
  const empty = new CanonicalL2BookOwner(identity).applySnapshot({ ...meta, bids: [], asks: [] });
  assert.equal(empty.quality, "PARTIAL");
});

test("duplicate, stale, and gaps do not regress state", () => {
  const owner = new CanonicalL2BookOwner({ ...identity, marketType: "Perpetual" });
  owner.applySnapshot({ ...snapshot, source: "rest" });
  assert.equal(owner.applyDelta({ ...meta, source: "websocket", sequence: 10, bids: [], asks: [] }).reason, "STALE");
  assert.equal(owner.applyDelta({ ...meta, source: "websocket", sequence: 12, firstUpdateId: 12, previousUpdateId: 10, bids: [], asks: [] }).reason, "GAP");
  assert.equal(owner.getBook().quality, "GAP");
});

test("Perpetual U/u/pu continuity and missing sequence are explicit", () => {
  const owner = new CanonicalL2BookOwner({ ...identity, marketType: "Perpetual" });
  owner.applySnapshot({ ...snapshot, source: "rest" });
  const missing = owner.applyDelta({ ...meta, source: "websocket", sequence: null, firstUpdateId: 11, previousUpdateId: 10, bids: [], asks: [] });
  assert.equal(missing.accepted, false);
  const valid = owner.applyDelta({ ...meta, source: "websocket", sequence: 11, firstUpdateId: 11, previousUpdateId: 10, bids: [], asks: [] });
  assert.equal(valid.accepted, true);
});

test("disconnect invalidates cached book and reconnect remains non-VALID until snapshot", () => {
  const owner = new CanonicalL2BookOwner(identity);
  owner.applySnapshot(snapshot);
  assert.equal(owner.markDisconnected().quality, "DISCONNECTED");
  assert.equal(owner.getBook().quality, "DISCONNECTED");
  const reconnectDelta = owner.applyDelta({ ...meta, source: "websocket", sequence: 11, bids: [], asks: [] });
  assert.equal(reconnectDelta.accepted, false);
  assert.equal(reconnectDelta.book.quality, "RESYNCING");
  assert.equal(owner.applySnapshot({ ...snapshot, source: "rest", snapshotId: 11 }).quality, "VALID");
});

test("provenance and repeated input remain stable", () => {
  const a = new CanonicalL2BookOwner(identity).applySnapshot(snapshot);
  const b = new CanonicalL2BookOwner(identity).applySnapshot(snapshot);
  assert.deepEqual(a, b);
  assert.equal(a.snapshotId, 10);
  assert.equal(a.sequence, 10);
  assert.equal(a.eventTime, 100);
  assert.equal(a.receiveTime, 110);
  assert.equal(a.provenance.source, "rest");
});
