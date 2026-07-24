import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { bingxApiFetch } from "../execution/bingxApiClient";
import { BINGX_UI_BADGES } from "@shared/goodTradingAiBingxAccount";
import type {
  BingxAccountSnapshot,
  BingxSafeConnectionStatus,
  BingxTradingActionEvent,
} from "@shared/goodTradingAiBingxAccount";
import { DecisionContextJournalPanel } from "./DecisionContextJournalPanel";

type StatusResponse = {
  success?: boolean;
  status?: BingxSafeConnectionStatus;
  featureEnabled?: boolean;
  badges?: string[];
  code?: string;
  message?: string;
};

type SnapshotResponse = {
  success?: boolean;
  snapshot?: BingxAccountSnapshot;
  code?: string;
  message?: string;
};

type TimelineResponse = {
  success?: boolean;
  events?: BingxTradingActionEvent[];
};

function Badge({ children, tone }: { children: React.ReactNode; tone?: string }) {
  return (
    <span
      className={cn(
        "rounded border px-1.5 py-0.5 text-[8px] font-semibold uppercase tracking-wider",
        tone ?? "border-slate-500/40 text-slate-300",
      )}
    >
      {children}
    </span>
  );
}

function Panel({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="rounded border border-terminal-border/70 bg-terminal-bg/40 p-2">
      <div className="mb-1.5 text-[9px] font-semibold uppercase tracking-widest text-slate-400">
        {title}
      </div>
      {children}
    </section>
  );
}

function fmt(n: number | undefined, digits = 2): string {
  if (n == null || !Number.isFinite(n)) return "--";
  return n.toFixed(digits);
}

export type BingxAccountActivityPanelProps = {
  connectionId: string | null | undefined;
  symbol?: string;
};

/**
 * AI-8.0 read-only BingX account activity panel.
 * No Buy / Sell / Cancel / Edit controls.
 */
