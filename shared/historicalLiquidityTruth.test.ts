import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalL2BookOwner } from "./canonicalL2Book";
import { projectLiquidityLifecycle } from "./liquidityLifecycle";
import { HistoricalLiquidityTruth, historicalFrameFromCanonical } from "./historicalLiquidityTruth";

const id = { instrument: "BTCUSDT", venue: "Binance" as const, marketType: "Spot" as const };
const meta = { sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 110, source: "rest" as const, quality: "VALID" as const };
function canonical(bids = [{ price: 100, quantity: 10 }], asks = [{ price: 101, quantity: 12 }], sequence = 1, source: "rest" | "websocket" = "rest", eventTime = 100) {
  return new CanonicalL2BookOwner(id).applySnapshot({ ...meta, bids, asks, sequence, snapshotId: sequence, source, eventTime, receiveTime: eventTime + 10 });
}
function addEvent(history: HistoricalLiquidityTruth, previous: ReturnType<typeof canonical>, current: ReturnType<typeof canonical>) {
  for (const event of projectLiquidityLifecycle(previous, current)) history.addEvent(event);
}

test("checkpoint reconstructs exact book and frame before/after event", () => {
  const owner = new CanonicalL2BookOwner(id); const history = new HistoricalLiquidityTruth(id);
  const a = owner.applySnapshot({ ...meta, bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }] }); history.addCheckpoint(a);
  const b = owner.applyDelta({ ...meta, eventTime: 101, source: "websocket", sequence: 2, bids: [{ price: 100, quantity: 15 }], asks: [] }).book; addEvent(history, a, b);
  assert.deepEqual(history.bookAt(100)?.bids, a.bids); assert.deepEqual(history.bookAt(110)?.bids, b.bids);
  assert.deepEqual(history.bookAt(110)?.asks, b.asks);
});

test("ADD, UPDATE, DECREASE and REMOVE replay without ghost liquidity", () => {
  const owner = new CanonicalL2BookOwner(id); const history = new HistoricalLiquidityTruth(id); const a = owner.applySnapshot({ ...meta, bids: [{ price: 99, quantity: 1 }], asks: [{ price: 101, quantity: 12 }] }); history.addCheckpoint(a);
  const states = [1, 5, 3, 0].map((quantity, i) => owner.applyDelta({ ...meta, source: "websocket", sequence: i + 2, bids: [{ price: 100, quantity }], asks: [] }).book);
  let previous = a; for (const current of states) { addEvent(history, previous, current); previous = current; }
  assert.equal(history.bookAt(120)?.bids.some((level) => level.price === 100), false); assert.equal(history.bookAt(120)?.bids.some((level) => level.price === 99), true); assert.equal(history.bookAt(120)?.asks.length, 1);
});

test("duplicate events do not replay twice and multiple same-level events remain ordered", () => {
  const owner = new CanonicalL2BookOwner(id); const history = new HistoricalLiquidityTruth(id); const a = owner.applySnapshot({ ...meta, bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }] }); history.addCheckpoint(a);
  const b = owner.applyDelta({ ...meta, source: "websocket", sequence: 2, bids: [{ price: 100, quantity: 15 }], asks: [] }).book; const event = projectLiquidityLifecycle(a, b)[0]!;
  assert.equal(history.addEvent(event), true); assert.equal(history.addEvent(event), false);
  assert.equal(history.bookAt(110)?.bids[0]?.quantity, 15);
});

test("resnapshot starts a new segment and does not fabricate lifecycle", () => {
  const history = new HistoricalLiquidityTruth(id); const a = canonical(); history.addCheckpoint(a); const b = canonical([{ price: 99, quantity: 4 }], [{ price: 102, quantity: 5 }], 20, "rest", 200); history.addCheckpoint(b);
  assert.equal(history.size, 2); assert.equal(history.getSegments()[1]!.events.length, 0); assert.deepEqual(history.bookAt(200)?.bids, b.bids);
});

test("GAP, RESYNCING and DISCONNECTED cut continuity", () => {
  for (const quality of ["GAP", "RESYNCING", "DISCONNECTED"] as const) {
    const history = new HistoricalLiquidityTruth(id); const owner = new CanonicalL2BookOwner(id); const a = owner.applySnapshot({ ...meta, bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }] }); history.addCheckpoint(a);
    const degraded = { ...a, eventTime: 200, receiveTime: 210, quality, provenance: { ...a.provenance, eventTime: 200, receiveTime: 210 } }; history.addCheckpoint(degraded);
    assert.equal(history.bookAt(200), null);
  }
});

test("Spot and Perpetual histories are isolated and levels stay sorted", () => {
  const spot = new HistoricalLiquidityTruth(id); const perpId = { ...id, marketType: "Perpetual" as const }; const perp = new HistoricalLiquidityTruth(perpId);
  const spotBook = canonical([{ price: 99, quantity: 1 }, { price: 100, quantity: 2 }], [{ price: 102, quantity: 2 }, { price: 101, quantity: 1 }]); spot.addCheckpoint(spotBook);
  assert.throws(() => spot.addCheckpoint({ ...spotBook, marketType: "Perpetual" })); assert.equal(perp.bookAt(200), null);
  assert.deepEqual(spot.bookAt(200)?.bids.map((x) => x.price), [100, 99]); assert.deepEqual(spot.bookAt(200)?.asks.map((x) => x.price), [101, 102]);
});

test("metadata, parity, determinism and pruning are preserved", () => {
  const owner = new CanonicalL2BookOwner(id); const a = owner.applySnapshot({ ...meta, bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }] }); const history = new HistoricalLiquidityTruth(id, 2); history.addCheckpoint(a);
  assert.deepEqual(historicalFrameFromCanonical(a), history.bookAt(110));
  for (let i = 0; i < 4; i++) history.addCheckpoint({ ...a, sequence: i + 2, snapshotId: i + 2, eventTime: 200 + i, receiveTime: 210 + i, provenance: { ...a.provenance, sequence: i + 2, snapshotId: i + 2, eventTime: 200 + i, receiveTime: 210 + i } });
  assert.equal(history.size, 2); assert.equal(history.bookAt(1000)?.sequence, 5);
  const clone = history.getSegments(); clone[1]!.checkpoint.bids[0]!.quantity = 999; assert.notEqual(history.bookAt(1000)?.bids[0]?.quantity, 999);
});
