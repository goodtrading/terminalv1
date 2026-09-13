import assert from "node:assert/strict";
import test from "node:test";
import type { PaperState } from "@/lib/paperState";
import type { PaperFillSnapshot } from "./executionTypes";
import { calculateNetPositionPct, canonicalNetPnl } from "./canonicalNetPnl";

test("position NET percentage uses canonical NET and entry notional only", () => {
  assert.equal(calculateNetPositionPct(0.08, 0.001, 80000), 0.1);
  assert.equal(calculateNetPositionPct(-0.04, 0.001, 80000), -0.05);
  const canonicalNet = 0.05;
  assert.equal(calculateNetPositionPct(canonicalNet, 0.001, 80000), 0.0625);
  assert.equal(calculateNetPositionPct(0.08, 0.001, null), null);
  assert.equal(calculateNetPositionPct(0.08, 0, 80000), null);
  assert.equal(calculateNetPositionPct(null, 0.001, 80000), null);
});

function fill(id: string, side: "buy" | "sell", fee: number | null = 0.03): PaperFillSnapshot {
  return { fillId: id, clientOrderId: id, instrument: "BTCUSDT-PERP", venue: "SIM", marketType: "perpetual", side, quantity: 0.001, price: 100, timestamp: `2026-09-11T17:2${id === "1" ? "1" : "2"}:00.000Z`, fee, feeAsset: "USDT", liquidity: "TAKER" };
}
function state(side: "long" | "short" = "long"): PaperState {
  return { active: true, backend: "nautilus", source: "nautilus", availability: "PARTIAL", resources: { account: "AVAILABLE", position: "AVAILABLE", orders: "AVAILABLE", fills: "AVAILABLE", trades: "NOT_WIRED", settings: "NOT_WIRED" }, position: { symbol: "BTCUSDT-PERP", side, quantity: 0.001, entryPrice: 100, markPrice: 110, unrealizedPnl: 2, leverage: null, marginMode: "unknown" }, account: { exchange: "paper", balanceUsdt: 1000, equityUsdt: 1000, availableMarginUsdt: 1000, unrealizedPnlUsdt: 999, realizedPnlUsdt: 10, feesTotal: "0.03", updatedAt: "" }, fills: [fill("1", side === "long" ? "buy" : "sell")], orders: [], trades: [], loading: false, error: null, lastUpdatedAt: 1, refresh: async () => {} };
}
for (const side of ["long", "short"] as const) {
  test(`open ${side}: uses canonical position gross, actual entry fee, separate exit estimates`, () => {
    const input = state(side);
    const pnl = canonicalNetPnl(input, { feeBps: 5, slippageBps: 1 });
    assert.equal(pnl.gross, 2, "never reconstruct gross from prices or substitute account PnL");
    assert.equal(pnl.actualFees, 0.03);
    assert.equal(pnl.estimatedExitFee, 0.000055);
    assert.equal(pnl.estimatedExitSlippage, 0.000011);
    assert.equal(pnl.net, 2 - 0.03 - 0.000055 - 0.000011);
    assert.equal(pnl.netPct, pnl.net! / 1000 * 100);
  });
}
test("historical fees unchanged by estimation settings", () => {
  const input = state();
  const low = canonicalNetPnl(input, { feeBps: 1, slippageBps: 0 });
  const high = canonicalNetPnl(input, { feeBps: 99, slippageBps: 8 });
  assert.equal(low.actualFees, high.actualFees);
  assert.notEqual(low.estimatedExitFee, high.estimatedExitFee);
});
test("closed actual NET uses all real entry and exit fees, no estimates", () => {
  const input = state();
  input.position = null;
  input.fills.push(fill("2", "sell", 0.04));
  input.account!.feesTotal = "0.07";
  const pnl = canonicalNetPnl(input, { feeBps: 999, slippageBps: 999 });
  assert.equal(pnl.mode, "closed");
  assert.equal(pnl.gross, 10);
  assert.equal(pnl.actualFees, 0.07);
  assert.equal(pnl.net, 9.93);
  assert.equal(pnl.estimatedExitFee, null);
  assert.equal(pnl.estimatedExitSlippage, null);
});
test("deduplication by fillId and account aggregate never double-count fees", () => {
  const input = state();
  input.fills.push({ ...input.fills[0] });
  assert.deepEqual(canonicalNetPnl(input), canonicalNetPnl(state()));
});
test("a new position excludes fees of previously closed cycles", () => {
  const input = state();
  input.fills = [fill("1", "buy"), fill("2", "sell"), { ...fill("3", "buy", 0.01), timestamp: "2026-09-11T17:23:00.000Z" }];
  input.account!.feesTotal = "0.07";
  assert.equal(canonicalNetPnl(input).actualFees, 0.01);
});
test("unavailable resources and null fees never become zero", () => {
  for (const resource of ["position", "fills"] as const) {
    const input = state(); input.resources[resource] = "UNAVAILABLE";
    assert.equal(canonicalNetPnl(input).net, null);
  }
  const input = state(); input.fills[0].fee = null;
  assert.equal(canonicalNetPnl(input).actualFees, null);
  assert.equal(canonicalNetPnl(input).net, null);
  input.fills = [];
  assert.equal(canonicalNetPnl(input).net, null);
});
test("explicit zero fees and slippage produce valid canonical NET", () => {
  const input = state();
  input.fills[0].fee = 0;
  input.account!.feesTotal = "0";
  const pnl = canonicalNetPnl(input);
  assert.equal(pnl.actualFees, 0);
  assert.equal(pnl.estimatedExitFee, 0);
  assert.equal(pnl.estimatedExitSlippage, 0);
  assert.equal(pnl.net, 2);
});

