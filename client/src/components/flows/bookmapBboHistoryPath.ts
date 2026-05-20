import type { BookmapTimeViewport } from "@/hooks/useBookmapTimeScale";
import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import type { BookmapBboPoint } from "@shared/bookmapBboHistory";
import type { BidAskLineOpacity } from "./bookmapBboGuideLines";
import { HEATMAP_PAD } from "./bookmapHeatmapRenderer";

const MAX_RENDERED_SEGMENTS = 2_000;
const BID_COLOR = { r: 0, g: 255, b: 120 };
const ASK_COLOR = { r: 255, g: 80, b: 90 };

const PATH_OPACITY: Record<BidAskLineOpacity, number> = {
  low: 0.45,
  normal: 0.65,
  high: 0.82,
};

const LINE_WIDTH: Record<VerticalCompressionMode, number> = {
  micro: 1.5,
  intraday: 1,
  macro: 1,
  fullDepth: 1,
};

export type BboPathRenderStats = {
  totalPoints: number;
  visiblePoints: number;
  renderedSegments: number;
};

function rgba(r: number, g: number, b: number, a: number): string {
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
}

/** Downsample to at most one point per time bucket (pixel column). */
export function downsampleBboPointsForViewport(
  points: BookmapBboPoint[],
  visibleStart: number,
  visibleEnd: number,
  minPrice: number,
  maxPrice: number,
  maxBuckets: number,
): BookmapBboPoint[] {
  if (points.length === 0) return [];
  const margin = (visibleEnd - visibleStart) * 0.02;
  const t0 = visibleStart - margin;
  const t1 = visibleEnd + margin;
  const pricePad = (maxPrice - minPrice) * 0.02;

  const visible = points.filter(
    (p) =>
      p.timestamp >= t0 &&
      p.timestamp <= t1 &&
      p.bestBid >= minPrice - pricePad &&
      p.bestAsk <= maxPrice + pricePad,
  );
  if (visible.length <= maxBuckets) return visible;

  const span = Math.max(1, t1 - t0);
  const bucketMs = span / maxBuckets;
  const buckets = new Map<number, BookmapBboPoint>();

  for (const p of visible) {
    const key = Math.floor((p.timestamp - t0) / bucketMs);
    buckets.set(key, p);
  }

  return Array.from(buckets.values()).sort((a, b) => a.timestamp - b.timestamp);
}

function drawPath(
  ctx: CanvasRenderingContext2D,
  coords: Array<{ x: number; y: number }>,
  r: number,
  g: number,
  b: number,
  alpha: number,
  lineWidth: number,
  dashed: boolean,
  glow: boolean,
) {
  if (coords.length < 2) return;
  ctx.save();
  ctx.strokeStyle = rgba(r, g, b, alpha);
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dashed ? [4, 3] : []);
  if (glow) {
    ctx.shadowColor = rgba(r, g, b, alpha * 0.5);
    ctx.shadowBlur = 4;
  }
  ctx.beginPath();
  ctx.moveTo(coords[0]!.x, coords[0]!.y);
  for (let i = 1; i < coords.length; i++) {
    ctx.lineTo(coords[i]!.x, coords[i]!.y);
  }
  ctx.stroke();
  ctx.restore();
}

export function renderHistoricalBboPath(
  ctx: CanvasRenderingContext2D,
  params: {
    points: BookmapBboPoint[];
    plotW: number;
    plotH: number;
    plotLeft: number;
    plotTop: number;
    plotBottom: number;
    minPrice: number;
    maxPrice: number;
    timeToX: (timeMs: number) => number;
    priceToY: (price: number) => number;
    timeViewport: BookmapTimeViewport;
    verticalMode: VerticalCompressionMode;
    opacity?: BidAskLineOpacity;
  },
): BboPathRenderStats {
  const {
    points,
    plotW,
    plotH,
    plotLeft,
    plotTop,
    plotBottom,
    minPrice,
    maxPrice,
    timeToX,
    priceToY,
    timeViewport,
    verticalMode,
    opacity = "normal",
  } = params;

  const empty: BboPathRenderStats = {
    totalPoints: points.length,
    visiblePoints: 0,
    renderedSegments: 0,
  };
  if (points.length < 2 || plotW < 8 || plotH < 8) return empty;

  const sampled = downsampleBboPointsForViewport(
    points,
    timeViewport.visibleStartTime,
    timeViewport.visibleEndTime,
    minPrice,
    maxPrice,
    Math.min(MAX_RENDERED_SEGMENTS, Math.max(64, Math.floor(plotW))),
  );

  if (sampled.length < 2) {
    return { ...empty, visiblePoints: sampled.length };
  }

  const baseAlpha = PATH_OPACITY[opacity];
  const lineWidth = LINE_WIDTH[verticalMode] ?? 1;
  const dashed = verticalMode !== "micro";
  const glow = verticalMode === "micro";

  const bidCoords: Array<{ x: number; y: number }> = [];
  const askCoords: Array<{ x: number; y: number }> = [];

  for (const p of sampled) {
    const x = timeToX(p.timestamp);
    if (x < plotLeft - 2 || x > plotLeft + plotW + 2) continue;
    const bidY = priceToY(p.bestBid);
    const askY = priceToY(p.bestAsk);
    if (bidY < plotTop - 8 || bidY > plotBottom + 8) continue;
    if (askY < plotTop - 8 || askY > plotBottom + 8) continue;
    bidCoords.push({ x, y: bidY });
    askCoords.push({ x, y: askY });
  }

  drawPath(ctx, bidCoords, BID_COLOR.r, BID_COLOR.g, BID_COLOR.b, baseAlpha, lineWidth, dashed, glow);
  drawPath(ctx, askCoords, ASK_COLOR.r, ASK_COLOR.g, ASK_COLOR.b, baseAlpha, lineWidth, dashed, glow);

  return {
    totalPoints: points.length,
    visiblePoints: sampled.length,
    renderedSegments: Math.max(0, bidCoords.length - 1) + Math.max(0, askCoords.length - 1),
  };
}

export function getBboPathPlotBounds(width: number, height: number) {
  return {
    plotLeft: HEATMAP_PAD.left,
    plotTop: HEATMAP_PAD.top,
    plotW: width - HEATMAP_PAD.left - HEATMAP_PAD.right,
    plotH: height - HEATMAP_PAD.top - HEATMAP_PAD.bottom,
    plotBottom: height - HEATMAP_PAD.bottom,
  };
}
