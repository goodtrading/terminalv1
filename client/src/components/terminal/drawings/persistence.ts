/**
 * Persist drawings and drawing UI settings per user + symbol.
 * Keys:
 * - goodtrading:drawings:v2:{userId}:{symbol}
 * - goodtrading:drawing-settings:v2:{userId} (see lib/drawingPersistence.ts)
 */

import type { Drawing, DrawingPoint, DrawingTool } from "./types";
import { DEFAULT_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_OPACITY } from "./types";
import {
  getDrawingSettingsStorageKey,
  loadDrawingSettingsV2,
  normalizeFillOpacity,
  normalizeHexColor,
  saveDrawingSettingsV2,
  type DrawingUserSettingsV2,
} from "@/lib/drawingPersistence";

const DRAWINGS_V2_PREFIX = "goodtrading:drawings:v2:";
const DRAWINGS_V1_PREFIX = "goodtrading:drawings:v1:";
const SETTINGS_V1_PREFIX = "goodtrading:drawing-settings:v1:";
const LEGACY_PREFIX = "goodtrading:drawings:";

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

export type { DrawingUserSettingsV2 as DrawingUserSettings } from "@/lib/drawingPersistence";
export {
  getStableDrawingUserKey,
  resolveDrawingUserScope,
  loadDrawingSettingsV2 as loadDrawingSettings,
  saveDrawingSettingsV2 as saveDrawingSettings,
  getDrawingSettingsStorageKey,
  clearDrawingSettingsV2ForDev,
} from "@/lib/drawingPersistence";

export function getDrawingUserScope(userId: number | string | null | undefined): string {
  if (userId == null || userId === "") return "guest";
  return String(userId);
}

function drawingsKeyV2(userScope: string, symbol: string): string {
  return `${DRAWINGS_V2_PREFIX}${userScope}:${symbol}`;
}

function drawingsKeyV1(userScope: string, symbol: string): string {
  return `${DRAWINGS_V1_PREFIX}${userScope}:${symbol}`;
}

function isValidDrawing(d: Drawing): boolean {
  if (!d || typeof d.id !== "string" || d.id.trim() === "") return false;
  if (!VALID_TOOLS.includes(d.tool as (typeof VALID_TOOLS)[number])) return false;
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
  locked?: boolean;
  text?: string;
  createdAt?: number;
}

function applyPositionFields(out: Drawing, obj: Record<string, unknown>): void {
  if (obj.tool !== "longPosition" && obj.tool !== "shortPosition") return;
  const num = (k: string) =>
    typeof obj[k] === "number" && Number.isFinite(obj[k] as number) ? (obj[k] as number) : undefined;
  const entryPrice = num("entryPrice");
  const targetPrice = num("targetPrice");
  const stopPrice = num("stopPrice");
  if (entryPrice != null) out.entryPrice = entryPrice;
  if (targetPrice != null) out.targetPrice = targetPrice;
  if (stopPrice != null) out.stopPrice = stopPrice;
  if (typeof obj.targetColor === "string") {
    out.targetColor = normalizeHexColor(obj.targetColor, "#22c55e");
  }
  if (typeof obj.stopColor === "string") {
    out.stopColor = normalizeHexColor(obj.stopColor, "#ef4444");
  }
  if (typeof obj.targetOpacity === "number") out.targetOpacity = normalizeFillOpacity(obj.targetOpacity);
  if (typeof obj.stopOpacity === "number") out.stopOpacity = normalizeFillOpacity(obj.stopOpacity);
  if (typeof obj.opacity === "number") {
    out.opacity = normalizeFillOpacity(obj.opacity);
    if (out.targetOpacity == null) out.targetOpacity = out.opacity;
    if (out.stopOpacity == null) out.stopOpacity = out.opacity;
  }
  if (typeof obj.showLabels === "boolean") out.showLabels = obj.showLabels;
  if (typeof obj.labelPrecision === "number") out.labelPrecision = obj.labelPrecision;
  if (typeof obj.accountSize === "number") out.accountSize = obj.accountSize;
  if (typeof obj.riskPercent === "number") out.riskPercent = obj.riskPercent;
  if (typeof obj.leverage === "number") out.leverage = obj.leverage;
  if (typeof obj.quantity === "number") out.quantity = obj.quantity;
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
      .filter(
        (p: unknown) =>
          p &&
          typeof p === "object" &&
          typeof (p as { time?: unknown }).time === "number" &&
          typeof (p as { price?: unknown }).price === "number",
      )
      .map((p) => ({ time: (p as DrawingPoint).time, price: (p as DrawingPoint).price }));
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
    applyPositionFields(out, obj);
    return out;
  }

  return migrateLegacy(obj as LegacyDrawing);
}

function parseDrawingsRaw(raw: string | null): Drawing[] {
  if (!raw) return [];
  try {
    const parsed = JSON.parse(raw) as unknown;
    const list = Array.isArray(parsed) ? parsed : (parsed as { drawings?: unknown[] })?.drawings;
    if (!Array.isArray(list)) return [];
    const result: Drawing[] = [];
    for (const item of list) {
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

function loadLegacySymbolDrawings(symbol: string): Drawing[] {
  try {
    let raw = localStorage.getItem(`${LEGACY_PREFIX}${symbol}`);
    if (!raw) raw = localStorage.getItem(`${LEGACY_PREFIX}${symbol}:15m`);
    return parseDrawingsRaw(raw);
  } catch {
    return [];
  }
}

export function loadDrawings(
  symbol: string,
  userScope: string = "guest",
  _timeframe?: string,
): Drawing[] {
  try {
    const keyV2 = drawingsKeyV2(userScope, symbol);
    let result = parseDrawingsRaw(localStorage.getItem(keyV2));
    if (result.length === 0) {
      const v1Raw = localStorage.getItem(drawingsKeyV1(userScope, symbol));
      result = parseDrawingsRaw(v1Raw);
      if (result.length > 0) {
        try {
          localStorage.setItem(keyV2, JSON.stringify(result));
        } catch {
          /* ignore */
        }
      }
    }
    if (result.length === 0 && userScope !== "guest") {
      const legacy = loadLegacySymbolDrawings(symbol);
      if (legacy.length > 0) {
        result = legacy;
        try {
          localStorage.setItem(keyV2, JSON.stringify(legacy));
        } catch {
          /* ignore */
        }
      }
    }
    if (result.length === 0 && userScope === "guest") {
      result = loadLegacySymbolDrawings(symbol);
    }
    return result;
  } catch {
    return [];
  }
}

export function saveDrawings(
  symbol: string,
  userScope: string,
  _timeframe: string | undefined,
  drawings: Drawing[],
): void {
  try {
    const payload = drawings.map((d) => ({ ...d, selected: false }));
    localStorage.setItem(drawingsKeyV2(userScope, symbol), JSON.stringify(payload));
  } catch (e) {
    console.warn("[Drawings] Failed to save:", e);
  }
}

export function getDrawingToolbarStorageKey(userScope: string): string {
  return `${SETTINGS_V1_PREFIX}${userScope}:toolbar-pos`;
}
