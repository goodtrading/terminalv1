import assert from "node:assert/strict";
import test from "node:test";
import { canonicalizeReplayResult, replayTruth, type TruthReplayEvent } from "./truthReplay";

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
