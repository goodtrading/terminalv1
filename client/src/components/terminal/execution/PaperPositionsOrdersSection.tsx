import type {
  PaperOrderSnapshot,
  PaperPositionSnapshot,
  PaperTradeLedgerSnapshot,
} from "./executionTypes";
import { formatPrice, formatUSDT } from "./paperFormatHelpers";
import { paperExecutionPort, getPaperExecutionBackend } from "@/lib/paperExecutionPort";
import { nautilusSimulation } from "@/lib/nautilusSimulationBridge";

type Props = {
  /** Still passed for parent refresh wiring; position UI lives on chart overlay. */
  position: PaperPositionSnapshot | null;
  pendingOrders: PaperOrderSnapshot[];
  closedTrades: PaperTradeLedgerSnapshot[];
  unrealizedPnl?: number;
  onMessage: (msg: string) => void;
  onRefresh: () => void | Promise<void>;
  busy?: boolean;
  backend?: "legacy" | "nautilus";
};

export function PaperPositionsOrdersSection({
  pendingOrders,
  closedTrades,
  onMessage,
  onRefresh,
  busy = false,
  backend = "legacy",
}: Props) {
  const hasPending = pendingOrders.length > 0;
  const recentClosed = closedTrades.slice(0, 3);
  const hasClosed = recentClosed.length > 0;

  if (!hasPending && !hasClosed) {
    return null;
  }

  const cancelOne = async (orderId: string) => {
    try {
      if (getPaperExecutionBackend() === "nautilus") {
        await nautilusSimulation.cancelOrder(orderId);
      } else {
        await paperExecutionPort.cancelOrder(orderId);
      }
      onMessage("Order cancellation requested");
      await onRefresh();
    } catch (err) {
      onMessage(err instanceof Error ? err.message : "Cancel failed");
    }
  };

  return (
    <div className="space-y-1.5">
      {hasPending ? (
        <div className="rounded border border-terminal-border/80 bg-black/30 px-2 py-1 space-y-0.5">
          <div className="text-[7px] font-bold uppercase tracking-widest text-slate-500">
            Orders
          </div>
          <ul className="space-y-0.5">
            {pendingOrders.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-1 text-[8px] font-mono"
              >
                <span className="text-slate-400 truncate">
                  {o.instrument ?? o.symbol} · {o.side === "long" ? "BUY" : "SELL"} {o.orderType ?? o.type.toUpperCase()}{" "}
                  {o.quantity ?? String(o.size)} · {o.limitPrice != null ? `@ ${formatPrice(o.limitPrice)}` : "MKT"} · {o.filledQuantity ?? "—"}/{o.remainingQuantity ?? "—"} · {o.status}
                </span>
                {o.status === "ACCEPTED" || o.status === "PARTIALLY_FILLED" ? <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancelOne(o.id)}
                  className="shrink-0 text-[7px] uppercase text-amber-300/90 hover:text-amber-200 disabled:opacity-50"
                >
                  Cancel
                </button> : null}
              </li>
            ))}
          </ul>
        </div>
      ) : null}

      {hasClosed ? (
        <div className="rounded border border-terminal-border/60 bg-black/20 px-2 py-1 space-y-0.5">
          <div className="text-[7px] font-bold uppercase tracking-widest text-slate-600">
            Closed trades
          </div>
          <ul className="space-y-0.5">
            {recentClosed.map((t) => (
              <li
                key={t.id}
                className="text-[8px] text-slate-500 font-mono truncate"
              >
                {t.side.toUpperCase()} · {formatUSDT(t.realizedPnlUsdt)}
                {t.rMultiple != null ? ` · ${t.rMultiple}R` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  );
}
