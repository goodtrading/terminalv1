import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeReplayResult, replayTruth, type TruthReplayEvent } from "./truthReplay";
import { CanonicalL2BookOwner } from "./canonicalL2Book";
import { LiquidityLifecycleProjector } from "./liquidityLifecycle";
import { CanonicalTradeTape } from "./canonicalTradeTape";
import { HistoricalLiquidityTruth } from "./historicalLiquidityTruth";

const spot = { instrument: "BTCUSDT", venue: "Binance" as const, marketType: "Spot" as const };
const perp = { instrument: "BTCUSDT", venue: "Binance" as const, marketType: "Perpetual" as const };
const snapshot = (identity = spot, sequence = 1, eventTime = 100): TruthReplayEvent => ({ type: "L2_SNAPSHOT", ...identity, bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }], sequence, snapshotId: sequence, eventTime, receiveTime: eventTime + 1, source: "rest", quality: "VALID" });
const delta = (identity = spot, sequence = 2, eventTime = 110, quantity = 15): TruthReplayEvent => ({ type: "L2_DELTA", ...identity, bids: [{ price: 100, quantity }], asks: [], sequence, ...(identity.marketType === "Perpetual" ? { firstUpdateId: sequence, previousUpdateId: sequence - 1 } : {}), eventTime, receiveTime: eventTime + 1, source: "websocket", quality: "VALID" });
const trade = (identity = spot, id = "10", eventTime = 111, side: "BUY" | "SELL" = "BUY"): TruthReplayEvent => ({ type: "TRADE", ...identity, tradeId: id, price: 100.5, quantity: 2, aggressorSide: side, eventTime, receiveTime: eventTime + 1, source: "websocket", quality: "VALID" });

const run = (...events: TruthReplayEvent[]) => replayTruth([...events, { type: "ADVANCE_TIME", ...spot, eventTime: 200, receiveTime: 201, quality: "VALID", source: "websocket" }]);

test("same input produces deeply equal canonical results and isolated executions", () => {
  const events = [snapshot(), delta(), trade()];
  assert.deepEqual(canonicalizeReplayResult(replayTruth(events)), canonicalizeReplayResult(replayTruth(events)));
  const a = run(...events); const b = run(...events);
  assert.deepEqual(a, b); assert.notEqual(a.l2Book, b.l2Book); assert.notEqual(a.tradeTape, b.tradeTape);
});

test("happy path produces exact BBO, lifecycle, tape and historical book", () => {
  const result = run(snapshot(), delta(), trade());
  assert.deepEqual(result.l2Book?.bids, [{ price: 100, quantity: 15 }]);
  assert.deepEqual(result.bbo, { bid: 100, ask: 101 });
  assert.equal(result.lifecycleEvents.length, 1); assert.equal(result.lifecycleEvents[0]?.eventType, "UPDATE");
  assert.equal(result.tradeTape[0]?.aggressorSide, "BUY");
  assert.deepEqual(result.historicalState?.bids, result.l2Book?.bids);
});

test("duplicates, stale events and duplicate trades do not regress or duplicate", () => {
  const result = run(snapshot(), delta(), delta(), { ...delta(), sequence: 1 }, trade(), trade());
  assert.equal(result.lifecycleEvents.length, 1); assert.equal(result.tradeTape.length, 1); assert.equal(result.l2Book?.bids[0]?.quantity, 15);
});

test("gap, reconnect and resync never create valid history without a new snapshot", () => {
  const result = replayTruth([snapshot(), { type: "L2_DELTA", ...spot, bids: [], asks: [], sequence: 5, eventTime: 120, receiveTime: 121, source: "websocket", quality: "VALID" }, { type: "RECONNECT", ...spot, eventTime: 130, receiveTime: 131, source: "websocket", quality: "VALID" }, { type: "RESYNC", ...spot, eventTime: 140, receiveTime: 141, source: "websocket", quality: "RESYNCING" }, { type: "ADVANCE_TIME", ...spot, eventTime: 150, receiveTime: 151, source: "websocket", quality: "VALID" }]);
  assert.equal(result.l2Book?.quality, "RESYNCING"); assert.equal(result.historicalState, null);
});

