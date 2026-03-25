import { useState, useCallback, useEffect } from "react";
import type { Drawing, DrawingPoint, DrawingTool, SmartToolKind } from "./types";
import { DEFAULT_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_OPACITY, getToolPointCount } from "./types";
import { loadDrawings, saveDrawings } from "./persistence";
import { getChartSettings } from "../chart/chartSettingsStore";
import { getPositionMetrics, isPositionDrawing, nextPositionLevels } from "./positionUtils";

const MAX_POLYLINE_POINTS = 10;
const HIT_THRESHOLD = 10;
const ANCHOR_HIT_THRESHOLD = 12;

const SMART_STYLES: Record<SmartToolKind, { color: string; lineWidth: number; opacity: number }> = {
  gammaZone: { color: "#f97316", lineWidth: 2, opacity: 0.45 },
  liquidityZone: { color: "#ef4444", lineWidth: 2, opacity: 0.6 },
  sweep: { color: "#22c55e", lineWidth: 2, opacity: 0.55 },
  magnet: { color: "#9ca3af", lineWidth: 1, opacity: 0.4 },
};

function isValidNumber(v: unknown): v is number {
  return typeof v === "number" && Number.isFinite(v);
}

function sanitizePoint(pt: DrawingPoint | null | undefined): DrawingPoint | null {
  if (!pt) return null;
  if (!isValidNumber(pt.time) || !isValidNumber(pt.price)) return null;
  return { time: pt.time, price: pt.price };
}

function sanitizeDrawing(d: Drawing): Drawing | null {
  if (!d || typeof d.id !== "string" || !d.id || typeof d.tool !== "string") return null;
  const points = (d.points ?? []).map((pt) => sanitizePoint(pt)).filter((pt): pt is DrawingPoint => pt != null);
  if (points.length === 0) return null;
  return { ...d, points };
}

function sanitizeDrawings(list: Drawing[]): Drawing[] {
  return list.map((d) => sanitizeDrawing(d)).filter((d): d is Drawing => d != null);
}

