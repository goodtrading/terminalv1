import { DrawingsToolbar } from "./DrawingsToolbar";
import { DrawingsContextualBar } from "./DrawingsContextualBar";
import { DrawingsOverlay } from "./DrawingsOverlay";
import { useDrawings } from "./useDrawings";

export interface DrawingsCoordinateHelpers {
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: number) => number | null;
  coordinateToPrice: (y: number) => number | null;
  coordinateToTime: (x: number) => number | null;
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
  } = useDrawings(symbol, timeframe);

  const isDrawMode = activeTool !== "select" || pendingDrawing != null;
  const selectedDrawing = selectedId ? drawings.find((d) => d.id === selectedId) : null;

  return (
    <>
      <div className="absolute left-2 bottom-10 z-[14] pointer-events-auto" title="Drawing tools">
        <DrawingsToolbar activeTool={activeTool} onToolChange={setActiveTool} isDrawMode={isDrawMode} />
      </div>

      {selectedDrawing && (
        <div className="absolute left-2 bottom-[4.5rem] z-[14] pointer-events-auto" title="Edit selected">
          <DrawingsContextualBar
            drawing={selectedDrawing}
            onUpdate={(u) => updateDrawing(selectedId!, u)}
            onDelete={removeSelected}
            onDeselect={() => selectDrawing(null)}
          />
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
