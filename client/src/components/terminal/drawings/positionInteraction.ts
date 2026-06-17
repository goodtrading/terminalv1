import type { Drawing } from "./types";
import { getPositionMetrics, isPositionDrawing } from "./positionUtils";

export const POSITION_HIT_TOL = 8;
export const POSITION_HANDLE_SIZE = 10;
export const POSITION_MIN_WIDTH_PX = 24;

/** Overlay anchor indices for position tools (>= 100). */
export const POSITION_ANCHOR = {
  entry: 100,
  stop: 101,
  target: 102,
  rightEdge: 103,
  leftEdge: 104,
} as const;

export type PositionBox = {
  left: number;
  right: number;
  top: number;
  bottom: number;
  midX: number;
  midY: number;
  entryY: number;
  targetY: number;
  stopY: number;
  width: number;
  height: number;
};

export function getPositionBox(
  drawing: Drawing,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null,
): PositionBox | null {
  if (!isPositionDrawing(drawing) || drawing.points.length < 2) return null;
  const metrics = getPositionMetrics(drawing);
  if (!metrics) return null;
  const x1 = timeToX(drawing.points[0].time);
  const x2 = timeToX(drawing.points[1].time);
  const entryY = priceToY(metrics.entry);
  const targetY = priceToY(metrics.target);
  const stopY = priceToY(metrics.stop);
  if (x1 == null || x2 == null || entryY == null || targetY == null || stopY == null) return null;

  const left = Math.min(x1, x2);
  const right = Math.max(x1, x2);
  const top = Math.min(targetY, stopY, entryY);
  const bottom = Math.max(targetY, stopY, entryY);
  const width = Math.max(0, right - left);
  const height = Math.max(0, bottom - top);

  return {
    left,
    right,
    top,
    bottom,
    midX: (left + right) / 2,
    midY: (top + bottom) / 2,
    entryY,
    targetY,
    stopY,
    width,
    height,
  };
}

function near(x: number, y: number, cx: number, cy: number, tol: number): boolean {
  return Math.abs(x - cx) <= tol && Math.abs(y - cy) <= tol;
}

function nearSegment(x: number, y: number, x1: number, y1: number, x2: number, y2: number, tol: number): boolean {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  let t = ((x - x1) * dx + (y - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const px = x1 + t * dx;
  const py = y1 + t * dy;
  return Math.hypot(x - px, y - py) <= tol;
}

/** Hit-test resize/move handles for a selected position drawing. */
export function hitTestPositionAnchor(
  x: number,
  y: number,
  drawing: Drawing,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null,
  threshold = POSITION_HIT_TOL,
): number | null {
  const box = getPositionBox(drawing, timeToX, priceToY);
  if (!box || box.width < 1) return null;
  const tol = threshold;

  // Corners (time + price edge) — optional quick resize
  if (near(x, y, box.left, box.targetY, tol)) return POSITION_ANCHOR.leftEdge;
  if (near(x, y, box.right, box.targetY, tol)) return POSITION_ANCHOR.rightEdge;
  if (near(x, y, box.left, box.stopY, tol)) return POSITION_ANCHOR.leftEdge;
  if (near(x, y, box.right, box.stopY, tol)) return POSITION_ANCHOR.rightEdge;

  // Horizontal edges (time resize)
  if (Math.abs(x - box.left) <= tol && y >= box.top - tol && y <= box.bottom + tol) {
    return POSITION_ANCHOR.leftEdge;
  }
  if (Math.abs(x - box.right) <= tol && y >= box.top - tol && y <= box.bottom + tol) {
    return POSITION_ANCHOR.rightEdge;
  }

  // Vertical price edges
  if (Math.abs(y - box.targetY) <= tol && x >= box.left - tol && x <= box.right + tol) {
    return POSITION_ANCHOR.target;
  }
  if (Math.abs(y - box.stopY) <= tol && x >= box.left - tol && x <= box.right + tol) {
    return POSITION_ANCHOR.stop;
  }
  if (nearSegment(x, y, box.left, box.entryY, box.right, box.entryY, tol)) {
    return POSITION_ANCHOR.entry;
  }

  // Center handles (fallback targets)
  if (near(x, y, box.midX, box.targetY, tol + 2)) return POSITION_ANCHOR.target;
  if (near(x, y, box.midX, box.stopY, tol + 2)) return POSITION_ANCHOR.stop;
  if (near(x, y, box.midX, box.entryY, tol + 2)) return POSITION_ANCHOR.entry;
  if (near(x, y, box.left, box.midY, tol + 2)) return POSITION_ANCHOR.leftEdge;
  if (near(x, y, box.right, box.midY, tol + 2)) return POSITION_ANCHOR.rightEdge;

  return null;
}

export function isPointInsidePositionBody(
  x: number,
  y: number,
  drawing: Drawing,
  timeToX: (t: number) => number | null,
  priceToY: (p: number) => number | null,
): boolean {
  const box = getPositionBox(drawing, timeToX, priceToY);
  if (!box) return false;
  return x >= box.left && x <= box.right && y >= box.top && y <= box.bottom;
}

export function cursorForPositionAnchor(pointIndex: number): string {
  switch (pointIndex) {
    case POSITION_ANCHOR.entry:
    case POSITION_ANCHOR.target:
    case POSITION_ANCHOR.stop:
      return "ns-resize";
    case POSITION_ANCHOR.leftEdge:
    case POSITION_ANCHOR.rightEdge:
      return "ew-resize";
    default:
      return "grab";
  }
}
