/**
 * Drawing tools - chart coordinates (time, price), not pixels.
 * Unified points-based model. Survives zoom, pan, resize.
 */

export type DrawingTool =
  | "select"
  | "horizontalLine"
  | "trendLine"
  | "arrow"
  | "rectangle"
  | "text"
  | "polyline"
  | "longPosition"
  | "shortPosition";

export type SmartToolKind = "gammaZone" | "liquidityZone" | "sweep" | "magnet";

export interface DrawingPoint {
  time: number;
  price: number;
}

export interface BaseDrawing {
  id: string;
  tool: DrawingTool;
  smartKind?: SmartToolKind;
  points: DrawingPoint[];
  color: string;
  opacity: number;
  lineWidth: number;
  locked: boolean;
  selected?: boolean;
  createdAt: number;
  text?: string;
  entryPrice?: number;
  stopPrice?: number;
  targetPrice?: number;
  accountSize?: number;
  riskPercent?: number;
  leverage?: number;
  quantity?: number;
  showLabels?: boolean;
  labelPrecision?: number;
  targetColor?: string;
  stopColor?: string;
}

export type Drawing = BaseDrawing;

/** Helper: get point count for tool */
export function getToolPointCount(tool: DrawingTool): number | { min: number; max: number } {
  switch (tool) {
    case "horizontalLine":
    case "text":
      return 1;
    case "trendLine":
    case "arrow":
    case "rectangle":
      return 2;
    case "polyline":
      return { min: 2, max: 10 };
    case "longPosition":
    case "shortPosition":
      return 2;
    default:
      return 0;
  }
}

/** Helper: get first point */
export function getFirstPoint(d: Drawing): DrawingPoint | null {
  return d.points[0] ?? null;
}

/** Helper: get second point */
export function getSecondPoint(d: Drawing): DrawingPoint | null {
  return d.points[1] ?? null;
}

/** Helper: horizontal line price */
export function getHorizontalLinePrice(d: Drawing): number | null {
  if (d.tool !== "horizontalLine") return null;
  return d.points[0]?.price ?? null;
}

export const DRAWING_COLORS = [
  "#ef4444", // red
  "#22c55e", // green
  "#3b82f6", // blue
  "#eab308", // yellow
  "#a855f7", // purple
  "#f97316", // orange
  "#ffffff", // white
  "#9ca3af", // gray
] as const;

export const DEFAULT_COLOR = DRAWING_COLORS[0];
export const DEFAULT_LINE_WIDTH = 2;
export const DEFAULT_OPACITY = 0.9;
export const LINE_WIDTHS = [1, 2, 3, 4, 5] as const;
export const OPACITY_PRESETS = [0.3, 0.5, 0.7, 0.9, 1] as const;
