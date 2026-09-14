import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalL2BookOwner } from "./canonicalL2Book";
import { CanonicalTradeTape } from "./canonicalTradeTape";
import { LiquidityLifecycleProjector } from "./liquidityLifecycle";
import { HistoricalLiquidityTruth } from "./historicalLiquidityTruth";
import { composeOrderFlowState, type OrderFlowCompositionInput, type OrderFlowIdentity } from "./orderFlowState";

const spot: OrderFlowIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" };
const perp: OrderFlowIdentity = { instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual" };

function fixture(identity: OrderFlowIdentity = spot, quality: "VALID" | "GAP" = "VALID"): OrderFlowCompositionInput {
  const owner = new CanonicalL2BookOwner(identity);
  const tape = new CanonicalTradeTape(identity);
  const projector = new LiquidityLifecycleProjector();
  const history = new HistoricalLiquidityTruth(identity);
  const first = owner.applySnapshot({ bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, source: "rest", quality: "VALID" });
  history.addCheckpoint(first);
  const second = quality === "VALID"
    ? owner.applyDelta({ bids: [{ price: 100, quantity: 15 }], asks: [], sequence: 2, eventTime: 110, receiveTime: 111, source: "websocket", quality: "VALID", ...(identity.marketType === "Perpetual" ? { firstUpdateId: 2, previousUpdateId: 1 } : {}) }).book
    : owner.applyDelta({ bids: [], asks: [], sequence: null, eventTime: 120, receiveTime: 121, source: "websocket", quality: "VALID" }).book;
  const events = quality === "VALID" ? projector.project(first, second) : [];
  for (const event of events) history.addEvent(event);
  tape.ingest({ instrument: identity.instrument, venue: identity.venue, marketType: identity.marketType, tradeId: "10", price: 100.5, quantity: 2, aggressorSide: "BUY", eventTime: 111, receiveTime: 112, source: "websocket", quality: "VALID" });
  return { identity, book: second, trades: tape.getTrades(), tradeQuality: "VALID", liquidityLifecycle: events, lifecycleQuality: quality, historicalLiquidity: quality === "VALID" ? history : null, capturedAt: 200 };
}

function compose(input: OrderFlowCompositionInput) { return composeOrderFlowState(input); }

test("composes canonical book, BBO, tape, lifecycle and historical frame", () => {
  const state = compose(fixture());
  assert.deepEqual(state.identity, spot);
  assert.deepEqual(state.book?.bids, [{ price: 100, quantity: 15 }]);
  assert.deepEqual(state.bbo, { bid: 100, ask: 101, spread: 1, mid: 100.5 });
  assert.equal(state.trades[0]?.tradeId, "10");
  assert.equal(state.trades[0]?.aggressorSide, "BUY");
  assert.equal(state.liquidityLifecycle[0]?.eventType, "UPDATE");
  assert.deepEqual(state.historicalLiquidity.latestFrame?.bids, state.book?.bids);
  assert.deepEqual(state.historicalLiquidity.bookAt(200)?.bids, state.book?.bids);
});

test("BBO is copied only from the canonical book, never from trades or ticker", () => {
  const input = fixture();
  input.trades = [{ ...input.trades[0]!, price: 999, provenance: { ...input.trades[0]!.provenance, eventTime: 999 } }];
  const state = compose(input);
  assert.deepEqual(state.bbo, { bid: 100, ask: 101, spread: 1, mid: 100.5 });
});

test("history unavailable stays null and never becomes an empty synthetic book", () => {
  const input = fixture(); input.historicalLiquidity = null;
  const state = compose(input);
  assert.equal(state.historicalLiquidity.latestFrame, null);
  assert.equal(state.historicalLiquidity.bookAt(200), null);
  assert.equal(state.quality.history, "UNAVAILABLE");
  assert.equal(state.quality.overall, "PARTIAL");
});

test("quality is preserved per component and aggregated without information loss", () => {
  const staleTrades = compose({ ...fixture(), tradeQuality: "STALE" });
  assert.equal(staleTrades.quality.book, "VALID"); assert.equal(staleTrades.quality.trades, "STALE"); assert.equal(staleTrades.quality.overall, "STALE");
  const gap = compose(fixture(spot, "GAP"));
  assert.equal(gap.quality.book, "GAP"); assert.equal(gap.quality.trades, "VALID"); assert.equal(gap.quality.lifecycle, "GAP"); assert.equal(gap.quality.history, "UNAVAILABLE"); assert.equal(gap.quality.overall, "GAP");
});

test("timestamps remain separated and null event timestamps stay null", () => {
  const input = fixture(); input.book = { ...input.book!, eventTime: null, provenance: { ...input.book!.provenance, eventTime: null } };
  const state = compose(input);
  assert.equal(state.timestamps.book.eventTime, null);
  assert.equal(state.timestamps.book.receiveTime, 111);
  assert.equal(state.timestamps.trades.newestEventTime, 111);
  assert.equal(state.capturedAt, 200);
  assert.equal(state.timestamps.book.receiveTime === state.capturedAt, false);
});

test("component provenance and consistency metadata are preserved", () => {
  const state = compose(fixture());
  assert.equal(state.provenance.book?.source, "websocket");
  assert.equal(state.provenance.trades.latest?.tradeId, "10");
  assert.equal(state.provenance.lifecycle.latest?.source, "websocket");
  assert.equal(state.provenance.history?.source, "websocket");
  assert.equal(state.consistency.bookSequence, 2);
  assert.equal(state.consistency.bookSnapshotId, 1);
  assert.equal(state.consistency.latestTradeId, "10");
  assert.equal(state.consistency.latestLifecycleSequence, 2);
  assert.equal(state.consistency.historySequence, 2);
  assert.equal(state.consistency.status, "CONSISTENT");
});

test("identity is mandatory and every component must match exactly", () => {
  assert.throws(() => compose({ ...fixture(), identity: { instrument: "BTCUSDT", venue: "Binance" } as never }), /complete market identity/);
  assert.throws(() => compose({ ...fixture(), book: { ...fixture().book!, marketType: "Perpetual" } }), /book identity mismatch/);
  assert.throws(() => compose({ ...fixture(), trades: [{ ...fixture().trades[0]!, marketType: "Perpetual" }] }), /trades identity mismatch/);
  assert.throws(() => compose({ ...fixture(), liquidityLifecycle: [{ ...fixture().liquidityLifecycle[0]!, marketType: "Perpetual" }] }), /lifecycle identity mismatch/);
  const history = new HistoricalLiquidityTruth(perp);
  assert.throws(() => compose({ ...fixture(), historicalLiquidity: history }), /history identity mismatch/);
});

test("Spot and Perpetual composition remains isolated", () => {
  const spotState = compose(fixture(spot));
  const perpState = compose(fixture(perp));
  assert.equal(spotState.identity.marketType, "Spot"); assert.equal(perpState.identity.marketType, "Perpetual");
  assert.equal(spotState.book?.marketType, "Spot"); assert.equal(perpState.book?.marketType, "Perpetual");
  assert.notEqual(spotState.book, perpState.book);
});

test("bookAt delegates to the real historical owner and does not copy its store", () => {
  const input = fixture(); const state = compose(input);
  const before = state.historicalLiquidity.bookAt(100);
  assert.deepEqual(before?.bids, [{ price: 100, quantity: 10 }]);
  const after = state.historicalLiquidity.bookAt(200);
  assert.deepEqual(after?.bids, [{ price: 100, quantity: 15 }]);
});

test("defensive snapshots prevent consumer mutation of inputs and owners", () => {
  const input = fixture(); const originalBook = input.book!.bids[0]!.quantity; const originalTrade = input.trades[0]!.quantity;
  const state = compose(input);
  (state.book!.bids[0] as { quantity: number }).quantity = 999;
  (state.trades[0] as { quantity: number }).quantity = 999;
  (state.liquidityLifecycle[0]!.provenance as { sequence: number | null }).sequence = 999;
  state.historicalLiquidity.latestFrame!.bids[0]!.quantity = 999;
  assert.equal(input.book!.bids[0]!.quantity, originalBook);
  assert.equal(input.trades[0]!.quantity, originalTrade);
  assert.equal(state.historicalLiquidity.bookAt(200)?.bids[0]?.quantity, 15);
});

test("same inputs and capturedAt produce deeply equal deterministic state", () => {
  const first = compose(fixture()); const second = compose(fixture());
  const comparable = (state: ReturnType<typeof compose>) => ({ ...state, historicalLiquidity: { latestFrame: state.historicalLiquidity.latestFrame } });
  assert.deepEqual(comparable(first), comparable(second));
  assert.deepEqual(first.historicalLiquidity.bookAt(200), second.historicalLiquidity.bookAt(200));
  assert.equal(Object.keys(first).includes("owner"), false);
  assert.equal(Object.keys(first).includes("bookmap"), false);
  assert.equal(Object.keys(first).includes("strategy"), false);
});

test("lifecycle remains canonical and does not acquire inferred economic meanings", () => {
  const state = compose(fixture());
  assert.deepEqual(Object.keys(state.liquidityLifecycle[0]!).sort(), ["deltaQuantity", "eventTime", "eventType", "instrument", "marketType", "newQuantity", "previousQuantity", "price", "provenance", "quality", "receiveTime", "sequence", "side", "venue"]);
  assert.equal("execute" in state.liquidityLifecycle[0]!, false);
  assert.equal("cancel" in state.liquidityLifecycle[0]!, false);
  assert.equal("replenish" in state.liquidityLifecycle[0]!, false);
});