test("missing equity does not invent NET percent; missing gross does not invent NET", () => {
  const input = state(); input.account = undefined;
  assert.notEqual(canonicalNetPnl(input).net, null);
  assert.equal(canonicalNetPnl(input).netPct, null);
  input.position!.unrealizedPnl = undefined;
  assert.equal(canonicalNetPnl(input).net, null);
});
test("inconsistent, foreign currency, or ambiguous partial-close fills are unavailable", () => {
  const input = state(); input.fills[0].feeAsset = "BTC";
  assert.equal(canonicalNetPnl(input).net, null);
  input.fills[0].feeAsset = "USDT";
  input.fills.push({ ...fill("2", "sell"), quantity: 0.0005 });
  input.position!.quantity = 0.0005;
  assert.equal(canonicalNetPnl(input).actualFees, null);
  assert.match(canonicalNetPnl(input).reason!, /attribution/);
});

test("entry-notional NET percent is independent of account equity", () => {
  const input = state();
  const before = calculateNetPositionPct(canonicalNetPnl(input).net, input.position!.quantity, input.position!.entryPrice);
  input.account!.equityUsdt *= 100;
  assert.equal(calculateNetPositionPct(canonicalNetPnl(input).net, input.position!.quantity, input.position!.entryPrice), before);
});

test("protective NET at level respects long/short direction and actual fees", async () => {
  const { canonicalNetAtPrice } = await import("./canonicalNetPnl");
  for (const side of ["long", "short"] as const) {
    const input = state(side);
    input.position!.markPrice = 100;
    input.position!.unrealizedPnl = 0;
    const profitPrice = side === "long" ? 200 : 50;
    const lossPrice = side === "long" ? 50 : 200;
    assert.ok(canonicalNetAtPrice(input, profitPrice)! > 0);
    assert.ok(canonicalNetAtPrice(input, lossPrice)! < 0);
    assert.equal(canonicalNetAtPrice(input, 100), -0.03);
    input.fills[0].fee = null;
    assert.equal(canonicalNetAtPrice(input, 100), null);
  }
});