test("resnapshot replaces baseline without fabricated lifecycle", () => {
  const result = run(snapshot(), delta(), { ...snapshot(spot, 20, 180), bids: [{ price: 99, quantity: 4 }], asks: [{ price: 102, quantity: 5 }] });
  assert.deepEqual(result.l2Book?.bids, [{ price: 99, quantity: 4 }]); assert.equal(result.lifecycleEvents.length, 1); assert.equal(result.historicalState?.sequence, 20);
});

test("corrupt and wrong-identity events leave canonical owners unchanged", () => {
  const result = run(snapshot(), { ...delta(), bids: [{ price: Number.NaN, quantity: 99 }] }, { ...trade(), tradeId: "bad", price: -1 }, { ...snapshot(perp), sequence: 1 });
  assert.equal(result.l2Book?.sequence, 1); assert.equal(result.l2Book?.bids[0]?.quantity, 10); assert.equal(result.tradeTape.length, 0);
});

test("late trades are ordered deterministically and REST/WSS overlap deduplicates", () => {
  const result = run(trade(spot, "2", 120, "SELL"), trade(spot, "1", 110, "BUY"), trade(spot, "2", 120, "SELL"), trade(spot, "3", 120, "BUY"));
  assert.deepEqual(result.tradeTape.map((x) => x.tradeId), ["1", "2", "3"]); assert.deepEqual(result.tradeTape.map((x) => x.aggressorSide), ["BUY", "SELL", "BUY"]);
});

test("Spot and Perpetual streams remain isolated", () => {
  const result = replayTruth([snapshot(spot), snapshot(perp), delta(spot), delta(perp)]);
  assert.equal(result.l2Book?.marketType, "Perpetual"); assert.equal(result.lifecycleEvents.some((x) => x.marketType === "Spot"), true); assert.equal(result.lifecycleEvents.some((x) => x.marketType === "Perpetual"), true);
});

test("REMOVE leaves no ghost liquidity and disconnect cuts historical state", () => {
  const result = replayTruth([{ ...snapshot(), bids: [{ price: 100, quantity: 10 }, { price: 99, quantity: 3 }] }, { ...delta(spot, 2, 110, 0), bids: [{ price: 99, quantity: 0 }] }, { type: "DISCONNECT", ...spot, eventTime: 120, receiveTime: 121, source: "websocket", quality: "DISCONNECTED" }, { type: "ADVANCE_TIME", ...spot, eventTime: 130, receiveTime: 131, source: "websocket", quality: "VALID" }]);
  assert.equal(result.lifecycleEvents.some((event) => event.eventType === "REMOVE"), true); assert.equal(result.historicalState, null);
});

const advance = (identity = spot, time = 500): TruthReplayEvent => ({ type: "ADVANCE_TIME", ...identity, eventTime: time, receiveTime: time + 1, source: "websocket", quality: "VALID" });
const deterministic = (events: TruthReplayEvent[]) => assert.deepEqual(canonicalizeReplayResult(replayTruth(events)), canonicalizeReplayResult(replayTruth(events)));

function directHappyResult() {
  const owner = new CanonicalL2BookOwner(spot);
  const projector = new LiquidityLifecycleProjector();
  const tape = new CanonicalTradeTape(spot);
  const history = new HistoricalLiquidityTruth(spot);
  const first = owner.applySnapshot({ bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, source: "rest", quality: "VALID" });
  history.addCheckpoint(first);
  const second = owner.applyDelta({ bids: [{ price: 100, quantity: 15 }], asks: [], sequence: 2, eventTime: 110, receiveTime: 111, source: "websocket", quality: "VALID" });
  const lifecycle = projector.project(first, second.book); for (const event of lifecycle) { history.addEvent(event); }
  tape.ingest({ instrument: "BTCUSDT", venue: "Binance", marketType: "Spot", tradeId: "10", price: 100.5, quantity: 2, aggressorSide: "BUY", eventTime: 111, receiveTime: 112, source: "websocket", quality: "VALID" });
  return { l2Book: second.book, bbo: second.book.bbo, lifecycleEvents: lifecycle, tradeTape: tape.getTrades(), historicalState: history.bookAt(200) };
}

