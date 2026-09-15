import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { adaptNautilusPaperPortfolio } from "./nautilusPaperPortfolioAdapter";

type Raw = { account: Record<string, unknown>; position: Record<string, unknown> | null; fills: Record<string, unknown>[] };
type Action = ["buy" | "sell", string, string, string];
const runtime = "G:/Dev/tmp-release-commit/build/n2c/runtime/nautilus-runtime/python.exe";

function run(actions: readonly Action[], fees = false): Raw {
  if (!existsSync(runtime)) throw new Error(`missing packaged runtime: ${runtime}`);
  const script = `
import json
from decimal import Decimal
from goodtrading.simulation_core import SimulationCore, SimulationCoreConfig
config = SimulationCoreConfig(maker_fee=Decimal("0.0002"), taker_fee=Decimal("0.0005")) if ${fees ? "True" : "False"} else None
core = SimulationCore(config)
core.start()
core.set_market("100", "102", timestamp_ns=1_000_000_000)
for index, (side, quantity, bid, ask) in enumerate(${JSON.stringify(actions)}):
    core.set_market(bid, ask)
    core.submit_market(side, quantity, client_order_id=f"n65-{index}")
def clean(value):
    if isinstance(value, dict): return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, list): return [clean(v) for v in value]
    return str(value) if type(value).__name__ == "Decimal" else value
print(json.dumps(clean({"account": core.get_account(), "position": core.get_position(), "fills": core.list_fills()}), sort_keys=True))
`;
  return JSON.parse(execFileSync(runtime, ["-c", script], { cwd: "G:/Dev/tmp-release-commit", encoding: "utf8" }).trim()) as Raw;
}

function input(raw: Raw) {
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

function adapt(actions: readonly Action[], fees = false) {
  return adaptNautilusPaperPortfolio(input(run(actions, fees)), { capturedAt: 2_000, goodTradingAccountId: "GT-TEST-001" });
}

const profitableLong: Action[] = [["buy", "1", "99", "101"], ["sell", "1", "109", "111"]];
const losingLong: Action[] = [["buy", "1", "109", "111"], ["sell", "1", "99", "101"]];
const profitableShort: Action[] = [["sell", "1", "109", "111"], ["buy", "1", "99", "101"]];
const losingShort: Action[] = [["sell", "1", "99", "101"], ["buy", "1", "109", "111"]];

for (const [name, actions] of [["profitable LONG", profitableLong], ["losing LONG", losingLong], ["profitable SHORT", profitableShort], ["losing SHORT", losingShort], ["partial close", [["buy", "2", "99", "101"], ["sell", "1", "104", "106"]] as Action[]], ["flip", [["buy", "1", "99", "101"], ["sell", "2", "104", "106"]] as Action[]]] as const) {
  test(`preserves authoritative accounting for ${name}`, () => {
    const result = adapt(actions);
    assert.equal(result.portfolio.accountIdentity.environment, "PAPER");
    assert.equal(result.portfolio.accountIdentity.accountId, "GT-TEST-001");
    assert.equal(result.portfolio.pnl.realized.basis, "NET");
    assert.notEqual(result.portfolio.pnl.realized.value, null);
    assert.notEqual(result.portfolio.equity.value, null);
    assert.equal(result.portfolio.funding.total.value, null);
    assert.equal(result.portfolio.funding.total.quality, "UNAVAILABLE");
    assert.equal(result.portfolio.margin.marginUsed?.value, null);
    assert.equal(result.portfolio.margin.collateral?.value, null);
    assert.equal(result.portfolio.exposure.grossNotional?.value, null);
    assert.equal(result.portfolio.consistency.status, "CONSISTENT");
    assert.equal(result.fills.length, actions.length);
  });
}

test("default packaged policy is an explicit valid zero fee, not unavailable", () => {
  const result = adapt(profitableLong);
  assert.equal(result.fills.every((fill) => fill.fee?.value === 0 && fill.fee?.quality === "VALID"), true);
  assert.equal(result.portfolio.fees.total.value, 0);
  assert.equal(result.portfolio.fees.total.quality, "VALID");
});

test("explicit nonzero Nautilus fee configuration survives the canonical boundary", () => {
  const result = adapt(profitableLong, true);
  assert.equal(result.fills.every((fill) => (fill.fee?.value ?? 0) > 0), true);
  assert.equal((result.portfolio.fees.total.value ?? 0) > 0, true);
  assert.equal(result.portfolio.pnl.realized.value, 7.895);
  assert.equal(result.portfolio.fees.total.value, 0.105);
  assert.equal(result.portfolio.balances.total.value, 100007.895);
  assert.equal(result.portfolio.equity.value, 100007.895);
  assert.equal(result.fills.every((fill) => fill.fee?.currency === "USDT"), true);
});

 test("reported equity and balance remain observations; realized PnL is not added twice", () => {
  const raw = run(profitableLong);
  const result = adapt(profitableLong);
  const account = raw.account;
  assert.equal(result.portfolio.balances.total.value, Number(account.balance_total));
  assert.equal(result.portfolio.equity.value, Number(account.equity));
  assert.equal(result.portfolio.pnl.realized.value, Number(account.realized_pnl));
  assert.notEqual(result.portfolio.equity.value, (Number(account.balance_total) + Number(account.realized_pnl) + Number(account.unrealized_pnl)));
});

test("same Nautilus state projects deterministically", () => {
  assert.deepEqual(adapt(profitableLong), adapt(profitableLong));
});
