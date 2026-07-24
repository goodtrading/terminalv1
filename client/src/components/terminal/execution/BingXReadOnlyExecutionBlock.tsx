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
import { hasPersistedBingXConnection, isBingXSecureApiSession } from "./bingxSession";
import { bingXConnectionDisplay } from "./bingxConnectionUi";
import { useBrokerSession } from "./useBrokerSession";
import { DEFAULT_CHART_SYMBOL } from "./executionContext";
import { ExecutionVenueStrip } from "./ExecutionVenueStrip";
import { ReadOnlyRiskMirrorPanel } from "../riskMirror/ReadOnlyRiskMirrorPanel";
import { LiveTradingReadinessBlock } from "../health/LiveTradingReadinessBlock";
import { useLiveTradingReadiness } from "../health/useLiveTradingReadiness";
import { BingxAccountActivityPanel } from "../bingxAccount";

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
  if (snapshot.positionsUnavailable) return "Unavailable";
  const open = snapshot.positions.filter((p) => p.side !== "flat" && p.quantity > 0);
  if (open.length === 0) return "No position";
  if (open.length === 1) {
    const p = open[0];
    return `${p.side.toUpperCase()} ${p.quantity} ${p.symbol}`;
  }
  return `${open.length} open`;
}

function connectionStateTone(state: string | undefined): string {
  switch (state) {
    case "CONNECTED":
      return "border-emerald-500/35 text-emerald-300";
    case "DEGRADED":
    case "STALE":
      return "border-amber-500/35 text-amber-300";
    case "RATE_LIMITED":
    case "UNAUTHORIZED":
    case "ERROR":
      return "border-red-500/35 text-red-300";
    default:
      return "border-slate-500/35 text-slate-400";
  }
}

