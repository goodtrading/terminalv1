import { useRef, useEffect, useState, useCallback } from "react";
import { DrawingsCanvas } from "./DrawingsCanvas";
import { DrawingHitRegions } from "./DrawingHitRegions";
import { DrawingAnchorHandles } from "./DrawingAnchorHandles";
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
  const { priceToCoordinate, timeToCoordinate, coordinateToPrice, coordinateToTime } = coordinates;
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

  const isDrawMode = activeTool !== "select" || pendingDrawing != null;
  const isDraggingAnchor = draggingAnchor != null;
  const selectedDrawing = drawings.find((d) => d.selected);

  const getCoords = useCallback(
    (e: React.MouseEvent) => {
      const rect = containerRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const time = coordinateToTime(x);
      const price = coordinateToPrice(y);
      if (time == null || price == null) return null;
      return { x, y, time, price };
    },
    [coordinateToTime, coordinateToPrice]
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
        startDrawing(c.time, c.price);
      }
    },
    [activeTool, pendingDrawing, getCoords, startDrawing, addPolylinePoint, finishDrawing]
  );

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
      const c = getCoords(e);
      if (!c) return;

      const anchorHit = hitTestAnchor(c.x, c.y, timeToCoordinate, priceToCoordinate);
      if (anchorHit && anchorHit.drawing.selected) {
        setDraggingAnchor({ id: anchorHit.drawing.id, pointIndex: anchorHit.pointIndex });
        e.preventDefault();
        return;
      }

      if (activeTool === "rectangle" && !pendingDrawing) {
        startDrawing(c.time, c.price);
        setIsDragging(true);
      }
    },
    [activeTool, pendingDrawing, isDraggingAnchor, getCoords, hitTestAnchor, timeToCoordinate, priceToCoordinate, setDraggingAnchor, startDrawing]
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
        viewportVersion={viewportVersion}
        priceToCoordinate={priceToCoordinate}
        timeToCoordinate={timeToCoordinate}
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
            priceToCoordinate={priceToCoordinate}
            timeToCoordinate={timeToCoordinate}
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
            priceToCoordinate={priceToCoordinate}
            timeToCoordinate={timeToCoordinate}
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
