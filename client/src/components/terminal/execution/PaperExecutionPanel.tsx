import type { ExecutionWorkspace } from "@/lib/executionWorkspace";
import { useState } from "react";
import { cn } from "@/lib/utils";
import { usePaperState } from "@/lib/paperState";
import { PaperPositionsOrdersSection } from "./PaperPositionsOrdersSection";
import { PaperOrderEntryPanel } from "./PaperOrderEntryPanel";
import { ExchangeConnectionPanel } from "./ExchangeConnectionPanel";
import { TerminalErrorBoundary } from "@/components/common/TerminalErrorBoundary";
import { formatPrice } from "./paperFormatHelpers";
import { CanonicalNetPnlCard } from "./CanonicalNetPnlCard";

type ExecutionDockTab = "account" | "orders" | "execution" | "connections";

export function PaperExecutionPanel({ collapsed = false, executionWorkspace = "paper" }: { collapsed?: boolean; executionWorkspace?: ExecutionWorkspace }) {
  const [activeTab, setActiveTab] = useState<ExecutionDockTab>("execution");
  const canonicalState = usePaperState();
  const isPaper = executionWorkspace === "paper";
  const paperState = isPaper ? canonicalState : { ...canonicalState, account: undefined, position: null, orders: [], trades: [] };
  const account = paperState.account;
  const position = paperState.position;
  const orders = paperState.orders ?? [];
  const trades = paperState.trades ?? [];
  const pendingOrders = orders.filter((order) =>
    ["ACCEPTED", "PARTIALLY_FILLED", "open", "pending", "partial"].includes(order.status),
  );
  const orderHistory = orders.filter((order) => !pendingOrders.includes(order)).slice(0, 8);
  const closedTrades = trades.filter((trade) => trade.status === "closed").slice(0, 3);
  const health = paperState.availability === "AVAILABLE" ? "LIVE" : paperState.availability;
  const backend = paperState.backend?.toUpperCase() ?? "LEGACY";
  const instrument = position?.symbol ?? "BTCUSDT-PERP";

  return (
    <div data-execution-workspace={executionWorkspace} data-execution-panel="PaperExecutionPanel" className="flex-1 min-w-0 min-h-0 flex flex-col border border-terminal-border bg-terminal-bg overflow-hidden">
      <div className="flex items-center justify-between gap-3 px-3 py-1 border-b border-terminal-border bg-terminal-panel/30">
        <div className="flex items-center gap-2 min-w-0 text-[11px] font-mono terminal-text-secondary">
          <span className="font-bold text-cyan-300">{isPaper ? `PAPER · ${backend}` : executionWorkspace.toUpperCase()}</span>
          <span className="truncate">{instrument}</span>
          <span className={health === "LIVE" ? "text-cyan-300" : "text-amber-300"}>● {isPaper ? health : "NOT_WIRED"}</span>
        </div>
      </div>
      {!collapsed ? (
        <>
          <div className="flex items-center gap-1 px-2 py-1 border-b border-terminal-border bg-terminal-panel/20" role="tablist" aria-label="Execution Dock">
            {(["account", "orders", "execution", "connections"] as const).map((tab) => (
              <button
                key={tab}
                type="button"
                role="tab"
                aria-selected={activeTab === tab}
                onClick={() => setActiveTab(tab)}
                className={cn(
                  "px-2 py-1 text-[10px] uppercase tracking-wider border transition-colors",
                  activeTab === tab ? "border-terminal-accent bg-terminal-accent/15 text-white" : "border-transparent terminal-text-muted hover:text-white",
                )}
              >
                {tab}
              </button>
            ))}
          </div>
          <div className="flex-1 min-h-0 overflow-y-auto p-2">
            {isPaper && paperState.backend === "nautilus" && activeTab !== "connections" ? <CanonicalNetPnlCard state={paperState} /> : null}
            {activeTab === "account" ? (
              <div className="grid grid-cols-2 gap-x-6 gap-y-1 text-[12px] font-mono max-w-xl">
                <span className="terminal-text-muted">Equity</span><span className="text-right terminal-text-data">{account?.equityUsdt != null ? `${account.equityUsdt.toFixed(2)} USDT` : "--"}</span>
                <span className="terminal-text-muted">Balance</span><span className="text-right terminal-text-data">{account?.balanceUsdt != null ? `${account.balanceUsdt.toFixed(2)} USDT` : "--"}</span>
                <span className="terminal-text-muted">Available</span><span className="text-right terminal-text-data">{account?.availableMarginUsdt != null ? `${account.availableMarginUsdt.toFixed(2)} USDT` : "--"}</span>
                <span className="terminal-text-muted">Position</span><span className="text-right terminal-text-data">{position?.side ?? "--"}</span>
                <span className="terminal-text-muted">Quantity</span><span className="text-right terminal-text-data">{position?.quantity ?? "--"}</span>
                <span className="terminal-text-muted">Entry</span><span className="text-right terminal-text-data">{position?.entryPrice ?? "--"}</span>
                <span className="terminal-text-muted">Mark</span><span className="text-right terminal-text-data">{position?.markPrice ?? "--"}</span>
                <span className="terminal-text-muted">PnL</span><span className="text-right terminal-text-data">{account?.unrealizedPnlUsdt != null ? `${account.unrealizedPnlUsdt.toFixed(2)} USDT` : "--"}</span>
              </div>
            ) : null}
            {activeTab === "orders" ? (
              <div className="space-y-2 text-[12px] font-mono">
                <PaperPositionsOrdersSection
                  position={position}
                  pendingOrders={pendingOrders}
                  closedTrades={closedTrades}
                  backend={paperState.backend ?? "legacy"}
                  unrealizedPnl={account?.unrealizedPnlUsdt}
                  onMessage={() => undefined}
                  onRefresh={paperState.refresh}
                />
                {orderHistory.length > 0 ? (
                  <div className="rounded border border-terminal-border/60 bg-black/20 px-2 py-1.5 space-y-1">
                    <div className="text-[10px] font-bold uppercase tracking-wider terminal-text-secondary">Order history</div>
                    <ul className="space-y-1">
                      {orderHistory.map((order) => (
                        <li key={order.id} className="flex items-center justify-between gap-2 terminal-text-secondary">
                          <span className="min-w-0 truncate">
                            {order.instrument ?? order.symbol} · {order.side === "long" ? "BUY" : "SELL"} {order.orderType ?? order.type.toUpperCase()} · {order.quantity ?? String(order.size)} · {order.price != null ? `@ ${formatPrice(order.price)}` : "MKT"} · {order.filledQuantity ?? "—"}/{order.remainingQuantity ?? "—"}
                          </span>
                          <span className="shrink-0 text-[11px] terminal-text-primary">{order.status}</span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {pendingOrders.length === 0 && orderHistory.length === 0 && closedTrades.length === 0 ? (
                  <div className="terminal-text-muted">No orders available</div>
                ) : null}
              </div>
            ) : null}
            {activeTab === "execution" ? (
              <TerminalErrorBoundary name="paper-execution" fallbackMessage="Paper panel error. Reload this workspace.">
                <PaperOrderEntryPanel collapsed={false} executionWorkspace={executionWorkspace} />
              </TerminalErrorBoundary>
            ) : null}
            {activeTab === "connections" ? (
              <TerminalErrorBoundary name="exchange-connection" fallbackMessage="Connection panel crashed. Reload terminal.">
                <ExchangeConnectionPanel collapsed={false} />
              </TerminalErrorBoundary>
            ) : null}
          </div>
        </>
      ) : null}
    </div>
  );
}