export function BingxAccountActivityPanel({
  connectionId,
  symbol,
}: BingxAccountActivityPanelProps) {
  const qc = useQueryClient();
  const enabledFeatureQuery = useQuery({
    queryKey: ["/api/account/bingx/status", connectionId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (connectionId) params.set("connectionId", connectionId);
      const res = await bingxApiFetch(
        `/api/account/bingx/status?${params}`,
        { method: "GET", assertOk: false },
      );
      return (await res.json()) as StatusResponse;
    },
    staleTime: 15_000,
  });

  const featureEnabled = enabledFeatureQuery.data?.featureEnabled === true;
  const status = enabledFeatureQuery.data?.status;
  const canLoad = Boolean(featureEnabled && connectionId);

  const snapshotQuery = useQuery({
    queryKey: ["/api/account/bingx/snapshot", connectionId, symbol],
    enabled: canLoad,
    queryFn: async () => {
      const params = new URLSearchParams({ connectionId: connectionId! });
      if (symbol) params.set("symbol", symbol);
      const res = await bingxApiFetch(
        `/api/account/bingx/snapshot?${params}`,
        { method: "GET", assertOk: false },
      );
      const json = (await res.json()) as SnapshotResponse;
      if (!res.ok || !json.success || !json.snapshot) {
        throw new Error(json.message ?? json.code ?? "Snapshot failed");
      }
      return json.snapshot;
    },
    staleTime: 20_000,
    refetchInterval: false,
  });

  const timelineQuery = useQuery({
    queryKey: ["/api/account/bingx/timeline", connectionId],
    enabled: canLoad,
    queryFn: async () => {
      const params = new URLSearchParams({
        connectionId: connectionId!,
        limit: "30",
      });
      const res = await bingxApiFetch(
        `/api/account/bingx/timeline?${params}`,
        { method: "GET", assertOk: false },
      );
      const json = (await res.json()) as TimelineResponse;
      return json.events ?? [];
    },
    staleTime: 20_000,
  });

  const snapshot = snapshotQuery.data;
  const usdt = snapshot?.balances.find((b) => b.asset === "USDT");

  async function onRefresh() {
    if (!connectionId) return;
    const res = await bingxApiFetch("/api/account/bingx/refresh", {
      method: "POST",
      assertOk: false,
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ connectionId, symbol }),
    });
    const json = (await res.json()) as SnapshotResponse;
    if (!res.ok || !json.success) {
      throw new Error(json.message ?? "Refresh failed");
    }
    await qc.invalidateQueries({ queryKey: ["/api/account/bingx"] });
  }

  return (
    <div className="flex flex-col gap-2 text-[10px] text-slate-200">
      <div className="flex flex-wrap items-center gap-1.5">
        {(enabledFeatureQuery.data?.badges ?? BINGX_UI_BADGES).map((b) => (
          <Badge
            key={b}
            tone={
              b.includes("READ")
                ? "border-cyan-500/40 text-cyan-300"
                : b.includes("AI")
                  ? "border-amber-500/40 text-amber-300"
                  : "border-emerald-500/40 text-emerald-300"
            }
          >
            {b}
          </Badge>
        ))}
        <Badge>REAL — READ ONLY</Badge>
      </div>

      {!featureEnabled && (
        <div className="rounded border border-amber-500/30 bg-amber-500/5 px-2 py-1.5 text-amber-200/90">
          Account activity read model is OFF (
          <code className="font-mono">GOODTRADING_BINGX_ACCOUNT_ENABLED</code>
          ). Existing BingX connection cards remain available.
        </div>
      )}

      <Panel title="Connection">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[9px]">
          <span className="text-slate-500">Configured</span>
          <span>{status?.configured ? "yes" : "no"}</span>
          <span className="text-slate-500">Connected</span>
          <span>{status?.connected ? "yes" : "no"}</span>
          <span className="text-slate-500">Permissions</span>
          <span>{status?.permissionsClassification ?? "--"}</span>
          <span className="text-slate-500">Health</span>
          <span>{snapshot?.health.status ?? "--"}</span>
          <span className="text-slate-500">Completeness</span>
          <span>{snapshot?.completeness ?? "--"}</span>
          <span className="text-slate-500">Last sync</span>
          <span>{snapshot?.capturedAt ?? status?.lastValidatedAt ?? "--"}</span>
          <span className="text-slate-500">Stale</span>
          <span>{snapshot?.health.stale ? "yes" : "no"}</span>
          <span className="text-slate-500">Clock drift</span>
          <span>
            {snapshot?.health.clockDriftMs != null
              ? `${snapshot.health.clockDriftMs}ms`
              : "--"}
          </span>
        </div>
        <button
          type="button"
          className="mt-2 rounded border border-cyan-500/40 px-2 py-1 text-[9px] uppercase tracking-wider text-cyan-200 disabled:opacity-40"
          disabled={!canLoad || snapshotQuery.isFetching}
          onClick={() => {
            void onRefresh().catch(() => undefined);
          }}
        >
          {snapshotQuery.isFetching ? "Refreshing…" : "Manual refresh"}
        </button>
        {/* No Buy / Sell / Cancel / Edit — read-only by design */}
      </Panel>

      <Panel title="Account">
        <div className="grid grid-cols-2 gap-x-3 gap-y-1 font-mono text-[9px]">
          <span className="text-slate-500">Wallet</span>
          <span>{fmt(usdt?.walletBalance)}</span>
          <span className="text-slate-500">Available</span>
          <span>{fmt(usdt?.availableBalance)}</span>
          <span className="text-slate-500">Used margin</span>
          <span>{fmt(usdt?.usedMargin)}</span>
          <span className="text-slate-500">Unrealized PnL</span>
          <span>{fmt(usdt?.unrealizedPnl)}</span>
        </div>
      </Panel>

      <Panel title="Positions">
        {!snapshot?.positions.length ? (
          <div className="text-slate-500">No open positions</div>
        ) : (
          <ul className="space-y-1">
            {snapshot.positions.map((p) => (
              <li
                key={p.positionId}
                className="grid grid-cols-4 gap-1 font-mono text-[9px]"
              >
                <span>{p.symbol}</span>
                <span className="uppercase">{p.side}</span>
                <span>{fmt(p.quantity, 4)}</span>
                <span>uPnL {fmt(p.unrealizedPnl)}</span>
                <span className="col-span-2 text-slate-500">
                  entry {fmt(p.entryPrice)} · mark {fmt(p.markPrice)}
                </span>
                <span className="col-span-2 text-slate-500">
                  lev {p.leverage ?? "--"} · {p.marginMode ?? "--"}
                </span>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Open orders">
        {!snapshot?.openOrders.length ? (
          <div className="text-slate-500">No open orders</div>
        ) : (
          <ul className="space-y-1">
            {snapshot.openOrders.map((o) => (
              <li key={o.orderId} className="font-mono text-[9px]">
                {o.symbol} {o.side} {o.type} · {o.status}
                {o.reduceOnly ? " · reduce-only" : ""} · px {fmt(o.price)}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Recent fills">
        {!snapshot?.recentFills.length ? (
          <div className="text-slate-500">No recent fills</div>
        ) : (
          <ul className="space-y-1">
            {snapshot.recentFills.slice(0, 12).map((f) => (
              <li key={f.fillId} className="font-mono text-[9px]">
                {f.timestamp.slice(11, 19)} {f.symbol} {f.side} {fmt(f.quantity, 4)} @{" "}
                {fmt(f.price)} · fee {fmt(f.fee)}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Action timeline">
        {!(timelineQuery.data?.length || snapshot?.reconciliation?.events.length) ? (
          <div className="text-slate-500">No derived events yet</div>
        ) : (
          <ul className="max-h-40 space-y-1 overflow-y-auto">
            {(timelineQuery.data ?? snapshot?.reconciliation?.events ?? [])
              .slice()
              .reverse()
              .slice(0, 30)
              .map((e) => (
                <li key={e.eventId} className="font-mono text-[9px] text-slate-300">
                  <span className="text-slate-500">{e.confidence}</span> {e.type} —{" "}
                  {e.summary}
                </li>
              ))}
          </ul>
        )}
      </Panel>

      <DecisionContextJournalPanel connectionId={connectionId} />

      {snapshotQuery.isError && (
        <div className="text-red-300">
          {(snapshotQuery.error as Error)?.message ?? "Load error"}
        </div>
      )}
    </div>
  );
}
