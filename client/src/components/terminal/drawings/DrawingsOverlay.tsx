import { useRef, useEffect, useState, useCallback, useMemo } from "react";
import { DrawingsCanvas } from "./DrawingsCanvas";
import { DrawingHitRegions } from "./DrawingHitRegions";
import { DrawingAnchorHandles } from "./DrawingAnchorHandles";
import { drawDebug, getChartViewportVersion } from "./debug";
import { createDrawingProjection } from "./projection";
import type { Drawing, DrawingTool } from "./types";

export interface DrawingsState {
  drawings: Drawing[];
  activeTool: DrawingTool;
  setActiveTool: (t: DrawingTool) => void;
  selectedId: string | null;
  selectDrawing: (id: string | null) => void;
  pendingDrawing: Drawing | null;
  draggingAnchor: { id: string; pointIndex: number } | null;
  setDraggingAnchor: (v: { id: string; pointIndex: number } | null) => void;
  removeSelected: () => void;
  hitTest: (x: number, y: number, tx: (t: number) => number | null, py: (p: number) => number | null) => Drawing | null;
  hitTestAnchor: (x: number, y: number, tx: (t: number) => number | null, py: (p: number) => number | null) => { drawing: Drawing; pointIndex: number } | null;
  startDrawing: (time: number, price: number) => void;
  addPolylinePoint: (time: number, price: number) => void;
  updatePendingEnd: (time: number, price: number) => void;
  updatePoint: (id: string, pointIndex: number, pt: { time: number; price: number }) => void;
  finishDrawing: (time?: number, price?: number) => void;
  confirmTextDrawing: (text: string) => void;
  completePolyline: () => void;
  removeLastPolylinePoint: () => void;
  cancelPending: () => void;
}

interface DrawingsCoordinateHelpers {
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: number) => number | null;
  coordinateToPrice: (y: number) => number | null;
  coordinateToTime: (x: number) => number | null;
  coordinateToLogical?: (x: number) => number | null;
  getVisibleLogicalRange?: () => { from: number; to: number } | null;
  getLastDataLogical?: () => number | null;
  getLastTimeSec?: () => number | null;
  getBarSec?: () => number | null;
}

interface DrawingsOverlayProps {
  chartWidth: number;
  chartHeight: number;
  viewportVersion?: number;
  coordinates: DrawingsCoordinateHelpers;
  drawingsState: DrawingsState;
}