export function BingXReadOnlyExecutionBlock({
  session,
  symbol,
  onSwitchToPaper,
}: BingXReadOnlyExecutionBlockProps) {
  const queryClient = useQueryClient();
  const { loginStatus } = useBrokerSession();
  const connectionId = session.connectionId;
  const canSync = hasPersistedBingXConnection(session);
  const secureApi = isBingXSecureApiSession(session);
  const display = bingXConnectionDisplay(session, loginStatus);

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
  const connectionState = snapshot?.connectionState;
  const freshness = snapshot?.freshness;
  const dataQuality = snapshot?.dataQuality;
  const syncLabel = isLoading
    ? "Loading…"
    : isFetching
      ? "Syncing…"
      : freshness?.stale
        ? `Stale · ${formatLastSyncAgo(snapshot?.lastSyncTime)}`
        : formatLastSyncAgo(snapshot?.lastSyncTime);

  const errMsg =
    isError && error instanceof Error
      ? error.message
      : snapshot?.error
        ? bingxReadOnlyErrorMessage(snapshot.error.code, snapshot.error.message)
        : null;

  const openPositions = snapshot?.positionsUnavailable
    ? undefined
    : snapshot?.positions.filter((p) => p.side !== "flat" && p.quantity > 0);
  const openOrders = snapshot?.openOrdersUnavailable ? undefined : snapshot?.openOrders ?? [];

  const { readiness: liveReadiness, isLoading: liveReadinessLoading } =
    useLiveTradingReadiness(canSync);

  const readOnlyFreeze =
    liveReadiness?.readOnlyFreezeActive !== false ||
    liveReadiness?.blockers?.includes("BINGX_READ_ONLY_FREEZE_ACTIVE") ||
    !liveReadiness?.readyForLive;

  return (
    <div className="space-y-2">
      <ExecutionVenueStrip
        chartSymbol={DEFAULT_CHART_SYMBOL}
        liveTradingEnabled={false}
      />

      <section className="rounded border border-cyan-500/35 bg-cyan-950/25 p-2 space-y-1">
        <div className="text-[8px] font-bold uppercase tracking-widest text-cyan-200">
          READ-ONLY MODE
        </div>
        <p className="text-[9px] text-cyan-100/90 leading-snug">
          Live execution is disabled during BingX stabilization.
        </p>
      </section>

      <section className="rounded border border-emerald-500/30 bg-emerald-950/20 p-2 space-y-1.5">
        <div className="text-[8px] font-bold uppercase tracking-widest text-emerald-400/90">
          Account Monitor
        </div>

        <div className="flex flex-wrap gap-1">
          {display.badges.map((badge) => (
            <span
              key={badge}
              className={cn(
                "rounded border px-1 py-0.5 text-[7px] font-bold uppercase",
                badge.includes("Secure") || badge.includes("guarded")
                  ? "border-amber-500/35 text-amber-200"
                  : badge.includes("Limit")
                    ? "border-cyan-500/35 text-cyan-200"
                    : "border-emerald-500/35 text-emerald-300",
              )}
            >
              {badge}
            </span>
          ))}
          {connectionState ? (
            <span
              className={cn(
                "rounded border px-1 py-0.5 text-[7px] font-bold uppercase",
                connectionStateTone(connectionState),
              )}
              title="Connection state"
            >
              {connectionState.replace(/_/g, " ")}
            </span>
          ) : null}
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
          {dataQuality?.status ? (
            <span
              className={cn(
                "rounded border px-1 py-0.5 text-[7px] font-bold uppercase",
                dataQuality.status === "complete"
                  ? "border-emerald-500/35 text-emerald-300"
                  : dataQuality.status === "stale"
                    ? "border-amber-500/35 text-amber-300"
                    : "border-amber-500/35 text-amber-300",
              )}
              title="Data quality"
            >
              Data {dataQuality.status}
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
          <span className="text-right text-emerald-300/90">
            {secureApi ? "Connected secure API" : "Connected read-only"}
          </span>
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
              acc?.unrealizedPnlUsdt != null && acc.unrealizedPnlUsdt > 0 && "text-emerald-400",
              acc?.unrealizedPnlUsdt != null && acc.unrealizedPnlUsdt < 0 && "text-red-400",
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
            {snapshot?.openOrdersUnavailable
              ? "Orders unavailable"
              : snapshot
                ? String(openOrders?.length ?? 0)
                : "--"}
          </span>
          <span>Trading permissions</span>
          <span className="text-right text-amber-400/90">Read-only</span>
          <span>Last sync</span>
          <span className="text-right text-slate-500">{syncLabel}</span>
        </div>

        {freshness?.stale ? (
          <p className="text-[9px] text-amber-300/90 border-t border-terminal-border/50 pt-1.5 leading-snug">
            Snapshot is stale. Last successful update:{" "}
            {formatLastSyncAgo(snapshot?.lastSyncTime)}.
          </p>
        ) : null}

        {accountSyncHint && !balanceLoaded && !errMsg ? (
          <p className="text-[9px] text-amber-300/90 border-t border-terminal-border/50 pt-1.5 leading-snug">
            {accountSyncHint}
          </p>
        ) : null}

        {snapshot?.positionsUnavailable ? (
          <p className="text-[9px] text-amber-300/90 border-t border-terminal-border/50 pt-1.5 leading-snug">
            Positions could not be refreshed. Account balance remains available.
          </p>
        ) : null}

        {errMsg ? (
          <p className="text-[9px] text-red-300/90 border-t border-terminal-border/50 pt-1.5">
            {errMsg}
          </p>
        ) : null}

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
                key={p.id ?? `${p.symbol}-${p.positionSide ?? p.side}`}
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

      {openOrders && openOrders.length > 0 ? (
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

      {snapshot?.unknownOrders && snapshot.unknownOrders.length > 0 ? (
        <section className="rounded border border-amber-500/25 bg-amber-950/10 p-2 space-y-1">
          <div className="text-[8px] font-bold uppercase tracking-widest text-amber-400/80">
            Unrecognized orders ({snapshot.unknownOrders.length})
          </div>
          <p className="text-[8px] text-amber-200/80 leading-snug">
            Some orders have unrecognized status and are not shown as open.
          </p>
        </section>
      ) : null}

      <section className="rounded border border-slate-500/30 bg-slate-950/30 p-2 space-y-1.5">
        <div className="text-[8px] font-bold uppercase tracking-widest text-slate-400">
          Trading activity (AI-8.0 read model)
        </div>
        <BingxAccountActivityPanel connectionId={connectionId} symbol={symbol} />
      </section>

      <section className="rounded border border-red-500/30 bg-red-950/15 p-2 space-y-1">
        <div className="text-[8px] font-bold uppercase tracking-widest text-red-300/90">
          LIVE EXECUTION LOCKED
        </div>
        <p className="text-[9px] text-red-100/85 leading-snug">
          BingX is currently available in read-only mode while account monitoring
          and security controls are being validated.
        </p>
        {readOnlyFreeze ? (
          <p className="text-[8px] text-slate-500">
            Server freeze active — order submit, cancel, and close are blocked.
          </p>
        ) : null}
      </section>

      <div className="rounded border border-terminal-border/60 bg-terminal-panel/20 p-1.5">
        <LiveTradingReadinessBlock
          readiness={liveReadiness}
          isLoading={liveReadinessLoading}
          compact
        />
      </div>

      <ReadOnlyRiskMirrorPanel brokerSession={session} symbol={symbol} />
    </div>
  );
}
