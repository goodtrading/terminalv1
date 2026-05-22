import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { cn } from "@/lib/utils";
import type { DrawingsCoordinateHelpers } from "../drawings/DrawingsLayer";
import { PositionRiskOverlay } from "../chartRisk/PositionRiskOverlay";
import { PlacementPreviewLine } from "../chartRisk/positionRiskOverlayShared";
import type { IPriceLine } from "lightweight-charts";
import {
  buildRiskLevelNetMetrics,
  createEmptyRiskLevelMetrics,
} from "../chartRisk/riskLevelMetrics";
import {
  normalizePaperQuantity,
  initialPlacementPreviewPrice,
  snapOverlayPrice,
  validateChartPlacement,
  type RiskPlacementTarget,
} from "./paperTradeOverlayHelpers";
import { PaperClosePositionModal } from "../execution/PaperClosePositionModal";
import { postPaperClosePartial } from "../execution/paperChartActions";
import type { PaperChartTradeOverlay, PaperRiskDragTarget } from "./paperTradeOverlayTypes";
import { usePaperTradeOverlay } from "./usePaperTradeOverlay";

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
  const slPrice = displayOverlay.stopLoss ?? null;
  const tpPrice = displayOverlay.takeProfit ?? null;
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

  const qtyForMetrics = qty != null && qty > 0 ? qty : 0;

  const emptyMetrics = createEmptyRiskLevelMetrics();

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

  const placementHint =
    placementMode === "takeProfit"
      ? "Drag to place TP · Click chart to confirm"
      : placementMode === "stopLoss"
        ? "Drag to place SL · Click chart to confirm"
        : null;

  const overlayPosition = {
    side: displayOverlay.side,
    quantity: qtyForMetrics > 0 ? qtyForMetrics : displayOverlay.quantity,
    entryPrice: entry,
    markPrice: displayOverlay.markPrice ?? undefined,
    unrealizedPnlUsdt: pnl,
  };

  return (
    <div ref={rootRef} data-paper-chart-root className="absolute inset-0" style={{ width: chartWidth, height: chartHeight }}>
      {statusMsg ? (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-[20] rounded border border-slate-600 bg-black/90 px-2 py-0.5 text-[9px] font-mono text-slate-200 pointer-events-none">
          {statusMsg}
        </div>
      ) : null}

      <PositionRiskOverlay
        mode="paper"
        readonly={false}
        position={overlayPosition}
        account={{ equityUsdt: accountEquityUsdt }}
        stopLoss={
          displayOverlay.stopLoss != null
            ? { price: displayOverlay.stopLoss, source: "paper" }
            : null
        }
        takeProfit={
          displayOverlay.takeProfit != null
            ? { price: displayOverlay.takeProfit, source: "paper" }
            : null
        }
        feeSettings={feeSettings}
        chartWidth={chartWidth}
        chartHeight={chartHeight}
        viewportVersion={viewportVersion}
        coordinates={coordinates}
        candleSeries={candleSeries}
        draftStopLoss={draftRisk?.target === "stopLoss" ? draftRisk.price : undefined}
        draftTakeProfit={draftRisk?.target === "takeProfit" ? draftRisk.price : undefined}
        placementActive={placementMode != null}
        hideStopLossLine={placementMode === "stopLoss"}
        hideTakeProfitLine={placementMode === "takeProfit"}
        draggingStopLoss={draftRisk?.target === "stopLoss"}
        draggingTakeProfit={draftRisk?.target === "takeProfit"}
        onStopLossPointerDown={
          hasSl
            ? (e) =>
                handleExistingLinePointerDown("stopLoss", displayOverlay.stopLoss!, e)
            : undefined
        }
        onTakeProfitPointerDown={
          hasTp
            ? (e) =>
                handleExistingLinePointerDown("takeProfit", displayOverlay.takeProfit!, e)
            : undefined
        }
        paperControls={
          <>
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
          </>
        }
        paperTrailing={
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
        }
      >
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
            mode="paper"
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
      </PositionRiskOverlay>

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
