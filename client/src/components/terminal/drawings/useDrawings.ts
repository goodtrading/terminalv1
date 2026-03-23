import { useState, useCallback, useEffect } from "react";
import type { Drawing, DrawingPoint, DrawingTool } from "./types";
import { DEFAULT_COLOR, DEFAULT_LINE_WIDTH, DEFAULT_OPACITY, getToolPointCount } from "./types";
import { loadDrawings, saveDrawings } from "./persistence";

const MAX_POLYLINE_POINTS = 10;
const HIT_THRESHOLD = 10;
const ANCHOR_HIT_THRESHOLD = 12;

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

export function useDrawings(symbol: string, timeframe: string) {
  const [drawings, setDrawings] = useState<Drawing[]>(() => sanitizeDrawings(loadDrawings(symbol, timeframe)));
  const [activeTool, setActiveTool] = useState<DrawingTool>("select");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [pendingDrawing, setPendingDrawing] = useState<Drawing | null>(null);
  const [draggingAnchor, setDraggingAnchor] = useState<{ id: string; pointIndex: number } | null>(null);

  useEffect(() => {
    const clean = sanitizeDrawings(drawings);
    if (clean.length !== drawings.length) {
      setDrawings(clean);
      return;
    }
    saveDrawings(symbol, timeframe, clean);
  }, [drawings, symbol, timeframe]);

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

  const selectDrawing = useCallback((id: string | null) => {
    setDrawings((prev) =>
      prev.map((d) => ({ ...d, selected: d.id === id }))
    );
    setSelectedId(id);
  }, []);

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
      }
      return null;
    },
    [drawings]
  );

  const startDrawing = useCallback(
    (time: number, price: number) => {
      if (activeTool === "select") return;
      const base: Partial<Drawing> = {
        color: DEFAULT_COLOR,
        opacity: DEFAULT_OPACITY,
        lineWidth: DEFAULT_LINE_WIDTH,
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
      } else if (activeTool === "polyline") {
        setPendingDrawing({
          ...base,
          tool: "polyline",
          points: [pt],
        } as Drawing);
      }
    },
    [activeTool, addDrawing]
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
      if (pts.length >= 2 && (pendingDrawing.tool === "trendLine" || pendingDrawing.tool === "arrow" || pendingDrawing.tool === "rectangle")) {
        pts[1] = { time, price };
        setPendingDrawing({ ...pendingDrawing, points: pts });
      }
    },
    [pendingDrawing]
  );

  const finishDrawing = useCallback(
    (time?: number, price?: number) => {
      if (!pendingDrawing) return;
      if (pendingDrawing.tool === "trendLine" || pendingDrawing.tool === "arrow" || pendingDrawing.tool === "rectangle") {
        const pts = [...pendingDrawing.points];
        if (pts.length >= 2) {
          if (time != null && price != null) pts[1] = { time, price };
          addDrawing({ ...pendingDrawing, points: pts } as Drawing);
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

  return {
    drawings,
    activeTool,
    setActiveTool,
    selectedId,
    selectDrawing,
    pendingDrawing,
    draggingAnchor,
    setDraggingAnchor,
    addDrawing,
    updateDrawing,
    updatePoint,
    removeDrawing,
    removeSelected,
    hitTest,
    hitTestAnchor,
    startDrawing,
    addPolylinePoint,
    updatePendingEnd,
    finishDrawing,
    confirmTextDrawing,
    completePolyline,
    removeLastPolylinePoint,
    cancelPending,
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
