import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalL2BookOwner } from "./canonicalL2Book";
import { LiquidityLifecycleProjector, appendLiquidityLifecycleEvents, projectLiquidityLifecycle } from "./liquidityLifecycle";

const base = { instrument: "BTCUSDT", venue: "Binance" as const, marketType: "Spot" as const };
const meta = { sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 110, source: "websocket" as const, quality: "VALID" as const };
function book(bids: { price: number; quantity: number }[], asks: { price: number; quantity: number }[] = [], overrides: Record<string, unknown> = {}) {
  return new CanonicalL2BookOwner({ ...base, ...(overrides.marketType ? { marketType: overrides.marketType } : {}) }).applySnapshot({ ...meta, bids, asks, ...overrides } as any);
}

test("projects ADD, UPDATE, DECREASE and REMOVE with exact quantities", () => {
  const owner = new CanonicalL2BookOwner(base);
  const a = owner.applySnapshot({ ...meta, bids: [], asks: [] });
  const b = owner.applySnapshot({ ...meta, sequence: 2, bids: [{ price: 100, quantity: 10 }], asks: [] });
  const c = owner.applySnapshot({ ...meta, sequence: 3, bids: [{ price: 100, quantity: 15 }], asks: [] });
  const d = owner.applySnapshot({ ...meta, sequence: 4, bids: [{ price: 100, quantity: 7 }], asks: [] });
  const e = owner.applySnapshot({ ...meta, sequence: 5, bids: [], asks: [] });
  assert.equal(projectLiquidityLifecycle(a, b)[0]?.eventType, "ADD");
  assert.equal(projectLiquidityLifecycle(b, c)[0]?.eventType, "UPDATE");
  assert.equal(projectLiquidityLifecycle(c, d)[0]?.eventType, "DECREASE");
  assert.equal(projectLiquidityLifecycle(d, e)[0]?.eventType, "REMOVE");
  assert.deepEqual(projectLiquidityLifecycle(c, d)[0], { ...projectLiquidityLifecycle(c, d)[0], previousQuantity: 15, newQuantity: 7, deltaQuantity: -8 });
});

test("preserves side, identity and provenance", () => {
  const previous = book([], [{ price: 101, quantity: 2 }]);
  const current = book([], [{ price: 101, quantity: 3 }], { sequence: 2, snapshotId: 2, eventTime: 200, receiveTime: 210 });
  const [event] = projectLiquidityLifecycle(previous, current);
  assert.equal(event.side, "ask");
  assert.equal(event.marketType, "Spot");
  assert.equal(event.sequence, 2);
  assert.equal(event.eventTime, 200);
  assert.equal(event.receiveTime, 210);
  assert.equal(event.provenance.source, "websocket");
});

test("degraded quality emits no usable lifecycle", () => {
  const previous = book([{ price: 100, quantity: 2 }]);
  for (const quality of ["GAP", "RESYNCING", "DISCONNECTED"] as const) {
    const current = book([{ price: 100, quantity: 1 }], [], { quality });
    assert.deepEqual(projectLiquidityLifecycle(previous, current), []);
  }
});

test("projector deduplicates and does not mutate books", () => {
  const previous = book([{ price: 100, quantity: 2 }]);
  const current = book([{ price: 100, quantity: 3 }], [], { sequence: 2 });
  const before = structuredClone(previous);
  const projector = new LiquidityLifecycleProjector();
  assert.equal(projector.project(previous, current).length, 1);
  assert.equal(projector.project(previous, current).length, 0);
  assert.deepEqual(previous, before);
});



test("accepted owner delta projects once and preserves legacy parity", () => {
  const owner = new CanonicalL2BookOwner(base);
  const initial = owner.applySnapshot({ ...meta, source: "rest", bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }] });
  const before = owner.getBook();
  const applied = owner.applyDelta({ ...meta, sequence: 2, bids: [{ price: 100, quantity: 15 }], asks: [] });
  assert.equal(applied.accepted, true);
  const events = projectLiquidityLifecycle(before, applied.book);
  assert.equal(events.length, 1);
  assert.deepEqual(applied.book.bids, [{ price: 100, quantity: 15 }]);
  assert.equal(events[0]?.newQuantity, applied.book.bids[0]?.quantity);
  assert.deepEqual(initial.asks, [{ price: 101, quantity: 12 }]);
});

test("rejected, degraded and resnapshot transitions emit no usable lifecycle", () => {
  const owner = new CanonicalL2BookOwner({ ...base, marketType: "Perpetual" });
  const initial = owner.applySnapshot({ ...meta, source: "rest", bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }] });
  const projector = new LiquidityLifecycleProjector();
  const rejected = owner.applyDelta({ ...meta, sequence: 10, firstUpdateId: 10, previousUpdateId: 9, bids: [{ price: 100, quantity: 15 }], asks: [] });
  assert.equal(rejected.accepted, false);
  assert.equal(projector.project(initial, rejected.book).length, 0);
  const disconnected = owner.markDisconnected();
  assert.equal(projector.project(initial, disconnected).length, 0);
  const resnapshot = owner.applySnapshot({ ...meta, source: "rest", snapshotId: 20, sequence: 20, bids: [{ price: 99, quantity: 3 }], asks: [{ price: 102, quantity: 4 }] });
  assert.equal(projector.project(disconnected, resnapshot).length, 0);
});

test("buffer is ordered, capped at 500, and independent from the books", () => {
  const buffer: ReturnType<typeof projectLiquidityLifecycle> = [];
  const owner = new CanonicalL2BookOwner(base);
  let previous = owner.applySnapshot({ ...meta, source: "rest", bids: [{ price: 100, quantity: 1 }], asks: [{ price: 101, quantity: 2 }] });
  for (let i = 0; i < 501; i += 1) {
    const current = owner.applySnapshot({ ...meta, source: "websocket", sequence: i + 2, bids: [{ price: 100 + i + 1, quantity: 1 }], asks: [{ price: 101, quantity: 2 }] });
    appendLiquidityLifecycleEvents(buffer, projectLiquidityLifecycle(previous, current));
    previous = current;
  }
  assert.equal(buffer.length, 500);
  assert.ok(buffer.every((event, index) => index === 0 || event.sequence! >= buffer[index - 1]!.sequence!));
  assert.equal(owner.getBook().bids.length, 1);
});