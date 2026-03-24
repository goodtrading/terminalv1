import { useLayoutEffect, useRef, useCallback } from "react";
import type { Drawing, DrawingPoint } from "./types";
import { drawDebug, getChartViewportVersion } from "./debug";
import { createDrawingProjection } from "./projection";
import { getPositionMetrics, isPositionDrawing } from "./positionUtils";

const LABEL_OFFSET_STOP = -12;
const LABEL_OFFSET_ENTRY = 0;
const LABEL_OFFSET_TARGET = 12;
const LABEL_BASE_PADDING = 12;

function formatCompact(n: number, decimals: number): string {
  if (Math.abs(n) >= 1e6) return n.toExponential(1);
  if (Math.abs(n) >= 1e3) return n.toFixed(decimals >= 2 ? 1 : 0);
  return n.toFixed(decimals);
}

function formatAmount(n: number): string {
  if (Math.abs(n) >= 1e6) return `$${(n / 1e6).toFixed(1)}M`;
  if (Math.abs(n) >= 1e3) return `$${(n / 1e3).toFixed(1)}k`;
  return `$${n.toFixed(0)}`;
}

function roundRect(ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.lineTo(x + w - r, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + r);
  ctx.lineTo(x + w, y + h - r);
  ctx.quadraticCurveTo(x + w, y + h, x + w - r, y + h);
  ctx.lineTo(x + r, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - r);
  ctx.lineTo(x, y + r);
  ctx.quadraticCurveTo(x, y, x + r, y);
  ctx.closePath();
}

type LineStyle = "label" | "main" | "sub";

