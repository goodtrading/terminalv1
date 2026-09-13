import type { ExecutionWorkspace } from "@/lib/executionWorkspace";
import { apiUrl } from "../../../lib/apiBase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";

import { bingxApiFetch } from "./bingxApiClient";
import type { BingXReadOnlySnapshot } from "./executionTypes";
import { cn } from "@/lib/utils";
import type {
  PaperAccountSnapshot,
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
  createNautilusPaperDevControl,
} from "@/lib/nautilusPaperDevControl";
import {
  setPaperExecutionBackend,
  paperExecutionPort,
} from "@/lib/paperExecutionPort";
import { isTauriRuntime } from "@/lib/desktopRuntime";
import { nautilusSimulation, type NautilusSimulationStatusWire } from "@/lib/nautilusSimulationBridge";

import {
  invalidatePaperQueries,
} from "./paperQueryKeys";
import { PAPER_RISK_GUARD_POLICY } from "./paperRiskGuardConfig";
import { emitTerminalAudit } from "../health/terminalAuditLog";
import { isPaperExecutionCoreReady, usePaperState } from "@/lib/paperState";

type PaperAccountExtended = PaperAccountSnapshot & {
  mode?: string;
  paperEquity?: number;
  paperAvailableMargin?: number;
  paperUnrealizedPnL?: number;
  paperRealizedPnL?: number;
};

type PaperTradingExecutionBlockProps = {
  executionWorkspace?: ExecutionWorkspace;
  bingxStillConnected?: boolean;
  bingxReferenceConnectionId?: string;
  onSwitchFromPaper?: () => void;
};

