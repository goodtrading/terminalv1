import { useCallback, useEffect, useMemo, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { TerminalPanel } from "../TerminalPanel";
import { cn } from "@/lib/utils";
import type {
  ExecutionRiskGuardState,
  OrderPreviewSummary,
  OrderTicketState,
  PaperAccountSnapshot,
  PaperOrderSnapshot,
  PaperPositionSnapshot,
  PaperTradeLedgerSnapshot,
  PaperTradingSettings,
} from "./executionTypes";
import { DEFAULT_ORDER_TICKET, DEFAULT_RISK_GUARD } from "./executionMockState";
import {
  DEFAULT_CHART_SYMBOL,
  EXECUTION_MAPPING_MISSING_MESSAGE,
  resolveExecutionSymbolForChart,
} from "./executionContext";
import { ExecutionVenueStrip } from "./ExecutionVenueStrip";
import { BingXReadOnlyExecutionBlock } from "./BingXReadOnlyExecutionBlock";
import { PaperTradingExecutionBlock } from "./PaperTradingExecutionBlock";
import { isBingXReadOnlySession, isBingXSecureApiSession } from "./bingxSession";
import { bingXConnectionDisplay } from "./bingxConnectionUi";
import { useBrokerSession } from "./useBrokerSession";
import { PaperClosePositionModal } from "./PaperClosePositionModal";
import { PaperRiskManagementSection } from "./PaperRiskManagementSection";

const inputClass =
  "w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-[10px] font-mono text-white focus:border-cyan-500/40 focus:outline-none disabled:opacity-50";

const labelClass = "text-[8px] uppercase tracking-widest text-slate-500 mb-0.5";

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className={labelClass}>{label}</div>
      {children}
    </div>
  );
}

function buildLocalPreview(ticket: OrderTicketState): OrderPreviewSummary {
  const size = Number(ticket.size);
  const price = ticket.type === "limit" ? Number(ticket.price) : NaN;
  let estimatedNotional: number | null = null;
  if (Number.isFinite(size) && size > 0) {
    if (ticket.sizeUnit === "USDT") estimatedNotional = size;
    else if (ticket.sizeUnit === "BTC" && Number.isFinite(price)) {
      estimatedNotional = size * price;
    }
  }
  return {
    exchange: ticket.exchange,
    symbol: ticket.symbol,
    side: ticket.side,
    type: ticket.type,
    size: ticket.size,
    sizeUnit: ticket.sizeUnit,
    price: ticket.type === "limit" ? ticket.price : undefined,
    leverage: ticket.leverage,
    marginMode: ticket.marginMode,
    estimatedNotional,
    warnings: [
      "Live trading is disabled.",
      "Broker login is required before execution.",
    ],
  };
}

function paperAccountLabel(
  isPaper: boolean,
  loading: boolean,
  error: boolean,
  value: number | undefined,
  suffix = "",
): string {
  if (!isPaper) return "";
  if (loading && value === undefined) return "Loading…";
  if (error && value === undefined) return "Sync error";
  if (value !== undefined && Number.isFinite(value)) {
    return `${value.toFixed(2)}${suffix}`;
  }
  return "--";
}

import {
  invalidatePaperQueries,
  PAPER_INVALIDATE_KEYS,
} from "./paperQueryKeys";
import { postPaperClosePartial } from "./paperChartActions";
import { paperApiFetch } from "./paperApiClient";
import {
  buildPaperSubmitRiskPayload,
  paperRiskReferencePrice,
  validatePaperTicketRisk,
} from "./paperRiskValidation";

function buildPaperOrderPayload(
  ticket: OrderTicketState,
  referenceMark: number | null | undefined,
  chartSymbol: string = DEFAULT_CHART_SYMBOL,
): { payload: Record<string, unknown> } | { error: string } {
  const executionSymbol = resolveExecutionSymbolForChart(chartSymbol);
  if (!executionSymbol) {
    return { error: EXECUTION_MAPPING_MISSING_MESSAGE };
  }

  const risk = buildPaperSubmitRiskPayload(ticket.stopLoss, ticket.takeProfit);
  if (risk.error) return { error: risk.error };

  const limitPx =
    ticket.type === "limit" ? Number(ticket.price) : Number.NaN;
  const ref =
    ticket.type === "limit" && Number.isFinite(limitPx) && limitPx > 0
      ? limitPx
      : paperRiskReferencePrice(referenceMark, null);

  const riskMsg = validatePaperTicketRisk(
    ticket.side,
    ref,
    risk.stopLoss,
    risk.takeProfit,
  );
  if (riskMsg) return { error: riskMsg };

  const size = Number(ticket.size);
  const leverage = Number(ticket.leverage);
  const price = ticket.type === "limit" ? limitPx : undefined;

  return {
    payload: {
      symbol: executionSymbol,
      chartSymbol: chartSymbol.toUpperCase().replace(/-/g, ""),
      venue: "bingx",
      marketType: "perpetual",
      executionExchange: "bingx",
      side: ticket.side,
      type: ticket.type,
      price: ticket.type === "limit" && Number.isFinite(price) ? price : undefined,
      size: Number.isFinite(size) ? size : ticket.size,
      sizeUnit: ticket.sizeUnit,
      leverage: Number.isFinite(leverage) ? leverage : ticket.leverage,
      marginMode: ticket.marginMode,
      reduceOnly: ticket.reduceOnly,
      postOnly: ticket.postOnly,
      stopLoss: risk.stopLoss,
      takeProfit: risk.takeProfit,
    },
  };
}