function drawLabelBlock(
  ctx: CanvasRenderingContext2D,
  lines: { text: string; style: LineStyle }[],
  centerX: number,
  centerY: number,
  opts: {
    bgColor: string;
    borderColor: string;
    labelColor: string;
    mainColor: string;
    subColor: string;
    padding?: number;
    lineHeight?: number;
    mainFontSize?: number;
  }
) {
  const {
    bgColor,
    borderColor,
    labelColor,
    mainColor,
    subColor,
    padding = 8,
    lineHeight = 14,
    mainFontSize = 13,
  } = opts;
  const fontLabel = "9px 'JetBrains Mono', monospace";
  const fontMain = `${mainFontSize}px 'JetBrains Mono', monospace`;
  const fontSub = "11px 'JetBrains Mono', monospace";

  ctx.font = fontMain;
  let maxW = 0;
  for (const { text, style } of lines) {
    const font = style === "label" ? fontLabel : style === "main" ? fontMain : fontSub;
    ctx.font = font;
    const w = ctx.measureText(text).width;
    maxW = Math.max(maxW, w);
  }
  const totalH = lines.length * lineHeight + padding * 2;
  const totalW = maxW + padding * 2;
  const left = centerX - totalW / 2;
  const top = centerY - totalH / 2;

  ctx.fillStyle = bgColor;
  roundRect(ctx, left, top, totalW, totalH, 5);
  ctx.fill();
  ctx.strokeStyle = borderColor;
  ctx.lineWidth = 1;
  ctx.stroke();

  let y = top + padding + lineHeight / 2;
  for (const { text, style } of lines) {
    const font = style === "label" ? fontLabel : style === "main" ? fontMain : fontSub;
    ctx.font = font;
    ctx.fillStyle = style === "label" ? labelColor : style === "main" ? mainColor : subColor;
    ctx.textAlign = "left";
    ctx.textBaseline = "middle";
    ctx.fillText(text, left + padding, y);
    y += lineHeight;
  }
}

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
      } else if (isPositionDrawing(d) && pts.length >= 2) {
        const metrics = getPositionMetrics(d);
        const x1 = tx(pts[0].time);
        const x2 = tx(pts[1].time);
        if (x1 == null || x2 == null || !metrics) continue;
        const left = Math.min(x1, x2);
        const right = Math.max(x1, x2);
        const entryY = py(metrics.entry);
        const stopY = py(metrics.stop);
        const targetY = py(metrics.target);
        if (entryY == null || stopY == null || targetY == null) continue;

        const targetTop = Math.min(entryY, targetY);
        const targetBottom = Math.max(entryY, targetY);
        const stopTop = Math.min(entryY, stopY);
        const stopBottom = Math.max(entryY, stopY);
        const targetColor = d.targetColor ?? "#22c55e";
        const stopColor = d.stopColor ?? "#ef4444";

        ctx.fillStyle = hexToRgba(targetColor, 0.2);
        ctx.fillRect(left, targetTop, right - left, targetBottom - targetTop);
        ctx.fillStyle = hexToRgba(stopColor, 0.24);
        ctx.fillRect(left, stopTop, right - left, stopBottom - stopTop);

        ctx.strokeStyle = hexToRgba("#ffffff", 0.85);
        ctx.lineWidth = isSelected ? 1.8 : 1.2;
        ctx.beginPath();
        ctx.moveTo(left, entryY);
        ctx.lineTo(right, entryY);
        ctx.stroke();

        ctx.strokeStyle = hexToRgba(targetColor, 0.85);
        ctx.setLineDash([4, 2]);
        ctx.beginPath();
        ctx.moveTo(left, targetY);
        ctx.lineTo(right, targetY);
        ctx.stroke();

        ctx.strokeStyle = hexToRgba(stopColor, 0.85);
        ctx.beginPath();
        ctx.moveTo(left, stopY);
        ctx.lineTo(right, stopY);
        ctx.stroke();
        ctx.setLineDash([]);

        if (d.showLabels !== false) {
          const p = d.labelPrecision ?? 2;
          const accountSize = d.accountSize ?? 10000;
          const qty = d.quantity ?? 0;
          const riskAmt = accountSize * (metrics.riskPercent / 100);
          const rewardAmt = accountSize * (metrics.rewardPercent / 100);

          const targetColor = d.targetColor ?? "#22c55e";
          const stopColor = d.stopColor ?? "#ef4444";

          const pad = 8;
          const lineH = 14;

          const targetLines: { text: string; style: LineStyle }[] = [
            { text: "OBJETIVO", style: "label" },
            { text: formatAmount(rewardAmt), style: "main" },
            { text: `+${metrics.rewardPercent.toFixed(2)}%`, style: "sub" },
          ];
          const entryLines: { text: string; style: LineStyle }[] = [
            { text: formatCompact(metrics.entry, p), style: "main" },
            { text: `RR 1:${metrics.rr.toFixed(2)}`, style: "sub" },
            ...(qty > 0 ? [{ text: `${formatCompact(qty, 0)} contr.`, style: "sub" as const }] : []),
          ];
          const stopLines: { text: string; style: LineStyle }[] = [
            { text: "STOP", style: "label" },
            { text: formatAmount(riskAmt), style: "main" },
            { text: `-${metrics.riskPercent.toFixed(2)}%`, style: "sub" },
          ];

          const measureW = (lines: typeof targetLines, mainSz = 13) => {
            let m = 0;
            for (const { text, style } of lines) {
              ctx.font =
                style === "label"
                  ? "9px 'JetBrains Mono', monospace"
                  : style === "main"
                    ? `${mainSz}px 'JetBrains Mono', monospace`
                    : "11px 'JetBrains Mono', monospace";
              m = Math.max(m, ctx.measureText(text).width);
            }
            return m + pad * 2;
          };
          const targetW = measureW(targetLines);
          const entryW = measureW(entryLines, 15);
          const stopW = measureW(stopLines);
          const boxW = Math.max(targetW, entryW, stopW, 70);
          const targetH = targetLines.length * lineH + pad * 2;
          const entryH = entryLines.length * lineH + pad * 2;
          const stopH = stopLines.length * lineH + pad * 2;
          const halfTarget = targetH / 2;
          const halfEntry = entryH / 2;
          const halfStop = stopH / 2;

          const stopLabelY = stopY + LABEL_OFFSET_STOP;
          const entryLabelY = entryY + LABEL_OFFSET_ENTRY;
          const targetLabelY = targetY + LABEL_OFFSET_TARGET;

          const stopBoxY = Math.max(halfStop + 4, Math.min(chartHeight - halfStop - 4, stopLabelY));
          const entryBoxY = Math.max(halfEntry + 4, Math.min(chartHeight - halfEntry - 4, entryLabelY));
          const targetBoxY = Math.max(halfTarget + 4, Math.min(chartHeight - halfTarget - 4, targetLabelY));

          const baseX = Math.max(4, Math.min(chartWidth - boxW - 4, right + LABEL_BASE_PADDING));
          const centerX = baseX + boxW / 2;

          drawLabelBlock(
            ctx,
            targetLines,
            centerX,
            targetBoxY,
            {
              bgColor: "rgba(12,28,18,0.97)",
              borderColor: "rgba(34,197,94,0.5)",
              labelColor: "rgba(255,255,255,0.6)",
              mainColor: "rgba(255,255,255,1)",
              subColor: "rgba(255,255,255,0.88)",
              padding: pad,
              lineHeight: lineH,
            }
          );

          drawLabelBlock(
            ctx,
            entryLines,
            centerX,
            entryBoxY,
            {
              bgColor: "rgba(10,12,18,0.98)",
              borderColor: "rgba(255,255,255,0.28)",
              labelColor: "rgba(255,255,255,0.7)",
              mainColor: "rgba(255,255,255,1)",
              subColor: "rgba(255,255,255,0.92)",
              padding: pad,
              lineHeight: lineH,
              mainFontSize: 15,
            }
          );

          drawLabelBlock(
            ctx,
            stopLines,
            centerX,
            stopBoxY,
            {
              bgColor: "rgba(28,12,12,0.97)",
              borderColor: "rgba(239,68,68,0.5)",
              labelColor: "rgba(255,255,255,0.6)",
              mainColor: "rgba(255,255,255,1)",
              subColor: "rgba(255,255,255,0.88)",
              padding: pad,
              lineHeight: lineH,
            }
          );
        }

        if (isSelected) {
          ctx.fillStyle = "rgba(255,255,255,0.95)";
          [entryY, stopY, targetY].forEach((yy) => {
            ctx.beginPath();
            ctx.arc(right, yy, 4.5, 0, Math.PI * 2);
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
