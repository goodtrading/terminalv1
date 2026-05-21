import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { LineStyle, type IPriceLine } from "lightweight-charts";
import { cn } from "@/lib/utils";
import type { DrawingsCoordinateHelpers } from "../drawings/DrawingsLayer";
import {
  buildRiskLevelNetMetrics,
  formatOverlayPrice,
  formatPnlUsdt,
  formatQtyBtc,
  normalizePaperQuantity,
  formatSignedPct,
  formatSignedUsd,
  initialPlacementPreviewPrice,
  snapOverlayPrice,
  validateChartPlacement,
  type RiskPlacementTarget,
} from "./paperTradeOverlayHelpers";
import { PaperClosePositionModal } from "../execution/PaperClosePositionModal";
import { postPaperClosePartial } from "../execution/paperChartActions";
import type { PaperChartTradeOverlay, PaperRiskDragTarget } from "./paperTradeOverlayTypes";
import { usePaperTradeOverlay } from "./usePaperTradeOverlay";

/** Reserve space for lightweight-charts right price scale */
const PRICE_SCALE_INSET = 108;
const BAR_HEIGHT = 22;
const PLACEMENT_DRAG_THRESHOLD_PX = 5;

type RiskPlacementMode = null | RiskPlacementTarget;

type PaperTradeOverlayProps = {
  chartWidth: number;
  chartHeight: number;
  viewportVersion: number;
  coordinates: DrawingsCoordinateHelpers;
  candleSeries: {
    createPriceLine: (options: {
      price: number;
      color: string;
      lineWidth: 1 | 2 | 3 | 4;
      lineStyle: number;
      axisLabelVisible: boolean;
      title: string;
    }) => IPriceLine;
    removePriceLine: (line: IPriceLine) => void;
  } | null;
};

const ENTRY_LONG = "rgba(34, 211, 238, 0.7)";
const ENTRY_SHORT = "rgba(249, 115, 22, 0.7)";
const SL_LINE = "rgba(239, 68, 68, 0.95)";
const TP_LINE = "rgba(34, 197, 94, 0.95)";
const SL_PREVIEW_INVALID = "rgba(251, 146, 60, 0.9)";
const TP_PREVIEW_INVALID = "rgba(248, 113, 113, 0.9)";

function RiskLevelLabel({
  kind,
  price,
  preview,
  lineColor,
  netPnlUsdt,
  accountPct,
}: {
  kind: "SL" | "TP";
  price: number;
  preview?: boolean;
  lineColor: string;
  netPnlUsdt: number | null;
  accountPct: number | null;
}) {
  const pnlColor =
    netPnlUsdt == null
      ? "text-slate-400"
      : netPnlUsdt > 0
        ? "text-emerald-400"
        : netPnlUsdt < 0
          ? "text-red-400"
          : "text-slate-400";

  return (
    <div
      className="absolute -translate-y-1/2 pointer-events-none flex items-center gap-1 rounded px-1 py-px text-[9px] font-mono font-bold border backdrop-blur-sm max-w-[min(100%,240px)]"
      style={{
        right: 4,
        borderColor: lineColor,
        backgroundColor: "rgba(0,0,0,0.82)",
      }}
    >
      <span style={{ color: lineColor }} className="shrink-0 whitespace-nowrap tabular-nums">
        {kind}
        {preview ? " preview" : ""}{" "}
        {price.toLocaleString("en-US", {
          minimumFractionDigits: 1,
          maximumFractionDigits: 1,
        })}
      </span>
      {netPnlUsdt != null ? (
        <span className={cn("shrink-0 whitespace-nowrap tabular-nums", pnlColor)}>
          {formatSignedUsd(netPnlUsdt)}
        </span>
      ) : null}
      {accountPct != null ? (
        <span className={cn("shrink-0 whitespace-nowrap tabular-nums", pnlColor)}>
          {formatSignedPct(accountPct)}
        </span>
      ) : null}
    </div>
  );
}