function isPaperSession(session: {
  connected: boolean;
  exchange: string | null;
  connectionMode?: string | null;
}): boolean {
  return (
    session.connected &&
    (session.exchange === "paper" || session.connectionMode === "paper")
  );
}

export function TradingExecutionPanel({ collapsed = false }: { collapsed?: boolean }) {
  const queryClient = useQueryClient();
  const {
    session,
    savedBingXConnections,
    connectPaperTrading,
    restoreBingXAfterPaper,
  } = useBrokerSession();
  const bingxRefId =
    session.bingxReferenceConnectionId ?? savedBingXConnections[0]?.id;
  const [ticket, setTicket] = useState<OrderTicketState>(DEFAULT_ORDER_TICKET);
  const [risk, setRisk] = useState<ExecutionRiskGuardState>(DEFAULT_RISK_GUARD);
  const [preview, setPreview] = useState<OrderPreviewSummary | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [submitLoading, setSubmitLoading] = useState(false);
  const [actionLoading, setActionLoading] = useState(false);
  const [paperMessage, setPaperMessage] = useState<string | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [paperTicketInitialized, setPaperTicketInitialized] = useState(false);

  const loadStatus = useCallback(async () => {
    try {
      const res = await fetch("/api/execution/status");
      if (!res.ok) return;
      const data = (await res.json()) as {
        liveTradingEnabled: boolean;
        connectedExchange: "bingx" | "binance" | null;
        brokerLoginAvailable: boolean;
        brokerSessionRequired?: boolean;
        demoAvailable?: boolean;
        tradingLocked?: boolean;
        permissions?: "locked" | "read_only" | "trading";
        riskGuard: {
          maxNotionalUsdt: number | null;
          maxLeverage: number | null;
          confirmationRequired: boolean;
          tradingLocked: boolean;
        };
      };
      setRisk({
        liveTradingEnabled: data.liveTradingEnabled,
        brokerLoginAvailable: data.brokerLoginAvailable,
        brokerSessionRequired: data.brokerSessionRequired ?? true,
        demoAvailable: data.demoAvailable ?? false,
        connectedExchange: data.connectedExchange,
        tradingLocked: data.tradingLocked ?? data.riskGuard.tradingLocked,
        confirmationRequired: data.riskGuard.confirmationRequired,
        maxNotionalUsdt: data.riskGuard.maxNotionalUsdt,
        maxLeverage: data.riskGuard.maxLeverage,
        permissions: data.permissions ?? "locked",
      });
    } catch {
      setRisk(DEFAULT_RISK_GUARD);
    }
  }, []);

  useEffect(() => {
    void loadStatus();
  }, [loadStatus]);

  const isPaper = isPaperSession(session);

  useEffect(() => {
    if (!isPaper) {
      setPaperTicketInitialized(false);
      return;
    }
    setTicket((t) => (t.exchange === "paper" ? t : { ...t, exchange: "paper" }));
    for (const key of PAPER_INVALIDATE_KEYS) {
      void queryClient.invalidateQueries({ queryKey: [key] });
    }
  }, [isPaper, queryClient]);

  const invalidatePaper = useCallback(async () => {
    await invalidatePaperQueries(queryClient);
  }, [queryClient]);

  useEffect(() => {
    if (!isPaper) return;
    const tick = () => {
      void paperApiFetch("/api/paper/check-stops", { method: "POST" }).then(() => {
        void invalidatePaper();
      });
    };
    const id = setInterval(tick, 12_000);
    return () => clearInterval(id);
  }, [isPaper, invalidatePaper]);

  const { data: paperSettings } = useQuery<PaperTradingSettings>({
    queryKey: ["/api/paper/settings"],
    queryFn: async () => {
      const res = await fetch("/api/paper/settings");
      if (!res.ok) throw new Error("Paper settings failed");
      return res.json() as Promise<PaperTradingSettings>;
    },
    enabled: false,
    staleTime: 30_000,
  });

  useEffect(() => {
    if (!isPaper || !paperSettings || paperTicketInitialized) return;
    const executionSymbol = resolveExecutionSymbolForChart(DEFAULT_CHART_SYMBOL);
    setTicket((t) => ({
      ...t,
      exchange: "paper",
      symbol: executionSymbol ?? "BTC-USDT",
      leverage: String(paperSettings.defaultLeverage),
      marginMode: paperSettings.defaultMarginMode,
    }));
    setPaperTicketInitialized(true);
  }, [isPaper, paperSettings, paperTicketInitialized]);

  const isBingXReadOnly = isBingXReadOnlySession(session);
  const isBingXSecureApi = isBingXSecureApiSession(session);
  const isBingXApiActive = isBingXReadOnly || isBingXSecureApi;
  const liveTradingLocked =
    !isPaper &&
    (isBingXReadOnly || (!isBingXSecureApi && risk.tradingLocked));
  const {
    data: paperAccount,
    isLoading: paperAccountLoading,
    isError: paperAccountError,
    isFetching: paperAccountFetching,
    refetch: refetchPaperAccount,
  } = useQuery<PaperAccountSnapshot>({
    queryKey: ["/api/paper/account"],
    queryFn: async () => {
      const res = await fetch("/api/paper/account");
      if (!res.ok) throw new Error("Paper account sync failed");
      const json = (await res.json()) as PaperAccountSnapshot;
      if (
        !Number.isFinite(json.balanceUsdt) &&
        Number.isFinite(json.equityUsdt)
      ) {
        json.balanceUsdt = json.equityUsdt;
      }
      return json;
    },
    enabled: false,
    refetchOnMount: "always",
    retry: 2,
  });

  const paperAccountBusy = paperAccountLoading || (paperAccountFetching && !paperAccount);

  const { data: paperOrdersData, refetch: refetchPaperOrders } = useQuery<{
    orders: PaperOrderSnapshot[];
  }>({
    queryKey: ["/api/paper/orders"],
    queryFn: async () => {
      const res = await fetch("/api/paper/orders");
      if (!res.ok) throw new Error("Paper orders sync failed");
      return res.json() as Promise<{ orders: PaperOrderSnapshot[] }>;
    },
    enabled: false,
    refetchInterval: 6000,
    retry: 1,
  });

  const { data: paperPositionData, refetch: refetchPaperPosition } = useQuery<{
    position: PaperPositionSnapshot | null;
  }>({
    queryKey: ["/api/paper/position"],
    queryFn: async () => {
      const res = await fetch("/api/paper/position");
      if (!res.ok) throw new Error("Paper position sync failed");
      return res.json() as Promise<{ position: PaperPositionSnapshot | null }>;
    },
    enabled: false,
    refetchInterval: 6000,
    retry: 1,
  });

  const paperPosition = paperPositionData?.position ?? null;
  const paperOpenOrders = paperOrdersData?.orders ?? [];
  const safePaperOpenOrders = paperOpenOrders ?? [];
  const openOrdersLabel = useMemo(() => {
    if (session.exchange === "paper") {
      return safePaperOpenOrders.length > 0
        ? `${safePaperOpenOrders.length} paper`
        : "none";
    }
    if (isBingXReadOnly) {
      return "—";
    }
    return "none";
  }, [session.exchange, isBingXReadOnly, safePaperOpenOrders.length]);

  const { data: paperTradesData, refetch: refetchPaperTrades } = useQuery<{
    trades: PaperTradeLedgerSnapshot[];
  }>({
    queryKey: ["/api/paper/trades"],
    queryFn: async () => {
      const res = await fetch("/api/paper/trades");
      if (!res.ok) throw new Error("Paper trades sync failed");
      return res.json() as Promise<{ trades: PaperTradeLedgerSnapshot[] }>;
    },
    enabled: false,
    refetchInterval: 6000,
    retry: 1,
  });

  const paperOpenTrade = useMemo(
    () => paperTradesData?.trades.find((t) => t.status === "open") ?? null,
    [paperTradesData?.trades],
  );

  const paperRecentClosed = useMemo(
    () =>
      (paperTradesData?.trades ?? [])
        .filter((t) => t.status === "closed")
        .slice(0, 5),
    [paperTradesData?.trades],
  );

  const refetchPaper = useCallback(async () => {
    await Promise.all([
      refetchPaperAccount(),
      refetchPaperOrders(),
      refetchPaperPosition(),
      refetchPaperTrades(),
    ]);
    await invalidatePaper();
  }, [
    refetchPaperAccount,
    refetchPaperOrders,
    refetchPaperPosition,
    refetchPaperTrades,
    invalidatePaper,
  ]);

  const connectionLabel = (() => {
    if (isPaper) return "Connected · Simulated";
    if (session.connected && session.demo) return "Connected demo";
    if (isBingXSecureApi) return "Connected secure API";
    if (isBingXReadOnly) return "Connected read-only";
    if (session.connected && session.phase === "connected") return "Connected";
    if (session.phase === "connecting" || session.phase === "checking") {
      return "Connecting";
    }
    if (risk.connectedExchange) return "Connected";
    return "Not connected";
  })();

  const permissionsLabel = (() => {
    if (isPaper) return "Paper simulated";
    if (session.demo) return "Demo / Live locked";
    if (isBingXSecureApi) return "Secure API";
    if (isBingXReadOnly) return "Read-only";
    if (session.connected && session.phase === "connected") return "Pending / Live locked";
    return "Locked";
  })();

  const workspaceMessage = (() => {
    if (paperMessage) return paperMessage;
    if (isPaper && paperAccountError) {
      return "Paper account sync error — ensure dev server is running and retry.";
    }
    if (isPaper) {
      return "Paper mode — simulated orders only. No real funds. Live trading OFF.";
    }
    if (isBingXSecureApi) {
      return session.tradingEnabled
        ? "BingX secure API — live limit submit guarded (preview + confirm). Market/cancel/close disabled."
        : "BingX secure API — trading permission OK; enable live flags for submit.";
    }
    if (isBingXReadOnly) {
      return "BingX connected read-only. Live trading locked — use Paper Trading to simulate orders.";
    }
    if (session.connected && session.demo) {
      return "Demo broker session active. Live trading remains disabled.";
    }
    if (session.connected && session.phase === "connected") {
      return "Broker connected. Live execution not enabled in this phase.";
    }
    return "Connect BingX via secure API to enable execution workspace.";
  })();

  const handlePreview = async () => {
    setPreviewLoading(true);
    setPaperMessage(null);
    try {
      const url = isPaper ? "/api/paper/preview" : "/api/execution/preview";
      let previewBody: Record<string, unknown> | OrderTicketState = ticket;
      if (isPaper) {
        const built = buildPaperOrderPayload(
          ticket,
          paperPosition?.markPrice ?? preview?.markPrice,
        );
        if ("error" in built) {
          setPaperMessage(built.error);
          setPreview(buildLocalPreview(ticket));
          return;
        }
        previewBody = built.payload;
      }
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(previewBody),
      });
      const data = await res.json();
      if (data.success && data.preview) {
        const p = data.preview as OrderPreviewSummary;
        setPreview({
          exchange: isPaper ? "paper" : ticket.exchange,
          symbol: p.symbol,
          side: p.side,
          type: p.type,
          size: p.size,
          sizeUnit: p.sizeUnit,
          price: p.price,
          leverage: p.leverage,
          marginMode: p.marginMode,
          estimatedNotional: p.estimatedNotional,
          estimatedMargin: p.estimatedMargin,
          estimatedFee: p.estimatedFee,
          estimatedSlippageBps: p.estimatedSlippageBps,
          fillPriceEstimate: p.fillPriceEstimate,
          markPrice: p.markPrice,
          estimatedRiskUsdt: p.estimatedRiskUsdt,
          estimatedRewardUsdt: p.estimatedRewardUsdt,
          riskRewardRatio: p.riskRewardRatio,
          warnings: p.warnings ?? [],
        });
      } else {
        setPreview(buildLocalPreview(ticket));
      }
    } catch {
      setPreview(buildLocalPreview(ticket));
    } finally {
      setPreviewLoading(false);
    }
  };

  const handleSubmit = async () => {
    if (!isPaper) return;
    setSubmitLoading(true);
    setPaperMessage(null);
    try {
      const built = buildPaperOrderPayload(
        ticket,
        paperPosition?.markPrice ?? preview?.markPrice,
      );
      if ("error" in built) {
        setPaperMessage(built.error);
        return;
      }
      const res = await fetch("/api/paper/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(built.payload),
      });
      let data: {
        success?: boolean;
        message?: string;
        code?: string;
      } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setPaperMessage(`Paper submit failed (HTTP ${res.status})`);
        return;
      }
      if (!res.ok || !data.success) {
        setPaperMessage(
          data.message ??
            `Paper order rejected${data.code ? ` (${data.code})` : ""}`,
        );
        return;
      }
      setPaperMessage(data.message ?? "Paper order submitted");
      setPreview(null);
      await refetchPaper();
      await queryClient.refetchQueries({ queryKey: ["/api/paper/position"] });
    } catch (err) {
      const hint = err instanceof Error ? err.message : "network error";
      setPaperMessage(`Paper submit failed: ${hint}`);
    } finally {
      setSubmitLoading(false);
    }
  };

  const runPaperAction = async (
    path: string,
    successMsg: string,
  ): Promise<void> => {
    if (!isPaper) return;
    setActionLoading(true);
    setPaperMessage(null);
    try {
      const res = await fetch(path, { method: "POST" });
      const data = await res.json();
      setPaperMessage(data.message ?? successMsg);
      await refetchPaper();
    } catch {
      setPaperMessage("Paper action failed");
    } finally {
      setActionLoading(false);
    }
  };

  const paperSizeNum = Number(ticket.size);
  const paperSizeValid = Number.isFinite(paperSizeNum) && paperSizeNum > 0;
  const paperLimitValid =
    ticket.type !== "limit" ||
    (Number.isFinite(Number(ticket.price)) && Number(ticket.price) > 0);
  const paperLeverageNum = Number(ticket.leverage);
  const paperLeverageValid =
    Number.isFinite(paperLeverageNum) &&
    paperLeverageNum >= 1 &&
    (!paperSettings || paperLeverageNum <= paperSettings.maxLeverage);
  const paperTypeAllowed =
    !paperSettings ||
    (ticket.type === "market"
      ? paperSettings.allowMarketOrders
      : paperSettings.allowLimitOrders);

  const submitDisabled =
    liveTradingLocked ||
    !isPaper ||
    !paperSizeValid ||
    !paperLimitValid ||
    !paperLeverageValid ||
    !paperTypeAllowed ||
    submitLoading ||
    paperAccountLoading;

  const hasPaperPosition =
    isPaper &&
    paperPosition != null &&
    paperPosition.side !== "flat" &&
    paperPosition.quantity > 0;

  const positionActionsDisabled = !isPaper || actionLoading;
  const closeDisabled = positionActionsDisabled || !hasPaperPosition;

  const sideLong = ticket.side === "long";

  const brokerName = isPaper
    ? "GoodTrading Paper Trading"
    : isBingXReadOnly || session.exchange === "bingx"
      ? "BingX"
      : "—";

  const panelHeader = useMemo(
    () => (
      <div className="flex items-center gap-2 flex-wrap">
        {isPaper ? (
          <>
            <span className="text-[8px] font-mono text-cyan-400/90 tracking-wider">
              PAPER MODE
            </span>
            <span className="text-[7px] font-bold uppercase tracking-wider text-cyan-300 border border-cyan-500/40 px-1 rounded">
              No real funds
            </span>
          </>
        ) : (
          <span className="text-[8px] font-mono text-amber-400/90 tracking-wider">
            LIVE TRADING LOCKED
          </span>
        )}
        {session.demo ? (
          <span className="text-[7px] font-bold uppercase tracking-wider text-amber-300 border border-amber-500/40 px-1 rounded">
            Demo · Not live
          </span>
        ) : null}
        {isBingXSecureApi ? (
          <span className="text-[7px] font-bold uppercase tracking-wider text-amber-200 border border-amber-500/40 px-1 rounded">
            BingX secure API
          </span>
        ) : isBingXReadOnly ? (
          <span className="text-[7px] font-bold uppercase tracking-wider text-emerald-300 border border-emerald-500/40 px-1 rounded">
            BingX read-only
          </span>
        ) : null}
      </div>
    ),
    [isPaper, session.demo, isBingXReadOnly, isBingXSecureApi],
  );

  return (
    <TerminalPanel
      title="TRADING EXECUTION"
      collapsed={collapsed}
      noPadding
      headerExtra={panelHeader}
      className="flex-[0.65] min-w-[260px] min-h-0 max-[1200px]:min-w-[220px] max-[1000px]:min-w-0 max-[1000px]:flex-1"
    >
      <div className="flex flex-col gap-2 p-2 overflow-y-auto max-h-full text-[10px] font-mono">
        {isPaper ? (
          <PaperTradingExecutionBlock
            bingxStillConnected={Boolean(bingxRefId)}
            bingxReferenceConnectionId={bingxRefId}
            onSwitchFromPaper={
              savedBingXConnections.length > 0
                ? () => restoreBingXAfterPaper()
                : undefined
            }
          />
        ) : isBingXApiActive ? (
          <BingXReadOnlyExecutionBlock
            session={session}
            symbol={ticket.symbol}
            liveTradingEnabled={
              isBingXSecureApi
                ? session.tradingEnabled ?? risk.liveTradingEnabled
                : false
            }
            onSwitchToPaper={() => connectPaperTrading()}
          />
        ) : (
          <ExecutionVenueStrip
            chartSymbol={DEFAULT_CHART_SYMBOL}
            liveTradingEnabled={risk.liveTradingEnabled}
          />
        )}

        {/* Account — non-paper, non–BingX read-only */}
        {!isPaper && !isBingXApiActive ? (
          <section className="rounded border border-terminal-border bg-[#0a0a0a] p-2 space-y-1">
            <div className="text-[8px] font-bold uppercase tracking-widest text-cyan-500/80 mb-1">
              Account / Broker
            </div>
            <div className="grid grid-cols-2 gap-x-2 gap-y-1 text-slate-400">
              <span>Broker</span>
              <span className="text-right text-slate-200">{brokerName}</span>
              <span>Connection</span>
              <span className="text-right text-slate-200">{connectionLabel}</span>
              {isPaper ? (
                <>
                  <span>Mode</span>
                  <span className="text-right text-cyan-300/90">Simulated</span>
                </>
              ) : null}
              <span>Symbol</span>
              <span className="text-right text-slate-200">{ticket.symbol}</span>
              <span>Market</span>
              <span className="text-right text-slate-200">Perpetual Futures</span>
              <span>Balance</span>
              <span className="text-right">
                {isPaper
                  ? paperAccount && !paperAccountBusy && !paperAccountError
                    ? `${(paperAccount.equityUsdt ?? paperAccount.balanceUsdt ?? 0).toFixed(2)} USDT`
                    : paperAccountLabel(
                        true,
                        paperAccountBusy,
                        paperAccountError,
                        paperAccount?.equityUsdt ?? paperAccount?.balanceUsdt,
                        " USDT",
                      )
                  : session.demo
                    ? "Demo --"
                    : "--"}
              </span>
              <span>Avail. margin</span>
              <span className="text-right">
                {isPaper
                  ? paperAccount && !paperAccountBusy && !paperAccountError
                    ? `${(paperAccount.availableMarginUsdt ?? 0).toFixed(2)} USDT`
                    : paperAccountLabel(
                        true,
                        paperAccountBusy,
                        paperAccountError,
                        paperAccount?.availableMarginUsdt,
                        " USDT",
                      )
                  : "--"}
              </span>
              <span>Unrealized PnL</span>
              <span className="text-right">
                {isPaper
                  ? paperAccount && !paperAccountBusy && !paperAccountError
                    ? `${(paperAccount.unrealizedPnlUsdt ?? 0).toFixed(2)} USDT`
                    : paperAccountLabel(
                        true,
                        paperAccountBusy,
                        paperAccountError,
                        paperAccount?.unrealizedPnlUsdt,
                        " USDT",
                      )
                  : "--"}
              </span>
              <span>Position</span>
              <span className="text-right text-slate-200">
                {isPaper
                  ? paperPosition && paperPosition.side !== "flat"
                    ? `${paperPosition.side.toUpperCase()} ${paperPosition.quantity.toFixed(6)} BTC @ ${paperPosition.symbol}`
                    : "No position"
                  : session.demo
                    ? "No live position"
                    : "No position"}
              </span>
              <span>Open orders</span>
              <span className="text-right text-slate-200">
                {isPaper
                  ? paperAccountBusy
                    ? "Loading…"
                    : String(paperOpenOrders.length)
                  : "--"}
              </span>
              <span>Trading permissions</span>
              <span className="text-right text-amber-400/90">{permissionsLabel}</span>
            </div>
          </section>
        ) : null}

        {/* Order ticket — legacy panel path (paper uses PaperTradingExecutionBlock) */}
        {!isPaper ? (
        <section
          className={cn(
            "rounded border border-terminal-border bg-[#0a0a0a] p-2 space-y-2",
            isBingXReadOnly && "opacity-60 pointer-events-none",
          )}
          title={
            isBingXReadOnly
              ? "Real trading is disabled in this build."
              : undefined
          }
        >
          <div className="text-[8px] font-bold uppercase tracking-widest text-cyan-500/80">
            Order ticket
          </div>

          <div className="grid grid-cols-2 gap-1">
            <button
              type="button"
              onClick={() => setTicket((t) => ({ ...t, side: "long" }))}
              className={cn(
                "py-1.5 text-[9px] font-bold uppercase border rounded transition-colors",
                sideLong
                  ? "border-emerald-500/50 bg-emerald-500/15 text-emerald-300"
                  : "border-terminal-border text-slate-500 hover:text-slate-300",
              )}
            >
              Long
            </button>
            <button
              type="button"
              onClick={() => setTicket((t) => ({ ...t, side: "short" }))}
              className={cn(
                "py-1.5 text-[9px] font-bold uppercase border rounded transition-colors",
                !sideLong
                  ? "border-red-500/50 bg-red-500/15 text-red-300"
                  : "border-terminal-border text-slate-500 hover:text-slate-300",
              )}
            >
              Short
            </button>
          </div>

          <div className="grid grid-cols-2 gap-1">
            {(["market", "limit"] as const).map((t) => {
              const typeDisabled =
                isPaper &&
                ((t === "market" && paperSettings && !paperSettings.allowMarketOrders) ||
                  (t === "limit" && paperSettings && !paperSettings.allowLimitOrders));
              return (
                <button
                  key={t}
                  type="button"
                  disabled={typeDisabled}
                  onClick={() => setTicket((tk) => ({ ...tk, type: t }))}
                  className={cn(
                    "py-1 text-[9px] uppercase border rounded",
                    typeDisabled && "opacity-40 cursor-not-allowed",
                    ticket.type === t
                      ? "border-cyan-500/40 text-cyan-200 bg-cyan-500/10"
                      : "border-terminal-border text-slate-500",
                  )}
                >
                  {t}
                </button>
              );
            })}
          </div>

          {ticket.type === "limit" ? (
            <Row label="Price">
              <input
                className={inputClass}
                value={ticket.price}
                onChange={(e) => setTicket((t) => ({ ...t, price: e.target.value }))}
                placeholder="0.00"
              />
            </Row>
          ) : null}

          <div className="grid grid-cols-[1fr_auto] gap-1">
            <Row label="Size">
              <input
                className={inputClass}
                value={ticket.size}
                onChange={(e) => setTicket((t) => ({ ...t, size: e.target.value }))}
                placeholder="0"
              />
            </Row>
            <Row label="Unit">
              <select
                className={cn(inputClass, "w-14")}
                value={ticket.sizeUnit}
                onChange={(e) =>
                  setTicket((t) => ({
                    ...t,
                    sizeUnit: e.target.value as OrderTicketState["sizeUnit"],
                  }))
                }
              >
                <option value="USDT">USDT</option>
                <option value="BTC">BTC</option>
                <option value="%">%</option>
              </select>
            </Row>
          </div>

          <Row label="Leverage">
            <input
              className={inputClass}
              value={ticket.leverage}
              max={isPaper && paperSettings ? paperSettings.maxLeverage : undefined}
              onChange={(e) => setTicket((t) => ({ ...t, leverage: e.target.value }))}
            />
          </Row>
          {isPaper && paperSettings ? (
            <p className="text-[8px] text-slate-600">Max leverage {paperSettings.maxLeverage}x</p>
          ) : null}

          <Row label="Margin mode">
            <select
              className={inputClass}
              value={ticket.marginMode}
              onChange={(e) =>
                setTicket((t) => ({
                  ...t,
                  marginMode: e.target.value as OrderTicketState["marginMode"],
                }))
              }
            >
              <option value="isolated">Isolated</option>
              <option value="cross">Cross</option>
            </select>
          </Row>

          <div className="flex flex-wrap gap-3 text-[9px] text-slate-400">
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={ticket.reduceOnly}
                onChange={(e) =>
                  setTicket((t) => ({ ...t, reduceOnly: e.target.checked }))
                }
                className="h-3 w-3 accent-cyan-500"
              />
              Reduce only
            </label>
            <label className="flex items-center gap-1.5 cursor-pointer">
              <input
                type="checkbox"
                checked={ticket.postOnly}
                onChange={(e) =>
                  setTicket((t) => ({ ...t, postOnly: e.target.checked }))
                }
                className="h-3 w-3 accent-cyan-500"
              />
              Post only
            </label>
          </div>

          <div className="grid grid-cols-2 gap-1">
            <Row label={isPaper ? "Stop loss (paper)" : "Stop loss"}>
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder={isPaper ? "optional" : ""}
                disabled={!isPaper}
                value={ticket.stopLoss}
                onChange={(e) => setTicket((t) => ({ ...t, stopLoss: e.target.value }))}
              />
            </Row>
            <Row label={isPaper ? "Take profit (paper)" : "Take profit"}>
              <input
                className={inputClass}
                inputMode="decimal"
                placeholder={isPaper ? "optional" : ""}
                disabled={!isPaper}
                value={ticket.takeProfit}
                onChange={(e) => setTicket((t) => ({ ...t, takeProfit: e.target.value }))}
              />
            </Row>
          </div>
          {isPaper ? (
            <p className="text-[8px] text-slate-600 leading-snug">
              SL/TP sent with paper submit — shown on chart when position opens.
            </p>
          ) : null}
        </section>
        ) : null}

        {/* Risk guard — compact while live trading is off */}
        {!isPaper && !isBingXReadOnly && !risk.liveTradingEnabled ? (
          <p className="text-[8px] text-slate-500 px-0.5">
            Risk guard: Live trading locked
            {isPaper ? " · Paper simulation" : " · Read-only mode"}
          </p>
        ) : !isPaper && !isBingXReadOnly && risk.liveTradingEnabled ? (
          <section className="rounded border border-amber-500/25 bg-amber-950/20 p-2 space-y-0.5 text-[9px] text-amber-200/80">
            <div className="font-bold uppercase tracking-widest text-[8px] mb-1">Risk guard</div>
            <div className="flex justify-between">
              <span>Live trading</span>
              <span>{risk.liveTradingEnabled ? "ON" : "OFF"}</span>
            </div>
            <div className="flex justify-between">
              <span>Max notional</span>
              <span>{risk.maxNotionalUsdt ?? "--"}</span>
            </div>
            <div className="flex justify-between">
              <span>Max leverage</span>
              <span>{risk.maxLeverage ?? "--"}</span>
            </div>
            <div className="flex justify-between">
              <span>Confirmation</span>
              <span>{risk.confirmationRequired ? "YES" : "NO"}</span>
            </div>
            <div className="flex justify-between">
              <span>Permissions</span>
              <span className="uppercase">{permissionsLabel}</span>
            </div>
          </section>
        ) : null}

        {/* Preview result */}
        {!isPaper && preview ? (
          <section className="rounded border border-cyan-500/25 bg-cyan-950/20 p-2 text-[9px] text-cyan-100/90 space-y-1">
            <div className="font-bold uppercase tracking-widest text-[8px]">Order preview</div>
            <div>
              {preview.side.toUpperCase()} {preview.type} · {preview.size} {preview.sizeUnit}
              {preview.price ? ` @ ${preview.price}` : ""} · {preview.leverage}x{" "}
              {preview.marginMode}
            </div>
            {preview.estimatedNotional != null ? (
              <div>Est. notional: {preview.estimatedNotional.toFixed(2)} USDT</div>
            ) : null}
            {preview.estimatedMargin != null ? (
              <div>Est. margin: {preview.estimatedMargin.toFixed(2)} USDT</div>
            ) : null}
            {preview.estimatedFee != null ? (
              <div>Est. fee: {preview.estimatedFee.toFixed(4)} USDT</div>
            ) : null}
            {preview.estimatedSlippageBps != null && preview.estimatedSlippageBps > 0 ? (
              <div>Est. slippage: {preview.estimatedSlippageBps} bps</div>
            ) : null}
            {preview.fillPriceEstimate != null ? (
              <div>Est. fill: {preview.fillPriceEstimate.toFixed(2)}</div>
            ) : null}
            {preview.markPrice != null ? (
              <div>Mark: {preview.markPrice.toFixed(2)}</div>
            ) : null}
            {preview.estimatedRiskUsdt != null ? (
              <div>Est. risk (SL): {preview.estimatedRiskUsdt.toFixed(2)} USDT</div>
            ) : null}
            {preview.estimatedRewardUsdt != null ? (
              <div>Est. reward (TP): {preview.estimatedRewardUsdt.toFixed(2)} USDT</div>
            ) : null}
            {preview.riskRewardRatio != null ? (
              <div>R:R ≈ 1:{preview.riskRewardRatio.toFixed(2)}</div>
            ) : null}
            {preview.warnings.map((w) => (
              <div key={w} className="text-amber-400/80">
                · {w}
              </div>
            ))}
          </section>
        ) : null}

        {/* Actions */}
        {!isPaper ? (
        <div className="grid grid-cols-2 gap-1">
          <button
            type="button"
            onClick={() => void handlePreview()}
            disabled={previewLoading}
            className="rounded border border-terminal-border py-1.5 text-[9px] font-bold uppercase tracking-wider text-slate-300 hover:border-white/25 hover:bg-white/[0.03] disabled:opacity-50"
          >
            {previewLoading ? "..." : "Preview order"}
          </button>
          <button
            type="button"
            disabled={submitDisabled || submitLoading}
            onClick={() => void handleSubmit()}
            title={
              isPaper
                ? "Submit simulated paper order"
                : isBingXReadOnly
                  ? "Real trading is disabled in this build."
                  : "Live trading disabled in this phase."
            }
            className={cn(
              "rounded border py-1.5 text-[9px] font-bold uppercase tracking-wider",
              isPaper
                ? "border-cyan-500/45 bg-cyan-600/20 text-cyan-100 hover:bg-cyan-600/30 disabled:opacity-50"
                : "border-slate-700 bg-slate-900/80 text-slate-500 cursor-not-allowed",
            )}
          >
            {submitLoading
              ? "..."
              : isPaper
                ? "Submit paper order"
                : "Submit order"}
          </button>
        </div>
        ) : null}

        <p className="text-[8px] text-center text-slate-600 leading-snug px-1">
          {workspaceMessage}
        </p>

        {/* Position mgmt — non-paper */}
        {!isPaper && !isBingXApiActive ? (
        <section className="rounded border border-terminal-border p-2 space-y-1">
          <div className="text-[8px] font-bold uppercase tracking-widest text-slate-500">
            Position management
          </div>
          <div className="text-[9px] text-slate-500">
            Open position:{" "}
            {isPaper
              ? paperPosition && paperPosition.side !== "flat"
                ? `${paperPosition.side} ${paperPosition.quantity.toFixed(6)} BTC`
                : "none"
              : "none"}
          </div>
          <div className="text-[9px] text-slate-500">
            Open orders: {openOrdersLabel}
          </div>
          {isPaper && paperPosition && paperPosition.side !== "flat" ? (
            <div className="text-[9px] font-mono text-slate-400 space-y-0.5">
              <div>
                SL:{" "}
                {paperPosition.stopLoss != null
                  ? paperPosition.stopLoss.toFixed(2)
                  : paperOpenTrade?.stopLoss != null
                    ? paperOpenTrade.stopLoss.toFixed(2)
                    : "—"}
              </div>
              <div>
                TP:{" "}
                {paperPosition.takeProfit != null
                  ? paperPosition.takeProfit.toFixed(2)
                  : paperOpenTrade?.takeProfit != null
                    ? paperOpenTrade.takeProfit.toFixed(2)
                    : "—"}
              </div>
            </div>
          ) : null}
          {isPaper && !hasPaperPosition ? (
            <p className="text-[8px] text-slate-600 mt-1">
              Open a paper position to manage SL/TP.
            </p>
          ) : null}
          {isPaper && hasPaperPosition && paperPosition ? (
            <PaperRiskManagementSection
              position={paperPosition}
              disabled={actionLoading}
              onSuccess={(msg) => setPaperMessage(msg)}
              onError={(msg) => setPaperMessage(msg)}
              onUpdated={refetchPaper}
            />
          ) : null}
          <div className="grid grid-cols-3 gap-1 mt-1">
            <button
              type="button"
              disabled={closeDisabled}
              onClick={() => hasPaperPosition && setCloseModalOpen(true)}
              className={cn(
                "py-1 text-[8px] font-bold uppercase border rounded",
                isPaper
                  ? "border-terminal-border text-slate-300 hover:border-white/25"
                  : "border-terminal-border text-slate-600 cursor-not-allowed opacity-50",
              )}
            >
              Close
            </button>
            <button
              type="button"
              disabled={positionActionsDisabled}
              onClick={() => void runPaperAction("/api/paper/cancel-all", "Orders cancelled")}
              className={cn(
                "py-1 text-[8px] font-bold uppercase border rounded",
                isPaper
                  ? "border-terminal-border text-slate-300 hover:border-white/25"
                  : "border-terminal-border text-slate-600 cursor-not-allowed opacity-50",
              )}
            >
              Cancel all
            </button>
            <button
              type="button"
              disabled={positionActionsDisabled}
              onClick={() => void runPaperAction("/api/paper/kill-switch", "Kill switch executed")}
              className={cn(
                "py-1 text-[8px] font-bold uppercase border rounded",
                isPaper
                  ? "border-red-900/50 text-red-400 hover:bg-red-950/30"
                  : "border-red-900/50 text-red-400/60 cursor-not-allowed opacity-50",
              )}
            >
              Kill switch
            </button>
          </div>
          <p className="text-[8px] text-red-400/50 text-center">
            {isPaper
              ? "Paper position controls — simulated only."
              : session.connected
                ? "Live position controls disabled in this phase."
                : "Available after broker connection."}
          </p>
        </section>
        ) : null}

        {isPaper && false ? (
          <section className="rounded border border-terminal-border p-2 space-y-1">
            <div className="text-[8px] font-bold uppercase tracking-widest text-slate-500">
              Paper trades
            </div>
            {paperOpenTrade ? (
              <div className="font-mono text-[9px] text-slate-300 space-y-0.5 border border-cyan-500/20 rounded px-1.5 py-1 bg-cyan-950/15">
                <div className="text-[8px] uppercase text-cyan-500/80">Open</div>
                <div>
                  {paperOpenTrade.side.toUpperCase()} · entry{" "}
                  {paperOpenTrade.entryPrice.toFixed(2)} · qty{" "}
                  {paperOpenTrade.quantity.toFixed(6)}
                </div>
                <div className="text-slate-500">
                  SL{" "}
                  {paperOpenTrade.stopLoss != null
                    ? paperOpenTrade.stopLoss.toFixed(2)
                    : "—"}{" "}
                  · TP{" "}
                  {paperOpenTrade.takeProfit != null
                    ? paperOpenTrade.takeProfit.toFixed(2)
                    : "—"}
                </div>
                <div>
                  uPnL {paperOpenTrade.unrealizedPnlUsdt.toFixed(2)} USDT
                  {paperOpenTrade.rMultiple != null
                    ? ` · R ${paperOpenTrade.rMultiple.toFixed(2)}`
                    : ""}
                </div>
              </div>
            ) : (
              <p className="text-[9px] text-slate-600">No open paper trade.</p>
            )}
            {paperRecentClosed.length > 0 ? (
              <div className="space-y-1 max-h-24 overflow-y-auto">
                {paperRecentClosed.map((t) => (
                  <div
                    key={t.id}
                    className="font-mono text-[8px] text-slate-500 border-b border-terminal-border/50 pb-0.5"
                  >
                    {t.side.toUpperCase()} {t.entryPrice.toFixed(0)}→
                    {t.exitPrice?.toFixed(0) ?? "—"} · PnL{" "}
                    {t.realizedPnlUsdt.toFixed(2)}
                    {t.rMultiple != null ? ` · ${t.rMultiple.toFixed(2)}R` : ""}
                  </div>
                ))}
              </div>
            ) : null}
          </section>
        ) : null}

        {isPaper && hasPaperPosition && paperPosition ? (
          <PaperClosePositionModal
            open={closeModalOpen}
            onClose={() => setCloseModalOpen(false)}
            position={paperPosition}
            loading={actionLoading}
            onConfirm={async (percent) => {
              setActionLoading(true);
              setPaperMessage(null);
              try {
                await postPaperClosePartial(percent);
                setCloseModalOpen(false);
                setPaperMessage(
                  percent >= 100
                    ? "Paper position closed"
                    : `Closed ${percent}% of paper position.`,
                );
                await refetchPaper();
              } catch {
                setPaperMessage("Paper close failed");
              } finally {
                setActionLoading(false);
              }
            }}
          />
        ) : null}
      </div>
    </TerminalPanel>
  );
}