function directRecoveryResult() {
  const owner = new CanonicalL2BookOwner(spot);
  const history = new HistoricalLiquidityTruth(spot);
  owner.applySnapshot({ bids: [{ price: 100, quantity: 10 }], asks: [{ price: 101, quantity: 12 }], sequence: 1, snapshotId: 1, eventTime: 100, receiveTime: 101, source: "rest", quality: "VALID" });
  owner.markDisconnected();
  const recovered = owner.applySnapshot({ bids: [{ price: 99, quantity: 4 }], asks: [{ price: 102, quantity: 5 }], sequence: 20, snapshotId: 20, eventTime: 180, receiveTime: 181, source: "rest", quality: "VALID" });
  history.addCheckpoint(recovered);
  return { l2Book: recovered, bbo: recovered.bbo, lifecycleEvents: [], tradeTape: [], historicalState: history.bookAt(200) };
}

test("failure matrix: explicit reject, degrade and accept outcomes", () => {
  const duplicate = replayTruth([snapshot(), delta(), delta(), advance()]);
  assert.equal(duplicate.lifecycleEvents.length, 1); assert.equal(duplicate.l2Book?.quality, "VALID");
  const stale = replayTruth([snapshot(), delta(), { ...delta(), sequence: 1, eventTime: 120 }, advance()]);
  assert.equal(stale.l2Book?.sequence, 2); assert.equal(stale.lifecycleEvents.length, 1);
  const gap = replayTruth([snapshot(), { ...delta(), sequence: null, eventTime: 120 }, advance()]);
  assert.equal(gap.l2Book?.quality, "GAP"); assert.equal(gap.historicalState, null); assert.equal(gap.lifecycleEvents.length, 0);
  const perpGap = replayTruth([snapshot(perp), delta(perp, 3, 120), advance(perp)]);
  assert.equal(perpGap.l2Book?.quality, "GAP"); assert.equal(perpGap.historicalState, null);
  const malformed = replayTruth([snapshot(), { ...delta(), bids: [{ price: Number.NaN, quantity: 5 }] }, { ...delta(), bids: [{ price: 100, quantity: Number.NaN }] }, advance()]);
  assert.equal(malformed.l2Book?.sequence, 1); assert.equal(malformed.l2Book?.bids[0]?.quantity, 10); assert.equal(malformed.lifecycleEvents.length, 0);
  const crossed = replayTruth([{ ...snapshot(), bids: [{ price: 102, quantity: 5 }], asks: [{ price: 101, quantity: 5 }] }, advance()]);
  assert.equal(crossed.l2Book?.quality, "PARTIAL"); assert.equal(crossed.l2Book?.bbo.bid, null); assert.equal(crossed.historicalState?.quality, "PARTIAL");
});

test("failure matrix: control boundaries and valid recovery", () => {
  const disconnected = replayTruth([snapshot(), { type: "DISCONNECT", ...spot, eventTime: 120, receiveTime: 121, source: "websocket", quality: "DISCONNECTED" }, delta(spot, 2, 125), { type: "RECONNECT", ...spot, eventTime: 130, receiveTime: 131, source: "websocket", quality: "VALID" }, advance()]);
  assert.equal(disconnected.l2Book?.quality, "RESYNCING"); assert.equal(disconnected.historicalState, null); assert.equal(disconnected.lifecycleEvents.length, 0);
  const recovered = replayTruth([snapshot(), { type: "DISCONNECT", ...spot, eventTime: 120, receiveTime: 121, source: "websocket", quality: "DISCONNECTED" }, { type: "RECONNECT", ...spot, eventTime: 130, receiveTime: 131, source: "websocket", quality: "VALID" }, { ...snapshot(spot, 10, 140), type: "RESNAPSHOT" }, delta(spot, 11, 150), advance()]);
  assert.equal(recovered.l2Book?.quality, "VALID"); assert.equal(recovered.l2Book?.sequence, 11); assert.equal(recovered.historicalState?.sequence, 11); assert.equal(recovered.lifecycleEvents.length, 1);
  const afterDisconnect = replayTruth([snapshot(), { type: "DISCONNECT", ...spot, eventTime: 120, receiveTime: 121, source: "websocket", quality: "DISCONNECTED" }, delta(spot, 2, 125), advance()]);
  assert.equal(afterDisconnect.lifecycleEvents.length, 0); assert.equal(afterDisconnect.historicalState, null);
});

