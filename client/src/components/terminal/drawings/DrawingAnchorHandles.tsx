import type { Drawing } from "./types";
import { createDrawingProjection } from "./projection";
import { getPositionMetrics, isPositionDrawing } from "./positionUtils";
import {
  POSITION_ANCHOR,
  POSITION_HANDLE_SIZE,
  cursorForPositionAnchor,
  getPositionBox,
} from "./positionInteraction";

interface DrawingAnchorHandlesProps {
  drawing: Drawing;
  chartWidth: number;
  chartHeight: number;
  viewportVersion?: number;
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: number) => number | null;
  onAnchorMouseDown: (pointIndex: number, e: React.MouseEvent) => void;
}

const HANDLE = POSITION_HANDLE_SIZE;

function PositionHandle({
  left,
  top,
  cursor,
  pointIndex,
  onAnchorMouseDown,
  className = "border-2 border-white/90 bg-black/75",
}: {
  left: number;
  top: number;
  cursor: string;
  pointIndex: number;
  onAnchorMouseDown: (pointIndex: number, e: React.MouseEvent) => void;
  className?: string;
}) {
  return (
    <div
      className={`absolute rounded-sm pointer-events-auto ${className}`}
      style={{
        left: left - HANDLE / 2,
        top: top - HANDLE / 2,
        width: HANDLE,
        height: HANDLE,
        cursor,
      }}
      onMouseDown={(e) => {
        e.stopPropagation();
        e.preventDefault();
        onAnchorMouseDown(pointIndex, e);
      }}
      onDoubleClick={(e) => {
        e.stopPropagation();
        e.preventDefault();
      }}
    />
  );
}

export function DrawingAnchorHandles({
  drawing,
  priceToCoordinate,
  timeToCoordinate,
  onAnchorMouseDown,
}: DrawingAnchorHandlesProps) {
  if (drawing.locked || !drawing.selected) return null;
  const pts = drawing.points;
  if (!pts || pts.length === 0) return null;
  const { timeToX, priceToY } = createDrawingProjection(timeToCoordinate, priceToCoordinate);

  if (isPositionDrawing(drawing) && drawing.points.length >= 2) {
    const box = getPositionBox(drawing, timeToX, priceToY);
    if (!box) return null;

    const handles: Array<{ key: string; x: number; y: number; index: number; cursor: string; shape?: "bar" }> = [
      { key: "tl", x: box.left, y: box.targetY, index: POSITION_ANCHOR.leftEdge, cursor: "nwse-resize" },
      { key: "tr", x: box.right, y: box.targetY, index: POSITION_ANCHOR.rightEdge, cursor: "nesw-resize" },
      { key: "tc", x: box.midX, y: box.targetY, index: POSITION_ANCHOR.target, cursor: "ns-resize" },
      { key: "ml", x: box.left, y: box.midY, index: POSITION_ANCHOR.leftEdge, cursor: "ew-resize", shape: "bar" },
      { key: "mr", x: box.right, y: box.midY, index: POSITION_ANCHOR.rightEdge, cursor: "ew-resize", shape: "bar" },
      { key: "ec", x: box.midX, y: box.entryY, index: POSITION_ANCHOR.entry, cursor: "ns-resize" },
      { key: "bc", x: box.midX, y: box.stopY, index: POSITION_ANCHOR.stop, cursor: "ns-resize" },
      { key: "bl", x: box.left, y: box.stopY, index: POSITION_ANCHOR.leftEdge, cursor: "nesw-resize" },
      { key: "br", x: box.right, y: box.stopY, index: POSITION_ANCHOR.rightEdge, cursor: "nwse-resize" },
    ];

    return (
      <>
        {handles.map((h) =>
          h.shape === "bar" ? (
            <div
              key={`${drawing.id}-${h.key}`}
              className="absolute rounded-sm pointer-events-auto border border-white/80 bg-white/20 cursor-ew-resize"
              style={{
                left: h.x - 3,
                top: h.y - 12,
                width: 6,
                height: 24,
              }}
              onMouseDown={(e) => {
                e.stopPropagation();
                e.preventDefault();
                onAnchorMouseDown(h.index, e);
              }}
            />
          ) : (
            <PositionHandle
              key={`${drawing.id}-${h.key}`}
              left={h.x}
              top={h.y}
              cursor={h.cursor}
              pointIndex={h.index}
              onAnchorMouseDown={onAnchorMouseDown}
            />
          ),
        )}
      </>
    );
  }

  return (
    <>
      {pts.map((pt, i) => {
        const x = timeToX(pt.time);
        const y = priceToY(pt.price);
        if (x == null || y == null) return null;
        return (
          <PositionHandle
            key={`${drawing.id}-anchor-${i}`}
            left={x}
            top={y}
            cursor="move"
            pointIndex={i}
            onAnchorMouseDown={onAnchorMouseDown}
            className="rounded-full border-2 border-white bg-black/60"
          />
        );
      })}
    </>
  );
}

export { cursorForPositionAnchor, getPositionMetrics };
