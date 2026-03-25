/**
 * Persist drawings per symbol (absolute time + price — shared across chart timeframes).
 * Primary key: goodtrading:drawings:<symbol>
 * Migrates legacy keys goodtrading:drawings:<symbol>:<timeframe> (first non-empty wins).
 */

import type { Drawing, DrawingPoint } from "./types";
import { DEFAULT_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_OPACITY } from "./types";

const PREFIX = "goodtrading:drawings:";

const VALID_TOOLS = [
  "horizontalLine",
  "trendLine",
  "arrow",
  "rectangle",
  "text",
  "polyline",
  "longPosition",
  "shortPosition",
] as const;

function isValidDrawing(d: Drawing): boolean {
  if (!d || typeof d.id !== "string" || d.id.trim() === "") return false;
  if (!VALID_TOOLS.includes(d.tool as typeof VALID_TOOLS[number])) return false;
  if (!Array.isArray(d.points)) return false;
  const pts = d.points as DrawingPoint[];
  for (const p of pts) {
    if (typeof p.time !== "number" || typeof p.price !== "number") return false;
    if (!Number.isFinite(p.time) || !Number.isFinite(p.price)) return false;
  }
  if (d.tool === "horizontalLine" && pts.length !== 1) return false;
  if (d.tool === "text") {
    if (pts.length !== 1) return false;
    if (typeof d.text !== "string" || d.text.length === 0) return false;
  }
  if (
    (d.tool === "trendLine" ||
      d.tool === "arrow" ||
      d.tool === "rectangle" ||
      d.tool === "longPosition" ||
      d.tool === "shortPosition") &&
    pts.length !== 2
  )
    return false;
  if (d.tool === "polyline" && (pts.length < 2 || pts.length > 10)) return false;
  return true;
}

interface LegacyDrawing {
  id?: string;
  tool?: string;
  price?: number;
  startTime?: number;
  startPrice?: number;
  endTime?: number;
  endPrice?: number;
  time?: number;
  color?: string;
  lineWidth?: number;
  fillOpacity?: number;
  locked?: boolean;
  text?: string;
  createdAt?: number;
}

function migrateLegacy(raw: LegacyDrawing): Drawing | null {
  if (!raw || typeof raw !== "object" || !raw.tool) return null;
  const tool = String(raw.tool);
  const id = typeof raw.id === "string" ? raw.id : crypto.randomUUID();
  const color = raw.color ?? DEFAULT_COLOR;
  const lineWidth = typeof raw.lineWidth === "number" ? raw.lineWidth : DEFAULT_LINE_WIDTH;
  const opacity = DEFAULT_OPACITY;
  const locked = Boolean(raw.locked);
  const createdAt = typeof raw.createdAt === "number" ? raw.createdAt : Date.now();

  const pts: DrawingPoint[] = [];

  if (tool === "horizontalLine" && typeof raw.price === "number") {
    pts.push({ time: 0, price: raw.price });
  } else if (tool === "text" && typeof raw.time === "number" && typeof raw.price === "number") {
    pts.push({ time: raw.time, price: raw.price });
  } else if (
    (tool === "trendLine" || tool === "ray" || tool === "arrow") &&
    typeof raw.startTime === "number" &&
    typeof raw.startPrice === "number"
  ) {
    pts.push({ time: raw.startTime, price: raw.startPrice });
    pts.push({
      time: typeof raw.endTime === "number" ? raw.endTime : raw.startTime,
      price: typeof raw.endPrice === "number" ? raw.endPrice : raw.startPrice,
    });
  } else if (
    tool === "rectangle" &&
    typeof raw.startTime === "number" &&
    typeof raw.startPrice === "number"
  ) {
    pts.push({ time: raw.startTime, price: raw.startPrice });
    pts.push({
      time: typeof raw.endTime === "number" ? raw.endTime : raw.startTime,
      price: typeof raw.endPrice === "number" ? raw.endPrice : raw.startPrice,
    });
  } else {
    return null;
  }

  const normalized: Drawing = {
    id,
    tool: tool === "ray" ? "arrow" : (tool as Drawing["tool"]),
    points: pts,
    color,
    opacity,
    lineWidth,
    locked,
    selected: false,
    createdAt,
  };
  if (tool === "text" && typeof raw.text === "string") {
    normalized.text = raw.text;
  }
  return normalized;
}

function normalizeDrawing(d: unknown): Drawing | null {
  if (!d || typeof d !== "object") return null;
  const obj = d as Record<string, unknown>;
  const tool = obj.tool;
  if (typeof tool !== "string") return null;

  if (Array.isArray(obj.points) && obj.points.length > 0) {
    const points = obj.points
      .filter((p: unknown) => p && typeof p === "object" && typeof (p as any).time === "number" && typeof (p as any).price === "number")
      .map((p: any) => ({ time: p.time, price: p.price }));
    if (points.length === 0) return null;
    const out = {
      id: typeof obj.id === "string" ? obj.id : crypto.randomUUID(),
      tool: tool as Drawing["tool"],
      points,
      color: typeof obj.color === "string" ? obj.color : DEFAULT_COLOR,
      opacity: typeof obj.opacity === "number" ? Math.min(1, Math.max(0, obj.opacity)) : DEFAULT_OPACITY,
      lineWidth: typeof obj.lineWidth === "number" ? obj.lineWidth : DEFAULT_LINE_WIDTH,
      locked: Boolean(obj.locked),
      selected: false,
      createdAt: typeof obj.createdAt === "number" ? obj.createdAt : Date.now(),
      text: typeof obj.text === "string" ? obj.text : undefined,
    } as Drawing;
    if (out.tool === "text" && out.text === undefined) out.text = "Label";
    return out;
  }

  return migrateLegacy(obj as LegacyDrawing);
}

function storageKeySymbol(symbol: string): string {
  return `${PREFIX}${symbol}`;
}

/** @deprecated timeframe ignored — kept for call-site compatibility */
export function loadDrawings(symbol: string, _timeframe?: string): Drawing[] {
  try {
    const symKey = storageKeySymbol(symbol);
    let raw = localStorage.getItem(symKey);
    if (!raw) {
      const legacy = localStorage.getItem(`${PREFIX}${symbol}:15m`);
      if (legacy) {
        raw = legacy;
        try {
          localStorage.setItem(symKey, legacy);
        } catch {
          /* ignore */
        }
      }
    }
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    if (!Array.isArray(parsed)) return [];
    const result: Drawing[] = [];
    for (const item of parsed) {
      const d = normalizeDrawing(item);
      if (!d) continue;
      if (!isValidDrawing(d)) continue;
      if (d.tool === "text" && d.text === "asas") continue;
      result.push(d);
    }
    return result;
  } catch {
    return [];
  }
}

/** @deprecated timeframe ignored */
export function saveDrawings(symbol: string, _timeframe: string | undefined, drawings: Drawing[]): void {
  try {
    localStorage.setItem(storageKeySymbol(symbol), JSON.stringify(drawings));
  } catch (e) {
    console.warn("[Drawings] Failed to save:", e);
  }
}
