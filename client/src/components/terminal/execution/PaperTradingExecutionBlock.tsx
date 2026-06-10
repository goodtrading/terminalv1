import { apiUrl } from "../../../lib/apiBase";
import { useCallback, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { bingxApiFetch } from "./bingxApiClient";
import type { BingXReadOnlySnapshot } from "./executionTypes";
import { cn } from "@/lib/utils";
import type {
  PaperAccountSnapshot,
  PaperOrderSnapshot,
  PaperPositionSnapshot,
  PaperTradeLedgerSnapshot,
  PaperTradingSettings,
} from "./executionTypes";
import {
  DEFAULT_CHART_SYMBOL,
  resolveExecutionSymbolForChart,
} from "./executionContext";
import { ExecutionVenueStrip } from "./ExecutionVenueStrip";
import { BingXReferenceAccountStrip } from "./BingXReferenceAccountStrip";
import { PaperOrderTicket, type PaperOrderFeedback } from "./PaperOrderTicket";
import { PaperPositionsOrdersSection } from "./PaperPositionsOrdersSection";
import { paperApiFetch } from "./paperApiClient";
import {
  invalidatePaperQueries,
} from "./paperQueryKeys";
import { PAPER_RISK_GUARD_POLICY } from "./paperRiskGuardConfig";
import { emitTerminalAudit } from "../health/terminalAuditLog";

type PaperAccountExtended = PaperAccountSnapshot & {
  mode?: string;
  paperEquity?: number;
  paperAvailableMargin?: number;
  paperUnrealizedPnL?: number;
  paperRealizedPnL?: number;
};

type PaperTradingExecutionBlockProps = {
  bingxStillConnected?: boolean;
  bingxReferenceConnectionId?: string;
  onSwitchFromPaper?: () => void;
};

export function PaperTradingExecutionBlock({
  bingxStillConnected,
  bingxReferenceConnectionId,
  onSwitchFromPaper,
}: PaperTradingExecutionBlockProps) {
  const queryClient = useQueryClient();
  const { authenticated, authReady } = useTerminalAuth();
  const paperQueriesEnabled = authReady && authenticated;
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastRiskPct, setLastRiskPct] = useState<number | null>(null);
  const [ticketLeverage, setTicketLeverage] = useState<number | null>(null);

  const executionSymbol =
    resolveExecutionSymbolForChart(DEFAULT_CHART_SYMBOL) ?? "BTC-USDT";

  const { data: settings } = useQuery<PaperTradingSettings>({
    queryKey: ["/api/paper/settings"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/settings");
      return res.json() as Promise<PaperTradingSettings>;
    },
    enabled: paperQueriesEnabled,
    staleTime: 30_000,
  });

  const { data: account, isLoading: accountLoading } = useQuery<PaperAccountExtended>({
    queryKey: ["/api/paper/account"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/account");
      return res.json() as Promise<PaperAccountExtended>;
    },
    enabled: paperQueriesEnabled,
    refetchInterval: paperQueriesEnabled ? 5_000 : false,
    staleTime: 3_000,
  });

  const { data: ordersData } = useQuery<{ orders: PaperOrderSnapshot[] }>({
    queryKey: ["/api/paper/orders"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/orders");
      return res.json() as Promise<{ orders: PaperOrderSnapshot[] }>;
    },
    enabled: paperQueriesEnabled,
    refetchInterval: paperQueriesEnabled ? 5_000 : false,
  });

  const { data: positionData } = useQuery<{ position: PaperPositionSnapshot | null }>({
    queryKey: ["/api/paper/position"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/position");
      return res.json() as Promise<{ position: PaperPositionSnapshot | null }>;
    },
    enabled: paperQueriesEnabled,
    refetchInterval: paperQueriesEnabled ? 5_000 : false,
  });

  const { data: tradesData } = useQuery<{ trades: PaperTradeLedgerSnapshot[] }>({
    queryKey: ["/api/paper/trades"],
    queryFn: async () => {
      const res = await paperApiFetch("/api/paper/trades");
      return res.json() as Promise<{ trades: PaperTradeLedgerSnapshot[] }>;
    },
    enabled: paperQueriesEnabled,
    refetchInterval: paperQueriesEnabled ? 8_000 : false,
  });

  const { data: ticker } = useQuery<{ price: number; timestamp?: number }>({
    queryKey: ["btc-ticker", "paper-ticket"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/market/ticker?symbol=BTCUSDT"));
      if (!res.ok) throw new Error("Ticker unavailable");
      return res.json() as Promise<{ price: number; timestamp?: number }>;
    },
    refetchInterval: 4_000,
    staleTime: 2_000,
    retry: 1,
  });

  const { data: bingxSnapshot } = useQuery<BingXReadOnlySnapshot>({
    queryKey: [
      "/api/bingx/read-only/snapshot",
      bingxReferenceConnectionId,
      executionSymbol,
    ],
    queryFn: async () => {
      const params = new URLSearchParams({
        connectionId: bingxReferenceConnectionId!,
        symbol: executionSymbol,
      });
      const res = await bingxApiFetch(`/api/bingx/read-only/snapshot?${params}`, {
        assertOk: false,
      });
      const json = (await res.json()) as {
        success?: boolean;
        snapshot?: BingXReadOnlySnapshot;
      };
      if (!json.success || !json.snapshot) {
        throw new Error("BingX snapshot unavailable");
      }
      return json.snapshot;
    },
    enabled: Boolean(bingxReferenceConnectionId),
    refetchInterval: 8_000,
    staleTime: 5_000,
    retry: 1,
  });

  const position = positionData?.position ?? null;
  const markPrice = position?.markPrice ?? null;
  const tickerPrice =
    ticker?.price != null && Number.isFinite(ticker.price) ? ticker.price : null;
  const bingxLastPrice = useMemo(() => {
    const pos = bingxSnapshot?.positions?.find(
      (p) =>
        p.symbol === executionSymbol ||
        p.symbol.replace(/-/g, "") === executionSymbol.replace(/-/g, ""),
    );
    if (pos?.markPrice != null && Number.isFinite(pos.markPrice) && pos.markPrice > 0) {
      return pos.markPrice;
    }
    return null;
  }, [bingxSnapshot?.positions, executionSymbol]);
  const pendingOrders = useMemo(
    () =>
      (ordersData?.orders ?? []).filter(
        (o) => o.status === "open" || o.status === "pending" || o.status === "partial",
      ),
    [ordersData?.orders],
  );
  const closedTrades = useMemo(
    () =>
      (tradesData?.trades ?? [])
        .filter((t) => t.status === "closed")
        .slice(0, 3),
    [tradesData?.trades],
  );

  const equity = account?.paperEquity ?? account?.equityUsdt;
  const availMargin = account?.paperAvailableMargin ?? account?.availableMarginUsdt;
  const uPnl = account?.paperUnrealizedPnL ?? account?.unrealizedPnlUsdt;
  const rPnl = account?.paperRealizedPnL ?? account?.realizedPnlUsdt;

  const invalidate = useCallback(async () => {
    await invalidatePaperQueries(queryClient);
  }, [queryClient]);

  const drawdownBlock = useMemo(() => {
    const initial = settings?.initialBalanceUsdt ?? 10_000;
    const eq = equity ?? initial;
    const lossPct = initial > 0 ? Math.max(0, ((initial - eq) / initial) * 100) : 0;
    if (lossPct > PAPER_RISK_GUARD_POLICY.maxDailyLossPct) {
      return `Daily loss ${lossPct.toFixed(2)}% exceeds max ${PAPER_RISK_GUARD_POLICY.maxDailyLossPct}%.`;
    }
    return null;
  }, [settings?.initialBalanceUsdt, equity]);

  /** Daily loss only — risk % is warning in Risk Guard, does not disable ticket buttons. */
  const tradingBlocked = Boolean(drawdownBlock);
  const blockReason = drawdownBlock;

  const closePosition = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await paperApiFetch("/api/paper/close-position", {
        method: "POST",
        assertOk: false,
      });
      const json = (await res.json()) as { success?: boolean; message?: string };
      if (!res.ok || json.success === false) {
        setMessage(json.message ?? "Close failed");
        return;
      }
      setMessage(json.message ?? "Paper position closed — realized PnL updated");
      emitTerminalAudit("paper_position_closed", json.message ?? "Paper position closed");
      await invalidate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Close failed");
    } finally {
      setBusy(false);
    }
  }, [invalidate]);

  const cancelOrders = useCallback(async () => {
    setBusy(true);
    setMessage(null);
    try {
      const res = await paperApiFetch("/api/paper/cancel-all", {
        method: "POST",
        assertOk: false,
      });
      const json = (await res.json()) as { success?: boolean; cancelled?: number };
      if (!res.ok || !json.success) {
        setMessage("Cancel failed");
        return;
      }
      setMessage(`Cancelled ${json.cancelled ?? 0} paper order(s)`);
      await invalidate();
    } catch (err) {
      setMessage(err instanceof Error ? err.message : "Cancel failed");
    } finally {
      setBusy(false);
    }
  }, [invalidate]);

  const handleExecuted = useCallback((fb: PaperOrderFeedback) => {
    if (fb.riskUsdt != null && equity != null && equity > 0) {
      setLastRiskPct(Math.round((fb.riskUsdt / equity) * 10000) / 100);
    }
  }, [equity]);

  return (
    <div className="space-y-1.5">
      <ExecutionVenueStrip
        chartSymbol={DEFAULT_CHART_SYMBOL}
        liveTradingEnabled={false}
        mode="paper"
      />

      <p className="text-[7px] text-slate-600 leading-snug px-0.5">
        <span className="text-cyan-400/90 font-semibold">Paper mode</span>
        {" · "}
        Simulated BingX Perpetual — no real orders
        {bingxStillConnected ? " · BingX read-only reference" : ""}
        {" · "}
        <span className="text-red-300/80">Live locked</span>
      </p>

      {bingxReferenceConnectionId ? (
        <details className="rounded border border-emerald-500/20 bg-emerald-950/10 px-2 py-1">
          <summary className="text-[7px] font-bold uppercase tracking-widest text-emerald-400/80 cursor-pointer">
            BingX reference (read-only)
          </summary>
          <div className="pt-1">
            <BingXReferenceAccountStrip
              connectionId={bingxReferenceConnectionId}
              compact
            />
          </div>
        </details>
      ) : null}

      <section className="rounded border border-terminal-border bg-[#0a0a0a] px-2 py-1 space-y-0.5">
        <div className="text-[7px] font-bold uppercase tracking-widest text-slate-500">
          Paper account
        </div>
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5 text-[8px] text-slate-500">
          <span>Equity</span>
          <span className="text-right text-slate-200">
            {accountLoading ? "…" : equity != null ? `${equity.toFixed(2)} USDT` : "—"}
          </span>
          <span>Available margin</span>
          <span className="text-right text-slate-200">
            {availMargin != null ? `${availMargin.toFixed(2)} USDT` : "—"}
          </span>
          <span>uPnL</span>
          <span
            className={cn(
              "text-right",
              (uPnl ?? 0) > 0 && "text-emerald-400",
              (uPnl ?? 0) < 0 && "text-red-400",
            )}
          >
            {uPnl != null ? `${uPnl.toFixed(2)} USDT` : "—"}
          </span>
          <span>Realized PnL</span>
          <span className="text-right text-slate-200">
            {rPnl != null ? `${rPnl.toFixed(2)} USDT` : "—"}
          </span>
        </div>
      </section>

      {!paperQueriesEnabled ? (
        <p className="text-[8px] text-amber-400/90 px-0.5">
          Sign in to load paper account and place simulated orders.
        </p>
      ) : null}

      <PaperOrderTicket
        markPrice={markPrice}
        tickerPrice={tickerPrice}
        bingxLastPrice={bingxLastPrice}
        account={account ?? null}
        settings={settings}
        position={position}
        busy={busy || !paperQueriesEnabled}
        tradingBlocked={tradingBlocked}
        blockReason={blockReason ?? undefined}
        ticketLeverage={ticketLeverage}
        computedRiskPct={lastRiskPct}
        onMessage={setMessage}
        onExecuted={handleExecuted}
        onRiskPctChange={setLastRiskPct}
        onLeverageChange={setTicketLeverage}
        onRefresh={invalidate}
        onClosePosition={closePosition}
        onCancelAll={cancelOrders}
      />

      <PaperPositionsOrdersSection
        position={position}
        pendingOrders={pendingOrders}
        closedTrades={closedTrades}
        unrealizedPnl={uPnl}
        onMessage={setMessage}
        onRefresh={invalidate}
        busy={busy}
      />

      {message ? (
        <p className="text-[8px] text-cyan-200/90 border border-terminal-border/50 rounded px-2 py-0.5">
          {message}
        </p>
      ) : null}

      {onSwitchFromPaper ? (
        <button
          type="button"
          onClick={onSwitchFromPaper}
          className="w-full text-[8px] uppercase text-slate-500 hover:text-slate-300"
        >
          Back to BingX read-only
        </button>
      ) : null}
    </div>
  );
}
