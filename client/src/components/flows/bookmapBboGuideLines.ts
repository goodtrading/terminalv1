import type { BookmapTimeViewport } from "@/hooks/useBookmapTimeScale";
import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import type { LiquiditySnapshot } from "./liquidityHeatmapUtils";
import { formatHeatmapPrice } from "./liquidityHeatmapUtils";
import { bucketPrice } from "./domLadderUtils";
import { DOM_ROW_HEIGHT } from "./domLadderUtils";
import { HEATMAP_PAD } from "./bookmapHeatmapRenderer";

export type BookmapBbo = {
  bestBid: number;
  bestAsk: number;
};

export type BidAskLineOpacity = "low" | "normal" | "high";

const BID_COLOR = { r: 0, g: 255, b: 120 };
const ASK_COLOR = { r: 255, g: 80, b: 90 };

const OPACITY_MUL: Record<BidAskLineOpacity, number> = {
  low: 0.55,
  normal: 0.75,
  high: 0.92,
};

const MODE_LINE_ALPHA: Record<VerticalCompressionMode, number> = {
  micro: 1,
  intraday: 0.92,
  macro: 0.72,
  fullDepth: 0.65,
};

const MODE_LINE_WIDTH: Record<VerticalCompressionMode, number> = {
  micro: 1.75,
  intraday: 1.5,
  macro: 1.15,
  fullDepth: 1,
};

/** Best bid / ask from DOM snapshot (bids desc, asks asc). */
export function extractBboFromDomSnapshot(
  snapshot: LiquiditySnapshot | undefined | null,
): BookmapBbo | null {
  if (!snapshot?.bids?.length || !snapshot?.asks?.length) return null;
  const bestBid = snapshot.bids[0]?.price;
  const bestAsk = snapshot.asks[0]?.price;
  if (!isBboValid(bestBid, bestAsk)) return null;
  return { bestBid: bestBid!, bestAsk: bestAsk! };
}

export function isBboValid(
  bestBid: number | null | undefined,
  bestAsk: number | null | undefined,
): boolean {
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return false;
  if (bestBid! <= 0 || bestAsk! <= 0) return false;
  return bestBid! < bestAsk!;
}

export type SeparatedBboLinePositions = {
  bidY: number;
  askY: number;
};

function rowHeightPx(
  priceToY: (price: number) => number,
  rowPrice: number,
  step: number,
): number {
  const hDown = Math.abs(priceToY(rowPrice) - priceToY(rowPrice - step));
  const hUp = Math.abs(priceToY(rowPrice) - priceToY(rowPrice + step));
  return Math.max(4, hDown, hUp);
}

function minVisualGapPx(
  verticalMode: VerticalCompressionMode,
  rowHeightPx: number,
): number {
  const fromRow = rowHeightPx * 0.9;
  switch (verticalMode) {
    case "micro":
      return Math.max(10, Math.min(DOM_ROW_HEIGHT, fromRow));
    case "intraday":
      return Math.max(8, fromRow);
    case "macro":
    case "fullDepth":
    default:
      return Math.max(6, fromRow * 0.85);
  }
}

/**
 * Map BBO to distinct ladder row Y positions (ask above bid).
 * Labels still use true bestBid/bestAsk prices — only display Y may separate.
 */
export function getSeparatedBboLinePositions(params: {
  bestBid: number;
  bestAsk: number;
  tickSize: number;
  priceToY: (price: number) => number;
  verticalMode?: VerticalCompressionMode;
}): SeparatedBboLinePositions | null {
  const { bestBid, bestAsk, tickSize, priceToY, verticalMode = "intraday" } = params;
  if (
    !Number.isFinite(bestBid) ||
    !Number.isFinite(bestAsk) ||
    bestBid <= 0 ||
    bestAsk <= 0 ||
    bestAsk < bestBid
  ) {
    return null;
  }

  const step = Math.max(1, tickSize);
  const bidRowPrice = bucketPrice(bestBid, step);
  let askRowPrice = bucketPrice(bestAsk, step);

  if (askRowPrice <= bidRowPrice) {
    askRowPrice = bidRowPrice + step;
  }

  let bidY = priceToY(bidRowPrice);
  let askY = priceToY(askRowPrice);

  const rowH = Math.max(
    rowHeightPx(priceToY, bidRowPrice, step),
    rowHeightPx(priceToY, askRowPrice, step),
  );
  const minGap = minVisualGapPx(verticalMode, rowH);

  if (askY >= bidY) {
    askY = bidY - minGap;
  }

  if (bidY - askY < minGap) {
    const mid = (bidY + askY) / 2;
    askY = mid - minGap / 2;
    bidY = mid + minGap / 2;
  }

  return { bidY, askY };
}

