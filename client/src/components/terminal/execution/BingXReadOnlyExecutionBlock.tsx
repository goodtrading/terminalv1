import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type {
  BingXReadOnlySnapshot,
  BrokerSessionState,
} from "./executionTypes";
import { bingxApiFetch } from "./bingxApiClient";
import {
  bingxAccountSyncHint,
  bingxReadOnlyErrorMessage,
  formatLastSyncAgo,
} from "./bingxReadOnlyMessages";
import { hasPersistedBingXConnection } from "./bingxSession";
import { DEFAULT_CHART_SYMBOL } from "./executionContext";
import { ExecutionVenueStrip } from "./ExecutionVenueStrip";
import { ReadOnlyRiskMirrorPanel } from "../riskMirror/ReadOnlyRiskMirrorPanel";

type BingXReadOnlyExecutionBlockProps = {
  session: BrokerSessionState;
  symbol: string;
  liveTradingEnabled?: boolean;
  onSwitchToPaper: () => void;
};

function formatPositionSummary(
  snapshot: BingXReadOnlySnapshot | undefined,
): string {
  if (!snapshot) return "--";
  const open = snapshot.positions.filter((p) => p.side !== "flat" && p.quantity > 0);
  if (open.length === 0) return "No position";
  if (open.length === 1) {
    const p = open[0];
    return `${p.side.toUpperCase()} ${p.quantity} ${p.symbol}`;
  }
  return `${open.length} open`;
}

