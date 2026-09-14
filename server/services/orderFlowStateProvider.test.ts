import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalL2BookOwner } from "@shared/canonicalL2Book";
import { CanonicalTradeTape } from "@shared/canonicalTradeTape";
import { LiquidityLifecycleProjector } from "@shared/liquidityLifecycle";
import { HistoricalLiquidityTruth } from "@shared/historicalLiquidityTruth";
import type { OrderFlowIdentity } from "@shared/orderFlowState";
import { createOrderFlowStateProvider, type OrderFlowStateReads } from "./orderFlowStateProvider";

const spot: OrderFlowIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" };
const perp: OrderFlowIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual" };

function readsFor(identity: OrderFlowIdentity = spot, degraded = false): OrderFlowStateReads {
  const owner = new CanonicalL2BookOwner(identity);
  const tape = new CanonicalTradeTape(identity);
  const projector = new LiquidityLifecycleProjector();
  const history = new HistoricalLiquidityTruth(identity);
  const first = owner.applySnapshot({ bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, source: "rest", quality: "VALID" });
  history.addCheckpoint(first);
  const result = degraded
    ? owner.applyDelta({ bids: [], asks: [], sequence: null, eventTime: 120, receiveTime: 121, source: "websocket", quality: "VALID" })
    : owner.applyDelta({ bids: [{ price: 100, quantity: 15 }], asks: [], sequence: 2, eventTime: 110, receiveTime: 111, source: "websocket", quality: "VALID", ...(identity.marketType === "Perpetual" ? { firstUpdateId: 2, previousUpdateId: 1 } : {}) });
  const events = degraded ? [] : projector.project(first, result.book);
  for (const event of events) history.addEvent(event);
  tape.ingest({ instrument: identity.instrument, venue: identity.venue, marketType: identity.marketType, tradeId: "t1", price: 100.5, quantity: 2, aggressorSide: "BUY", eventTime: 111, receiveTime: 112, source: "websocket", quality: "VALID" });
  return {
    book: () => result.book,
    trades: () => ({ trades: tape.getTrades(), quality: degraded ? "STALE" : tape.quality }),
    lifecycle: () => events,
    history: () => degraded ? null : history,
  };
}

function provider(identity: OrderFlowIdentity = spot, degraded = false) {
  return createOrderFlowStateProvider(readsFor(identity, degraded));
}

test("provider composes Spot canonical owners and preserves exact component sources", () => {
  const state = provider().getState(spot, 500);
  assert.equal(state.identity.marketType, "Spot");
  assert.equal(state.book?.bids[0]?.quantity, 15);
  assert.deepEqual(state.bbo, { bid: 100, ask: 101, spread: 1, mid: 100.5 });
  assert.equal(state.trades[0]?.tradeId, "t1");
  assert.equal(state.liquidityLifecycle[0]?.eventType, "UPDATE");
  assert.equal(state.historicalLiquidity.latestFrame?.sequence, 2);
  assert.equal(state.historicalLiquidity.bookAt(200)?.bids[0]?.quantity, 15);
  assert.equal(state.capturedAt, 500);
});

test("provider resolves Perpetual independently and never falls back to Spot", () => {
  const state = provider(perp).getState(perp, 500);
  assert.equal(state.identity.marketType, "Perpetual");
  assert.equal(state.book?.marketType, "Perpetual");
  assert.equal(state.trades[0]?.marketType, "Perpetual");
  assert.equal(state.provenance.book?.source, "websocket");
});

test("provider rejects missing marketType and does not silently route mismatches", () => {
  assert.throws(() => provider().getState({ instrument: "BTCUSDT", venue: "Binance" } as never, 500), /complete market identity/);
  const mismatchedReads: OrderFlowStateReads = { ...readsFor(), book: () => ({ ...readsFor(perp).book(spot)!, marketType: "Perpetual" }) };
  assert.throws(() => createOrderFlowStateProvider(mismatchedReads).getState(spot, 500), /book identity mismatch/);
});

test("provider preserves degraded book, trade and history quality", () => {
  const state = provider(spot, true).getState(spot, 500);
  assert.equal(state.quality.book, "GAP");
  assert.equal(state.quality.trades, "STALE");
  assert.equal(state.quality.lifecycle, "GAP");
  assert.equal(state.quality.history, "UNAVAILABLE");
  assert.equal(state.quality.overall, "GAP");
  assert.equal(state.historicalLiquidity.latestFrame, null);
  assert.equal(state.historicalLiquidity.bookAt(500), null);
});

test("provider reads each canonical component once and never calls legacy market truth", () => {
  const calls = { book: 0, trades: 0, lifecycle: 0, history: 0 };
  const base = readsFor();
  const reads: OrderFlowStateReads = {
    book: (id) => { calls.book++; return base.book(id); },
    trades: (id) => { calls.trades++; return base.trades(id); },
    lifecycle: (id) => { calls.lifecycle++; return base.lifecycle(id); },
    history: (id) => { calls.history++; return base.history(id); },
  };
  const state = createOrderFlowStateProvider(reads).getState(spot, 500);
  assert.deepEqual(calls, { book: 1, trades: 1, lifecycle: 1, history: 1 });
  assert.equal("getMarketTruth" in state, false);
});

test("two reads have independent defensive snapshots and preserve capturedAt semantics", () => {
  const p = provider(); const first = p.getState(spot, 500); const second = p.getState(spot, 500);
  assert.notEqual(first.book, second.book);
  (first.book!.bids[0] as { quantity: number }).quantity = 999;
  (first.trades[0] as { quantity: number }).quantity = 999;
  assert.equal(second.book!.bids[0]?.quantity, 15);
  assert.equal(second.trades[0]?.quantity, 2);
  assert.equal(first.timestamps.book.eventTime, 110);
  assert.equal(first.timestamps.book.receiveTime, 111);
  assert.equal(first.capturedAt, 500);
});

test("provider returns deterministic state for the same owners and capturedAt", () => {
  const a = provider().getState(spot, 500); const b = provider().getState(spot, 500);
  const comparable = (state: typeof a) => ({ ...state, historicalLiquidity: { latestFrame: state.historicalLiquidity.latestFrame } });
  assert.deepEqual(comparable(a), comparable(b));
  assert.deepEqual(a.historicalLiquidity.bookAt(200), b.historicalLiquidity.bookAt(200));
  assert.equal(Object.keys(a).includes("owner"), false);
});