function DraggableRiskLine({
  kind,
  price,
  y,
  chartWidth,
  dragging,
  netPnlUsdt,
  accountPct,
  onPointerDown,
}: {
  kind: "SL" | "TP";
  price: number;
  y: number;
  chartWidth: number;
  dragging: boolean;
  netPnlUsdt: number | null;
  accountPct: number | null;
  onPointerDown: (e: ReactPointerEvent<HTMLDivElement>) => void;
}) {
  if (!Number.isFinite(y) || y < 0 || y > 50000) return null;

  const color = kind === "SL" ? SL_LINE : TP_LINE;
  const title = kind === "SL" ? "Drag SL line to modify" : "Drag TP line to modify";

  return (
    <div
      className="absolute left-0 z-[14] pointer-events-none"
      style={{
        top: y,
        width: chartWidth - PRICE_SCALE_INSET,
        height: 0,
      }}
    >
      <div
        className="absolute left-0 right-0 h-px -translate-y-1/2"
        style={{
          backgroundColor: color,
          boxShadow: dragging ? `0 0 6px ${color}` : undefined,
          opacity: dragging ? 1 : 0.9,
        }}
      />
      <div
        role="slider"
        aria-label={title}
        title={title}
        className={cn(
          "absolute left-0 right-0 h-4 -translate-y-1/2 cursor-ns-resize pointer-events-auto",
          dragging && "bg-white/[0.03]",
        )}
        onPointerDown={onPointerDown}
      />
      <RiskLevelLabel
        kind={kind}
        price={price}
        lineColor={color}
        netPnlUsdt={netPnlUsdt}
        accountPct={accountPct}
      />
    </div>
  );
}

function PlacementPreviewLine({
  kind,
  price,
  y,
  chartWidth,
  invalid,
  netPnlUsdt,
  accountPct,
}: {
  kind: "SL" | "TP";
  price: number;
  y: number;
  chartWidth: number;
  invalid: boolean;
  netPnlUsdt: number | null;
  accountPct: number | null;
}) {
  if (!Number.isFinite(y) || y < 0 || y > 50000) return null;

  const baseColor = kind === "SL" ? SL_LINE : TP_LINE;
  const color = invalid ? (kind === "SL" ? SL_PREVIEW_INVALID : TP_PREVIEW_INVALID) : baseColor;

  return (
    <div
      className="absolute left-0 z-[15] pointer-events-none"
      style={{
        top: y,
        width: chartWidth - PRICE_SCALE_INSET,
        height: 0,
      }}
    >
      <div
        className="absolute left-0 right-0 h-px -translate-y-1/2 border-dashed"
        style={{
          backgroundColor: color,
          opacity: 0.85,
          boxShadow: `0 0 4px ${color}`,
        }}
      />
      <RiskLevelLabel
        kind={kind}
        price={price}
        preview
        lineColor={color}
        netPnlUsdt={netPnlUsdt}
        accountPct={accountPct}
      />
    </div>
  );
}