function rgba(
  r: number,
  g: number,
  b: number,
  a: number,
): string {
  return `rgba(${r}, ${g}, ${b}, ${Math.max(0, Math.min(1, a))})`;
}

function drawGuideSegment(
  ctx: CanvasRenderingContext2D,
  x0: number,
  x1: number,
  y: number,
  r: number,
  g: number,
  b: number,
  alpha: number,
  lineWidth: number,
  dashed: boolean,
) {
  if (x1 <= x0) return;
  ctx.save();
  ctx.strokeStyle = rgba(r, g, b, alpha);
  ctx.lineWidth = lineWidth;
  ctx.setLineDash(dashed ? [5, 4] : []);
  ctx.beginPath();
  ctx.moveTo(x0, y);
  ctx.lineTo(x1, y);
  ctx.stroke();
  ctx.restore();
}

type GuideLineMetrics = {
  plotW: number;
  plotH: number;
  priceToY: (price: number) => number;
  timeToX: (timeMs: number) => number;
};

export function renderBookmapBidAskGuideLines(
  ctx: CanvasRenderingContext2D,
  bbo: BookmapBbo,
  metrics: GuideLineMetrics,
  timeViewport: BookmapTimeViewport,
  verticalMode: VerticalCompressionMode,
  lineOpacity: BidAskLineOpacity = "normal",
  tickSize: number,
) {
  const plotLeft = HEATMAP_PAD.left;
  const plotRight = plotLeft + metrics.plotW;
  const plotTop = HEATMAP_PAD.top;
  const plotBottom = plotTop + metrics.plotH;

  const separated = getSeparatedBboLinePositions({
    bestBid: bbo.bestBid,
    bestAsk: bbo.bestAsk,
    tickSize,
    priceToY: metrics.priceToY,
    verticalMode,
  });
  if (!separated) return;

  const { bidY, askY } = separated;

  if (bidY < plotTop - 4 && askY < plotTop - 4) return;
  if (bidY > plotBottom + 4 && askY > plotBottom + 4) return;

  const baseAlpha = OPACITY_MUL[lineOpacity] * (MODE_LINE_ALPHA[verticalMode] ?? 0.85);
  const lineWidth = MODE_LINE_WIDTH[verticalMode] ?? 1.25;

  const dataEdgeX = metrics.timeToX(timeViewport.dataEndTime);
  const liveStart = Math.max(plotLeft, Math.min(plotRight, dataEdgeX));
  const liveBoost = 1.12;

  drawGuideSegment(
    ctx,
    plotLeft,
    liveStart,
    bidY,
    BID_COLOR.r,
    BID_COLOR.g,
    BID_COLOR.b,
    baseAlpha * 0.88,
    lineWidth,
    true,
  );
  drawGuideSegment(
    ctx,
    liveStart,
    plotRight,
    bidY,
    BID_COLOR.r,
    BID_COLOR.g,
    BID_COLOR.b,
    Math.min(1, baseAlpha * liveBoost),
    lineWidth,
    false,
  );

  drawGuideSegment(
    ctx,
    plotLeft,
    liveStart,
    askY,
    ASK_COLOR.r,
    ASK_COLOR.g,
    ASK_COLOR.b,
    baseAlpha * 0.88,
    lineWidth,
    true,
  );
  drawGuideSegment(
    ctx,
    liveStart,
    plotRight,
    askY,
    ASK_COLOR.r,
    ASK_COLOR.g,
    ASK_COLOR.b,
    Math.min(1, baseAlpha * liveBoost),
    lineWidth,
    false,
  );

  ctx.save();
  ctx.font = "8px ui-monospace, monospace";
  ctx.textAlign = "right";

  const labelX = plotRight - 4;
  const labels: { y: number; text: string; color: string }[] = [
    {
      y: bidY - 3,
      text: `BID ${formatHeatmapPrice(bbo.bestBid)}`,
      color: rgba(BID_COLOR.r, BID_COLOR.g, BID_COLOR.b, Math.min(1, baseAlpha * 1.05)),
    },
    {
      y: askY + 9,
      text: `ASK ${formatHeatmapPrice(bbo.bestAsk)}`,
      color: rgba(ASK_COLOR.r, ASK_COLOR.g, ASK_COLOR.b, Math.min(1, baseAlpha * 1.05)),
    },
  ];

  for (const label of labels) {
    if (label.y < plotTop - 6 || label.y > plotBottom + 10) continue;
    const textW = ctx.measureText(label.text).width;
    ctx.fillStyle = "rgba(8, 14, 22, 0.78)";
    ctx.fillRect(labelX - textW - 3, label.y - 8, textW + 6, 10);
    ctx.fillStyle = label.color;
    ctx.fillText(label.text, labelX, label.y);
  }

  ctx.textAlign = "left";
  ctx.restore();
}