export function BingXReadOnlyExecutionBlock({
  session,
  symbol,
  liveTradingEnabled = false,
  onSwitchToPaper,
}: BingXReadOnlyExecutionBlockProps) {
  const queryClient = useQueryClient();
  const connectionId = session.connectionId;
  const canSync = hasPersistedBingXConnection(session);

  const {
    data: snapshot,
    isLoading,
    isError,
    isFetching,
    error,
  } = useQuery<BingXReadOnlySnapshot>({
    queryKey: ["/api/bingx/read-only/snapshot", connectionId, symbol],
    queryFn: async () => {
      const params = new URLSearchParams({
        connectionId: connectionId!,
        symbol,
      });
      const res = await bingxApiFetch(`/api/bingx/read-only/snapshot?${params}`, {
        method: "GET",
        assertOk: false,
      });
      const json = (await res.json()) as {
        success?: boolean;
        snapshot?: BingXReadOnlySnapshot;
        code?: string;
        message?: string;
      };
      if (!res.ok || !json.success || !json.snapshot) {
        throw new Error(
          bingxReadOnlyErrorMessage(json.code, json.message ?? "Sync failed"),
        );
      }
      return json.snapshot;
    },
    enabled: canSync,
    refetchInterval: canSync ? 6_000 : false,
    staleTime: 4_000,
    retry: 1,
  });

  const acc = snapshot?.account;
  const accountSyncStatus = snapshot?.accountSync?.status;
  const balanceLoaded = accountSyncStatus === "loaded";
  const accountSyncHint = bingxAccountSyncHint(
    accountSyncStatus,
    snapshot?.accountSync?.message,
  );
  const connectionHealth = snapshot?.connectionHealth ?? snapshot?.health;
  const syncLabel = isLoading
    ? "Loading…"
    : isFetching
      ? "Syncing…"
      : formatLastSyncAgo(snapshot?.lastSyncTime);

  const errMsg =
    isError && error instanceof Error
      ? error.message
      : snapshot?.error
        ? bingxReadOnlyErrorMessage(snapshot.error.code, snapshot.error.message)
        : null;

  const openPositions = snapshot?.positions.filter(
    (p) => p.side !== "flat" && p.quantity > 0,
  );
  const openOrders = snapshot?.openOrders ?? [];

  return (
    <div className="space-y-2">
      <ExecutionVenueStrip
        chartSymbol={DEFAULT_CHART_SYMBOL}
        liveTradingEnabled={liveTradingEnabled}
      />

      <section className="rounded border border-emerald-500/30 bg-emerald-950/20 p-2 space-y-1.5">
        <div className="text-[8px] font-bold uppercase tracking-widest text-emerald-400/90">
          BingX Real Account — Read Only
        </div>

        <div className="flex flex-wrap gap-1">
          <span className="rounded border border-emerald-500/35 px-1 py-0.5 text-[7px] font-bold uppercase text-emerald-300">
            Read only
          </span>
          <span className="rounded border border-amber-500/35 px-1 py-0.5 text-[7px] font-bold uppercase text-amber-200">
            Real account
          </span>
          <span className="rounded border border-red-900/50 px-1 py-0.5 text-[7px] font-bold uppercase text-red-300/80">
            Trading locked
          </span>
          {connectionHealth ? (
            <span
              className={cn(
                "rounded border px-1 py-0.5 text-[7px] font-bold uppercase",
                connectionHealth === "healthy"
                  ? "border-emerald-500/35 text-emerald-300"
                  : connectionHealth === "degraded"
                    ? "border-amber-500/35 text-amber-300"
                    : "border-red-500/35 text-red-300",
              )}
              title="BingX API connectivity"
            >
              API {connectionHealth}
            </span>
          ) : null}
          {accountSyncStatus ? (
            <span
              className={cn(
                "rounded border px-1 py-0.5 text-[7px] font-bold uppercase",
                balanceLoaded
                  ? "border-emerald-500/35 text-emerald-300"
                  : accountSyncStatus === "empty"
                    ? "border-slate-500/35 text-slate-400"
                    : "border-amber-500/35 text-amber-300",
              )}
              title="Futures balance sync"
            >
              {balanceLoaded ? "Balance loaded" : `Balance ${accountSyncStatus}`}
            </span>
          ) : null}
        </div>

        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-slate-400">
          <span>Broker</span>
          <span className="text-right text-slate-200">BingX</span>
          <span>Connection</span>
          <span className="text-right text-emerald-300/90">Connected read-only</span>
          {session.apiKeyMasked ? (
            <>
              <span>API</span>
              <span className="text-right text-slate-200 font-mono">
                {session.apiKeyMasked}
              </span>
            </>
          ) : null}
          <span>Symbol</span>
          <span className="text-right text-slate-200">{DEFAULT_CHART_SYMBOL}</span>
          <span>Market</span>
          <span className="text-right text-slate-200">Perpetual Futures</span>
          <span>Equity</span>
          <span className="text-right text-slate-200">
            {acc?.equityUsdt != null ? `${acc.equityUsdt.toFixed(2)} USDT` : "--"}
          </span>
          <span>Available margin</span>
          <span className="text-right text-slate-200">
            {acc?.availableMarginUsdt != null
              ? `${acc.availableMarginUsdt.toFixed(2)} USDT`
              : "--"}
          </span>
          <span>Unrealized PnL</span>
          <span
            className={cn(
              "text-right",
              (acc?.unrealizedPnlUsdt ?? 0) > 0 && "text-emerald-400",
              (acc?.unrealizedPnlUsdt ?? 0) < 0 && "text-red-400",
            )}
          >
            {acc?.unrealizedPnlUsdt != null
              ? `${acc.unrealizedPnlUsdt.toFixed(2)} USDT`
              : "--"}
          </span>
          <span>Position</span>
          <span className="text-right text-slate-200">
            {formatPositionSummary(snapshot)}
          </span>
          <span>Open orders</span>
          <span className="text-right text-slate-200">
            {snapshot ? String(openOrders.length) : "--"}
          </span>
          <span>Trading permissions</span>
          <span className="text-right text-amber-400/90">Read-only</span>
          <span>Last sync</span>
          <span className="text-right text-slate-500">{syncLabel}</span>
        </div>

        {accountSyncHint && !balanceLoaded && !errMsg ? (
          <p className="text-[9px] text-amber-300/90 border-t border-terminal-border/50 pt-1.5 leading-snug">
            {accountSyncHint}
          </p>
        ) : null}

        {errMsg ? (
          <p className="text-[9px] text-red-300/90 border-t border-terminal-border/50 pt-1.5">
            {errMsg}
          </p>
        ) : null}

        <p className="text-[8px] text-slate-500 border-t border-terminal-border/40 pt-1.5">
          Risk guard: Live trading locked · Read-only mode
        </p>

        <button
          type="button"
          onClick={onSwitchToPaper}
          className="w-full rounded border border-cyan-500/45 bg-cyan-600/20 py-1.5 text-[9px] font-bold uppercase text-cyan-100 hover:bg-cyan-600/30"
        >
          Switch to Paper Trading
        </button>

        {canSync ? (
          <button
            type="button"
            disabled={isFetching}
            onClick={() => {
              void queryClient.invalidateQueries({
                queryKey: ["/api/bingx/read-only/snapshot", connectionId],
              });
            }}
            className="w-full text-[8px] uppercase text-slate-500 hover:text-slate-300 disabled:opacity-50"
          >
            Refresh account data
          </button>
        ) : null}
      </section>

      {openPositions && openPositions.length > 0 ? (
        <section className="rounded border border-terminal-border bg-[#0a0a0a] p-2 space-y-1">
          <div className="text-[8px] font-bold uppercase tracking-widest text-slate-500">
            Position details
          </div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {openPositions.map((p) => (
              <div
                key={`${p.symbol}-${p.side}`}
                className="text-[8px] text-slate-400 border-b border-terminal-border/40 pb-0.5"
              >
                <span
                  className={cn(
                    "font-bold uppercase",
                    p.side === "long" ? "text-emerald-400" : "text-orange-400",
                  )}
                >
                  {p.side}
                </span>{" "}
                {p.symbol} · qty {p.quantity}
                {p.entryPrice != null ? ` · entry ${p.entryPrice.toFixed(2)}` : ""}
                {p.markPrice != null ? ` · mark ${p.markPrice.toFixed(2)}` : ""}
                {p.unrealizedPnlUsdt != null
                  ? ` · uPnL ${p.unrealizedPnlUsdt.toFixed(2)}`
                  : ""}
                {p.leverage != null ? ` · ${p.leverage}x` : ""}
                {p.marginMode && p.marginMode !== "unknown"
                  ? ` · ${p.marginMode}`
                  : ""}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {openOrders.length > 0 ? (
        <section className="rounded border border-terminal-border bg-[#0a0a0a] p-2 space-y-1">
          <div className="text-[8px] font-bold uppercase tracking-widest text-slate-500">
            Open order details
          </div>
          <div className="space-y-1 max-h-28 overflow-y-auto">
            {openOrders.map((o) => (
              <div
                key={o.id}
                className="text-[8px] text-slate-400 border-b border-terminal-border/40 pb-0.5"
              >
                {o.side} {o.type} {o.symbol}
                {o.price != null ? ` @ ${o.price}` : ""}
                {o.quantity != null ? ` · qty ${o.quantity}` : ""}
                {o.status !== "unknown" ? ` · ${o.status}` : ""}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <ReadOnlyRiskMirrorPanel symbol={symbol} />
    </div>
  );
}
