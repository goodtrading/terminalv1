import type { Drawing } from "./types";
import { drawDebug, getChartViewportVersion } from "./debug";
import { createDrawingProjection } from "./projection";

interface DrawingAnchorHandlesProps {
  drawing: Drawing;
  chartWidth: number;
  chartHeight: number;
  viewportVersion?: number;
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: number) => number | null;
  onAnchorMouseDown: (pointIndex: number, e: React.MouseEvent) => void;
}

/** Draggable anchor handles for selected drawing. pointer-events: auto. Slightly larger for reliable grab. */
const HANDLE_SIZE = 12;

export function DrawingAnchorHandles({
  drawing,
  chartWidth,
  chartHeight,
  viewportVersion = 0,
  priceToCoordinate,
  timeToCoordinate,
  onAnchorMouseDown,
}: DrawingAnchorHandlesProps) {
  if (drawing.locked || !drawing.selected) return null;
  const pts = drawing.points;
  if (!pts || pts.length === 0) return null;
  const { timeToX, priceToY } = createDrawingProjection(timeToCoordinate, priceToCoordinate);

  const handles: React.ReactNode[] = [];
  pts.forEach((pt, i) => {
    const x = timeToX(pt.time);
    const y = priceToY(pt.price);
    if (x == null || y == null) return;
    drawDebug("ANCHOR", {
      source: "DrawingAnchorHandles",
      drawingId: drawing.id,
      pointIndex: i,
      viewportVersion,
      chartViewportVersion: getChartViewportVersion(),
      x,
      y,
    });
    handles.push(
      <div
        key={`${drawing.id}-anchor-${i}`}
        className="absolute rounded-full cursor-move pointer-events-auto border-2 border-white bg-black/60"
        style={{
          left: x - HANDLE_SIZE / 2,
          top: y - HANDLE_SIZE / 2,
          width: HANDLE_SIZE,
          height: HANDLE_SIZE,
        }}
        onMouseDown={(e) => {
          e.stopPropagation();
          e.preventDefault();
          onAnchorMouseDown(i, e);
        }}
      />
    );
  });
  return <>{handles}</>;
}
