import type {
  PaperOrderSnapshot,
  PaperPositionSnapshot,
  PaperTradeLedgerSnapshot,
} from "./executionTypes";
import { formatPrice, formatUSDT } from "./paperFormatHelpers";
import { paperApiFetch } from "./paperApiClient";

type Props = {
  /** Still passed for parent refresh wiring; position UI lives on chart overlay. */
  position: PaperPositionSnapshot | null;
  pendingOrders: PaperOrderSnapshot[];
  closedTrades: PaperTradeLedgerSnapshot[];
  unrealizedPnl?: number;
  onMessage: (msg: string) => void;
  onRefresh: () => void | Promise<void>;
  busy?: boolean;
};

export function PaperPositionsOrdersSection({
  pendingOrders,
  closedTrades,
  onMessage,
  onRefresh,
  busy = false,
}: Props) {
  const hasPending = pendingOrders.length > 0;
  const recentClosed = closedTrades.slice(0, 3);
  const hasClosed = recentClosed.length > 0;

  if (!hasPending && !hasClosed) {
    return null;
  }

  const cancelOne = async (orderId: string) => {
    try {
      const res = await paperApiFetch(
        `/api/paper/orders/${encodeURIComponent(orderId)}/cancel`,
        { method: "POST", assertOk: false },
      );
      const json = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || !json.success) {
        onMessage(json.message ?? "Cancel failed");
        return;
      }
      onMessage(json.message ?? "Order cancelled");
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
            Pending orders
          </div>
          <ul className="space-y-0.5">
            {pendingOrders.map((o) => (
              <li
                key={o.id}
                className="flex items-center justify-between gap-1 text-[8px] font-mono"
              >
                <span className="text-slate-400 truncate">
                  {o.side.toUpperCase()} {o.type}{" "}
                  {o.size != null ? String(o.size) : "—"} @{" "}
                  {o.price != null ? formatPrice(o.price) : "MKT"}
                </span>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void cancelOne(o.id)}
                  className="shrink-0 text-[7px] uppercase text-amber-300/90 hover:text-amber-200 disabled:opacity-50"
                >
                  Cancel
                </button>
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
