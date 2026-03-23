import { useLayoutEffect, useRef, useCallback } from "react";
import type { Drawing, DrawingPoint } from "./types";
import { drawDebug, getChartViewportVersion } from "./debug";
import { createDrawingProjection } from "./projection";

interface DrawingsCanvasProps {
  drawings: Drawing[];
  pendingDrawing: Drawing | null;
  chartWidth: number;
  chartHeight: number;
  viewportVersion?: number;
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: number) => number | null;
}

function hexToRgba(hex: string, alpha: number): string {
  const h = hex.replace("#", "");
  const r = parseInt(h.slice(0, 2), 16);
  const g = parseInt(h.slice(2, 4), 16);
  const b = parseInt(h.slice(4, 6), 16);
  return `rgba(${r},${g},${b},${alpha})`;
}

export function DrawingsCanvas({
  drawings,
  pendingDrawing,
  chartWidth,
  chartHeight,
  viewportVersion = 0,
  priceToCoordinate,
  timeToCoordinate,
}: DrawingsCanvasProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const { timeToX, priceToY } = createDrawingProjection(timeToCoordinate, priceToCoordinate);

  const drawLine = useCallback(
    (
      ctx: CanvasRenderingContext2D,
      x1: number,
      y1: number,
      x2: number,
      y2: number,
      color: string,
      opacity: number,
      lw: number
    ) => {
      ctx.strokeStyle = hexToRgba(color, opacity);
      ctx.lineWidth = lw;
      ctx.setLineDash([]);
      ctx.beginPath();
      ctx.moveTo(x1, y1);
      ctx.lineTo(x2, y2);
      ctx.stroke();
    },
    []
  );

  const drawArrowhead = useCallback(
    (ctx: CanvasRenderingContext2D, x: number, y: number, angle: number, color: string, opacity: number, size = 10) => {
      ctx.save();
      ctx.translate(x, y);
      ctx.rotate(angle);
      ctx.fillStyle = hexToRgba(color, opacity);
      ctx.beginPath();
      ctx.moveTo(size, 0);
      ctx.lineTo(-size * 0.8, size * 0.6);
      ctx.lineTo(-size * 0.5, 0);
      ctx.lineTo(-size * 0.8, -size * 0.6);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    },
    []
  );

  const render = useCallback(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);

    const all: Drawing[] = [...drawings, ...(pendingDrawing ? [pendingDrawing] : [])];
    for (const d of all) {
      const pts = d.points;
      const color = d.color || "#22c55e";
      const opacity = d.opacity ?? 0.9;
      const lw = d.lineWidth ?? 2;
      const isSelected = d.selected ?? false;
      if (!pts || pts.length === 0) continue;

      const nullProjection = { xNull: 0, yNull: 0 };
      const tx = (t: number) => {
        const x = timeToX(t);
        if (x == null) nullProjection.xNull += 1;
        return x;
      };
      const py = (p: number) => {
        const y = priceToY(p);
        if (y == null) nullProjection.yNull += 1;
        return y;
      };

      if (d.tool === "horizontalLine" && pts[0]) {
        const y = py(pts[0].price);
        if (y == null) continue;
        drawLine(ctx, 0, y, chartWidth, y, color, opacity, isSelected ? lw + 1 : lw);
        if (isSelected) {
          ctx.fillStyle = hexToRgba(color, opacity);
          ctx.beginPath();
          ctx.arc(chartWidth * 0.5, y, 5, 0, Math.PI * 2);
          ctx.fill();
        }
      } else if ((d.tool === "trendLine" || d.tool === "arrow") && pts.length >= 2) {
        const x1 = tx(pts[0].time);
        const y1 = py(pts[0].price);
        const x2 = tx(pts[1].time);
        const y2 = py(pts[1].price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        drawLine(ctx, x1, y1, x2, y2, color, opacity, isSelected ? lw + 1 : lw);
        if (d.tool === "arrow") {
          const angle = Math.atan2(y2 - y1, x2 - x1);
          drawArrowhead(ctx, x2, y2, angle, color, opacity, 12);
        }
        if (isSelected) {
          ctx.fillStyle = hexToRgba(color, opacity);
          [x1, x2].forEach((x, i) => {
            const y = i === 0 ? y1 : y2;
            ctx.beginPath();
            ctx.arc(x!, y!, 5, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      } else if (d.tool === "rectangle" && pts.length >= 2) {
        const x1 = tx(pts[0].time);
        const y1 = py(pts[0].price);
        const x2 = tx(pts[1].time);
        const y2 = py(pts[1].price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const top = Math.min(y1, y2);
        const bottom = Math.max(y1, y2);
        const fillOpacity = opacity * 0.15;
        ctx.fillStyle = hexToRgba(color, fillOpacity);
        ctx.fillRect(left, top, right - left, bottom - top);
        ctx.strokeStyle = hexToRgba(color, opacity);
        ctx.lineWidth = isSelected ? lw + 1 : lw;
        ctx.strokeRect(left, top, right - left, bottom - top);
        if (isSelected) {
          ctx.fillStyle = hexToRgba(color, opacity);
          [x1, x2].forEach((x, i) => {
            const y = i === 0 ? y1 : y2;
            ctx.beginPath();
            ctx.arc(x!, y!, 5, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      } else if (d.tool === "text" && pts[0] && d.text) {
        const x = tx(pts[0].time);
        const y = py(pts[0].price);
        if (x == null || y == null) continue;
        ctx.font = "11px 'JetBrains Mono', monospace";
        ctx.fillStyle = hexToRgba(color, opacity);
        ctx.fillText(d.text, x + 4, y - 4);
        if (isSelected) {
          ctx.strokeStyle = hexToRgba(color, opacity);
          ctx.lineWidth = 1;
          ctx.setLineDash([2, 2]);
          const m = ctx.measureText(d.text);
          ctx.strokeRect(x, y - 14, m.width + 8, 16);
        }
      } else if (d.tool === "polyline" && pts.length >= 2) {
        const coords: { x: number; y: number }[] = [];
        for (const p of pts) {
          const x = tx(p.time);
          const y = py(p.price);
          if (x != null && y != null) coords.push({ x, y });
        }
        if (coords.length < 2) continue;
        ctx.strokeStyle = hexToRgba(color, opacity);
        ctx.lineWidth = isSelected ? lw + 1 : lw;
        ctx.beginPath();
        ctx.moveTo(coords[0].x, coords[0].y);
        for (let i = 1; i < coords.length; i++) {
          ctx.lineTo(coords[i].x, coords[i].y);
        }
        ctx.stroke();
        if (isSelected) {
          ctx.fillStyle = hexToRgba(color, opacity);
          coords.forEach((c) => {
            ctx.beginPath();
            ctx.arc(c.x, c.y, 5, 0, Math.PI * 2);
            ctx.fill();
          });
        }
      }

      drawDebug("RENDER", {
        source: "DrawingsCanvas",
        drawingId: d.id,
        tool: d.tool,
        viewportVersion,
        chartViewportVersion: getChartViewportVersion(),
        nullProjection,
        selected: Boolean(d.selected),
        pending: pendingDrawing?.id === d.id,
      });
    }
  }, [
    drawings,
    pendingDrawing,
    chartWidth,
    chartHeight,
    viewportVersion,
    priceToCoordinate,
    timeToCoordinate,
    timeToX,
    priceToY,
    drawLine,
    drawArrowhead,
  ]);

  useLayoutEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.width = chartWidth;
    canvas.height = chartHeight;
    render();
  }, [chartWidth, chartHeight, viewportVersion, render]);

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 pointer-events-none"
      style={{ width: chartWidth, height: chartHeight, left: 0, top: 0, zIndex: 20 }}
    />
  );
}