test("failure matrix: identity isolation, trade overlap and no ghost REMOVE", () => {
  const wrongIdentity = replayTruth([snapshot(), { ...delta(perp), sequence: 2 }, delta(), advance()]);
  assert.equal(wrongIdentity.l2Book?.marketType, "Spot"); assert.equal(wrongIdentity.l2Book?.sequence, 2); assert.equal(wrongIdentity.lifecycleEvents.every((event) => event.marketType === "Spot"), true);
  const trades = replayTruth([snapshot(), { ...trade(spot, "1", 120, "BUY"), source: "rest" }, { ...trade(spot, "1", 120, "BUY"), source: "websocket" }, trade(spot, "2", 110, "SELL"), advance()]);
  assert.deepEqual(trades.tradeTape.map((item) => item.tradeId), ["2", "1"]); assert.deepEqual(trades.tradeTape.map((item) => item.aggressorSide), ["SELL", "BUY"]);
  const removed = replayTruth([{ ...snapshot(), bids: [{ price: 100, quantity: 10 }, { price: 99, quantity: 3 }] }, { ...delta(spot, 2, 110, 0), bids: [{ price: 99, quantity: 0 }] }, advance()]);
  assert.equal(removed.lifecycleEvents.some((event) => event.eventType === "REMOVE"), true); assert.equal(removed.historicalState?.bids.some((level) => level.price === 99), false);
});

test("direct isolated owners are equivalent to replayTruth on the happy path", () => {
  const events = [snapshot(), delta(), trade(), advance()]; const replay = replayTruth(events); const direct = canonicalizeReplayResult(directHappyResult());
  assert.deepEqual(replay.l2Book, direct.l2Book); assert.deepEqual(replay.bbo, direct.bbo); assert.deepEqual(replay.lifecycleEvents, direct.lifecycleEvents); assert.deepEqual(replay.tradeTape, direct.tradeTape); assert.deepEqual(replay.historicalState, direct.historicalState);
});

test("direct isolated owners are equivalent on valid resnapshot recovery", () => {
  const events = [snapshot(), { type: "DISCONNECT", ...spot, eventTime: 150, receiveTime: 151, source: "websocket", quality: "DISCONNECTED" } as TruthReplayEvent, { ...snapshot(spot, 20, 180), bids: [{ price: 99, quantity: 4 }], asks: [{ price: 102, quantity: 5 }] }, advance()];
  const replay = canonicalizeReplayResult(replayTruth(events)); const direct = canonicalizeReplayResult(directRecoveryResult());
  assert.deepEqual(replay.l2Book, direct.l2Book); assert.deepEqual(replay.bbo, direct.bbo); assert.deepEqual(replay.lifecycleEvents, direct.lifecycleEvents); assert.deepEqual(replay.tradeTape, direct.tradeTape); assert.deepEqual(replay.historicalState, direct.historicalState);
});

test("all failure fixtures rerun deterministically and do not leak global state", () => {
  const fixtures: TruthReplayEvent[][] = [
    [snapshot(), delta(), advance()],
    [snapshot(), { ...delta(), sequence: 5 }, advance()],
    [snapshot(), trade(spot, "1", 120), trade(spot, "1", 120), advance()],
    [snapshot(perp), delta(perp), advance(perp)],
  ];
  for (const fixture of fixtures) deterministic(fixture);
  for (const fixture of [...fixtures].reverse()) deterministic(fixture);
  const first = replayTruth([snapshot(), delta(), advance()]); const second = replayTruth([snapshot(), advance()]);
  assert.equal(first.l2Book?.bids[0]?.quantity, 15); assert.equal(second.l2Book?.bids[0]?.quantity, 10);
});
