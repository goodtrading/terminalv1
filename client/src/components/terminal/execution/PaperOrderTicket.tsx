import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import {
  paperExecutionPort,
  PaperExecutionPortError,
} from "@/lib/paperExecutionPort";
import { NAUTILUS_PAPER_SIMULATION_CONTEXT } from "@/lib/nautilusPaperMarketAdapter";
import type {
  OrderPreviewSummary,
  PaperAccountSnapshot,
  PaperPositionSnapshot,
  PaperTradingSettings,
} from "./executionTypes";
import {
  DEFAULT_TERMINAL_EXECUTION_CONTEXT,
  resolveExecutionSymbolForChart,
} from "./executionContext";
import { PaperRiskGuardLine } from "./PaperRiskGuardLine";
import { emitTerminalAudit } from "../health/terminalAuditLog";
import {
  PAPER_NO_PRICE_MESSAGE,
  PAPER_PRICE_FALLBACK_HINT,
  resolvePaperEntryPrice,
} from "./paperEntryPrice";
import { computePaperTicketMetrics } from "./paperOrderTicketCalc";

import { paperMaxLeverage } from "./paperRiskGuardConfig";
import {
  buildPaperSubmitRiskPayload,
} from "./paperRiskValidation";
import {
  validatePaperTicketOrder,
  validatePaperTicketRiskLevels,
} from "./paperTicketValidation";
import {
  derivePaperQtyBtc,
  getPaperSubmitState,
} from "./paperTicketSubmitState";

const inputClass =
  "w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-[12px] font-mono text-white focus:border-cyan-500/40 focus:outline-none disabled:opacity-50";

const qtyReadonlyClass =
  "w-full rounded border border-terminal-border/60 bg-black/40 px-2 py-1 text-[10px] font-mono text-slate-400";

export type PaperOrderFeedback = {
  title: string;
  side: string;
  orderType: string;
  notionalUsdt?: number;
  entry?: number;
  size?: number;
  stopLoss?: number | null;
  takeProfit?: number | null;
  riskUsdt?: number | null;
  rMultiple?: number | null;
  detail?: string;
};

type PaperTicketSubmitStateInput = {
  marketReady: boolean;
  tradingBlocked: boolean;
  blockReason?: string | null;
};

export function resolvePaperTicketSubmitState({
  marketReady,
  tradingBlocked,
  blockReason,
}: PaperTicketSubmitStateInput): { disabled: boolean; reason: string | null } {
  if (tradingBlocked) {
    return {
      disabled: true,
      reason: blockReason ?? "PAPER execution is blocked.",
    };
  }
  return {
    disabled: !marketReady,
    reason: null,
  };
}

export function resolveNautilusPaperTicketQuantityText(
  source: "usdt" | "btc",
  rawQuantityText: string,
): string {
  if (source !== "btc") {
    throw new Error("NAUTILUS_EXACT_BASE_QUANTITY_REQUIRED");
  }
  const quantityText = rawQuantityText.trim();
  if (!quantityText) {
    throw new Error("NAUTILUS_DECIMAL_QUANTITY_REQUIRED");
  }
  return quantityText;
}

type Props = {
  markPrice: number | null;
  tickerPrice?: number | null;
  bingxLastPrice?: number | null;
  account?: PaperAccountSnapshot | null;
  settings?: PaperTradingSettings | null;
  position?: PaperPositionSnapshot | null;
  busy?: boolean;
  executionUnavailable?: boolean;
  tradingBlocked?: boolean;
  blockReason?: string | null;
  ticketLeverage?: number | null;
  computedRiskPct?: number | null;
  onMessage: (msg: string) => void;
  onExecuted: (feedback: PaperOrderFeedback) => void;
  onRiskPctChange: (pct: number | null) => void;
  onLeverageChange: (lev: number | null) => void;
  onRefresh: () => void | Promise<void>;
  onClosePosition: () => void | Promise<void>;
  onCancelAll: () => void | Promise<void>;
};

