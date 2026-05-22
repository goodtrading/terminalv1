import { useCallback, useEffect, useMemo, useRef } from "react";
import { LineStyle, type IPriceLine } from "lightweight-charts";
import { cn } from "@/lib/utils";
import { BingxLockedPositionControls } from "./BingxLockedPositionControls";
import { PositionRiskBar } from "./PositionRiskBar";
import type { PositionRiskOverlayProps } from "./positionRiskOverlayTypes";
import { RiskLevelLine, useRiskLevelMetrics, formatRiskLevelPrice } from "./positionRiskOverlayShared";
import {
  BAR_HEIGHT,
  BINGX_ENTRY_LONG,
  BINGX_ENTRY_SHORT,
  BINGX_BAR_ABOVE_ENTRY,
  BINGX_LIQ_LINE,
  ENTRY_LONG,
  ENTRY_SHORT,
  PRICE_SCALE_INSET,
  SL_LINE,
  SL_LINE_READONLY,
  TP_LINE,
  TP_LINE_READONLY,
} from "./positionRiskOverlayStyles";

export { PRICE_SCALE_INSET, BAR_HEIGHT } from "./positionRiskOverlayStyles";

export function PositionRiskOverlay({
  mode,
  position,
  account,
  stopLoss,
  takeProfit,
  feeSettings,
  readonly,
  showReadOnlyBadge = readonly,
  liveTradingEnabled = false,
  realActionsEnabled = false,
  showLockedActionControls = true,
  onRequestClosePosition,
  onRequestAddStopLoss,
  onRequestAddTakeProfit,
  onBlockedRealAction,
  liquidationPrice,
  chartWidth,
  chartHeight,
  viewportVersion,
  coordinates,
  candleSeries,
  draftStopLoss,
  draftTakeProfit,
  zIndex = mode === "paper" ? 12 : 11,
  onStopLossPointerDown,
  onTakeProfitPointerDown,
  paperControls,
  paperTrailing,
  placementActive = false,
  hideStopLossLine = false,
  hideTakeProfitLine = false,
  draggingStopLoss = false,
  draggingTakeProfit = false,
  children,
}: PositionRiskOverlayProps) {
  const entryLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);
  const liqLineRef = useRef<IPriceLine | null>(null);

  const slPrice = draftStopLoss ?? stopLoss?.price ?? null;
  const tpPrice = draftTakeProfit ?? takeProfit?.price ?? null;

  const entryColor =
    mode === "bingx_read_only"
      ? position.side === "long"
        ? BINGX_ENTRY_LONG
        : BINGX_ENTRY_SHORT
      : position.side === "long"
        ? ENTRY_LONG
        : ENTRY_SHORT;

  const slLineColor = readonly ? SL_LINE_READONLY : SL_LINE;
  const tpLineColor = readonly ? TP_LINE_READONLY : TP_LINE;

  const syncPriceLines = useCallback(() => {
    const series = candleSeries;
    if (!series || position.entryPrice <= 0) {
      for (const ref of [entryLineRef, slLineRef, tpLineRef, liqLineRef]) {
        if (ref.current) {
          series?.removePriceLine(ref.current);
          ref.current = null;
        }
      }
      return;
    }

    if (entryLineRef.current) series.removePriceLine(entryLineRef.current);
    entryLineRef.current = series.createPriceLine({
      price: position.entryPrice,
      color: entryColor,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: false,
      title: "",
    });

    const sl = slPrice;
    if (sl != null && Number.isFinite(sl) && sl > 0) {
      if (slLineRef.current) series.removePriceLine(slLineRef.current);
      slLineRef.current = series.createPriceLine({
        price: sl,
        color: slLineColor,
        lineWidth: 1,
        lineStyle: readonly ? LineStyle.Dotted : LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    } else if (slLineRef.current) {
      series.removePriceLine(slLineRef.current);
      slLineRef.current = null;
    }

    const tp = tpPrice;
    if (tp != null && Number.isFinite(tp) && tp > 0) {
      if (tpLineRef.current) series.removePriceLine(tpLineRef.current);
      tpLineRef.current = series.createPriceLine({
        price: tp,
        color: tpLineColor,
        lineWidth: 1,
        lineStyle: readonly ? LineStyle.Dotted : LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    } else if (tpLineRef.current) {
      series.removePriceLine(tpLineRef.current);
      tpLineRef.current = null;
    }

    const liq = liquidationPrice;
    if (liq != null && Number.isFinite(liq) && liq > 0) {
      if (liqLineRef.current) series.removePriceLine(liqLineRef.current);
      liqLineRef.current = series.createPriceLine({
        price: liq,
        color: BINGX_LIQ_LINE,
        lineWidth: 1,
        lineStyle: LineStyle.Dotted,
        axisLabelVisible: false,
        title: "",
      });
    } else if (liqLineRef.current) {
      series.removePriceLine(liqLineRef.current);
      liqLineRef.current = null;
    }
  }, [
    candleSeries,
    position.entryPrice,
    entryColor,
    slPrice,
    tpPrice,
    slLineColor,
    tpLineColor,
    readonly,
    liquidationPrice,
  ]);

  useEffect(() => {
    syncPriceLines();
    return () => {
      const series = candleSeries;
      if (!series) return;
      for (const ref of [entryLineRef, slLineRef, tpLineRef, liqLineRef]) {
        if (ref.current) series.removePriceLine(ref.current);
        ref.current = null;
      }
    };
  }, [syncPriceLines, candleSeries, viewportVersion]);

  const yEntry = coordinates.priceToCoordinate(position.entryPrice);
  const ySl = slPrice != null ? coordinates.priceToCoordinate(slPrice) : null;
  const yTp = tpPrice != null ? coordinates.priceToCoordinate(tpPrice) : null;
  const yLiq =
    liquidationPrice != null && liquidationPrice > 0
      ? coordinates.priceToCoordinate(liquidationPrice)
      : null;

  const slMetrics = useRiskLevelMetrics({
    side: position.side,
    entryPrice: position.entryPrice,
    quantity: position.quantity,
    levelPrice: slPrice,
    account,
    feeSettings,
  });

  const tpMetrics = useRiskLevelMetrics({
    side: position.side,
    entryPrice: position.entryPrice,
    quantity: position.quantity,
    levelPrice: tpPrice,
    account,
    feeSettings,
  });

  const barTop = useMemo(() => {
    if (yEntry != null && Number.isFinite(yEntry)) {
      const offset =
        mode === "bingx_read_only"
          ? yEntry - BAR_HEIGHT - BINGX_BAR_ABOVE_ENTRY
          : yEntry - BAR_HEIGHT / 2;
      return Math.min(Math.max(offset, 4), chartHeight - BAR_HEIGHT - 4);
    }
    return 12;
  }, [yEntry, chartHeight, mode]);

  const hasSl = slPrice != null && Number.isFinite(slPrice) && slPrice > 0;
  const hasTp = tpPrice != null && Number.isFinite(tpPrice) && tpPrice > 0;

  const bingxLockedControls =
    mode === "bingx_read_only" &&
    readonly &&
    showLockedActionControls &&
    !realActionsEnabled ? (
      <BingxLockedPositionControls
        hasStopLoss={hasSl}
        hasTakeProfit={hasTp}
        onBlockedRealAction={onBlockedRealAction}
        onRequestClosePosition={onRequestClosePosition}
        onRequestAddStopLoss={onRequestAddStopLoss}
        onRequestAddTakeProfit={onRequestAddTakeProfit}
      />
    ) : null;

  return (
    <div
      className={cn(
        "absolute inset-0 overflow-hidden",
        !readonly && placementActive
          ? "pointer-events-auto cursor-crosshair"
          : "pointer-events-none",
      )}
      style={{ width: chartWidth, height: chartHeight, zIndex }}
      data-position-risk-overlay={mode}
    >
      {hasSl && !hideStopLossLine && ySl != null && Number.isFinite(ySl) ? (
        <RiskLevelLine
          kind="SL"
          price={slPrice!}
          y={ySl}
          chartWidth={chartWidth}
          lineColor={slLineColor}
          readonly={readonly}
          dragging={draggingStopLoss}
          netPnlUsdt={slMetrics.netPnlUsdt}
          accountPct={slMetrics.accountPct}
          mode={mode}
          showReadOnlyBadge={showReadOnlyBadge}
          onPointerDown={readonly ? undefined : onStopLossPointerDown}
        />
      ) : null}

      {hasTp && !hideTakeProfitLine && yTp != null && Number.isFinite(yTp) ? (
        <RiskLevelLine
          kind="TP"
          price={tpPrice!}
          y={yTp}
          chartWidth={chartWidth}
          lineColor={tpLineColor}
          readonly={readonly}
          dragging={draggingTakeProfit}
          netPnlUsdt={tpMetrics.netPnlUsdt}
          accountPct={tpMetrics.accountPct}
          mode={mode}
          showReadOnlyBadge={showReadOnlyBadge}
          onPointerDown={readonly ? undefined : onTakeProfitPointerDown}
        />
      ) : null}

      {yLiq != null && Number.isFinite(yLiq) && liquidationPrice != null ? (
        <div
          className="absolute z-[11] pointer-events-none font-mono text-[9px] text-red-400/70"
          style={{
            top: Math.min(
              Math.max(yLiq - BAR_HEIGHT / 2, 4),
              chartHeight - BAR_HEIGHT - 4,
            ),
            right: PRICE_SCALE_INSET + 4,
          }}
        >
          <span className="rounded border border-red-900/40 bg-[#080808]/95 px-1.5 py-0.5 tabular-nums">
            LIQ REAL {formatRiskLevelPrice(liquidationPrice)} · READ ONLY
          </span>
        </div>
      ) : null}

      <PositionRiskBar
        mode={mode}
        position={position}
        account={account}
        chartWidth={chartWidth}
        barTop={barTop}
        readonly={readonly}
        showReadOnlyBadge={showReadOnlyBadge}
        liveTradingEnabled={liveTradingEnabled}
        bingxLockedControls={bingxLockedControls}
        paperControls={paperControls}
        paperTrailing={paperTrailing}
      />

      {children}
    </div>
  );
}
