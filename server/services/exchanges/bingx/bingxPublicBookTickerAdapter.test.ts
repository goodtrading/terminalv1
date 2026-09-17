import assert from "node:assert/strict";
import test from "node:test";
import { gzipSync } from "node:zlib";
import { BingXPublicBookTickerAdapter } from "./bingxPublicBookTickerAdapter";

class FakeSocket {
  static instances: FakeSocket[] = [];
  readyState = 0; sent: string[] = []; private listeners = new Map<string, ((...args: any[]) => void)[]>();
  constructor(_url: string) { FakeSocket.instances.push(this); }
  on(event: string, fn: (...args: any[]) => void) { this.listeners.set(event, [...(this.listeners.get(event) ?? []), fn]); }
  emit(event: string, value?: any) { for (const fn of this.listeners.get(event) ?? []) fn(value); }
  send(data: string) { this.sent.push(data); }
  close() { this.readyState = 3; this.emit("close"); }
  removeAllListeners() { this.listeners.clear(); }
}
const msg = JSON.stringify({ code: 0, dataType: "BTC-USDT@bookTicker", data: { e: "bookTicker", u: 456140685, s: "BTC-USDT", b: "1.000000000000000001", B: "0", a: "2.000000000000000002", A: "3", T: 1700000000000 } });

test("connects, subscribes, handles gzip bookTicker and provider pong", () => {
  FakeSocket.instances = []; const events: any[] = []; const states: string[] = [];
  const adapter = new BingXPublicBookTickerAdapter({ WebSocket: FakeSocket as any, now: () => new Date(1700000001000), onEvent: e => events.push(e), onStateChange: s => states.push(s) });
  adapter.start(); const socket = FakeSocket.instances[0]; assert.equal(adapter.state, "CONNECTING");
  socket.readyState = 1; socket.emit("open"); const sub = JSON.parse(socket.sent[0]); assert.equal(sub.reqType, "sub"); assert.equal(sub.dataType, "BTC-USDT@bookTicker");
  socket.emit("message", JSON.stringify({ code: 0, msg: "SUCCESS", dataType: "BTC-USDT@bookTicker" })); assert.equal(adapter.subscriptionAcknowledged, true); assert.equal(adapter.state, "READY");
  socket.emit("message", "ping"); assert.equal(socket.sent.at(-1), "pong"); socket.emit("message", gzipSync(Buffer.from(msg)));
  assert.equal(events.length, 1); assert.equal(events[0].bestBid, "1.000000000000000001"); assert.equal(events[0].sourceAgeAtObservationMs, 1000); assert.equal(events[0].providerSequence, "456140685"); adapter.stop(); assert.equal(adapter.state, "DISCONNECTED");
});

test("reconnects after disconnect and restores subscription", async () => {
  FakeSocket.instances = []; const adapter = new BingXPublicBookTickerAdapter({ WebSocket: FakeSocket as any, reconnectDelaysMs: [1] }); adapter.start(); const first = FakeSocket.instances[0]; first.emit("close"); await new Promise(r => setTimeout(r, 10)); assert.equal(FakeSocket.instances.length, 2); const second = FakeSocket.instances[1]; second.readyState = 1; second.emit("open"); assert.equal(JSON.parse(second.sent[0]).dataType, "BTC-USDT@bookTicker"); adapter.stop();
});
