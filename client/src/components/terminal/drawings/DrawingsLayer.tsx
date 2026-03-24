import { DrawingsToolbar } from "./DrawingsToolbar";
import { DrawingsContextualBar } from "./DrawingsContextualBar";
import { DrawingsOverlay } from "./DrawingsOverlay";
import { useDrawings } from "./useDrawings";

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

interface DrawingsLayerProps {
  /** Time-scale plot width (not container width). All tools use this for coordinate mapping. */
  chartWidth: number;
  chartHeight: number;
  symbol: string;
  timeframe: string;
  viewportVersion?: number;
  coordinates: DrawingsCoordinateHelpers;
}

export function DrawingsLayer({
  chartWidth,
  chartHeight,
  symbol,
  timeframe,
  viewportVersion = 0,
  coordinates,
}: DrawingsLayerProps) {
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
    updateDrawing,
    toolStyles,
    setToolStyle,
    setSmartKind,
    convertSelectedToSmart,
  } = useDrawings(symbol, timeframe);

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
          finishDrawing,
          confirmTextDrawing,
          completePolyline,
          removeLastPolylinePoint,
          cancelPending,
        }}
      />
    </>
  );
}