export function useDrawings(symbol: string, _timeframe?: string) {
  const [drawings, setDrawings] = useState<Drawing[]>(() => sanitizeDrawings(loadDrawings(symbol)));
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDrawing, setPendingDrawing] = useState<Drawing | null>(null);
  const [draggingAnchor, setDraggingAnchor] = useState<{ id: string; pointIndex: number } | null>(null);
  const [toolStyles, setToolStyles] = useState<Record<DrawingTool, { color: string; lineWidth: number; opacity: number }>>({
    select: { color: DEFAULT_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY },
    horizontalLine: { color: "#ffffff", lineWidth: 1, opacity: 1 },
    trendLine: { color: "#ffffff", lineWidth: 1, opacity: 1 },
    arrow: { color: "#ffffff", lineWidth: 2, opacity: 1 },
    rectangle: { color: DEFAULT_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY },
    text: { color: "#ffffff", lineWidth: 1, opacity: 1 },
    polyline: { color: "#ffffff", lineWidth: 2, opacity: 1 },
    longPosition: { color: "#22c55e", lineWidth: 1, opacity: 0.9 },
    shortPosition: { color: "#ef4444", lineWidth: 1, opacity: 0.9 },
  });

  useEffect(() => {
    const onDrawingDefaults = () => {
      const ds = getChartSettings().drawings;
      setToolStyles((prev) => {
        const next = { ...prev };
        (Object.keys(next) as DrawingTool[]).forEach((t) => {
          if (t === "select") return;
          next[t] = {
            ...next[t],
            color: ds.defaultColor,
            lineWidth: ds.defaultLineWidth,
            opacity: ds.defaultOpacity,
          };
        });
        return next;
      });
    };
    window.addEventListener("gt-chart-drawings-defaults", onDrawingDefaults);
    return () => window.removeEventListener("gt-chart-drawings-defaults", onDrawingDefaults);
  }, []);

  useEffect(() => {
    setDrawings(sanitizeDrawings(loadDrawings(symbol)));
  }, [symbol]);

  useEffect(() => {
    const clean = sanitizeDrawings(drawings);
    if (clean.length !== drawings.length) {
      setDrawings(clean);
      return;
    }
    saveDrawings(symbol, _timeframe, clean);
  }, [drawings, symbol, _timeframe]);

  const addDrawing = useCallback((d: Omit<Drawing, "id" | "createdAt">) => {
    const full: Drawing = {
      ...d,
      id: crypto.randomUUID(),
      createdAt: Date.now(),
    };
    const clean = sanitizeDrawing(full);
    if (!clean) return null;
    setDrawings((prev) => [...prev, clean]);
    setPendingDrawing(null);
    return clean.id;
  }, []);

  const updateDrawing = useCallback((id: string, updates: Partial<Drawing>) => {
    setDrawings((prev) =>
      prev
        .map((d) => (d.id === id ? ({ ...d, ...updates } as Drawing) : d))
        .map((d) => sanitizeDrawing(d))
        .filter((d): d is Drawing => d != null)
    );
  }, []);

  const duplicateDrawing = useCallback(
    (id: string) => {
      const d = drawings.find((x) => x.id === id);
      if (!d) return;
      addDrawing({
        tool: d.tool,
        points: d.points.map((p) => ({ ...p })),
        color: d.color,
        opacity: d.opacity,
        lineWidth: d.lineWidth,
        locked: false,
        selected: false,
        text: d.text,
        smartKind: d.smartKind,
      });
    },
    [drawings, addDrawing]
  );

  const updatePoint = useCallback((id: string, pointIndex: number, pt: DrawingPoint) => {
    setDrawings((prev) =>
      prev
        .map((d) => {
          if (d.id !== id) return d;
          const next = [...d.points];
          if (pointIndex >= 0 && pointIndex < next.length) {
            next[pointIndex] = pt;
            return { ...d, points: next };
          }
          return d;
        })
        .map((d) => sanitizeDrawing(d))
        .filter((d): d is Drawing => d != null)
    );
  }, []);

  const removeDrawing = useCallback((id: string) => {
    setDrawings((prev) => prev.filter((d) => d.id !== id));
    if (selectedId === id) setSelectedId(null);
  }, [selectedId]);

  const removeSelected = useCallback(() => {
    if (selectedId) {
      removeDrawing(selectedId);
      setSelectedId(null);
    }
  }, [selectedId, removeDrawing]);

  const undoLast = useCallback(() => {
    setDrawings((prev) => {
      if (prev.length === 0) return prev;
      return prev.slice(0, -1);
    });
    setSelectedId(null);
  }, []);

  const clearAll = useCallback(() => {
    setDrawings([]);
    setSelectedId(null);
    setPendingDrawing(null);
    setDraggingAnchor(null);
  }, []);

  const selectDrawing = useCallback((id: string | null) => {
    setDrawings((prev) =>
      prev.map((d) => ({ ...d, selected: d.id === id }))
    );
    setSelectedId(id);
  }, []);

  /** Hit-test including locked drawings (context menu / inspect). */
  const hitTestForContextMenu = useCallback(
    (x: number, y: number, timeToX: (t: number) => number | null, priceToY: (p: number) => number | null): Drawing | null => {
      const threshold = HIT_THRESHOLD;
      for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        for (const pt of d.points) {
          const dx = timeToX(pt.time);
          const dy = priceToY(pt.price);
          if (dx != null && dy != null && Math.abs(x - dx) <= threshold && Math.abs(y - dy) <= threshold)
            return d;
        }
        if (d.tool === "horizontalLine" && d.points[0]) {
          const lineY = priceToY(d.points[0].price);
          if (lineY != null && Math.abs(y - lineY) <= threshold) return d;
        }
        if (d.tool === "rectangle" && d.points.length >= 2) {
          const x1 = timeToX(d.points[0].time);
          const y1 = priceToY(d.points[0].price);
          const x2 = timeToX(d.points[1].time);
          const y2 = priceToY(d.points[1].price);
          if (x1 != null && y1 != null && x2 != null && y2 != null) {
            const left = Math.min(x1, x2) - threshold;
            const right = Math.max(x1, x2) + threshold;
            const top = Math.min(y1, y2) - threshold;
            const bottom = Math.max(y1, y2) + threshold;
            if (x >= left && x <= right && y >= top && y <= bottom) return d;
          }
        }
        if (d.tool === "polyline" && d.points.length >= 2) {
          for (let j = 0; j < d.points.length - 1; j++) {
            const p1 = d.points[j];
            const p2 = d.points[j + 1];
            const x1 = timeToX(p1.time);
            const y1 = priceToY(p1.price);
            const x2 = timeToX(p2.time);
            const y2 = priceToY(p2.price);
            if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
            const dist = distanceToSegment(x, y, x1, y1, x2, y2);
            if (dist <= threshold) return d;
          }
        }
        if (isPositionDrawing(d) && d.points.length >= 2) {
          const m = getPositionMetrics(d);
          const x1 = timeToX(d.points[0].time);
          const x2 = timeToX(d.points[1].time);
          if (!m || x1 == null || x2 == null) continue;
          const yTopV = Math.max(m.entry, m.stop, m.target);
          const yBottomV = Math.min(m.entry, m.stop, m.target);
          const yTop = priceToY(yTopV);
          const yBottom = priceToY(yBottomV);
          if (yTop == null || yBottom == null) continue;
          const left = Math.min(x1, x2) - threshold;
          const right = Math.max(x1, x2) + threshold;
          const top = Math.min(yTop, yBottom) - threshold;
          const bottom = Math.max(yTop, yBottom) + threshold;
          if (x >= left && x <= right && y >= top && y <= bottom) return d;
        }
      }
      return null;
    },
    [drawings]
  );

  const hitTest = useCallback(
    (x: number, y: number, timeToX: (t: number) => number | null, priceToY: (p: number) => number | null): Drawing | null => {
      const threshold = HIT_THRESHOLD;
      for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        if (d.locked) continue;
        for (const pt of d.points) {
          const dx = timeToX(pt.time);
          const dy = priceToY(pt.price);
          if (dx != null && dy != null && Math.abs(x - dx) <= threshold && Math.abs(y - dy) <= threshold)
            return d;
        }
        if (d.tool === "horizontalLine" && d.points[0]) {
          const lineY = priceToY(d.points[0].price);
          if (lineY != null && Math.abs(y - lineY) <= threshold) return d;
        }
        if (d.tool === "rectangle" && d.points.length >= 2) {
          const x1 = timeToX(d.points[0].time);
          const y1 = priceToY(d.points[0].price);
          const x2 = timeToX(d.points[1].time);
          const y2 = priceToY(d.points[1].price);
          if (x1 != null && y1 != null && x2 != null && y2 != null) {
            const left = Math.min(x1, x2) - threshold;
            const right = Math.max(x1, x2) + threshold;
            const top = Math.min(y1, y2) - threshold;
            const bottom = Math.max(y1, y2) + threshold;
            if (x >= left && x <= right && y >= top && y <= bottom) return d;
          }
        }
        if (d.tool === "polyline" && d.points.length >= 2) {
          for (let j = 0; j < d.points.length - 1; j++) {
            const p1 = d.points[j];
            const p2 = d.points[j + 1];
            const x1 = timeToX(p1.time);
            const y1 = priceToY(p1.price);
            const x2 = timeToX(p2.time);
            const y2 = priceToY(p2.price);
            if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
            const dist = distanceToSegment(x, y, x1, y1, x2, y2);
            if (dist <= threshold) return d;
          }
        }
        if (isPositionDrawing(d) && d.points.length >= 2) {
          const m = getPositionMetrics(d);
          const x1 = timeToX(d.points[0].time);
          const x2 = timeToX(d.points[1].time);
          if (!m || x1 == null || x2 == null) continue;
          const yTopV = Math.max(m.entry, m.stop, m.target);
          const yBottomV = Math.min(m.entry, m.stop, m.target);
          const yTop = priceToY(yTopV);
          const yBottom = priceToY(yBottomV);
          if (yTop == null || yBottom == null) continue;
          const left = Math.min(x1, x2) - threshold;
          const right = Math.max(x1, x2) + threshold;
          const top = Math.min(yTop, yBottom) - threshold;
          const bottom = Math.max(yTop, yBottom) + threshold;
          if (x >= left && x <= right && y >= top && y <= bottom) return d;
        }
      }
      return null;
    },
    [drawings]
  );

  const hitTestAnchor = useCallback(
    (x: number, y: number, timeToX: (t: number) => number | null, priceToY: (p: number) => number | null): { drawing: Drawing; pointIndex: number } | null => {
      const threshold = ANCHOR_HIT_THRESHOLD;
      for (let i = drawings.length - 1; i >= 0; i--) {
        const d = drawings[i];
        if (d.locked || !d.selected) continue;
        for (let j = 0; j < d.points.length; j++) {
          const pt = d.points[j];
          const dx = timeToX(pt.time);
          const dy = priceToY(pt.price);
          if (dx != null && dy != null && Math.abs(x - dx) <= threshold && Math.abs(y - dy) <= threshold)
            return { drawing: d, pointIndex: j };
        }
        if (isPositionDrawing(d) && d.points.length >= 2) {
          const m = getPositionMetrics(d);
          const x1 = timeToX(d.points[0].time);
          const x2 = timeToX(d.points[1].time);
          if (!m || x2 == null) continue;
          const entryY = priceToY(m.entry);
          const stopY = priceToY(m.stop);
          const targetY = priceToY(m.target);
          const anchors: Array<number | null> = [entryY, stopY, targetY];
          for (let k = 0; k < anchors.length; k++) {
            const ay = anchors[k];
            if (ay == null) continue;
            if (Math.abs(x - x2) <= threshold && Math.abs(y - ay) <= threshold) {
              return { drawing: d, pointIndex: 100 + k };
            }
          }
          if (x1 != null) {
            const yTop = priceToY(Math.max(m.entry, m.stop, m.target));
            const yBottom = priceToY(Math.min(m.entry, m.stop, m.target));
            if (yTop != null && yBottom != null) {
              const midY = (yTop + yBottom) / 2;
              if (Math.abs(x - x2) <= threshold && Math.abs(y - midY) <= Math.max(threshold, 14)) {
                return { drawing: d, pointIndex: 103 };
              }
            }
          }
        }
      }
      return null;
    },
    [drawings]
  );

  const startDrawing = useCallback(
    (time: number, price: number) => {
      if (activeTool === "select") return;
      const toolStyle = toolStyles[activeTool] ?? { color: DEFAULT_COLOR, lineWidth: DEFAULT_LINE_WIDTH, opacity: DEFAULT_OPACITY };
      const base: Partial<Drawing> = {
        color: toolStyle.color,
        opacity: toolStyle.opacity,
        lineWidth: toolStyle.lineWidth,
        locked: false,
        selected: false,
        points: [],
      };
      const pt: DrawingPoint = { time, price };
      if (activeTool === "horizontalLine") {
        addDrawing({ ...base, tool: "horizontalLine", points: [pt] } as Drawing);
        setActiveTool("select");
      } else if (activeTool === "text") {
        setPendingDrawing({ ...base, tool: "text", points: [pt], text: "" } as Drawing);
      } else if (activeTool === "trendLine" || activeTool === "arrow" || activeTool === "rectangle") {
        setPendingDrawing({
          ...base,
          tool: activeTool,
          points: [pt, { ...pt }],
        } as Drawing);
      } else if (activeTool === "longPosition" || activeTool === "shortPosition") {
        const levels = nextPositionLevels(activeTool, price, price);
        setPendingDrawing({
          ...base,
          tool: activeTool,
          points: [pt, { ...pt }],
          entryPrice: price,
          targetPrice: levels.targetPrice,
          stopPrice: levels.stopPrice,
          showLabels: true,
          labelPrecision: 2,
          targetColor: activeTool === "longPosition" ? "#22c55e" : "#22c55e",
          stopColor: activeTool === "longPosition" ? "#ef4444" : "#ef4444",
          accountSize: 10000,
          riskPercent: 1,
          leverage: 1,
        } as Drawing);
      } else if (activeTool === "polyline") {
        setPendingDrawing({
          ...base,
          tool: "polyline",
          points: [pt],
        } as Drawing);
      }
    },
    [activeTool, addDrawing, toolStyles]
  );

  const setToolStyle = useCallback((tool: DrawingTool, updates: Partial<{ color: string; lineWidth: number; opacity: number }>) => {
    setToolStyles((prev) => ({
      ...prev,
      [tool]: { ...prev[tool], ...updates },
    }));
  }, []);

  const setSmartKind = useCallback((id: string, smartKind: SmartToolKind | undefined) => {
    setDrawings((prev) =>
      prev.map((d) => {
        if (d.id !== id) return d;
        if (!smartKind) return { ...d, smartKind: undefined };
        const style = SMART_STYLES[smartKind];
        return {
          ...d,
          smartKind,
          color: style.color,
          lineWidth: style.lineWidth,
          opacity: style.opacity,
        };
      })
    );
  }, []);

  const convertSelectedToSmart = useCallback(
    (smartKind: SmartToolKind) => {
      if (!selectedId) return;
      setSmartKind(selectedId, smartKind);
    },
    [selectedId, setSmartKind]
  );

  const addPolylinePoint = useCallback(
    (time: number, price: number) => {
      if (!pendingDrawing || pendingDrawing.tool !== "polyline") return;
      const prev = pendingDrawing.points;
      const last = prev[prev.length - 1];
      if (last && last.time === time && last.price === price) return;
      const pts = [...prev, { time, price }];
      if (pts.length >= MAX_POLYLINE_POINTS) {
        addDrawing({ ...pendingDrawing, points: pts });
        setPendingDrawing(null);
        setActiveTool("select");
      } else {
        setPendingDrawing({ ...pendingDrawing, points: pts });
      }
    },
    [pendingDrawing, addDrawing]
  );

  const updatePendingEnd = useCallback(
    (time: number, price: number) => {
      if (!pendingDrawing) return;
      const pts = [...pendingDrawing.points];
      if (
        pts.length >= 2 &&
        (pendingDrawing.tool === "trendLine" ||
          pendingDrawing.tool === "arrow" ||
          pendingDrawing.tool === "rectangle" ||
          pendingDrawing.tool === "longPosition" ||
          pendingDrawing.tool === "shortPosition")
      ) {
        pts[1] = { time, price };
        if (pendingDrawing.tool === "longPosition" || pendingDrawing.tool === "shortPosition") {
          const levels = nextPositionLevels(pendingDrawing.tool, pendingDrawing.entryPrice ?? pts[0].price, price);
          setPendingDrawing({ ...pendingDrawing, points: pts, ...levels });
        } else {
          setPendingDrawing({ ...pendingDrawing, points: pts });
        }
      }
    },
    [pendingDrawing]
  );

  const finishDrawing = useCallback(
    (time?: number, price?: number) => {
      if (!pendingDrawing) return;
      if (
        pendingDrawing.tool === "trendLine" ||
        pendingDrawing.tool === "arrow" ||
        pendingDrawing.tool === "rectangle" ||
        pendingDrawing.tool === "longPosition" ||
        pendingDrawing.tool === "shortPosition"
      ) {
        const pts = [...pendingDrawing.points];
        if (pts.length >= 2) {
          if (time != null && price != null) pts[1] = { time, price };
          if (pendingDrawing.tool === "longPosition" || pendingDrawing.tool === "shortPosition") {
            const startTime = pts[0]?.time ?? 0;
            const endTimeRaw = pts[1]?.time ?? startTime;
            const endTime = Math.max(startTime + 1, endTimeRaw);
            pts[1] = { ...(pts[1] ?? pts[0]), time: endTime, price: pts[1]?.price ?? pts[0]?.price ?? 0 };
            const levels = nextPositionLevels(
              pendingDrawing.tool,
              pendingDrawing.entryPrice ?? pts[0].price,
              price ?? pts[1].price
            );
            const entry = pendingDrawing.entryPrice ?? pts[0].price;
            const hasVerticalDefinition =
              Math.abs((levels.targetPrice ?? entry) - entry) > 1e-9 || Math.abs((levels.stopPrice ?? entry) - entry) > 1e-9;
            const hasTimeSpan = Math.abs((pts[1]?.time ?? pts[0].time) - pts[0].time) >= 1;
            if (hasVerticalDefinition && hasTimeSpan) {
              addDrawing({ ...pendingDrawing, points: pts, ...levels } as Drawing);
            }
          } else {
            addDrawing({ ...pendingDrawing, points: pts } as Drawing);
          }
        }
      } else if (pendingDrawing.tool === "polyline" && pendingDrawing.points.length >= 2) {
        addDrawing(pendingDrawing);
      }
      setPendingDrawing(null);
      setActiveTool("select");
    },
    [pendingDrawing, addDrawing]
  );

  const confirmTextDrawing = useCallback(
    (text: string) => {
      if (!pendingDrawing || pendingDrawing.tool !== "text") return;
      addDrawing({ ...pendingDrawing, text: text.trim() || "Label" } as Drawing);
      setPendingDrawing(null);
      setActiveTool("select");
    },
    [pendingDrawing, addDrawing]
  );

  const completePolyline = useCallback(() => {
    if (!pendingDrawing || pendingDrawing.tool !== "polyline") return;
    let pts = [...pendingDrawing.points];
    while (pts.length >= 3) {
      const a = pts[pts.length - 2];
      const b = pts[pts.length - 1];
      if (a.time === b.time && a.price === b.price) pts = pts.slice(0, -1);
      else break;
    }
    if (pts.length >= 2) {
      addDrawing({ ...pendingDrawing, points: pts });
    }
    setPendingDrawing(null);
    setActiveTool("select");
  }, [pendingDrawing, addDrawing]);

  const removeLastPolylinePoint = useCallback(() => {
    if (!pendingDrawing || pendingDrawing.tool !== "polyline") return;
    const pts = pendingDrawing.points;
    if (pts.length <= 1) {
      setPendingDrawing(null);
      setActiveTool("select");
    } else {
      setPendingDrawing({ ...pendingDrawing, points: pts.slice(0, -1) });
    }
  }, [pendingDrawing]);

  const cancelPending = useCallback(() => {
    setPendingDrawing(null);
    setActiveTool("select");
  }, []);

  const updatePositionLevels = useCallback(
    (id: string, updates: Partial<Pick<Drawing, "entryPrice" | "targetPrice" | "stopPrice">>) => {
      setDrawings((prev) =>
        prev.map((d) => {
          if (d.id !== id || !isPositionDrawing(d)) return d;
          const entry = updates.entryPrice ?? d.entryPrice ?? d.points[0]?.price ?? 0;
          const targetRaw = updates.targetPrice ?? d.targetPrice ?? entry;
          const stopRaw = updates.stopPrice ?? d.stopPrice ?? entry;
          const minOffset = Math.max(Math.abs(entry), 1e-9) * 0.002;
          const normalized =
            d.tool === "longPosition"
              ? {
                  targetPrice: Math.max(targetRaw, entry + minOffset),
                  stopPrice: Math.min(stopRaw, entry - minOffset),
                }
              : {
                  targetPrice: Math.min(targetRaw, entry - minOffset),
                  stopPrice: Math.max(stopRaw, entry + minOffset),
                };
          return { ...d, entryPrice: entry, ...normalized };
        })
      );
    },
    []
  );

  const movePositionDrawing = useCallback((id: string, deltaTime: number, deltaPrice: number) => {
    setDrawings((prev) =>
      prev.map((d) => {
        if (d.id !== id || !isPositionDrawing(d)) return d;
        return {
          ...d,
          points: d.points.map((p) => ({ time: p.time + deltaTime, price: p.price + deltaPrice })),
          entryPrice: (d.entryPrice ?? d.points[0]?.price ?? 0) + deltaPrice,
          targetPrice: (d.targetPrice ?? d.points[0]?.price ?? 0) + deltaPrice,
          stopPrice: (d.stopPrice ?? d.points[0]?.price ?? 0) + deltaPrice,
        };
      })
    );
  }, []);

  return {
    drawings,
    activeTool,
    setActiveTool,
    toolStyles,
    setToolStyle,
    selectedId,
    selectDrawing,
    pendingDrawing,
    draggingAnchor,
    setDraggingAnchor,
    addDrawing,
    updateDrawing,
    duplicateDrawing,
    setSmartKind,
    convertSelectedToSmart,
    updatePoint,
    removeDrawing,
    removeSelected,
    undoLast,
    clearAll,
    hitTest,
    hitTestForContextMenu,
    hitTestAnchor,
    startDrawing,
    addPolylinePoint,
    updatePendingEnd,
    finishDrawing,
    confirmTextDrawing,
    completePolyline,
    removeLastPolylinePoint,
    cancelPending,
    updatePositionLevels,
    movePositionDrawing,
    getPositionMetrics,
  };
}

function distanceToSegment(px: number, py: number, x1: number, y1: number, x2: number, y2: number): number {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const lenSq = dx * dx + dy * dy || 1;
  let t = ((px - x1) * dx + (py - y1) * dy) / lenSq;
  t = Math.max(0, Math.min(1, t));
  const projX = x1 + t * dx;
  const projY = y1 + t * dy;
  return Math.sqrt((px - projX) ** 2 + (py - projY) ** 2);
}