export function DrawingsOverlay({
  chartWidth,
  chartHeight,
  viewportVersion = 0,
  coordinates,
  drawingsState,
}: DrawingsOverlayProps) {
  const {
    priceToCoordinate,
    timeToCoordinate,
    coordinateToPrice,
    coordinateToTime,
    coordinateToLogical,
    getVisibleLogicalRange,
    getLastDataLogical,
    getLastTimeSec,
    getBarSec,
  } = coordinates;
  const {
    drawings,
    activeTool,
    selectDrawing,
    pendingDrawing,
    draggingAnchor,
    setDraggingAnchor,
    removeSelected,
    hitTest,
    hitTestAnchor,
    startDrawing,
    addPolylinePoint,
    updatePendingEnd,
    updatePoint,
    finishDrawing,
    confirmTextDrawing,
    completePolyline,
    removeLastPolylinePoint,
    cancelPending,
  } = drawingsState;

  const containerRef = useRef<HTMLDivElement>(null);
  const textInputRef = useRef<HTMLInputElement | null>(null);
  const [textInput, setTextInput] = useState<{ x: number; y: number; time: number; price: number } | null>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [interactionTick, setInteractionTick] = useState(0);
  const rafRef = useRef<number | null>(null);
  const interactionRef = useRef(false);
  const wheelEndRef = useRef<number | null>(null);

  const isDrawMode = activeTool !== "select" || pendingDrawing != null;
  const isDraggingAnchor = draggingAnchor != null;
  const selectedDrawing = drawings.find((d) => d.selected);
  const projection = useMemo(
    () => createDrawingProjection(timeToCoordinate, priceToCoordinate),
    [timeToCoordinate, priceToCoordinate]
  );
  const { timeToX, priceToY } = projection;

  useEffect(() => {
    const chartViewportVersion = getChartViewportVersion();
    drawDebug("RENDER", {
      source: "DrawingsOverlay",
      viewportVersion,
      chartViewportVersion,
      mismatch: chartViewportVersion != null && chartViewportVersion !== viewportVersion,
      drawings: drawings.length,
      pendingTool: pendingDrawing?.tool ?? null,
    });
  }, [viewportVersion, drawings.length, pendingDrawing?.tool]);

  const stopInteractionLoop = useCallback(() => {
    interactionRef.current = false;
    if (rafRef.current != null) {
      window.cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    if (wheelEndRef.current != null) {
      window.clearTimeout(wheelEndRef.current);
      wheelEndRef.current = null;
    }
  }, []);

  const startInteractionLoop = useCallback(() => {
    if (interactionRef.current) return;
    interactionRef.current = true;
    const tick = () => {
      if (!interactionRef.current) return;
      setInteractionTick((v) => v + 1);
      rafRef.current = window.requestAnimationFrame(tick);
    };
    rafRef.current = window.requestAnimationFrame(tick);
  }, []);

  useEffect(() => {
    const onPointerUp = () => stopInteractionLoop();
    const onWindowWheel = () => {
      startInteractionLoop();
      if (wheelEndRef.current != null) window.clearTimeout(wheelEndRef.current);
      wheelEndRef.current = window.setTimeout(() => stopInteractionLoop(), 120);
    };
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("wheel", onWindowWheel, { passive: true });
    return () => {
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("wheel", onWindowWheel as EventListener);
      stopInteractionLoop();
    };
  }, [startInteractionLoop, stopInteractionLoop]);

  const getCoords = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) {
        drawDebug("INPUT_DEBUG", {
          source: "DrawingsOverlay.getCoords",
          stage: "enter",
          called: true,
          accepted: false,
          rejectReason: "no_rect",
        });
        return null;
      }
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const plotWidth = rect.width;
      const isInsideX = x >= 0 && x <= plotWidth;
      const rawTime = coordinateToTime(x);
      let time = rawTime;
      const price = coordinateToPrice(y);
      let fallbackUsed = "none";
      const directLogical = coordinateToLogical?.(x) ?? null;
      const lastLogical = getLastDataLogical?.() ?? null;
      const lastTimeSec = getLastTimeSec?.() ?? null;
      const barSec = getBarSec?.() ?? null;
      const isFutureLogical =
        typeof directLogical === "number" &&
        typeof lastLogical === "number" &&
        directLogical > lastLogical + 1e-6;

      // Critical fix: if library clamps coordinateToTime to last candle while pointer is in future logical space,
      // force future projection for the START point and subsequent input.
      if (
        isInsideX &&
        isFutureLogical &&
        typeof lastTimeSec === "number" &&
        typeof barSec === "number" &&
        Number.isFinite(barSec) &&
        barSec > 0 &&
        (time == null || time <= lastTimeSec)
      ) {
        time = Math.round(lastTimeSec + (directLogical - lastLogical) * barSec);
        fallbackUsed = "futureLogicalOverride";
      }

      if (time == null && isInsideX) {
        if (
          typeof directLogical === "number" &&
          typeof lastLogical === "number" &&
          typeof lastTimeSec === "number" &&
          typeof barSec === "number" &&
          Number.isFinite(barSec) &&
          barSec > 0
        ) {
          time = Math.round(lastTimeSec + (directLogical - lastLogical) * barSec);
          fallbackUsed = "coordinateToLogical";
        } else {
          const visible = getVisibleLogicalRange?.() ?? null;
          if (
            visible &&
            plotWidth > 0 &&
            typeof lastLogical === "number" &&
            typeof lastTimeSec === "number" &&
            typeof barSec === "number" &&
            Number.isFinite(barSec) &&
            barSec > 0
          ) {
            const logical = visible.from + (x / plotWidth) * (visible.to - visible.from);
            time = Math.round(lastTimeSec + (logical - lastLogical) * barSec);
            fallbackUsed = "visibleLogicalInterpolation";
          }
        }
      }
      drawDebug("INPUT_DEBUG", {
        source: "DrawingsOverlay.getCoords",
        stage: "exit",
        called: true,
        x,
        y,
        coordinateToTime: rawTime,
        coordinateToLogical: directLogical,
        lastLogical,
        lastTimeSec,
        isFutureLogical,
        plotWidth,
        isInsideX,
        fallbackUsed,
        finalTime: time,
        accepted: time != null && price != null,
        viewportVersion,
      });
      if (price == null || time == null) {
        drawDebug("INPUT_DEBUG", {
          source: "DrawingsOverlay.getCoords",
          stage: "reject",
          called: true,
          x,
          y,
          accepted: false,
          time,
          price,
          rejectReason: price == null ? "price_null" : "time_null",
          isInsideX,
          plotWidth,
          fallbackUsed,
        });
        return null;
      }
      drawDebug("POINTER_PROJECT", {
        source: "DrawingsOverlay.getCoords",
        accepted: true,
        viewportVersion,
        x,
        y,
        time,
        price,
      });
      return { x, y, time, price };
    },
    [
      coordinateToTime,
      coordinateToPrice,
      coordinateToLogical,
      getVisibleLogicalRange,
      getLastDataLogical,
      getLastTimeSec,
      getBarSec,
      viewportVersion,
    ]
  );

  const handleKeyDown = useCallback(
    (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        if (isDraggingAnchor) setDraggingAnchor(null);
        else {
          cancelPending();
          setTextInput(null);
          selectDrawing(null);
        }
      }
      if (e.key === "Backspace" && pendingDrawing?.tool === "polyline") {
        removeLastPolylinePoint();
        return;
      }
      if (e.key === "Delete" || e.key === "Backspace") removeSelected();
      if (e.key === "Enter" && pendingDrawing?.tool === "polyline") completePolyline();
    },
    [isDraggingAnchor, setDraggingAnchor, cancelPending, selectDrawing, removeSelected, removeLastPolylinePoint, pendingDrawing, completePolyline]
  );

  useEffect(() => {
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [handleKeyDown]);

  useEffect(() => {
    if (!draggingAnchor) return;
    const onMove = (e: MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = coordinateToTime(x);
      const price = coordinateToPrice(y);
      if (time == null || price == null) return;
      const d = drawings.find((x) => x.id === draggingAnchor.id);
      const pt = d?.points?.[draggingAnchor.pointIndex];
      if (d?.tool === "horizontalLine" && pt != null) {
        updatePoint(draggingAnchor.id, draggingAnchor.pointIndex, { time: pt.time, price });
      } else {
        updatePoint(draggingAnchor.id, draggingAnchor.pointIndex, { time, price });
      }
    };
    const onUp = () => setDraggingAnchor(null);
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [draggingAnchor, drawings, coordinateToTime, coordinateToPrice, updatePoint, setDraggingAnchor]);

  const handleDrawClick = useCallback(
    (e: React.MouseEvent) => {
      const c = getCoords(e);
      if (!c) return;

      if (activeTool === "text") {
        drawDebug("START_POINT", {
          source: "DrawingsOverlay.handleDrawClick:text",
          x: c.x,
          y: c.y,
          coordinateToTime: rawTimeFromPoint(c.x),
          coordinateToLogical: coordinateToLogical?.(c.x) ?? null,
          finalTimePersisted: c.time,
          clampedToLast: typeof getLastTimeSec?.() === "number" ? c.time <= (getLastTimeSec?.() as number) : null,
        });
        startDrawing(c.time, c.price);
        setTextInput({ x: c.x, y: c.y, time: c.time, price: c.price });
        return;
      }

      if (pendingDrawing?.tool === "polyline") {
        addPolylinePoint(c.time, c.price);
        return;
      }

      if (pendingDrawing && (pendingDrawing.tool === "trendLine" || pendingDrawing.tool === "arrow" || pendingDrawing.tool === "rectangle")) {
        finishDrawing(c.time, c.price);
      } else {
        drawDebug("START_POINT", {
          source: "DrawingsOverlay.handleDrawClick:start",
          tool: activeTool,
          x: c.x,
          y: c.y,
          coordinateToTime: rawTimeFromPoint(c.x),
          coordinateToLogical: coordinateToLogical?.(c.x) ?? null,
          finalTimePersisted: c.time,
          clampedToLast: typeof getLastTimeSec?.() === "number" ? c.time <= (getLastTimeSec?.() as number) : null,
        });
        startDrawing(c.time, c.price);
      }
    },
    [activeTool, pendingDrawing, getCoords, startDrawing, addPolylinePoint, finishDrawing, coordinateToLogical, getLastTimeSec]
  );

  const rawTimeFromPoint = useCallback((x: number) => coordinateToTime(x), [coordinateToTime]);

  const handleDoubleClick = useCallback(
    (e: React.MouseEvent) => {
      if (pendingDrawing?.tool === "polyline" && pendingDrawing.points.length >= 2) {
        completePolyline();
      }
    },
    [pendingDrawing, completePolyline]
  );

  const handleDrawMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (isDraggingAnchor) return;
      const rect = containerRef.current?.getBoundingClientRect();
      const x = rect ? e.clientX - rect.left : null;
      const y = rect ? e.clientY - rect.top : null;
      const plotWidth = rect?.width ?? null;
      drawDebug("POINTER_DOWN", {
        source: "DrawingsOverlay.handleDrawMouseDown",
        stage: "enter",
        called: true,
        x,
        y,
        chartWidth,
        plotLeft: 0,
        plotRight: plotWidth,
      });
      const c = getCoords(e);
      drawDebug("POINTER_DOWN", {
        source: "DrawingsOverlay.handleDrawMouseDown",
        x,
        y,
        chartWidth,
        plotLeft: 0,
        plotRight: plotWidth,
        isInsideX: typeof x === "number" && typeof plotWidth === "number" ? x >= 0 && x <= plotWidth : null,
        coordinateToTime: typeof x === "number" ? coordinateToTime(x) : null,
        coordinateToLogical: typeof x === "number" ? coordinateToLogical?.(x) ?? null : null,
        accepted: c != null,
        rejectReason: c == null ? "getCoords_returned_null" : null,
        stage: "post_getCoords",
        called: true,
      });
      if (!c) return;

      const anchorHit = hitTestAnchor(c.x, c.y, timeToX, priceToY);
      if (anchorHit && anchorHit.drawing.selected) {
        setDraggingAnchor({ id: anchorHit.drawing.id, pointIndex: anchorHit.pointIndex });
        e.preventDefault();
        return;
      }

      if (activeTool === "rectangle" && !pendingDrawing) {
        drawDebug("START_POINT", {
          source: "DrawingsOverlay.handleDrawMouseDown:rectangle",
          tool: activeTool,
          x: c.x,
          y: c.y,
          coordinateToTime: rawTimeFromPoint(c.x),
          coordinateToLogical: coordinateToLogical?.(c.x) ?? null,
          finalTimePersisted: c.time,
          clampedToLast: typeof getLastTimeSec?.() === "number" ? c.time <= (getLastTimeSec?.() as number) : null,
        });
        startDrawing(c.time, c.price);
        setIsDragging(true);
      }
    },
    [activeTool, pendingDrawing, isDraggingAnchor, getCoords, hitTestAnchor, timeToX, priceToY, setDraggingAnchor, startDrawing, rawTimeFromPoint, coordinateToLogical, getLastTimeSec, chartWidth, coordinateToTime]
  );

  const handleDrawMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const c = getCoords(e);
      if (!c) return;

      if (draggingAnchor) {
        const d = drawings.find((x) => x.id === draggingAnchor.id);
        if (d && !d.locked) updatePoint(draggingAnchor.id, draggingAnchor.pointIndex, { time: c.time, price: c.price });
        return;
      }

      if (isDragging && pendingDrawing?.tool === "rectangle") {
        updatePendingEnd(c.time, c.price);
      } else if (pendingDrawing && (pendingDrawing.tool === "trendLine" || pendingDrawing.tool === "arrow" || pendingDrawing.tool === "rectangle")) {
        updatePendingEnd(c.time, c.price);
      }
    },
    [draggingAnchor, isDragging, pendingDrawing, drawings, getCoords, updatePoint, updatePendingEnd]
  );

  const handleDrawMouseUp = useCallback(
    (e: React.MouseEvent) => {
      if (draggingAnchor) {
        setDraggingAnchor(null);
        return;
      }
      if (isDragging && pendingDrawing?.tool === "rectangle") {
        const c = getCoords(e);
        if (c) finishDrawing(c.time, c.price);
        setIsDragging(false);
      }
    },
    [draggingAnchor, isDragging, pendingDrawing, getCoords, setDraggingAnchor, finishDrawing]
  );

  const handleTextSubmit = useCallback(
    (text: string) => {
      if (text.trim()) confirmTextDrawing(text.trim());
      setTextInput(null);
    },
    [confirmTextDrawing]
  );

  return (
    <div
      ref={containerRef}
      className="absolute inset-0 z-[15] pointer-events-none"
      style={{ width: chartWidth, height: chartHeight }}
    >
      <DrawingsCanvas
        drawings={drawings}
        pendingDrawing={pendingDrawing}
        chartWidth={chartWidth}
        chartHeight={chartHeight}
        viewportVersion={viewportVersion + interactionTick}
        priceToCoordinate={priceToY}
        timeToCoordinate={timeToX}
      />

      {isDrawMode && (
        <div
          className="absolute inset-0 pointer-events-auto"
          style={{ zIndex: 1 }}
          onClick={handleDrawClick}
          onDoubleClick={handleDoubleClick}
          onMouseDown={handleDrawMouseDown}
          onMouseMove={handleDrawMouseMove}
          onMouseUp={handleDrawMouseUp}
          onMouseLeave={() => {
            if (isDragging) setIsDragging(false);
            if (draggingAnchor) setDraggingAnchor(null);
          }}
        />
      )}

      {!isDrawMode && drawings.length > 0 && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 2 }}>
          <DrawingHitRegions
            drawings={drawings}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            viewportVersion={viewportVersion + interactionTick}
            priceToCoordinate={priceToY}
            timeToCoordinate={timeToX}
            onSelect={(d) => selectDrawing(d.id)}
          />
        </div>
      )}

      {selectedDrawing && !isDrawMode && (
        <div className="absolute inset-0 pointer-events-none" style={{ zIndex: 3 }}>
          <DrawingAnchorHandles
            drawing={selectedDrawing}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            viewportVersion={viewportVersion + interactionTick}
            priceToCoordinate={priceToY}
            timeToCoordinate={timeToX}
            onAnchorMouseDown={(pointIndex) => setDraggingAnchor({ id: selectedDrawing.id, pointIndex })}
          />
        </div>
      )}


      {textInput && (
        <div
          className="absolute pointer-events-auto z-10 bg-black/90 border border-white/20 p-1 rounded shadow-lg"
          style={{ left: Math.min(textInput.x, chartWidth - 180), top: Math.min(textInput.y, chartHeight - 60) }}
        >
          <input
            ref={textInputRef}
            autoFocus
            type="text"
            placeholder="Label..."
            className="w-[140px] px-2 py-1 text-[11px] font-mono bg-black/80 border border-white/20 text-white rounded"
            onKeyDown={(e) => {
              const input = e.target as HTMLInputElement;
              if (e.key === "Enter") handleTextSubmit(input.value);
              if (e.key === "Escape") {
                cancelPending();
                setTextInput(null);
              }
            }}
            onBlur={() => {
              const value = textInputRef.current?.value;
              if (value) handleTextSubmit(value);
              textInputRef.current = null;
              setTextInput(null);
            }}
          />
        </div>
      )}
    </div>
  );
}