export function PaperOrderTicket({
  markPrice,
  tickerPrice,
  bingxLastPrice,
  account,
  settings,
  position,
  busy = false,
  executionUnavailable = false,
  tradingBlocked = false,
  blockReason,
  ticketLeverage: ticketLeverageProp,
  computedRiskPct,
  onMessage,
  onExecuted,
  onRiskPctChange,
  onLeverageChange,
  onRefresh,
  onClosePosition,
  onCancelAll,
}: Props) {
  const [side, setSide] = useState<"long" | "short">("long");
  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [limitPrice, setLimitPrice] = useState("");
  const [sizeUsdt, setSizeUsdt] = useState("100");
  const [qtyBtc, setQtyBtc] = useState("");
  const [sizeEditMode, setSizeEditMode] = useState<"usdt" | "btc">("usdt");
  const [leverage, setLeverage] = useState("10");
  const [leverageInitialized, setLeverageInitialized] = useState(false);
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [reduceOnly, setReduceOnly] = useState(false);
  const [marginMode, setMarginMode] = useState<"isolated" | "cross">(
    settings?.defaultMarginMode ?? "isolated",
  );
  const [serverPreview, setServerPreview] = useState<OrderPreviewSummary | null>(
    null,
  );
  const [priceHint, setPriceHint] = useState<string | null>(null);
  const [quantitySource, setQuantitySource] = useState<"usdt" | "btc">("usdt");
  const submitInFlight = useRef(false);

  const chartSymbol =
    DEFAULT_TERMINAL_EXECUTION_CONTEXT.chartSymbol ?? "BTCUSDT";
  const executionSymbol =
    resolveExecutionSymbolForChart(chartSymbol) ?? "BTC-USDT";
  const equity = account?.equityUsdt ?? settings?.initialBalanceUsdt ?? 10_000;
  const maxLev = paperMaxLeverage(settings);

  useEffect(() => {
    if (leverageInitialized || !settings) return;
    setLeverage(String(settings.defaultLeverage ?? 10));
    setLeverageInitialized(true);
  }, [settings, leverageInitialized]);

  const limitPx = Number(limitPrice);
  const limitPxValid = Number.isFinite(limitPx) && limitPx > 0;

  /** Market entry always uses fallback chain — independent of limit tab. */
  const marketEntryResolved = useMemo(
    () =>
      resolvePaperEntryPrice({
        orderType: "market",
        markPrice,
        bingxLastPrice,
        tickerPrice,
        chartClosePrice: tickerPrice,
      }),
    [markPrice, bingxLastPrice, tickerPrice],
  );

  const entryPriceForSizing =
    orderType === "limit" && limitPxValid
      ? limitPx
      : marketEntryResolved.price;

  useEffect(() => {
    if (
      marketEntryResolved.usedFallback &&
      marketEntryResolved.price != null
    ) {
      setPriceHint(PAPER_PRICE_FALLBACK_HINT);
    } else {
      setPriceHint(null);
    }
  }, [marketEntryResolved.usedFallback, marketEntryResolved.price]);

  const notionalNum = Number(sizeUsdt);
  const levNum = Number(leverage);

  const effectiveQtyBtc = useMemo(
    () => derivePaperQtyBtc(notionalNum, entryPriceForSizing, qtyBtc),
    [notionalNum, entryPriceForSizing, qtyBtc],
  );

  useEffect(() => {
    if (entryPriceForSizing == null || entryPriceForSizing <= 0) return;
    if (sizeEditMode === "usdt") {
      const usdt = Number(sizeUsdt);
      if (Number.isFinite(usdt) && usdt > 0) {
        setQtyBtc((usdt / entryPriceForSizing).toFixed(8));
      }
    } else {
      const btc = Number(qtyBtc);
      if (Number.isFinite(btc) && btc > 0) {
        setSizeUsdt((btc * entryPriceForSizing).toFixed(2));
      }
    }
  }, [entryPriceForSizing, sizeUsdt, qtyBtc, sizeEditMode]);
  const riskPayload = buildPaperSubmitRiskPayload(stopLoss, takeProfit);

  const localMetrics = useMemo(() => {
    if (
      entryPriceForSizing == null ||
      !Number.isFinite(notionalNum) ||
      notionalNum <= 0
    ) {
      return null;
    }
    if (!Number.isFinite(effectiveQtyBtc) || effectiveQtyBtc <= 0) return null;
    return computePaperTicketMetrics({
      side,
      entryPrice: entryPriceForSizing,
      notionalUsdt: notionalNum,
      quantityBtc: effectiveQtyBtc,
      leverage: Number.isFinite(levNum) && levNum > 0 ? levNum : 1,
      stopLoss: riskPayload.stopLoss,
      takeProfit: riskPayload.takeProfit,
      paperEquity: equity,
    });
  }, [
    side,
    entryPriceForSizing,
    notionalNum,
    effectiveQtyBtc,
    levNum,
    riskPayload.stopLoss,
    riskPayload.takeProfit,
    equity,
  ]);

  useEffect(() => {
    onRiskPctChange(localMetrics?.riskPct ?? null);
  }, [localMetrics?.riskPct, onRiskPctChange]);

  useEffect(() => {
    onLeverageChange(Number.isFinite(levNum) ? levNum : null);
  }, [levNum, onLeverageChange]);

  const dailyLossBlock =
    tradingBlocked && blockReason ? blockReason : null;
  const selectedBackend = paperExecutionPort.getBackend();
  useEffect(() => { setServerPreview(null); }, [selectedBackend]);

  const marketSubmit = useMemo(
    () =>
      getPaperSubmitState({
        busy,
        notionalUsdt: notionalNum,
        qtyBtc: effectiveQtyBtc,
        leverage: levNum,
        estimatedEntryPrice: marketEntryResolved.price,
        settings,
        kind: "market",
      }),
    [
      busy,
      notionalNum,
      effectiveQtyBtc,
      levNum,
      marketEntryResolved.price,
      settings,
    ],
  );

  const limitSubmit = useMemo(
    () =>
      getPaperSubmitState({
        busy,
        notionalUsdt: notionalNum,
        qtyBtc: effectiveQtyBtc,
        leverage: levNum,
        estimatedEntryPrice: limitPxValid ? limitPx : null,
        limitPrice: limitPx,
        settings,
        kind: "limit",
      }),
    [
      busy,
      notionalNum,
      effectiveQtyBtc,
      levNum,
      limitPx,
      limitPxValid,
      settings,
    ],
  );

  const marketReady = marketSubmit.enabled && !dailyLossBlock;
  const limitReady = limitSubmit.enabled && !dailyLossBlock;

  const marketDisabledReason =
    dailyLossBlock ?? marketSubmit.reason ?? null;
  const limitDisabledReason = dailyLossBlock ?? limitSubmit.reason ?? null;

  const softRiskWarning = useMemo(
    () =>
      validatePaperTicketRiskLevels({
        side,
        orderType,
        estimatedEntryPrice: marketEntryResolved.price,
        limitPrice: limitPxValid ? limitPx : null,
        stopLossRaw: stopLoss,
        takeProfitRaw: takeProfit,
      }),
    [
      side,
      orderType,
      marketEntryResolved.price,
      limitPx,
      limitPxValid,
      stopLoss,
      takeProfit,
    ],
  );

  const buildOrderPayload = useCallback(
    (apiSide: "buy" | "sell", type: "market" | "limit") => {
      const entry =
        type === "limit" && limitPxValid
          ? limitPx
          : marketEntryResolved.price ?? entryPriceForSizing;
      return {
        exchange: "bingx",
        marketType: "perpetual",
        symbol: executionSymbol,
        chartSymbol,
        side: apiSide,
        orderType: type,
        notionalUSDT: notionalNum,
        qtyBTC: effectiveQtyBtc,
        qty: effectiveQtyBtc,
        entryPrice: entry,
        leverage: levNum,
        marginMode,
        stopLoss: riskPayload.stopLoss,
        takeProfit: riskPayload.takeProfit,
        reduceOnly,
        price: type === "limit" ? limitPx : undefined,
      };
    },
    [
      executionSymbol,
      notionalNum,
      effectiveQtyBtc,
      marketEntryResolved.price,
      entryPriceForSizing,
      limitPx,
      limitPxValid,
      levNum,
      marginMode,
      riskPayload.stopLoss,
      riskPayload.takeProfit,
      reduceOnly,
    ],
  );

  const fetchPreview = useCallback(async () => {
    const previewBackend = paperExecutionPort.getBackend();
    if (previewBackend === "nautilus") {
      setServerPreview(null);
      return;
    }
    if (
      !marketSubmit.enabled ||
      marketEntryResolved.price == null ||
      notionalNum <= 0 ||
      effectiveQtyBtc <= 0
    ) {
      setServerPreview(null);
      return;
    }
    try {
      const json = await paperExecutionPort.previewOrder({
        ...buildOrderPayload(side === "long" ? "buy" : "sell", orderType),
      }) as {
        success?: boolean;
        preview?: OrderPreviewSummary;
      };
      if (paperExecutionPort.getBackend() !== previewBackend) return;
      if (json.success && json.preview) {
        setServerPreview(json.preview);
      } else {
        setServerPreview(null);
      }
    } catch {
      setServerPreview(null);
    }
  }, [
    selectedBackend,
    marketSubmit.enabled,
    marketEntryResolved.price,
    notionalNum,
    effectiveQtyBtc,
    buildOrderPayload,
    side,
    orderType,
  ]);

  useEffect(() => {
    const t = setTimeout(() => void fetchPreview(), 400);
    return () => clearTimeout(t);
  }, [fetchPreview]);

  const display = {
    entry:
      serverPreview?.fillPriceEstimate ??
      localMetrics?.estimatedEntry ??
      entryPriceForSizing,
    stopDistance: localMetrics?.stopDistance,
    riskUsdt: serverPreview?.estimatedRiskUsdt ?? localMetrics?.riskUsdt,
    riskPct: localMetrics?.riskPct,
    notional:
      serverPreview?.estimatedNotional ?? localMetrics?.positionNotional ?? notionalNum,
    margin:
      serverPreview?.estimatedMargin ??
      localMetrics?.requiredMargin ??
      (notionalNum > 0 && levNum > 0 ? notionalNum / levNum : null),
    pnlTp: serverPreview?.estimatedRewardUsdt ?? localMetrics?.pnlToTp,
    lossSl: localMetrics?.lossToSl,
    rMultiple: serverPreview?.riskRewardRatio ?? localMetrics?.rMultiple,
    fee: serverPreview?.estimatedFee,
  };

  const submitDebug = useMemo(
    () => ({
      mode: "paper" as const,
      orderType,
      side,
      notionalUSDT: notionalNum,
      qtyBTC: effectiveQtyBtc,
      leverage: levNum,
      maxLeverage: maxLev,
      marginMode,
      markPrice,
      fallbackPrice: marketEntryResolved.usedFallback
        ? marketEntryResolved.price
        : null,
      estimatedEntryPrice: marketEntryResolved.price,
      entryPriceForSizing,
      hasValidEntryPrice:
        marketEntryResolved.price != null && marketEntryResolved.price > 0,
      executionDomain: "paper" as const,
      executionMarketType: DEFAULT_TERMINAL_EXECUTION_CONTEXT.executionMarketType,
      executionSymbol,
      liveTradingLocked: true,
      riskGuardAllowed: !dailyLossBlock,
      marketButtonDisabled: !marketReady,
      marketDisabledReason,
      limitButtonDisabled: !limitReady,
      limitDisabledReason,
      softRiskWarning,
      dailyLossBlock,
    }),
    [
      orderType,
      side,
      notionalNum,
      effectiveQtyBtc,
      levNum,
      maxLev,
      marginMode,
      markPrice,
      marketEntryResolved,
      entryPriceForSizing,
      executionSymbol,
      dailyLossBlock,
      marketReady,
      marketDisabledReason,
      limitReady,
      limitDisabledReason,
      softRiskWarning,
    ],
  );

  const submit = async (apiSide: "buy" | "sell", type: "market" | "limit") => {
    if (busy || executionUnavailable || tradingBlocked) {
      onMessage(blockReason ?? "PAPER execution is blocked.");
      return;
    }
    if (submitInFlight.current) return;
    submitInFlight.current = true;
    const backend = paperExecutionPort.getBackend();
    const isNautilus = backend === "nautilus";
    const hardErr = validatePaperTicketOrder({
      side: apiSide === "buy" ? "long" : "short",
      orderType: type,
      notionalUsdt: notionalNum,
      qtyBtc: effectiveQtyBtc,
      leverage: levNum,
      estimatedEntryPrice:
        type === "limit" ? limitPx : marketEntryResolved.price,
      limitPrice: type === "limit" ? limitPx : null,
      stopLossRaw: stopLoss,
      takeProfitRaw: takeProfit,
      positionNotional: localMetrics?.positionNotional ?? notionalNum,
      settings,
      liveTradingEnabled: false,
      attemptLive: false,
    });
    const riskErr = validatePaperTicketRiskLevels({
      side: apiSide === "buy" ? "long" : "short",
      orderType: type,
      estimatedEntryPrice:
        type === "limit" ? limitPx : marketEntryResolved.price,
      limitPrice: type === "limit" ? limitPx : null,
      stopLossRaw: stopLoss,
      takeProfitRaw: takeProfit,
    });
    const lifecycleState = isNautilus ? paperExecutionPort.getState() : null;
    const quantityErr = isNautilus
      ? quantitySource !== "btc"
        ? "NAUTILUS_EXACT_BASE_QUANTITY_REQUIRED"
        : !qtyBtc.trim()
          ? "NAUTILUS_DECIMAL_QUANTITY_REQUIRED"
          : null
      : null;
    const orderTypeErr = null;
    const readinessErr =
      isNautilus &&
      (lifecycleState?.availability !== "AVAILABLE" ||
        lifecycleState.engine !== "RUNNING" ||
        lifecycleState.simulation !== "RUNNING")
        ? "NAUTILUS_BACKEND_NOT_READY"
        : null;
    const err = dailyLossBlock ?? orderTypeErr ?? readinessErr ?? quantityErr ?? hardErr ?? riskErr;

    if (err) {
      onMessage(err);
      submitInFlight.current = false;
      return;
    }
    onMessage(priceHint ?? "");
    try {
      const result = isNautilus
        ? {
            res: { ok: true, status: 200 },
            data: await paperExecutionPort.submitOrder({
              ...buildOrderPayload(apiSide, type),
              quantityText: resolveNautilusPaperTicketQuantityText(
                quantitySource,
                qtyBtc,
              ),
              executionContext: NAUTILUS_PAPER_SIMULATION_CONTEXT,
            }),
          }
        : await paperExecutionPort.paperApiJson("/api/paper/order", {
            method: "POST",
            body: JSON.stringify(buildOrderPayload(apiSide, type)),
          });
      if (paperExecutionPort.getBackend() !== backend) return;
      const response = result.data as {
        success?: boolean;
        message?: string;
        code?: string;
        order?: { status?: string; averageFillPrice?: string; clientOrderId?: string };
        position?: {
          entryPrice?: number;
          quantity?: number;
          stopLoss?: number | null;
          takeProfit?: number | null;
          side?: string;
        };
        account?: unknown;
      };
      const legacyJson = response;
      if (!result.res.ok || (!isNautilus && !legacyJson.success)) {
        const errBody = legacyJson;
        onMessage(
          result.res.status === 401
            ? errBody.message ?? "Paper trading requires login (cookie or Bearer token)."
            : errBody.message ?? "Paper order rejected",
        );
        return;
      }

      const ticketSide = apiSide === "buy" ? "long" : "short";
      const fb: PaperOrderFeedback = {
        title: type === "market" ? "Order filled (paper)" : "Order created (paper)",
        side: ticketSide,
        orderType: type,
        notionalUsdt: notionalNum,
        entry: isNautilus
          ? display.entry ?? undefined
          : legacyJson.position?.entryPrice ?? display.entry ?? undefined,
        size: isNautilus ? effectiveQtyBtc : legacyJson.position?.quantity ?? effectiveQtyBtc,
        stopLoss: legacyJson.position?.stopLoss ?? riskPayload.stopLoss,
        takeProfit: legacyJson.position?.takeProfit ?? riskPayload.takeProfit,
        riskUsdt: display.riskUsdt,
        rMultiple: display.rMultiple,
        detail:
          legacyJson.message ??
          (isNautilus
            ? "Nautilus Paper MARKET filled — proxy pricing provenance available."
            : "Paper execution — no real order sent."),
      };
      onExecuted(fb);
      emitTerminalAudit(
        "paper_order_submitted",
        `${type === "market" ? "Paper market" : "Paper limit"} ${ticketSide} · ${notionalNum ?? "—"} USDT`,
      );
      onMessage(
        type === "market"
          ? "Paper order filled"
          : (legacyJson.message ?? "Paper order created"),
      );
      await onRefresh();
    } catch (err) {
      if (paperExecutionPort.getBackend() !== backend) return;
      if (err instanceof PaperExecutionPortError && err.code === "ORDER_EXECUTED_STATE_REFRESH_FAILED") {
        onMessage("Order executed, state refresh failed");
      } else {
        onMessage(err instanceof Error ? err.message : "Submit failed");
      }
    } finally {
      submitInFlight.current = false;
    }
  };

  const riskLabel =
    riskPayload.stopLoss == null
      ? "Risk: No SL"
      : display.riskPct != null
        ? `Risk: ${display.riskPct}% (${fmt(display.riskUsdt, " USDT")})`
        : display.riskUsdt != null
          ? `Risk: ${fmt(display.riskUsdt, " USDT")}`
          : "Risk: —";

  const ticketLevNum = Number(leverage);
  const ticketLevForGuard =
    ticketLeverageProp ??
    (Number.isFinite(ticketLevNum) ? ticketLevNum : null);

  return (
    <section className="rounded border border-cyan-500/30 bg-[#0a0a0a] p-2 space-y-1.5">
      <div className="text-[7px] font-bold uppercase tracking-widest text-cyan-400/90">
        Order ticket
      </div>

      <div className="grid grid-cols-2 gap-1">
        <Row label="Side">
          <div className="flex gap-1">
            {(["long", "short"] as const).map((s) => (
              <button
                key={s}
                type="button"
                onClick={() => setSide(s)}
                className={cn(
                  "flex-1 py-1 text-[8px] font-bold uppercase rounded border",
                  side === s
                    ? s === "long"
                      ? "border-emerald-500/50 bg-emerald-950/30 text-emerald-200"
                      : "border-red-500/50 bg-red-950/30 text-red-200"
                    : "border-terminal-border text-slate-500",
                )}
              >
                {s}
              </button>
            ))}
          </div>
        </Row>
        <Row label="Order type">
          <div className="flex gap-1">
            {(["market", "limit"] as const).map((t) => (
              <button
                key={t}
                type="button"
                onClick={() => setOrderType(t)}
                className={cn(
                  "flex-1 py-1 text-[8px] font-bold uppercase rounded border",
                  orderType === t
                    ? "border-cyan-500/40 text-cyan-200 bg-cyan-950/20"
                    : "border-terminal-border text-slate-500",
                )}
              >
                {t}
              </button>
            ))}
          </div>
        </Row>

        <Row label="Size USDT">
          <input
            className={inputClass}
            value={sizeUsdt}
            onChange={(e) => {
              setSizeEditMode("usdt");
              setQuantitySource("usdt");
              setSizeUsdt(e.target.value);
            }}
          />
        </Row>
        <Row label="Qty BTC (est.)">
          <input
            className={qtyReadonlyClass}
            value={qtyBtc}
            onChange={(e) => {
              setSizeEditMode("btc");
              setQuantitySource("btc");
              setQtyBtc(e.target.value);
            }}
            title="Edit to recalculate Size USDT"
          />
        </Row>

        <Row label="Leverage">
          <input
            className={inputClass}
            value={leverage}
            onChange={(e) => { setLeverageInitialized(true); setLeverage(e.target.value); }}
            min={1}
            max={maxLev}
          />
        </Row>
        <Row label="Est. entry (market)">
          <div className={cn(qtyReadonlyClass, "text-cyan-300/80")}>
            {marketEntryResolved.price != null ? (
              <>
                {marketEntryResolved.price.toFixed(2)}
                {marketEntryResolved.source ? (
                  <span className="text-slate-600 ml-1">
                    ({marketEntryResolved.source})
                  </span>
                ) : null}
              </>
            ) : (
              "—"
            )}
          </div>
        </Row>

        {orderType === "limit" ? (
          <Row label="Limit price">
            <input
              className={inputClass}
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              placeholder="Required for limit"
            />
          </Row>
        ) : null}

        <Row label="Stop loss">
          <input
            className={inputClass}
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
          />
        </Row>
        <Row label="Take profit">
          <input
            className={inputClass}
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
          />
        </Row>
        <Row label="Margin">
          <select
            className={inputClass}
            value={marginMode}
            onChange={(e) =>
              setMarginMode(e.target.value as "isolated" | "cross")
            }
          >
            <option value="isolated">Isolated</option>
            <option value="cross">Cross</option>
          </select>
        </Row>
        <label className="col-span-2 flex items-center gap-2 text-[8px] text-slate-500 cursor-pointer">
          <input
            type="checkbox"
            checked={reduceOnly}
            onChange={(e) => setReduceOnly(e.target.checked)}
            className="rounded border-terminal-border"
          />
          Reduce only
        </label>
      </div>

      <div className="rounded border border-terminal-border/60 bg-black/30 px-2 py-1.5 space-y-0.5 text-[8px] text-slate-500">
        <div className="grid grid-cols-2 gap-x-2 gap-y-0.5">
          <Metric label="Notional" value={fmt(display.notional, " USDT")} />
          <Metric
            label="Leverage"
            value={Number.isFinite(levNum) ? `${levNum}x` : "—"}
          />
          <Metric label="Required margin" value={fmt(display.margin, " USDT")} highlight />
          <Metric label="Est. entry" value={fmt(display.entry)} />
          <Metric label="Stop distance" value={fmt(display.stopDistance)} />
          <Metric label="PnL to TP" value={fmt(display.pnlTp, " USDT")} tone="up" />
          <Metric label="Loss to SL" value={fmt(display.lossSl, " USDT")} tone="down" />
          <Metric
            label="R multiple"
            value={display.rMultiple != null ? `${display.rMultiple}R` : "—"}
          />
        </div>
        <p className={cn("text-[8px] pt-0.5", riskPayload.stopLoss == null ? "text-slate-600" : "text-amber-300/80")}>
          {riskLabel}
        </p>
      </div>

      <PaperRiskGuardLine
        account={account}
        settings={settings}
        ticketLeverage={ticketLevForGuard}
        computedRiskPct={computedRiskPct ?? null}
        extraBlockReason={blockReason}
      />

      {priceHint ? (
        <p className="text-[8px] text-cyan-400/80">{priceHint}</p>
      ) : null}
      {softRiskWarning ? (
        <p className="text-[8px] text-amber-400/70">{softRiskWarning}</p>
      ) : null}
      {selectedBackend === "nautilus" ? (
        <p className="text-[8px] text-slate-500">Preview not applicable for Nautilus MARKET.</p>
      ) : null}
      {marketDisabledReason && !marketReady ? (
        <p className="text-[8px] text-amber-400/90">{marketDisabledReason}</p>
      ) : null}
      {!marketEntryResolved.price && orderType === "market" ? (
        <p className="text-[8px] text-amber-400/90">{PAPER_NO_PRICE_MESSAGE}</p>
      ) : null}

      {import.meta.env.DEV ? (
        <details className="text-[7px] text-slate-600 border border-terminal-border/40 rounded px-1.5 py-1">
          <summary className="cursor-pointer uppercase tracking-wider">
            Paper ticket debug
          </summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-all font-mono text-[7px] text-slate-500">
            {JSON.stringify(submitDebug, null, 2)}
          </pre>
        </details>
      ) : null}

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={resolvePaperTicketSubmitState({ marketReady, tradingBlocked: tradingBlocked || executionUnavailable, blockReason }).disabled}
          onClick={() => void submit("buy", "market")}
          className="py-1.5 text-[9px] font-bold uppercase rounded border border-emerald-500/45 bg-emerald-600/20 text-emerald-200 disabled:opacity-50"
        >
          Buy market
        </button>
        <button
          type="button"
          disabled={resolvePaperTicketSubmitState({ marketReady, tradingBlocked: tradingBlocked || executionUnavailable, blockReason }).disabled}
          onClick={() => void submit("sell", "market")}
          className="py-1.5 text-[9px] font-bold uppercase rounded border border-red-500/45 bg-red-600/20 text-red-200 disabled:opacity-50"
        >
          Sell market
        </button>
        <button
          type="button"
          disabled={resolvePaperTicketSubmitState({ marketReady: limitReady, tradingBlocked: tradingBlocked || executionUnavailable, blockReason }).disabled}
          onClick={() => void submit("buy", "limit")}
          className="py-1.5 text-[9px] font-bold uppercase rounded border border-cyan-500/35 text-cyan-200 disabled:opacity-50"
        >
          Place buy limit
        </button>
        <button
          type="button"
          disabled={resolvePaperTicketSubmitState({ marketReady: limitReady, tradingBlocked: tradingBlocked || executionUnavailable, blockReason }).disabled}
          onClick={() => void submit("sell", "limit")}
          className="py-1.5 text-[9px] font-bold uppercase rounded border border-cyan-500/35 text-cyan-200 disabled:opacity-50"
        >
          Place sell limit
        </button>
        <button
          type="button"
          disabled={
            busy || executionUnavailable ||
            !position ||
            position.side === "flat"
          }
          onClick={() => void onClosePosition()}
          className="py-1 text-[8px] font-bold uppercase rounded border border-amber-500/40 text-amber-200 disabled:opacity-50"
        >
          Close position
        </button>
        <button
          type="button"
          disabled={busy || executionUnavailable}
          onClick={() => void onCancelAll()}
          className="py-1 text-[8px] font-bold uppercase rounded border border-terminal-border text-slate-400 disabled:opacity-50"
        >
          Cancel all paper orders
        </button>
      </div>

    </section>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <div className="text-[8px] uppercase tracking-widest text-slate-600 mb-0.5">
        {label}
      </div>
      {children}
    </div>
  );
}

function Metric({
  label,
  value,
  highlight,
  tone,
}: {
  label: string;
  value: string;
  highlight?: boolean;
  tone?: "up" | "down";
}) {
  return (
    <>
      <span>{label}</span>
      <span
        className={cn(
          "text-right text-slate-300",
          highlight && "text-cyan-300/90 font-semibold",
          tone === "up" && "text-emerald-400/90",
          tone === "down" && "text-red-400/90",
        )}
      >
        {value}
      </span>
    </>
  );
}

function fmt(n: number | null | undefined, suffix = ""): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return `${n.toFixed(2)}${suffix}`;
}
