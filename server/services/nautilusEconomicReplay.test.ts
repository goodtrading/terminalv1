import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { derivePortfolioAggregates } from "../../shared/portfolioAggregates";
import { compareEconomicFills, economicFillIdentityKey, economicFillsEqual, type EconomicFillRecord } from "../../shared/economicFill";
import { adaptNautilusPaperPortfolio } from "./nautilusPaperPortfolioAdapter";

type Action = ["buy" | "sell", string, string, string];
type Raw = { account: Record<string, unknown>; position: Record<string, unknown> | null; fills: Record<string, unknown>[] };
const runtime = "G:/Dev/tmp-release-commit/build/n2c/runtime/nautilus-runtime/python.exe";
const aggregateConfig = { notionalPolicy: { mode: "LINEAR_QUANTITY_TIMES_PRICE" as const, currency: "USDT", allowPartialReferencePrice: true } };

function replay(actions: readonly Action[], nonzeroFees = false): Raw {
  if (!existsSync(runtime)) throw new Error(`missing packaged Nautilus runtime: ${runtime}`);
  const code = `
import json
from decimal import Decimal
from goodtrading.simulation_core import SimulationCore, SimulationCoreConfig
config = SimulationCoreConfig(maker_fee=Decimal("0.0002"), taker_fee=Decimal("0.0005")) if ${nonzeroFees ? "True" : "False"} else None
core = SimulationCore(config)
core.start()
for index, (side, quantity, bid, ask) in enumerate(${JSON.stringify(actions)}):
    core.set_market(bid, ask, timestamp_ns=1_000_000_000 + index * 100)
    core.submit_market(side, quantity, client_order_id=f"n67-{index}")
def clean(value):
    if isinstance(value, dict): return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, list): return [clean(v) for v in value]
    return str(value) if type(value).__name__ == "Decimal" else value
print(json.dumps(clean({"account": core.get_account(), "position": core.get_position(), "fills": core.list_fills()}), sort_keys=True))
`;
  return JSON.parse(execFileSync(runtime, ["-c", code], { cwd: "G:/Dev/tmp-release-commit", encoding: "utf8" }).trim()) as Raw;
}

function canonicalInput(raw: Raw) {
  const a = raw.account;
  const i = a.instrument as Record<string, unknown>;
  return {
    account: {
      account_id: String(a.account_id), venue: String(a.venue), account_type: String(a.account_type), base_currency: String(a.base_currency),
      balance_total: a.balance_total as string, balance_free: a.balance_free as string, balance_locked: a.balance_locked as string,
      equity: a.equity as string, realized_pnl: a.realized_pnl as string, unrealized_pnl: a.unrealized_pnl as string, fees_total: a.fees_total as string,
      timestamp: Number(a.timestamp) / 1_000_000,
      instrument: { symbol: String(i.symbol), venue: String(i.venue), market_type: String(i.market_type) },
    },
    positions: raw.position ? [{
      instrument_id: String(raw.position.instrument_id), side: String(raw.position.side), quantity: raw.position.quantity as string,
      average_entry_price: raw.position.average_entry_price as string, mark_price: raw.position.mark_price as string,
      realized_pnl: raw.position.realized_pnl as string, unrealized_pnl: raw.position.unrealized_pnl as string,
      fees_total: raw.position.fees_total as string, opened_at: Number(raw.position.opened_at) / 1_000_000, updated_at: Number(raw.position.updated_at) / 1_000_000,
    }] : [],
    fills: raw.fills.map((f) => ({
      fill_id: String(f.fill_id), client_order_id: String(f.client_order_id), venue_order_id: f.venue_order_id == null ? null : String(f.venue_order_id),
      instrument_id: String(f.instrument_id), side: String(f.side), price: f.price as string, quantity: f.quantity as string,
      timestamp: Number(f.timestamp) / 1_000_000, fee: f.fee as string, fee_asset: f.fee_asset == null ? null : String(f.fee_asset), liquidity: f.liquidity == null ? null : String(f.liquidity),
    })),
  };
}

function project(actions: readonly Action[], nonzeroFees = false) {
  const raw = replay(actions, nonzeroFees);
  const result = adaptNautilusPaperPortfolio(canonicalInput(raw), { capturedAt: 2_000 });
  const aggregates = derivePortfolioAggregates(result.portfolio, aggregateConfig);
  return { ...result, aggregates };
}

