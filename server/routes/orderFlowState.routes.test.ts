import assert from "node:assert/strict";
import test from "node:test";
import { parseOrderFlowIdentityQuery, registerOrderFlowStateRoute } from "./orderFlowState.routes";

function registeredHandler(reader = (identity: any, capturedAt?: number) => ({ identity, capturedAt })) {
  let handler: ((req: any, res: any) => void) | null = null;
  const app = { get: (_path: string, fn: (req: any, res: any) => void) => { handler = fn; } } as any;
  registerOrderFlowStateRoute(app, reader);
  assert.ok(handler);
  return handler!;
}

function response() {
  const out: { status?: number; body?: unknown } = {};
  return { out, res: { status(code: number) { out.status = code; return this; }, json(body: unknown) { out.body = body; return this; } } };
}

test("canonical order-flow route delegates complete Spot and Perpetual identities", () => {
  const calls: unknown[] = [];
  const handler = registeredHandler((identity, capturedAt) => { calls.push([identity, capturedAt]); return { identity, capturedAt }; });
  for (const marketType of ["Spot", "Perpetual"] as const) {
    const r = response(); handler({ query: { instrument: "btcusdt", venue: "Binance", marketType, capturedAt: "500" } }, r.res);
    assert.equal(r.out.status, undefined); assert.deepEqual((r.out.body as any).identity, { instrument: "BTCUSDT", venue: "Binance", marketType }); assert.equal((r.out.body as any).capturedAt, 500);
  }
  assert.deepEqual(calls, [[{ instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" }, 500], [{ instrument: "BTCUSDT", venue: "Binance", marketType: "Perpetual" }, 500]]);
});

test("canonical order-flow route rejects missing or invalid market identity", () => {
  for (const query of [{ instrument: "BTCUSDT", venue: "Binance" }, { instrument: "BTCUSDT", venue: "Kraken", marketType: "Spot" }, { instrument: "BTCUSDT", venue: "Binance", marketType: "Both" }]) {
    const r = response(); registeredHandler(() => { throw new Error("must not read"); })({ query }, r.res);
    assert.equal(r.out.status, 400); assert.match(String((r.out.body as any).error), /marketType|identity/);
  }
});

test("identity parser is strict and does not provide Spot/Perpetual fallback", () => {
  assert.deepEqual(parseOrderFlowIdentityQuery({ instrument: " btcusdt ", venue: "Binance", marketType: "Spot" }), { instrument: "BTCUSDT", venue: "Binance", marketType: "Spot" });
  assert.throws(() => parseOrderFlowIdentityQuery({ instrument: "BTCUSDT", venue: "Binance", marketType: undefined }), /marketType/);
});
