import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { existsSync } from "node:fs";
import test from "node:test";
import { adaptNautilusPaperPortfolio } from "./nautilusPaperPortfolioAdapter";

type Snapshot = {
  account: Record<string, unknown>;
  position: Record<string, unknown> | null;
  fills: Record<string, unknown>[];
};

type Scenario = { name: string; actions: [string, string][]; expectedSide: string | null; expectedQuantity: string };

const scenarios: Scenario[] = [
  { name: "OPEN LONG", actions: [["buy", "1"]], expectedSide: "LONG", expectedQuantity: "1" },
  { name: "INCREASE LONG", actions: [["buy", "1"], ["buy", "1"]], expectedSide: "LONG", expectedQuantity: "2" },
  { name: "PARTIAL CLOSE LONG", actions: [["buy", "2"], ["sell", "1"]], expectedSide: "LONG", expectedQuantity: "1" },
  { name: "FULL CLOSE LONG", actions: [["buy", "1"], ["sell", "1"]], expectedSide: null, expectedQuantity: "0" },
  { name: "LONG TO SHORT FLIP", actions: [["buy", "1"], ["sell", "2"]], expectedSide: "SHORT", expectedQuantity: "1" },
  { name: "OPEN SHORT", actions: [["sell", "1"]], expectedSide: "SHORT", expectedQuantity: "1" },
  { name: "INCREASE SHORT", actions: [["sell", "1"], ["sell", "1"]], expectedSide: "SHORT", expectedQuantity: "2" },
  { name: "PARTIAL CLOSE SHORT", actions: [["sell", "2"], ["buy", "1"]], expectedSide: "SHORT", expectedQuantity: "1" },
  { name: "FULL CLOSE SHORT", actions: [["sell", "1"], ["buy", "1"]], expectedSide: null, expectedQuantity: "0" },
  { name: "SHORT TO LONG FLIP", actions: [["sell", "1"], ["buy", "2"]], expectedSide: "LONG", expectedQuantity: "1" },
];

function runNautilusScenario(actions: readonly [string, string][]): Snapshot {
  const runtime = "G:/Dev/tmp-release-commit/build/n2c/runtime/nautilus-runtime/python.exe";
  if (!existsSync(runtime)) throw new Error(`packaged Nautilus runtime missing: ${runtime}`);
  const script = `
import json
from goodtrading.simulation_core import SimulationCore
core = SimulationCore()
core.start()
core.set_market("100", "102", timestamp_ns=1_000_000_000)
actions = ${JSON.stringify(actions)}
for index, (side, quantity) in enumerate(actions):
    core.submit_market(side, quantity, client_order_id=f"n64-{index}")

def clean(value):
    if isinstance(value, dict): return {str(k): clean(v) for k, v in value.items()}
    if isinstance(value, list): return [clean(v) for v in value]
    return str(value) if type(value).__name__ == "Decimal" else value
account = core.get_account()
position = core.get_position()
fills = core.list_fills()
print(json.dumps(clean({"account": account, "position": position, "fills": fills}), sort_keys=True))
`;
  return JSON.parse(execFileSync(runtime, ["-c", script], { cwd: "G:/Dev/tmp-release-commit", encoding: "utf8" }).trim()) as Snapshot;
}