const longReplay: Action[] = [["buy", "1", "99", "101"], ["buy", "1", "99", "101"], ["sell", "1", "104", "106"], ["sell", "1", "109", "111"]];
const shortReplay: Action[] = [["sell", "1", "109", "111"], ["sell", "1", "109", "111"], ["buy", "1", "104", "106"], ["buy", "1", "99", "101"]];
const longFlip: Action[] = [["buy", "1", "99", "101"], ["sell", "2", "104", "106"]];
const shortFlip: Action[] = [["sell", "1", "109", "111"], ["buy", "2", "104", "106"]];

for (const [name, actions] of [["LONG", longReplay], ["SHORT", shortReplay]] as const) {
  test(`replays full ${name} lifecycle through Nautilus → N6.3 → N6.6`, () => {
    const first = project(actions);
    const second = project(actions);
    assert.deepEqual(first, second);
    assert.equal(first.portfolio.positions.length, 0);
    assert.equal(first.portfolio.positions[0], undefined);
    assert.equal(first.aggregates.positionCount.value, 0);
    assert.equal(first.aggregates.grossNotional.value, 0);
    assert.equal(first.aggregates.grossNotional.quality, "VALID");
    assert.equal(first.aggregates.netNotional.value, 0);
    assert.equal(first.portfolio.consistency.status, "CONSISTENT");
    assert.equal(first.portfolio.funding.total.value, null);
    assert.equal(first.portfolio.funding.total.quality, "UNAVAILABLE");
    assert.equal(first.fills.length, actions.length);
  });
}

for (const [name, actions, side] of [["LONG TO SHORT", longFlip, "SHORT"], ["SHORT TO LONG", shortFlip, "LONG"]] as const) {
  test(`replays ${name} with factual fill sides`, () => {
    const result = project(actions, true);
    const position = result.portfolio.positions[0];
    assert.equal(position?.side, side);
    assert.equal(position?.quantity, 1);
    assert.equal(result.aggregates.positionCount.value, 1);
    assert.equal(result.aggregates.netNotional.value, side === "LONG" ? 105 : -105);
    assert.equal(result.portfolio.pnl.realized.value !== null, true);
    assert.equal(result.portfolio.pnl.realized.basis, "NET");
    assert.equal(result.portfolio.fees.total.value !== null, true);
    assert.equal(result.fills.every((fill) => fill.side === "BUY" || fill.side === "SELL"), true);
    assert.equal(result.fills.some((fill) => "FLIP" in fill || "OPEN" in fill || "CLOSE" in fill), false);
  });
}

test("zero and nonzero fee replays remain explicit and distinct", () => {
  const zero = project(longFlip);
  const nonzero = project(longFlip, true);
  assert.equal(zero.fills.every((fill) => fill.fee?.value === 0 && fill.fee?.quality === "VALID"), true);
  assert.equal(zero.portfolio.fees.total.value, 0);
  assert.equal(nonzero.fills.every((fill) => (fill.fee?.value ?? 0) > 0 && fill.fee?.currency === "USDT"), true);
  assert.equal((nonzero.portfolio.fees.total.value ?? 0) > 0, true);
  assert.equal(nonzero.portfolio.equity.value !== null, true);
  assert.equal(nonzero.portfolio.balances.total.value !== null, true);
});

test("replay ordering is isolated and canonical fill duplicates/conflicts remain observable", () => {
  const a1 = project(longReplay);
  project(shortReplay);
  project(longFlip);
  const a2 = project(longReplay);
  assert.deepEqual(a1, a2);
  const fills = a1.fills as EconomicFillRecord[];
  const identityKeys = [...fills, fills[0]!].map(economicFillIdentityKey);
  assert.equal(identityKeys.filter((key, index) => identityKeys.indexOf(key) !== index).length, 1);
  const conflict = { ...fills[0]!, price: fills[0]!.price + 1 };
  assert.equal(compareEconomicFills(fills[0]!, conflict), 0);
  assert.equal(economicFillsEqual(fills[0]!, conflict), false);
});

test("replay result is defensive and preserves authoritative accounting fields", () => {
  const result = project(longFlip, true);
  const before = JSON.stringify({ balances: result.portfolio.balances, equity: result.portfolio.equity, pnl: result.portfolio.pnl, fees: result.portfolio.fees });
  const originalId = result.fills[0]?.executionId;
  (result.aggregates.positionExposures as { positionId: string }[]).reverse();
  assert.equal(result.fills[0]?.executionId, originalId);
  assert.equal(JSON.stringify({ balances: result.portfolio.balances, equity: result.portfolio.equity, pnl: result.portfolio.pnl, fees: result.portfolio.fees }), before);
});
