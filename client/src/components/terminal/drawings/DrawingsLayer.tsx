import {
  forwardRef,
  useCallback,
  useEffect,
  useImperativeHandle,
  useMemo,
  useRef,
  useState,
} from "react";
import { DrawingsToolbar } from "./DrawingsToolbar";
import { DrawingsContextualBar } from "./DrawingsContextualBar";
import { DrawingsOverlay } from "./DrawingsOverlay";
import { useDrawings } from "./useDrawings";
import { createDrawingProjection } from "./projection";
import type { Drawing, DrawingTool } from "./types";
import type { ChartMenuContext } from "../chart/chartContextTypes";
import { isPositionDrawing } from "./positionUtils";

export interface DrawingsCoordinateHelpers {
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

export interface DrawingsLayerProps {
  /** Time-scale plot width (not container width). All tools use this for coordinate mapping. */
  chartWidth: number;
  chartHeight: number;
  symbol: string;
  timeframe: string;
  viewportVersion?: number;
  coordinates: DrawingsCoordinateHelpers;
}

export type DrawingsLayerHandle = {
  resolveContextMenu: (clientX: number, clientY: number) => ChartMenuContext;
  selectDrawing: (id: string | null) => void;
  duplicateDrawing: (id: string) => void;
  updateDrawing: (id: string, updates: Partial<Drawing>) => void;
  removeDrawing: (id: string) => void;
  setActiveTool: (t: DrawingTool) => void;
  openPositionEditor: (id: string) => void;
};

export const DrawingsLayer = forwardRef<DrawingsLayerHandle, DrawingsLayerProps>(function DrawingsLayer(
  { chartWidth, chartHeight, symbol, timeframe, viewportVersion = 0, coordinates },
  ref
) {
  const overlayRootRef = useRef<HTMLDivElement>(null);
  const [editorOpenRequestId, setEditorOpenRequestId] = useState<string | null>(null);

  const {
    drawings,
    activeTool,
    setActiveTool,
    selectedId,
    selectDrawing,
    pendingDrawing,
    draggingAnchor,
    setDraggingAnchor,
    removeSelected,
    hitTest,
    hitTestForContextMenu,
    hitTestAnchor,
    startDrawing,
    addPolylinePoint,
    updatePendingEnd,
    updatePoint,
    updatePositionLevels,
    movePositionDrawing,
    finishDrawing,
    confirmTextDrawing,
    completePolyline,
    removeLastPolylinePoint,
    cancelPending,
    updateDrawing,
    duplicateDrawing,
    removeDrawing,
    toolStyles,
    setToolStyle,
    setSmartKind,
    convertSelectedToSmart,
  } = useDrawings(symbol, timeframe);

  const projection = useMemo(
    () => createDrawingProjection(coordinates.timeToCoordinate, coordinates.priceToCoordinate),
    [coordinates.timeToCoordinate, coordinates.priceToCoordinate]
  );

  const resolveContextMenu = useCallback(
    (clientX: number, clientY: number): ChartMenuContext => {
      const el = overlayRootRef.current;
      const rect = el?.getBoundingClientRect();
      if (!rect) return { kind: "empty", price: null, time: null };
      const x = clientX - rect.left;
      const y = clientY - rect.top;
      const price = coordinates.coordinateToPrice?.(y) ?? null;
      const time = coordinates.coordinateToTime?.(x) ?? null;
      const { timeToX, priceToY } = projection;
      const d = hitTestForContextMenu(x, y, timeToX, priceToY);
      if (d) {
        selectDrawing(d.id);
        return { kind: "drawing", drawing: d, price, time };
      }
      return { kind: "empty", price, time };
    },
    [coordinates.coordinateToPrice, coordinates.coordinateToTime, hitTestForContextMenu, projection, selectDrawing]
  );

  useImperativeHandle(
    ref,
    () => ({
      resolveContextMenu,
      selectDrawing,
      duplicateDrawing,
      updateDrawing,
      removeDrawing,
      setActiveTool,
      openPositionEditor: (id: string) => {
        const d = drawings.find((x) => x.id === id) ?? null;
        selectDrawing(id);
        setActiveTool("select");
        if (d && isPositionDrawing(d)) setEditorOpenRequestId(id);
      },
    }),
    [resolveContextMenu, selectDrawing, duplicateDrawing, updateDrawing, removeDrawing, setActiveTool, drawings]
  );

  useEffect(() => {
    const h = (e: Event) => {
      const t = (e as CustomEvent<{ tool: DrawingTool }>).detail?.tool;
      if (t) setActiveTool(t);
    };
    window.addEventListener("gt-set-drawing-tool", h as EventListener);
    return () => window.removeEventListener("gt-set-drawing-tool", h as EventListener);
  }, [setActiveTool]);

  const selectedDrawing = selectedId ? drawings.find((d) => d.id === selectedId) : null;
  const showContextual = activeTool !== "select" || selectedDrawing != null;

  return (
    <>
      <div className="absolute left-2 top-1/2 -translate-y-1/2 z-[14] pointer-events-auto" title="Drawing tools">
        <DrawingsToolbar
          activeTool={activeTool}
          onToolChange={setActiveTool}
          onToolVariantSelect={(tool, style) => {
            setActiveTool(tool);
            if (style) setToolStyle(tool, style);
          }}
          onSmartVariantSelect={(smartKind, style) => {
            setActiveTool("rectangle");
            if (style) setToolStyle("rectangle", style);
            if (selectedDrawing && selectedDrawing.tool === "rectangle") {
              setSmartKind(selectedDrawing.id, smartKind);
            }
          }}
        />
      </div>

      {showContextual && (
        <div className="absolute left-14 top-1/2 -translate-y-1/2 z-[14] pointer-events-auto" title="Drawing style">
          {selectedDrawing ? (
            <DrawingsContextualBar
              drawing={selectedDrawing}
              toolStyle={toolStyles[activeTool]}
              onConvertToSmart={(smartKind) => convertSelectedToSmart(smartKind)}
              onToolStyleChange={(u) => setToolStyle(activeTool, u)}
              onUpdate={(u) => updateDrawing(selectedId!, u)}
              onDelete={removeSelected}
              onDeselect={() => selectDrawing(null)}
            />
          ) : (
            <DrawingsContextualBar
              drawing={null}
              toolStyle={toolStyles[activeTool]}
              onConvertToSmart={() => {}}
              onToolStyleChange={(u) => setToolStyle(activeTool, u)}
              onUpdate={() => {}}
              onDelete={() => {}}
              onDeselect={() => setActiveTool("select")}
            />
          )}
        </div>
      )}

      <DrawingsOverlay
        ref={overlayRootRef}
        editorOpenRequestId={editorOpenRequestId}
        chartWidth={chartWidth}
        chartHeight={chartHeight}
        viewportVersion={viewportVersion}
        coordinates={coordinates}
        drawingsState={{
          drawings,
          activeTool,
          setActiveTool,
          selectedId,
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
          updateDrawing,
          updatePositionLevels,
          movePositionDrawing,
          finishDrawing,
          confirmTextDrawing,
          completePolyline,
          removeLastPolylinePoint,
          cancelPending,
        }}
      />
    </>
  );
});
