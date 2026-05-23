import { useCallback, useState } from "react";
import { useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "../execution/executionContext";
import { useLiveTradingReadiness } from "../health/useLiveTradingReadiness";
import type { LiveOrderPreviewResult } from "./liveOrderPreviewTypes";
import {
  LIVE_LIMIT_CONFIRMATION_TEXT,
  type LiveOrderSubmitResult,
} from "./liveOrderSubmitTypes";
import {
  formatLivePreviewFetchError,
  useLiveOrderPreview,
} from "./useLiveOrderPreview";
import { useLiveOrderSubmit } from "./useLiveOrderSubmit";
import { resolveLiveSubmitUiState } from "./resolveLiveSubmitUiState";

const inputClass =
  "w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-[10px] font-mono text-white focus:border-cyan-500/40 focus:outline-none";

type LiveOrderPreviewPanelProps = {
  symbol?: string;
  markPrice?: number | null;
};

export function LiveOrderPreviewPanel({
  symbol: symbolProp,
  markPrice,
}: LiveOrderPreviewPanelProps) {
  const executionSymbol =
    symbolProp ??
    DEFAULT_TERMINAL_EXECUTION_CONTEXT.executionSymbol ??
    "BTC-USDT";

  const [orderType, setOrderType] = useState<"market" | "limit">("market");
  const [sizeMode, setSizeMode] = useState<"notional" | "margin">("margin");
  const [notionalUsdt, setNotionalUsdt] = useState("2");
  const [marginUsdt, setMarginUsdt] = useState("2");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [leverage, setLeverage] = useState("5");
  const [preview, setPreview] = useState<LiveOrderPreviewResult | null>(null);
  const [previewSide, setPreviewSide] = useState<"buy" | "sell" | null>(null);
  const [confirmationText, setConfirmationText] = useState("");
  const [submitResult, setSubmitResult] = useState<LiveOrderSubmitResult | null>(
    null,
  );

  const mutation = useLiveOrderPreview();
  const submitMutation = useLiveOrderSubmit();
  const { readiness } = useLiveTradingReadiness(true);
  const queryClient = useQueryClient();

  const runPreview = useCallback(
    async (side: "buy" | "sell") => {
      setPreview(null);
      setSubmitResult(null);
      setPreviewSide(side);
      const body = {
        exchange: "bingx" as const,
        symbol: executionSymbol,
        side,
        type: orderType,
        source: "manual" as const,
        stopLossPrice: stopLoss.trim() ? Number(stopLoss) : undefined,
        takeProfitPrice: takeProfit.trim() ? Number(takeProfit) : undefined,
        limitPrice:
          orderType === "limit" && limitPrice.trim()
            ? Number(limitPrice)
            : undefined,
        sizingMode: sizeMode as "notional" | "margin",
        ...(sizeMode === "notional"
          ? { notionalUsdt: Number(notionalUsdt) }
          : { marginUsdt: Number(marginUsdt) }),
        leverage: Number(leverage),
      };

      try {
        const result = await mutation.mutateAsync(body);
        setPreview(result);
      } catch (err) {
        const { blockers, readinessStatus } = formatLivePreviewFetchError(err);
        setPreview({
          mode: "dry_run",
          exchange: "bingx",
          symbol: executionSymbol,
          side,
          type: orderType,
          orderWouldBeSent: false,
          tradingLocked: true,
          validated: false,
          blocked: true,
          blockers,
          warnings: [],
          estimate: {
            quantity: 0,
            notionalUsdt: 0,
            leverage: Number(leverage) || undefined,
          },
          risk: {
            hasStopLoss: Boolean(stopLoss.trim()),
            hasTakeProfit: Boolean(takeProfit.trim()),
            maxAccountRiskPct: 2,
            requireStopLoss: true,
            riskGuardPassed: false,
          },
          readiness: {
            status: readinessStatus,
            readyForDryRun: false,
            readyForLive: false,
          },
          message: "DRY RUN BLOCKED — risk guard failed",
        });
      }
    },
    [
      executionSymbol,
      orderType,
      sizeMode,
      notionalUsdt,
      marginUsdt,
      limitPrice,
      stopLoss,
      takeProfit,
      leverage,
      mutation,
    ],
  );

  const busy = mutation.isPending;
  const submitBusy = submitMutation.isPending;

  const showLiveSubmit =
    orderType === "limit" &&
    preview != null &&
    !preview.blocked &&
    preview.validated &&
    preview.type === "limit" &&
    previewSide != null;

  const submitUi = resolveLiveSubmitUiState({
    orderType,
    preview,
    readiness,
    confirmationText,
    stopLossInput: stopLoss,
    limitPriceInput: limitPrice,
    submitBusy,
  });

  const submitDisabled = !showLiveSubmit || !submitUi.canSubmit;

  const runLiveSubmit = useCallback(async () => {
    if (!previewSide || !showLiveSubmit) return;
    setSubmitResult(null);
    const lp = Number(limitPrice);
    const sl = Number(stopLoss);
    if (!Number.isFinite(lp) || lp <= 0 || !Number.isFinite(sl) || sl <= 0) {
      return;
    }
    const body = {
      exchange: "bingx" as const,
      symbol: executionSymbol,
      side: previewSide,
      type: "limit" as const,
      limitPrice: lp,
      stopLossPrice: sl,
      confirmationText: confirmationText.trim(),
      takeProfitPrice: takeProfit.trim() ? Number(takeProfit) : undefined,
      leverage: Number(leverage),
      sizingMode: sizeMode as "notional" | "margin",
      ...(sizeMode === "notional"
        ? { notionalUsdt: Number(notionalUsdt) }
        : { marginUsdt: Number(marginUsdt) }),
    };
    try {
      const result = await submitMutation.mutateAsync(body);
      setSubmitResult(result);

      // Auto-refresh BingX snapshot after successful submit to sync open orders
      if (result.orderSubmitted && result.status === "submitted") {
        setTimeout(() => {
          queryClient.invalidateQueries({ queryKey: ["/api/bingx/read-only/snapshot"] });
        }, 1500);
      }
    } catch (err) {
      setSubmitResult({
        mode: "live",
        exchange: "bingx",
        symbol: executionSymbol,
        side: previewSide,
        type: "limit",
        orderSubmitted: false,
        status: "failed",
        blockers: [
          err instanceof Error ? err.message.slice(0, 200) : "Submit failed",
        ],
        warnings: [],
        estimate: {
          entryPrice: lp,
          quantity: preview?.estimate.quantity ?? 0,
          notionalUsdt: preview?.estimate.notionalUsdt ?? 0,
        },
        message: "LIVE ORDER FAILED — request error",
      });
    }
  }, [
    previewSide,
    showLiveSubmit,
    limitPrice,
    stopLoss,
    takeProfit,
    leverage,
    sizeMode,
    notionalUsdt,
    marginUsdt,
    confirmationText,
    executionSymbol,
    preview,
    submitMutation,
  ]);

  return (
    <section className="rounded border border-cyan-500/25 bg-cyan-950/15 p-2 space-y-1.5">
      <div className="text-[8px] font-bold uppercase tracking-widest text-cyan-400/90">
        Live order preview — dry run
      </div>
      <p className="text-[7px] text-slate-500 leading-snug">
        Dry-run simulates risk locally. Live submit (limit only) sends one real
        order when readiness is ready_for_live and flags 5C are on.
      </p>
      <div className="flex flex-wrap gap-1 text-[7px]">
        <span className="rounded border border-amber-500/35 px-1 py-0.5 text-amber-200/90 uppercase font-bold">
          Live execution locked
        </span>
        <span className="rounded border border-cyan-500/35 px-1 py-0.5 text-cyan-300/90 uppercase font-bold">
          Dry run enabled
        </span>
      </div>

      <div className="flex flex-wrap gap-1">
        <button
          type="button"
          onClick={() => setOrderType("market")}
          className={cn(
            "px-1.5 py-0.5 text-[7px] uppercase rounded border",
            orderType === "market"
              ? "border-cyan-500/50 text-cyan-300 bg-cyan-950/40"
              : "border-terminal-border text-slate-500",
          )}
        >
          Market
        </button>
        <button
          type="button"
          onClick={() => setOrderType("limit")}
          className={cn(
            "px-1.5 py-0.5 text-[7px] uppercase rounded border",
            orderType === "limit"
              ? "border-cyan-500/50 text-cyan-300 bg-cyan-950/40"
              : "border-terminal-border text-slate-500",
          )}
        >
          Limit
        </button>
        <button
          type="button"
          onClick={() => setSizeMode("notional")}
          className={cn(
            "px-1.5 py-0.5 text-[7px] uppercase rounded border",
            sizeMode === "notional"
              ? "border-slate-500/50 text-slate-300"
              : "border-terminal-border text-slate-600",
          )}
        >
          USDT
        </button>
        <button
          type="button"
          onClick={() => setSizeMode("margin")}
          className={cn(
            "px-1.5 py-0.5 text-[7px] uppercase rounded border",
            sizeMode === "margin"
              ? "border-slate-500/50 text-slate-300"
              : "border-terminal-border text-slate-600",
          )}
        >
          Margin
        </button>
      </div>

      <div className="grid grid-cols-2 gap-1">
        {sizeMode === "notional" ? (
          <label className="col-span-2 flex flex-col gap-0.5 text-[8px] text-slate-500">
            Notional USDT
            <input
              className={inputClass}
              inputMode="decimal"
              value={notionalUsdt}
              onChange={(e) => setNotionalUsdt(e.target.value)}
              disabled={busy}
            />
          </label>
        ) : (
          <label className="col-span-2 flex flex-col gap-0.5 text-[8px] text-slate-500">
            Margin USDT
            <input
              className={inputClass}
              inputMode="decimal"
              value={marginUsdt}
              onChange={(e) => setMarginUsdt(e.target.value)}
              disabled={busy}
            />
          </label>
        )}
        {orderType === "limit" ? (
          <label className="col-span-2 flex flex-col gap-0.5 text-[8px] text-slate-500">
            Limit price
            <input
              className={inputClass}
              inputMode="decimal"
              value={limitPrice}
              onChange={(e) => setLimitPrice(e.target.value)}
              disabled={busy}
            />
          </label>
        ) : markPrice != null ? (
          <span className="col-span-2 text-[7px] text-slate-600">
            Mark ref: {markPrice.toFixed(2)}
          </span>
        ) : null}
        <label className="flex flex-col gap-0.5 text-[8px] text-slate-500">
          Leverage
          <div className="flex items-center gap-1">
            <input
              className={inputClass}
              type="number"
              min={1}
              max={125}
              step={1}
              inputMode="numeric"
              value={leverage}
              onChange={(e) => setLeverage(e.target.value)}
              disabled={busy}
            />
            <span className="text-[9px] text-slate-500 shrink-0">x</span>
          </div>
        </label>
        <label className="flex flex-col gap-0.5 text-[8px] text-slate-500">
          Stop loss
          <input
            className={inputClass}
            inputMode="decimal"
            value={stopLoss}
            onChange={(e) => setStopLoss(e.target.value)}
            disabled={busy}
            placeholder="required if policy on"
          />
        </label>
        <label className="flex flex-col gap-0.5 text-[8px] text-slate-500">
          Take profit
          <input
            className={inputClass}
            inputMode="decimal"
            value={takeProfit}
            onChange={(e) => setTakeProfit(e.target.value)}
            disabled={busy}
          />
        </label>
      </div>

      <div className="grid grid-cols-2 gap-1">
        <button
          type="button"
          disabled={busy}
          onClick={() => void runPreview("buy")}
          className="rounded border border-emerald-500/40 bg-emerald-950/30 py-1 text-[9px] font-bold uppercase text-emerald-300 hover:bg-emerald-950/50 disabled:opacity-50"
        >
          Preview buy
        </button>
        <button
          type="button"
          disabled={busy}
          onClick={() => void runPreview("sell")}
          className="rounded border border-red-500/40 bg-red-950/30 py-1 text-[9px] font-bold uppercase text-red-300 hover:bg-red-950/50 disabled:opacity-50"
        >
          Preview sell
        </button>
      </div>

      {preview ? (
        <div
          className={cn(
            "rounded border p-1.5 space-y-0.5 text-[8px]",
            preview.blocked
              ? "border-red-500/40 bg-red-950/25 text-red-200/90"
              : "border-emerald-500/35 bg-emerald-950/20 text-emerald-100/90",
          )}
        >
          <div className="flex items-center justify-between">
            <p className="font-bold uppercase tracking-wide text-[7px]">
              {preview.message}
            </p>
            {preview.liveLimitTestMode && (
              <span className="px-1.5 py-0.5 bg-yellow-500/20 text-yellow-300 text-[6px] font-semibold rounded border border-yellow-500/30">
                BINGX-LIKE LIVE LIMIT TEST
              </span>
            )}
          </div>
          {!preview.blocked ? (
            <ul className="text-slate-300 space-y-0.5">
              <li>
                Entry: {preview.estimate.entryPrice?.toFixed(2) ?? "—"} · Qty:{" "}
                {preview.estimate.quantity} · Notional:{" "}
                {preview.estimate.notionalUsdt.toFixed(2)} USDT
                {preview.estimate.leverage != null
                  ? ` · ${preview.estimate.leverage}x`
                  : ""}
              </li>
              {preview.liveLimitTestMode && (
                <li className="text-emerald-300/90">
                  READY FOR LIVE LIMIT TEST
                </li>
              )}
              {preview.estimate.rawQuantity != null && preview.estimate.normalizedQuantity != null ? (
                <li>
                  Raw qty: {preview.estimate.rawQuantity} · Normalized: {preview.estimate.normalizedQuantity}
                </li>
              ) : null}
              {preview.estimate.minQuantity != null ? (
                <li>
                  Min qty: {preview.estimate.minQuantity}
                </li>
              ) : null}
              {preview.estimate.requiredMinNotional != null ? (
                <li>
                  Required min notional: {preview.estimate.requiredMinNotional.toFixed(2)} USDT
                </li>
              ) : null}
              {preview.estimate.requiredMarginUsdt != null ? (
                <li>
                  Req. margin: {preview.estimate.requiredMarginUsdt.toFixed(2)}{" "}
                  USDT
                </li>
              ) : null}
              {preview.estimate.estimatedFeeUsdt != null ? (
                <li>Est. fee: {preview.estimate.estimatedFeeUsdt.toFixed(2)} USDT</li>
              ) : null}
              {preview.estimate.estimatedSlippageUsdt != null ? (
                <li>
                  Est. slippage: {preview.estimate.estimatedSlippageUsdt.toFixed(2)}{" "}
                  USDT
                </li>
              ) : null}
              {preview.estimate.maxLossUsdt != null ? (
                <li>
                  Max loss: {preview.estimate.maxLossUsdt.toFixed(2)} USDT
                  {preview.estimate.maxLossAccountPct != null
                    ? ` (${preview.estimate.maxLossAccountPct}%)`
                    : ""}
                </li>
              ) : null}
              {preview.estimate.takeProfitGainUsdt != null ? (
                <li>
                  TP gain: {preview.estimate.takeProfitGainUsdt.toFixed(2)} USDT
                  {preview.estimate.takeProfitAccountPct != null
                    ? ` (${preview.estimate.takeProfitAccountPct}%)`
                    : ""}
                </li>
              ) : null}
              {preview.estimate.liquidationDistancePct != null ? (
                <li>
                  Liq distance (est.): {preview.estimate.liquidationDistancePct}%
                </li>
              ) : null}
              {preview.symbolRules && (
                <li className="mt-2 pt-2 border-t border-slate-700/50">
                  <div className="font-semibold text-slate-300 mb-1">Symbol rules:</div>
                  {preview.symbolRules.available ? (
                    <ul className="space-y-0.5 ml-2">
                      <li>Min qty: {preview.symbolRules.minQty}</li>
                      <li>Step size: {preview.symbolRules.stepSize}</li>
                      <li>Qty precision: {preview.symbolRules.quantityPrecision}</li>
                      <li>Min notional: {preview.symbolRules.minNotional} USDT</li>
                    </ul>
                  ) : (
                    <div className={preview.liveLimitTestMode ? "text-amber-300" : "text-red-400"}>
                      {preview.liveLimitTestMode
                        ? "Symbol rules unavailable — BingX will validate quantity."
                        : "Symbol rules unavailable — live submit disabled"}
                    </div>
                  )}
                </li>
              )}
            </ul>
          ) : null}
          {preview.blockers.length > 0 ? (
            <ul className="text-[7px] text-red-300/80 max-h-16 overflow-y-auto">
              {preview.blockers
                .filter(
                  (b) =>
                    !b.includes("BINGX_ENABLE_LIVE_TRADING") &&
                    !b.includes("BINGX_ENABLE_ORDER_SUBMIT"),
                )
                .map((b) => (
                  <li key={b}>· {b}</li>
                ))}
            </ul>
          ) : null}
          {preview.systemHealth?.blockers && preview.systemHealth.blockers.length > 0 ? (
            <ul className="text-[7px] text-red-300/80 max-h-16 overflow-y-auto">
              {preview.systemHealth.blockers.map((b: string) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          ) : null}
          {preview.warnings.length > 0 ? (
            <ul className="text-[7px] text-amber-200/70">
              {preview.warnings.map((w) => (
                <li key={w}>! {w}</li>
              ))}
            </ul>
          ) : null}
          {preview.liveLimitTestMode ? (
            <ul className="text-[7px] text-yellow-300/80 border-t border-yellow-500/20 pt-1 mt-1">
              <li>! This submits a pure BingX LIMIT order.</li>
              <li>! SL/TP are not sent in this phase.</li>
              <li>! Set protection manually on BingX after fill.</li>
              <li>! Internal risk caps ignored in BingX-like mode.</li>
              <li>! Symbol rules unavailable — BingX will validate.</li>
              <li>! Cancel manually on BingX.</li>
              <li>! Market orders disabled.</li>
            </ul>
          ) : null}
          <p className="text-[7px] text-slate-500 pt-0.5">
            orderWouldBeSent: {String(preview.orderWouldBeSent)} · readiness:{" "}
            {preview.readiness.status}
          </p>

          {showLiveSubmit || (preview && orderType === "limit") ? (
            <div className="mt-1.5 rounded border border-amber-500/45 bg-amber-950/25 p-1.5 space-y-1">
              <p
                className={cn(
                  "text-[7px] font-bold uppercase tracking-widest",
                  submitUi.canSubmit
                    ? "text-emerald-300/95"
                    : "text-amber-200/95",
                )}
              >
                {submitUi.statusLabel}
              </p>
              {submitUi.lockReason ? (
                <p className="text-[7px] text-red-300/85">
                  LIVE SUBMIT LOCKED — {submitUi.lockReason}
                </p>
              ) : null}
              <p className="text-[7px] font-bold uppercase tracking-widest text-amber-200/80">
                Live submit — limit only
              </p>
              <p className="text-[7px] text-slate-500 leading-snug">
                First live test: 2 USDT, limit far from spot (buy below / sell
                above), SL set, then {LIVE_LIMIT_CONFIRMATION_TEXT}. Cancel on
                BingX only.
              </p>
              <ul className="text-[7px] text-slate-300 space-y-0.5">
                <li>
                  {preview.symbol} · {preview.side.toUpperCase()} · limit{" "}
                  {limitPrice || preview.estimate.entryPrice?.toFixed(2)}
                </li>
                <li>
                  Qty {preview.estimate.quantity} ·{" "}
                  {preview.estimate.notionalUsdt.toFixed(2)} USDT
                </li>
                <li>SL {stopLoss || "—"}</li>
                {preview.estimate.maxLossUsdt != null ? (
                  <li>
                    Max loss {preview.estimate.maxLossUsdt.toFixed(2)} USDT
                    {preview.estimate.maxLossAccountPct != null
                      ? ` (${preview.estimate.maxLossAccountPct}%)`
                      : ""}
                  </li>
                ) : null}
              </ul>
              {preview.warnings.length > 0 ? (
                <ul className="text-[7px] text-amber-200/70">
                  {preview.warnings.slice(0, 4).map((w) => (
                    <li key={w}>! {w}</li>
                  ))}
                </ul>
              ) : null}
              <label className="flex flex-col gap-0.5 text-[8px] text-slate-500">
                Type {LIVE_LIMIT_CONFIRMATION_TEXT} to submit
                <input
                  className={inputClass}
                  value={confirmationText}
                  onChange={(e) => setConfirmationText(e.target.value)}
                  disabled={submitBusy}
                  placeholder={LIVE_LIMIT_CONFIRMATION_TEXT}
                  autoComplete="off"
                  spellCheck={false}
                />
              </label>
              {showLiveSubmit ? (
                <button
                  type="button"
                  disabled={submitDisabled}
                  onClick={() => void runLiveSubmit()}
                  className="w-full rounded border border-amber-500/55 bg-amber-950/40 py-1 text-[9px] font-bold uppercase text-amber-100 hover:bg-amber-950/60 disabled:opacity-40"
                >
                  Submit live limit
                </button>
              ) : null}
            </div>
          ) : orderType === "market" && preview && !preview.blocked ? (
            <p className="text-[7px] text-amber-200/80 mt-1">
              Live market orders are disabled in this phase. Use limit orders
              only.
            </p>
          ) : null}
        </div>
      ) : null}

      {submitResult ? (
        <div
          className={cn(
            "rounded border p-1.5 space-y-0.5 text-[8px]",
            submitResult.status === "submitted"
              ? "border-amber-400/50 bg-amber-950/30 text-amber-100"
              : submitResult.status === "blocked"
                ? "border-red-500/40 bg-red-950/25 text-red-200/90"
                : "border-red-500/50 bg-red-950/35 text-red-200",
          )}
        >
          <p className="font-bold uppercase tracking-wide text-[7px]">
            {submitResult.status === "submitted"
              ? "LIVE LIMIT ORDER SUBMITTED"
              : submitResult.status === "blocked"
                ? "LIVE ORDER BLOCKED"
                : "LIVE ORDER FAILED"}
          </p>
          {submitResult.status === "submitted" ? (
            <p className="text-[7px] text-amber-100/90 leading-snug">
              Cancel/close from terminal is disabled in this phase. Manage the
              order directly from BingX.
            </p>
          ) : null}
          {submitResult.orderId ? (
            <p className="text-[7px]">Order ID: {submitResult.orderId}</p>
          ) : null}
          {submitResult.clientOrderId ? (
            <p className="text-[7px]">Client ID: {submitResult.clientOrderId}</p>
          ) : null}
          {submitResult.status === "submitted" ? (
            <div className="mt-1 pt-1 border-t border-amber-500/30">
              <p className="text-[7px] font-bold uppercase text-amber-200/80">
                Click SYNC to refresh open orders from BingX
              </p>
            </div>
          ) : null}
          {submitResult.message &&
          submitResult.status === "submitted" &&
          submitResult.message !== "LIVE LIMIT ORDER SUBMITTED" ? (
            <p className="text-[7px] text-slate-400">{submitResult.message}</p>
          ) : null}
          {submitResult.status !== "submitted" && submitResult.message ? (
            <p className="text-[7px] text-slate-400">{submitResult.message}</p>
          ) : null}
          {submitResult.blockers.length > 0 ? (
            <ul className="text-[7px] text-red-300/80">
              {submitResult.blockers.map((b) => (
                <li key={b}>· {b}</li>
              ))}
            </ul>
          ) : null}
          {submitResult.warnings.length > 0 ? (
            <ul className="text-[7px] text-amber-200/70">
              {submitResult.warnings.map((w) => (
                <li key={w}>! {w}</li>
              ))}
            </ul>
          ) : null}
          <p className="text-[7px] text-slate-500">
            mode: {submitResult.mode} · status: {submitResult.status} · submitted:{" "}
            {String(submitResult.orderSubmitted)}
          </p>
        </div>
      ) : null}
    </section>
  );
}