export function PaperTradingExecutionBlock({
  executionWorkspace = "paper",
  bingxStillConnected,
  bingxReferenceConnectionId,
  onSwitchFromPaper,
}: PaperTradingExecutionBlockProps) {
  const queryClient = useQueryClient();
  const canonicalState = usePaperState();
  const isPaperWorkspace = executionWorkspace === "paper";
  const paperState = isPaperWorkspace ? canonicalState : { ...canonicalState, active: false, account: undefined, position: null, orders: [], trades: [], settings: undefined };
  const { backend, settings, orders, position, trades } = paperState;
  const account = paperState.account as PaperAccountExtended | undefined;
  const isNautilus = backend === "nautilus";
  const paperQueriesEnabled = isPaperExecutionCoreReady(paperState);
  const executionUnavailable = !paperQueriesEnabled;
  const [message, setMessage] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [lastRiskPct, setLastRiskPct] = useState<number | null>(null);
  const [ticketLeverage, setTicketLeverage] = useState<number | null>(null);
  const [backendBusy, setBackendBusy] = useState(false);
  const nautilusControl = useMemo(() => createNautilusPaperDevControl(), []);
  const nativePortState = nautilusControl.status();
  const canUseNautilus = isTauriRuntime();
  const [nativeSimulationStatus, setNativeSimulationStatus] = useState<NautilusSimulationStatusWire | null>(null);
  const closeInFlightRef = useRef(false);

  useEffect(() => {
    if (!canUseNautilus || !isNautilus) {
      setNativeSimulationStatus(null);
      return;
    }
    let active = true;
    const refresh = async () => {
      try {
        const status = await nautilusSimulation.status();
        if (active) setNativeSimulationStatus(status);
      } catch {
        if (active) setNativeSimulationStatus(null);
      }
    };
    void refresh();
    const timer = window.setInterval(() => void refresh(), 2_000);
    return () => {
      active = false;
      window.clearInterval(timer);
    };
  }, [canUseNautilus, isNautilus]);


  const executionSymbol =
    resolveExecutionSymbolForChart(DEFAULT_CHART_SYMBOL) ?? "BTC-USDT";


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

  const accountLoading = paperState.loading && !account;
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
      orders.filter(
        (o) => isNautilus || o.status === "open" || o.status === "pending" || o.status === "partial",
      ),
    [isNautilus, orders],
  );
  const closedTrades = useMemo(
    () =>
      trades
        .filter((t) => t.status === "closed")
        .slice(0, 3),
    [trades],
  );

  const equity = account?.paperEquity ?? account?.equityUsdt;
  const availMargin = account?.paperAvailableMargin ?? account?.availableMarginUsdt;
  const uPnl = account?.paperUnrealizedPnL ?? account?.unrealizedPnlUsdt;
  const rPnl = account?.paperRealizedPnL ?? account?.realizedPnlUsdt;

  const invalidate = useCallback(async () => {
    await paperState.refresh();
    await invalidatePaperQueries(queryClient);
  }, [paperState.refresh, queryClient]);

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

  const selectLegacy = useCallback(async () => {
    setBackendBusy(true);
    try {
      if (backend === "nautilus") {
        await nautilusControl.deactivate();
      } else {
        setPaperExecutionBackend("legacy");
      }
    } finally {
      setBackendBusy(false);
    }
  }, [backend, nautilusControl]);

  const activateNautilus = useCallback(async () => {
    setBackendBusy(true);
    try {
      await nautilusControl.activate();
    } finally {
      setBackendBusy(false);
    }
  }, [nautilusControl]);

  const closePosition = useCallback(async () => {
    if (busy || closeInFlightRef.current) return;
    closeInFlightRef.current = true;
    setBusy(true);
    setMessage(null);
    try {
      if (isNautilus) {
        await paperExecutionPort.closePosition({
          instrument: { venue: "SIM", marketType: "perpetual", symbol: "BTCUSDT-PERP", baseAsset: "BTC", quoteAsset: "USDT", exchangeNativeSymbol: "BTCUSDT" },
        });
        setMessage("Paper position closed");
        await invalidate();
        return;
      }
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
      closeInFlightRef.current = false;
      setBusy(false);
    }
  }, [busy, invalidate, isNautilus]);

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
        mode={isPaperWorkspace ? "paper" : "live"}
      />

      <p className="text-[7px] text-slate-600 leading-snug px-0.5">
        <span className="text-cyan-400/90 font-semibold">{isPaperWorkspace ? "Paper mode" : executionWorkspace.toUpperCase()}</span>
        {" · "}
        {isPaperWorkspace ? "Paper Perpetual — no real orders" : "Execution adapter not wired"}
        {bingxStillConnected ? " · BingX read-only reference" : ""}
      </p>

      <section className="rounded border border-terminal-border px-2 py-1.5 space-y-1.5">
        <div className="text-[7px] font-bold uppercase tracking-widest text-slate-500">
          Execution engine
        </div>
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            disabled={!isPaperWorkspace || backendBusy || busy}
            onClick={() => void selectLegacy()}
            className={cn(
              "rounded border py-1 text-[8px] font-bold uppercase tracking-wider",
              backend === "legacy"
                ? "border-cyan-500/60 bg-cyan-600/15 text-cyan-100"
                : "border-terminal-border text-slate-500 hover:text-slate-200",
            )}
          >
            Legacy
          </button>
          {canUseNautilus ? (
            <button
              type="button"
              disabled={!isPaperWorkspace || backendBusy || busy}
              onClick={() => void activateNautilus()}
              className={cn(
                "rounded border py-1 text-[8px] font-bold uppercase tracking-wider",
                backend === "nautilus"
                  ? "border-amber-500/60 bg-amber-600/15 text-amber-100"
                  : "border-terminal-border text-slate-500 hover:text-slate-200",
              )}
            >
              Nautilus
            </button>
          ) : null}
        </div>
        {canUseNautilus && backend === "nautilus" ? (
          <p className="text-[8px] text-slate-400">
            {backendBusy
              ? "Nautilus · STARTING"
              : nativePortState.availability === "AVAILABLE"
                ? "Nautilus · RUNNING"
                : `Nautilus unavailable · ${nativePortState.message ?? "not activated"}`}
          </p>
        ) : null}
        {canUseNautilus && backend === "nautilus" ? (() => {
          const stream = nativeSimulationStatus?.quoteStream;
          const market = nativeSimulationStatus?.market;
          const streamLabel = !stream
            ? "STATUS UNAVAILABLE"
            : !stream.connected
              ? "WSS DISCONNECTED"
              : !stream.sourceAvailable
                ? "SOURCE BOOTSTRAPPING"
                : stream.framesReceived === 0
                  ? "NO QUOTE RECEIVED"
                  : "WSS CONNECTED · SOURCE LIVE";
          return (
            <div className="text-[8px] text-slate-500 space-y-0.5">
              <div>{streamLabel}</div>
              {stream ? <div>Frames {stream.framesReceived} · Age {stream.quoteAgeMs != null ? `${stream.quoteAgeMs}ms` : "—"}</div> : null}
              {market ? <div>{market.instrument} {market.bestBid} / {market.bestAsk}</div> : null}
            </div>
          );
        })() : null}
      </section>

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
          {isPaperWorkspace ? "Paper account" : "Account"}
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

      {!paperQueriesEnabled || paperState.availability !== "AVAILABLE" ? (
        <p role="status" className="text-[8px] text-amber-300/90 px-0.5">
          {!isPaperWorkspace ? "Execution adapter not wired" : backendBusy ? "Starting Nautilus..." : `Paper engine unavailable · ${paperState.availability}`}
        </p>
      ) : null}

      <PaperOrderTicket
        markPrice={markPrice}
        tickerPrice={tickerPrice}
        bingxLastPrice={bingxLastPrice}
        account={account ?? null}
        settings={settings}
        position={position}
        busy={busy || backendBusy}
        executionUnavailable={executionUnavailable}
        tradingBlocked={tradingBlocked || executionUnavailable}
        blockReason={executionUnavailable ? (isPaperWorkspace ? `Paper engine unavailable: ${paperState.availability}` : "Execution adapter not wired") : blockReason ?? undefined}
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
        backend={backend}
        unrealizedPnl={uPnl}
        onMessage={setMessage}
        onRefresh={invalidate}
        busy={busy || backendBusy || executionUnavailable}
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