function bridgeInput(snapshot: Snapshot) {
  const account = snapshot.account;
  const instrument = account.instrument as Record<string, unknown>;
  const accountInput = {
    account_id: String(account.account_id),
    venue: String(account.venue),
    account_type: String(account.account_type),
    base_currency: String(account.base_currency),
    balance_total: account.balance_total as string,
    balance_free: account.balance_free as string,
    balance_locked: account.balance_locked as string,
    equity: account.equity as string,
    realized_pnl: account.realized_pnl as string,
    unrealized_pnl: account.unrealized_pnl as string,
    fees_total: account.fees_total as string,
    timestamp: Number(account.timestamp) / 1_000_000,
    instrument: { venue: String(instrument.venue), market_type: String(instrument.market_type), symbol: String(instrument.symbol) },
  };
  const positions = snapshot.position ? [{
    instrument_id: String(snapshot.position.instrument_id),
    side: String(snapshot.position.side),
    quantity: snapshot.position.quantity as string,
    average_entry_price: snapshot.position.average_entry_price as string,
    mark_price: snapshot.position.mark_price as string,
    realized_pnl: snapshot.position.realized_pnl as string,
    unrealized_pnl: snapshot.position.unrealized_pnl as string,
    fees_total: snapshot.position.fees_total as string,
    opened_at: snapshot.position.opened_at == null ? null : Number(snapshot.position.opened_at) / 1_000_000,
    updated_at: snapshot.position.updated_at == null ? null : Number(snapshot.position.updated_at) / 1_000_000,
  }] : [];
  const fills = snapshot.fills.map((fill) => ({
    fill_id: String(fill.fill_id),
    client_order_id: String(fill.client_order_id),
    venue_order_id: fill.venue_order_id == null ? null : String(fill.venue_order_id),
    instrument_id: String(fill.instrument_id),
    side: String(fill.side),
    price: fill.price as string,
    quantity: fill.quantity as string,
    timestamp: Number(fill.timestamp) / 1_000_000,
    fee: fill.fee == null ? null : fill.fee as string,
    fee_asset: fill.fee_asset == null ? null : String(fill.fee_asset),
    liquidity: fill.liquidity == null ? null : String(fill.liquidity),
  }));
  return { account: accountInput, positions, fills };
}

test("validates all Nautilus canonical position accounting transitions through N6.3", () => {
  for (const scenario of scenarios) {
    const adapted = adaptNautilusPaperPortfolio(bridgeInput(runNautilusScenario(scenario.actions)), { capturedAt: 2_000 });
    const position = adapted.portfolio.positions[0];
    if (scenario.expectedSide === null) {
      assert.equal(position, undefined, `${scenario.name}: closed position must be absent`);
    } else {
      assert.equal(position?.side, scenario.expectedSide, scenario.name);
      assert.equal(String(position?.quantity), scenario.expectedQuantity, scenario.name);
      assert.equal(position?.marketIdentity.marketType, "Perpetual");
      assert.equal(position?.accountIdentity.environment, "PAPER");
      assert.equal(position?.unrealizedPnl.value !== null, true, `${scenario.name}: authoritative unrealized PnL`);
    }
    assert.equal(adapted.portfolio.accountIdentity.accountId, "SIM-001");
    assert.equal(adapted.portfolio.consistency.status, "CONSISTENT", scenario.name);
    assert.equal(adapted.fills.length, scenario.actions.length, `${scenario.name}: fill count`);
    assert.equal(adapted.fills.every((fill) => fill.side === "BUY" || fill.side === "SELL"), true);
    assert.equal(adapted.fills.some((fill) => "OPEN" in fill || "CLOSE" in fill || "FLIP" in fill), false);
  }
});

test("Nautilus accounting is deterministic and isolated across scenario order", () => {
  const first = scenarios.map((scenario) => adaptNautilusPaperPortfolio(bridgeInput(runNautilusScenario(scenario.actions)), { capturedAt: 2_000 }));
  const reversed = [...scenarios].reverse().map((scenario) => adaptNautilusPaperPortfolio(bridgeInput(runNautilusScenario(scenario.actions)), { capturedAt: 2_000 })).reverse();
  assert.deepEqual(first, reversed);
});

test("preserves authoritative fee and balance observations without TypeScript accounting", () => {
  const adapted = adaptNautilusPaperPortfolio(bridgeInput(runNautilusScenario([["buy", "1"], ["sell", "1"]])), { capturedAt: 2_000 });
  assert.equal(adapted.fills.every((fill) => fill.fee?.currency === "USDT"), true);
  assert.equal(adapted.fills.every((fill) => fill.fee?.value === 0), true);
  assert.equal(adapted.portfolio.fees.total.value, 0);
  assert.equal(adapted.portfolio.pnl.realized.value !== null, true);
  assert.equal(adapted.portfolio.equity.value !== null, true);
  assert.equal(adapted.portfolio.exposure.grossNotional?.value, null);
});
