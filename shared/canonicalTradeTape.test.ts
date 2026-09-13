import assert from "node:assert/strict";
import test from "node:test";
import { CanonicalTradeTape, classifyBinanceAggressor, deriveCvd, deriveTradeVolumes, type CanonicalTradeInput } from "./canonicalTradeTape";

const identity = { instrument: "BTCUSDT", venue: "Binance" as const, marketType: "Spot" as const };
const trade = (id: string, eventTime: number | null, source: "rest" | "websocket", side: "BUY" | "SELL", quantity = 2): CanonicalTradeInput => ({ ...identity, tradeId: id, price: 100, quantity, aggressorSide: side, eventTime, receiveTime: 200, source, quality: "VALID" });

test("Spot and Perpetual tapes are independent", () => {
  const spot = new CanonicalTradeTape(identity);
  const perp = new CanonicalTradeTape({ ...identity, marketType: "Perpetual" });
  assert.equal(spot.ingest(trade("s1", 100, "websocket", "BUY")).accepted, true);
  assert.equal(perp.ingest({ ...trade("p1", 100, "websocket", "SELL"), marketType: "Perpetual" }).accepted, true);
  assert.equal(spot.size, 1); assert.equal(perp.size, 1);
  assert.equal(spot.ingest({ ...trade("p2", 101, "websocket", "BUY"), marketType: "Perpetual" }).reason, "INVALID");
});

test("Binance m maps buyer-is-maker to aggressor side", () => {
  assert.equal(classifyBinanceAggressor(true), "SELL");
  assert.equal(classifyBinanceAggressor(false), "BUY");
});

test("source, timestamps and provenance remain explicit", () => {
  const tape = new CanonicalTradeTape(identity);
  const rest = tape.ingest(trade("r1", 100, "rest", "BUY")).trade!;
  const ws = tape.ingest(trade("w1", 110, "websocket", "SELL")).trade!;
  assert.equal(rest.source, "rest"); assert.equal(ws.source, "websocket");
  assert.equal(rest.eventTime, 100); assert.equal(rest.receiveTime, 200);
  assert.equal(rest.provenance.source, "rest");
  assert.equal(ws.provenance.receiveTime, 200);
});

test("duplicate IDs and REST/WSS overlap are accepted once", () => {
  const tape = new CanonicalTradeTape(identity);
  assert.equal(tape.ingest(trade("x", 100, "rest", "BUY")).accepted, true);
  assert.equal(tape.ingest(trade("x", 100, "websocket", "BUY")).reason, "DUPLICATE");
  assert.equal(tape.size, 1);
});

test("same timestamp and late arrivals are deterministically ordered", () => {
  const tape = new CanonicalTradeTape(identity);
  tape.ingest(trade("b", 100, "websocket", "BUY")); tape.ingest(trade("a", 100, "websocket", "SELL")); tape.ingest(trade("late", 90, "rest", "BUY"));
  assert.deepEqual(tape.getTrades().map((t) => t.tradeId), ["late", "a", "b"]);
});

test("disconnect preserves history and derivations do not mutate raw tape", () => {
  const tape = new CanonicalTradeTape(identity);
  tape.ingest(trade("1", 100, "websocket", "BUY", 3)); tape.ingest(trade("2", 101, "websocket", "SELL", 1));
  const before = tape.getTrades(); tape.markDisconnected();
  assert.equal(tape.quality, "DISCONNECTED"); assert.equal(tape.size, 2);
  const volumes = deriveTradeVolumes(before); const cvd = deriveCvd(before);
  assert.deepEqual(volumes, { aggressiveBuyVolume: 3, aggressiveSellVolume: 1, totalVolume: 4, delta: 2 });
  assert.deepEqual(cvd, [3, 2]); assert.deepEqual(tape.getTrades(), before);
});

test("same input produces same tape and reconnect does not duplicate", () => {
  const a = new CanonicalTradeTape(identity); const b = new CanonicalTradeTape(identity);
  for (const t of [trade("2", 102, "websocket", "BUY"), trade("1", 101, "rest", "SELL")]) { a.ingest(t); b.ingest(t); }
  a.markDisconnected(); a.markConnected(); a.ingest(trade("2", 102, "websocket", "BUY"));
  assert.deepEqual(a.getTrades(), b.getTrades());
});