export function PaperTradeOverlay({
  chartWidth,
  chartHeight,
  viewportVersion,
  coordinates,
  candleSeries,
}: PaperTradeOverlayProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const {
    paperActive,
    overlay,
    position,
    accountEquityUsdt,
    feeSettings,
    patchRisk,
    invalidatePaper,
  } = usePaperTradeOverlay();

  const entryLineRef = useRef<IPriceLine | null>(null);
  const slLineRef = useRef<IPriceLine | null>(null);
  const tpLineRef = useRef<IPriceLine | null>(null);

  const [draftRisk, setDraftRisk] = useState<{
    target: PaperRiskDragTarget;
    price: number;
  } | null>(null);
  const [placementMode, setPlacementMode] = useState<RiskPlacementMode>(null);
  const [previewRiskPrice, setPreviewRiskPrice] = useState<number | null>(null);
  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [closeModalOpen, setCloseModalOpen] = useState(false);
  const [closeLoading, setCloseLoading] = useState(false);
  const [riskBusy, setRiskBusy] = useState<"tp" | "sl" | null>(null);

  const displayOverlay = useMemo((): PaperChartTradeOverlay | null => {
    if (!overlay) return null;
    if (!draftRisk) return overlay;
    if (draftRisk.target === "stopLoss") {
      return { ...overlay, stopLoss: draftRisk.price };
    }
    return { ...overlay, takeProfit: draftRisk.price };
  }, [overlay, draftRisk]);

  const showStatus = useCallback((msg: string, ms = 2400) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), ms);
  }, []);

  const clearPlacement = useCallback((message?: string) => {
    setPlacementMode(null);
    setPreviewRiskPrice(null);
    if (message) showStatus(message);
  }, [showStatus]);

  const priceFromClientY = useCallback(
    (clientY: number): number | null => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const y = clientY - rect.top;
      const p = coordinates.coordinateToPrice(y);
      if (p == null || !Number.isFinite(p)) return null;
      return snapOverlayPrice(p);
    },
    [coordinates],
  );

  const syncPriceLines = useCallback(() => {
    const series = candleSeries;
    if (!series || !displayOverlay || displayOverlay.status !== "open") {
      for (const ref of [entryLineRef, slLineRef, tpLineRef]) {
        if (ref.current) {
          series?.removePriceLine(ref.current);
          ref.current = null;
        }
      }
      return;
    }

    const entry = displayOverlay.entryPrice!;
    const entryColor = displayOverlay.side === "long" ? ENTRY_LONG : ENTRY_SHORT;

    if (entryLineRef.current) series.removePriceLine(entryLineRef.current);
    entryLineRef.current = series.createPriceLine({
      price: entry,
      color: entryColor,
      lineWidth: 1,
      lineStyle: LineStyle.Solid,
      axisLabelVisible: false,
      title: "",
    });

    const sl = displayOverlay.stopLoss;
    if (sl != null && Number.isFinite(sl)) {
      if (slLineRef.current) series.removePriceLine(slLineRef.current);
      slLineRef.current = series.createPriceLine({
        price: sl,
        color: SL_LINE,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    } else if (slLineRef.current) {
      series.removePriceLine(slLineRef.current);
      slLineRef.current = null;
    }

    const tp = displayOverlay.takeProfit;
    if (tp != null && Number.isFinite(tp)) {
      if (tpLineRef.current) series.removePriceLine(tpLineRef.current);
      tpLineRef.current = series.createPriceLine({
        price: tp,
        color: TP_LINE,
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
        axisLabelVisible: false,
        title: "",
      });
    } else if (tpLineRef.current) {
      series.removePriceLine(tpLineRef.current);
      tpLineRef.current = null;
    }
  }, [candleSeries, displayOverlay]);

  useEffect(() => {
    syncPriceLines();
    return () => {
      const series = candleSeries;
      if (!series) return;
      for (const ref of [entryLineRef, slLineRef, tpLineRef]) {
        if (ref.current) series.removePriceLine(ref.current);
        ref.current = null;
      }
    };
  }, [syncPriceLines, candleSeries, viewportVersion]);

  useEffect(() => {
    if (!placementMode) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearPlacement("Placement cancelled");
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [placementMode, clearPlacement]);

  const commitPlacement = useCallback(
    async (price: number, mode: RiskPlacementTarget) => {
      if (!displayOverlay?.entryPrice) return false;
      const entry = displayOverlay.entryPrice;
      const validationError = validateChartPlacement(
        displayOverlay.side,
        entry,
        mode,
        price,
      );
      if (validationError) {
        showStatus(validationError, 3200);
        return false;
      }

      setRiskBusy(mode === "stopLoss" ? "sl" : "tp");
      try {
        const patch =
          mode === "stopLoss" ? { stopLoss: price } : { takeProfit: price };
        await patchRisk(patch);
        await invalidatePaper();
        clearPlacement();
        showStatus(mode === "stopLoss" ? "SL placed" : "TP placed");
        return true;
      } catch (err) {
        showStatus(
          err instanceof Error ? err.message : mode === "stopLoss" ? "Invalid SL" : "Invalid TP",
          3200,
        );
        return false;
      } finally {
        setRiskBusy(null);
      }
    },
    [displayOverlay, patchRisk, invalidatePaper, clearPlacement, showStatus],
  );

  const beginPlacement = useCallback(
    (mode: RiskPlacementTarget) => {
      if (!displayOverlay?.entryPrice) return;
      const existing =
        mode === "stopLoss" ? displayOverlay.stopLoss : displayOverlay.takeProfit;
      if (existing != null && Number.isFinite(existing)) return;

      setPlacementMode(mode);
      setPreviewRiskPrice(
        initialPlacementPreviewPrice(displayOverlay.side, displayOverlay.entryPrice, mode),
      );
    },
    [displayOverlay],
  );

  const finishDrag = useCallback(
    async (target: PaperRiskDragTarget, price: number, committed: number) => {
      if (Math.abs(price - committed) < 0.01) return;
      try {
        const patch =
          target === "stopLoss" ? { stopLoss: price } : { takeProfit: price };
        await patchRisk(patch);
        await invalidatePaper();
        showStatus(target === "stopLoss" ? "SL updated" : "TP updated", 1800);
      } catch (err) {
        setDraftRisk({ target, price: committed });
        const msg = err instanceof Error ? err.message : "";
        showStatus(
          msg.toLowerCase().includes("stop")
            ? "Invalid SL"
            : msg.toLowerCase().includes("profit")
              ? "Invalid TP"
              : target === "stopLoss"
                ? "Invalid SL"
                : "Invalid TP",
          3200,
        );
      }
    },
    [patchRisk, invalidatePaper, showStatus],
  );

  const handleExistingLinePointerDown = (
    target: PaperRiskDragTarget,
    committed: number,
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    clearPlacement();
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraftRisk({ target, price: committed });

    const onMove = (ev: PointerEvent) => {
      const p = priceFromClientY(ev.clientY);
      if (p == null) return;
      setDraftRisk({ target, price: p });
    };

    const onUp = async (ev: PointerEvent) => {
      const final = priceFromClientY(ev.clientY) ?? committed;
      setDraftRisk(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      await finishDrag(target, final, committed);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handleRiskButtonPointerDown = (
    mode: RiskPlacementTarget,
    e: ReactPointerEvent<HTMLButtonElement>,
  ) => {
    if (!displayOverlay?.entryPrice) return;
    const hasLevel =
      mode === "stopLoss"
        ? displayOverlay.stopLoss != null && Number.isFinite(displayOverlay.stopLoss)
        : displayOverlay.takeProfit != null &&
          Number.isFinite(displayOverlay.takeProfit);
    if (hasLevel || riskBusy != null) return;

    e.preventDefault();
    e.stopPropagation();
    beginPlacement(mode);

    const startY = e.clientY;
    let dragged = false;

    const onMove = (ev: PointerEvent) => {
      if (Math.abs(ev.clientY - startY) > PLACEMENT_DRAG_THRESHOLD_PX) {
        dragged = true;
      }
      const p = priceFromClientY(ev.clientY);
      if (p != null) setPreviewRiskPrice(p);
    };

    const onUp = async (ev: PointerEvent) => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      const final = priceFromClientY(ev.clientY) ?? previewRiskPrice;
      if (dragged && final != null) {
        const ok = await commitPlacement(final, mode);
        if (!ok) {
          setPlacementMode(mode);
          setPreviewRiskPrice(final);
        }
        return;
      }
      // Tap: stay in placement mode — chart click confirms
      const p = priceFromClientY(ev.clientY);
      if (p != null) setPreviewRiskPrice(p);
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  const handlePlacementLayerMove = (e: ReactPointerEvent<HTMLDivElement>) => {
    const p = priceFromClientY(e.clientY);
    if (p != null) setPreviewRiskPrice(p);
  };

  const handlePlacementLayerClick = (e: ReactPointerEvent<HTMLDivElement>) => {
    if (!placementMode) return;
    e.preventDefault();
    e.stopPropagation();
    const p = priceFromClientY(e.clientY) ?? previewRiskPrice;
    if (p == null) return;
    void commitPlacement(p, placementMode);
  };

  if (!paperActive || !displayOverlay || displayOverlay.status !== "open") {
    return null;
  }

  const pnl = displayOverlay.unrealizedPnlUsdt;
  const yEntry =
    displayOverlay.entryPrice != null
      ? coordinates.priceToCoordinate(displayOverlay.entryPrice)
      : null;

  const slPrice = displayOverlay.stopLoss ?? null;
  const tpPrice = displayOverlay.takeProfit ?? null;
  const ySl = slPrice != null ? coordinates.priceToCoordinate(slPrice) : null;
  const yTp = tpPrice != null ? coordinates.priceToCoordinate(tpPrice) : null;

  const hasSl = slPrice != null && Number.isFinite(slPrice);
  const hasTp = tpPrice != null && Number.isFinite(tpPrice);

  const entry = displayOverlay.entryPrice!;
  const side = displayOverlay.side;
  const { qtyBTC: qty } = normalizePaperQuantity(
    {
      quantity: displayOverlay.quantity,
      qty: displayOverlay.quantity,
      entryPrice: entry,
    },
    entry,
  );

  const emptyMetrics = { netPnlUsdt: null, accountPct: null };

  const slLabelPrice =
    draftRisk?.target === "stopLoss"
      ? draftRisk.price
      : hasSl
        ? slPrice!
        : null;

  const tpLabelPrice =
    draftRisk?.target === "takeProfit"
      ? draftRisk.price
      : hasTp
        ? tpPrice!
        : null;

  const qtyForMetrics = qty != null && qty > 0 ? qty : 0;

  const slMetrics =
    slLabelPrice != null && qtyForMetrics > 0
      ? buildRiskLevelNetMetrics(
          side,
          entry,
          qtyForMetrics,
          slLabelPrice,
          accountEquityUsdt,
          feeSettings,
        )
      : emptyMetrics;

  const tpMetrics =
    tpLabelPrice != null && qtyForMetrics > 0
      ? buildRiskLevelNetMetrics(
          side,
          entry,
          qtyForMetrics,
          tpLabelPrice,
          accountEquityUsdt,
          feeSettings,
        )
      : emptyMetrics;

  const previewMetrics =
    placementMode != null && previewRiskPrice != null && qtyForMetrics > 0
      ? buildRiskLevelNetMetrics(
          side,
          entry,
          qtyForMetrics,
          previewRiskPrice,
          accountEquityUsdt,
          feeSettings,
        )
      : emptyMetrics;

  const previewInvalid =
    placementMode != null &&
    previewRiskPrice != null &&
    validateChartPlacement(displayOverlay.side, entry, placementMode, previewRiskPrice) !=
      null;

  const yPreview =
    previewRiskPrice != null ? coordinates.priceToCoordinate(previewRiskPrice) : null;

  const barTop =
    yEntry != null && Number.isFinite(yEntry)
      ? Math.min(Math.max(yEntry - BAR_HEIGHT / 2, 4), chartHeight - BAR_HEIGHT - 4)
      : 12;

  const sideLabel = displayOverlay.side.toUpperCase();
  const qtyLabel =
    qty != null ? `${formatQtyBtc(qty)} BTC` : "Qty: —";

  const placementHint =
    placementMode === "takeProfit"
      ? "Drag to place TP · Click chart to confirm"
      : placementMode === "stopLoss"
        ? "Drag to place SL · Click chart to confirm"
        : null;

  return (
    <div
      ref={rootRef}
      data-paper-chart-root
      className={cn(
        "absolute inset-0 z-[12] overflow-hidden",
        placementMode ? "pointer-events-auto cursor-crosshair" : "pointer-events-none",
      )}
      style={{ width: chartWidth, height: chartHeight }}
    >
      {statusMsg ? (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-[20] rounded border border-slate-600 bg-black/90 px-2 py-0.5 text-[9px] font-mono text-slate-200 pointer-events-none">
          {statusMsg}
        </div>
      ) : null}

      {placementMode && placementHint ? (
        <div className="absolute top-7 left-1/2 -translate-x-1/2 z-[20] flex items-center gap-2 rounded border border-cyan-500/35 bg-black/92 px-2 py-1 text-[9px] font-mono text-slate-200 pointer-events-auto shadow-md">
          <span className={previewInvalid ? "text-amber-400" : "text-cyan-200/90"}>
            {previewInvalid
              ? placementMode === "takeProfit"
                ? `Invalid level for ${displayOverlay.side} TP`
                : `Invalid level for ${displayOverlay.side} SL`
              : placementHint}
          </span>
          <button
            type="button"
            className="text-[8px] uppercase text-slate-500 hover:text-white border border-slate-600 rounded px-1"
            onClick={(e) => {
              e.stopPropagation();
              clearPlacement("Placement cancelled");
            }}
          >
            Cancel
          </button>
        </div>
      ) : null}

      {placementMode && previewRiskPrice != null && yPreview != null && Number.isFinite(yPreview) ? (
        <PlacementPreviewLine
          kind={placementMode === "stopLoss" ? "SL" : "TP"}
          price={previewRiskPrice}
          y={yPreview}
          chartWidth={chartWidth}
          invalid={previewInvalid}
          netPnlUsdt={previewMetrics.netPnlUsdt}
          accountPct={previewMetrics.accountPct}
        />
      ) : null}

      {placementMode ? (
        <div
          className="absolute inset-0 z-[13] pointer-events-auto cursor-crosshair"
          style={{ width: chartWidth, height: chartHeight }}
          onPointerMove={handlePlacementLayerMove}
          onPointerDown={handlePlacementLayerClick}
          onContextMenu={(e) => {
            e.preventDefault();
            clearPlacement("Placement cancelled");
          }}
        />
      ) : null}

      {hasSl && ySl != null && Number.isFinite(ySl) && placementMode !== "stopLoss" ? (
        <DraggableRiskLine
          kind="SL"
          price={displayOverlay.stopLoss!}
          y={ySl}
          chartWidth={chartWidth}
          dragging={draftRisk?.target === "stopLoss"}
          netPnlUsdt={slMetrics.netPnlUsdt}
          accountPct={slMetrics.accountPct}
          onPointerDown={(e) =>
            handleExistingLinePointerDown("stopLoss", displayOverlay.stopLoss!, e)
          }
        />
      ) : null}

      {hasTp && yTp != null && Number.isFinite(yTp) && placementMode !== "takeProfit" ? (
        <DraggableRiskLine
          kind="TP"
          price={displayOverlay.takeProfit!}
          y={yTp}
          chartWidth={chartWidth}
          dragging={draftRisk?.target === "takeProfit"}
          netPnlUsdt={tpMetrics.netPnlUsdt}
          accountPct={tpMetrics.accountPct}
          onPointerDown={(e) =>
            handleExistingLinePointerDown("takeProfit", displayOverlay.takeProfit!, e)
          }
        />
      ) : null}

      <div
        className="absolute z-[16] pointer-events-auto flex items-stretch font-mono text-[10px] leading-none shadow-md"
        style={{
          top: barTop,
          right: PRICE_SCALE_INSET,
          height: BAR_HEIGHT,
          maxWidth: chartWidth - PRICE_SCALE_INSET - 8,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div className="flex items-center gap-0 rounded-l border border-r-0 border-cyan-500/40 bg-[#0a0a0a]/95 px-1.5 shrink-0">
          <span className="text-[9px] font-bold uppercase tracking-wider text-cyan-400">
            Paper
          </span>
        </div>

        <div
          className={cn(
            "flex items-center gap-1.5 border-y border-cyan-500/30 bg-[#0a0a0a]/95 px-2 shrink-0",
            displayOverlay.side === "long"
              ? "text-emerald-400"
              : "text-orange-400",
          )}
        >
          <span className="font-bold uppercase">{sideLabel}</span>
          <span className="text-slate-300 tabular-nums">{qtyLabel}</span>
        </div>

        <button
          type="button"
          disabled={riskBusy != null}
          title={
            hasTp
              ? "Drag TP line to modify"
              : "Click or drag from button, then click chart to place TP"
          }
          onPointerDown={(e) => handleRiskButtonPointerDown("takeProfit", e)}
          className={cn(
            "px-2 border-y border-l-0 font-bold uppercase tracking-wider transition-colors shrink-0 touch-none",
            hasTp
              ? "border-emerald-500/50 bg-emerald-950/50 text-emerald-400 hover:bg-emerald-900/40"
              : "border-dashed border-slate-600 bg-[#111] text-emerald-500/60 hover:bg-emerald-950/30 hover:text-emerald-400 hover:border-emerald-500/40",
            placementMode === "takeProfit" &&
              "ring-1 ring-emerald-400/60 bg-emerald-950/60 text-emerald-300",
            riskBusy === "tp" && "opacity-50",
          )}
        >
          TP
        </button>

        <button
          type="button"
          disabled={riskBusy != null}
          title={
            hasSl
              ? "Drag SL line to modify"
              : "Click or drag from button, then click chart to place SL"
          }
          onPointerDown={(e) => handleRiskButtonPointerDown("stopLoss", e)}
          className={cn(
            "px-2 border-y border-l-0 font-bold uppercase tracking-wider transition-colors shrink-0 touch-none",
            hasSl
              ? "border-amber-500/50 bg-amber-950/40 text-amber-300 hover:bg-amber-900/30"
              : "border-dashed border-slate-600 bg-[#111] text-amber-500/60 hover:bg-amber-950/30 hover:text-amber-300 hover:border-amber-500/40",
            placementMode === "stopLoss" &&
              "ring-1 ring-amber-400/60 bg-amber-950/60 text-amber-300",
            riskBusy === "sl" && "opacity-50",
          )}
        >
          SL
        </button>

        <div
          className={cn(
            "flex items-center px-2 border-y border-l-0 border-slate-600 bg-[#0a0a0a]/95 tabular-nums shrink-0",
            pnl > 0 && "text-emerald-400",
            pnl < 0 && "text-red-400",
            pnl === 0 && "text-slate-400",
          )}
        >
          {formatPnlUsdt(pnl)}
        </div>

        <button
          type="button"
          disabled={riskBusy != null}
          title="Close position"
          onClick={(e) => {
            e.stopPropagation();
            clearPlacement();
            setCloseModalOpen(true);
          }}
          className={cn(
            "px-2 rounded-r border border-cyan-500/30 bg-[#0a0a0a]/95 text-slate-400 hover:text-red-400 hover:bg-red-950/40 shrink-0",
            riskBusy === "close" && "opacity-50",
          )}
        >
          ×
        </button>
      </div>

      {position && position.side !== "flat" ? (
        <PaperClosePositionModal
          open={closeModalOpen}
          onClose={() => setCloseModalOpen(false)}
          position={position}
          loading={closeLoading}
          onConfirm={async (percent) => {
            setCloseLoading(true);
            try {
              await postPaperClosePartial(percent);
              setCloseModalOpen(false);
              clearPlacement();
              await invalidatePaper();
              showStatus(
                percent >= 100
                  ? "Paper position closed"
                  : `Closed ${percent}% of paper position.`,
              );
            } catch (err) {
              showStatus(err instanceof Error ? err.message : "Close failed", 3200);
            } finally {
              setCloseLoading(false);
            }
          }}
        />
      ) : null}
    </div>
  );
}
