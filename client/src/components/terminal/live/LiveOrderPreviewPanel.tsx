import { useCallback, useState } from "react";
import { cn } from "@/lib/utils";
import { DEFAULT_TERMINAL_EXECUTION_CONTEXT } from "../execution/executionContext";
import type { LiveOrderPreviewResult } from "./liveOrderPreviewTypes";
import {
  formatLivePreviewFetchError,
  useLiveOrderPreview,
} from "./useLiveOrderPreview";

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
  const [sizeMode, setSizeMode] = useState<"notional" | "quantity">("notional");
  const [notionalUsdt, setNotionalUsdt] = useState("100");
  const [quantity, setQuantity] = useState("");
  const [limitPrice, setLimitPrice] = useState("");
  const [stopLoss, setStopLoss] = useState("");
  const [takeProfit, setTakeProfit] = useState("");
  const [leverage, setLeverage] = useState("5");
  const [preview, setPreview] = useState<LiveOrderPreviewResult | null>(null);

  const mutation = useLiveOrderPreview();

  const runPreview = useCallback(
    async (side: "buy" | "sell") => {
      setPreview(null);
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
        ...(sizeMode === "notional"
          ? { notionalUsdt: Number(notionalUsdt) }
          : { quantity: Number(quantity) }),
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
      quantity,
      limitPrice,
      stopLoss,
      takeProfit,
      leverage,
      mutation,
    ],
  );

  const busy = mutation.isPending;

  return (
    <section className="rounded border border-cyan-500/25 bg-cyan-950/15 p-2 space-y-1.5">
      <div className="text-[8px] font-bold uppercase tracking-widest text-cyan-400/90">
        Live order preview — dry run
      </div>
      <p className="text-[7px] text-slate-500 leading-snug">
        Simulates a BingX order locally. Nothing is sent to the exchange.
      </p>

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
          onClick={() => setSizeMode("quantity")}
          className={cn(
            "px-1.5 py-0.5 text-[7px] uppercase rounded border",
            sizeMode === "quantity"
              ? "border-slate-500/50 text-slate-300"
              : "border-terminal-border text-slate-600",
          )}
        >
          Qty
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
            Quantity (BTC)
            <input
              className={inputClass}
              inputMode="decimal"
              value={quantity}
              onChange={(e) => setQuantity(e.target.value)}
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
          <p className="font-bold uppercase tracking-wide text-[7px]">
            {preview.message}
          </p>
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
            </ul>
          ) : null}
          {preview.blockers.length > 0 ? (
            <ul className="text-[7px] text-red-300/80 max-h-16 overflow-y-auto">
              {preview.blockers.map((b) => (
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
          <p className="text-[7px] text-slate-500 pt-0.5">
            orderWouldBeSent: {String(preview.orderWouldBeSent)} · readiness:{" "}
            {preview.readiness.status}
          </p>
        </div>
      ) : null}
    </section>
  );
}
