import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalL2BookOwner } from "./canonicalL2Book";
import { LiquidityLifecycleProjector, projectLiquidityLifecycle } from "./liquidityLifecycle";

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

test("Spot and Perpetual lifecycle streams are isolated", () => {
  const previous = book([{ price: 100, quantity: 2 }]);
  const perp = book([{ price: 100, quantity: 2 }], [], { marketType: "Perpetual" });
  assert.throws(() => projectLiquidityLifecycle(previous, perp));
});
