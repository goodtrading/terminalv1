import type { Drawing } from "./types";
import { drawDebug, getChartViewportVersion } from "./debug";
import { createDrawingProjection } from "./projection";
import { getPositionMetrics, isPositionDrawing } from "./positionUtils";

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
  if (isPositionDrawing(drawing) && drawing.points.length >= 2) {
    const metrics = getPositionMetrics(drawing);
    const x2 = timeToX(drawing.points[1].time);
    const x1 = timeToX(drawing.points[0].time);
    if (metrics && x2 != null) {
      const entryY = priceToY(metrics.entry);
      const stopY = priceToY(metrics.stop);
      const targetY = priceToY(metrics.target);
      [entryY, stopY, targetY].forEach((yy, i) => {
        if (yy == null) return;
        const cursor = i === 0 ? "ns-resize" : "ns-resize";
        handles.push(
          <div
            key={`${drawing.id}-pos-${i}`}
            className={`absolute rounded-full pointer-events-auto border-2 border-white bg-black/70 ${cursor}`}
            style={{
              left: x2 - HANDLE_SIZE / 2,
              top: yy - HANDLE_SIZE / 2,
              width: HANDLE_SIZE,
              height: HANDLE_SIZE,
            }}
            onMouseDown={(e) => {
              e.stopPropagation();
              e.preventDefault();
              // 0 entry / 1 stop / 2 target for overlay mapping
              onAnchorMouseDown(100 + i, e);
            }}
            onDoubleClick={(e) => {
              // Prevent bubbling to overlay-level editor open handler while resizing.
              e.stopPropagation();
              e.preventDefault();
            }}
          />
        );
      });
      if (x1 != null) {
        const yTop = priceToY(Math.max(metrics.entry, metrics.stop, metrics.target));
        const yBottom = priceToY(Math.min(metrics.entry, metrics.stop, metrics.target));
        if (yTop != null && yBottom != null) {
          const midY = (yTop + yBottom) / 2;
          handles.push(
            <div
              key={`${drawing.id}-pos-right-edge`}
              className="absolute rounded-sm pointer-events-auto border-2 border-white/90 bg-black/70 cursor-ew-resize"
              style={{
                left: x2 - 3,
                top: midY - 11,
                width: 6,
                height: 22,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onAnchorMouseDown(103, e);
              }}
              onDoubleClick={(e) => {
                e.stopPropagation();
                e.preventDefault();
              }}
            />
          );
        }
      }
    }
  }
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
        onDoubleClick={(e) => {
          e.stopPropagation();
          e.preventDefault();
        }}
      />
    );
  });
  return <>{handles}</>;
}
