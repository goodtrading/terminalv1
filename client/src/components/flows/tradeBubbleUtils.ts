import {
  MAX_LIQUIDITY_SNAPSHOTS,
  SNAPSHOT_INTERVAL_MS,
  type HeatmapTrade,
  type LiquiditySnapshot,
} from "./liquidityHeatmapUtils";

/** Rolling buffer cap — not trimmed by zoom/pan/toggles. */
export const MAX_TRADE_BUBBLES = 3000;

export const TRADE_INGEST_FLOOR_BTC = 0.01;
export const TRADE_DOT_MIN_BTC = 0.01;
export const TRADE_BUBBLE_VISIBLE_BTC = 0.05;
export const TRADE_BUBBLE_STRONG_BTC = 1;
export const TRADE_BUBBLE_HUGE_BTC = 5;

/** Temporal bucket for grouping nearby prints (Bookmap-style). */
export const TRADE_GROUP_TIME_MS = 250;

/** @deprecated */
export const TRADE_RENDER_FLOOR_BTC = TRADE_DOT_MIN_BTC;
/** @deprecated */
export const TRADE_BUBBLE_MIN_BTC = TRADE_BUBBLE_VISIBLE_BTC;
/** @deprecated */
export const TRADE_MIN_BUBBLE_VISIBLE_BTC = TRADE_BUBBLE_VISIBLE_BTC;
/** @deprecated */
export const TRADE_MAJOR_BUBBLE_BTC = TRADE_BUBBLE_STRONG_BTC;
/** @deprecated */
export const TRADE_LARGE_BUBBLE_BTC = TRADE_BUBBLE_HUGE_BTC;
/** @deprecated */
export const TRADE_HUGE_BUBBLE_BTC = TRADE_BUBBLE_HUGE_BTC;

export const TRADE_BUFFER_MS =
  MAX_LIQUIDITY_SNAPSHOTS * SNAPSHOT_INTERVAL_MS + 2_000;

export type TradeBubble = {
  id?: string;
  timeMs: number;
  price: number;
  sizeBtc: number;
  side: "buy" | "sell";
};

export function heatmapTradeToBubble(t: HeatmapTrade): TradeBubble {
  return {
    id: t.id,
    timeMs: t.ts,
    price: t.price,
    sizeBtc: t.sizeBtc,
    side: t.side,
  };
}

export function getTradeBubbleRadius(sizeBtc: number): number {
  if (!Number.isFinite(sizeBtc) || sizeBtc <= 0) return 0;

  if (sizeBtc < 0.05) return 2;
  if (sizeBtc < 0.15) return 3;
  if (sizeBtc < 0.5) return 5;
  if (sizeBtc < 1) return 7;
  if (sizeBtc < 2.5) return 10;
  if (sizeBtc < 5) return 14;
  if (sizeBtc < 10) return 18;

  return 24;
}

/** @deprecated use getTradeBubbleRadius */
export const bubbleRadius = getTradeBubbleRadius;

export function appendTradeToBuffer(
  trades: HeatmapTrade[],
  trade: HeatmapTrade,
): HeatmapTrade[] {
  const last = trades[trades.length - 1];
  if (trade.id && last?.id === trade.id) return trades;
  const next = [...trades, trade];
  if (next.length <= MAX_TRADE_BUBBLES) return next;
  return next.slice(-MAX_TRADE_BUBBLES);
}

export function getHeatmapTimeWindow(series: LiquiditySnapshot[]): {
  tMin: number;
  tMax: number;
} {
  if (!series.length) {
    const now = Date.now();
    return { tMin: now - TRADE_BUFFER_MS, tMax: now };
  }
  return {
    tMin: series[0].ts,
    tMax: series[series.length - 1].ts,
  };
}

export function timeToX(
  timeMs: number,
  timeRange: { min: number; max: number },
  plotLeft: number,
  plotWidth: number,
): number {
  const span = timeRange.max - timeRange.min;
  if (!Number.isFinite(span) || span <= 0) return plotLeft + plotWidth;
  const frac = (timeMs - timeRange.min) / span;
  return plotLeft + Math.min(1, Math.max(0, frac)) * plotWidth;
}

function snapPriceToStep(price: number, priceStep: number): number {
  const step = priceStep > 0 ? priceStep : 1;
  return Math.round(price / step) * step;
}

/** Trades inside snapshot time window and price band (pre-group). */
export function filterTradesForHeatmap(
  trades: HeatmapTrade[],
  series: LiquiditySnapshot[],
  minPrice: number,
  maxPrice: number,
): TradeBubble[] {
  if (!series.length) return [];

  const { tMin, tMax } = getHeatmapTimeWindow(series);

  const out: TradeBubble[] = [];
  for (const t of trades) {
    if (t.sizeBtc < TRADE_DOT_MIN_BTC) continue;
    if (t.ts < tMin || t.ts > tMax) continue;
    if (t.price < minPrice || t.price > maxPrice) continue;
    out.push(heatmapTradeToBubble(t));
  }
  return out;
}

/**
 * Merge prints in the same side + price bucket + time bucket (sum size).
 */
export function groupTradeBubbles(
  bubbles: TradeBubble[],
  priceStep: number,
  timeBucketMs: number = TRADE_GROUP_TIME_MS,
): TradeBubble[] {
  if (bubbles.length === 0) return [];

  const bucketMs = Math.max(50, timeBucketMs);
  const map = new Map<string, TradeBubble>();

  for (const b of bubbles) {
    const timeBucket = Math.floor(b.timeMs / bucketMs);
    const priceKey = snapPriceToStep(b.price, priceStep);
    const key = `${b.side}|${priceKey}|${timeBucket}`;
    const existing = map.get(key);
    if (existing) {
      existing.sizeBtc += b.sizeBtc;
    } else {
      map.set(key, {
        side: b.side,
        price: priceKey,
        timeMs: timeBucket * bucketMs + bucketMs * 0.5,
        sizeBtc: b.sizeBtc,
      });
    }
  }

  return [...map.values()];
}

export type PreparedTradeBubbles = {
  visible: TradeBubble[];
  grouped: TradeBubble[];
};

export function prepareTradeBubblesForRender(
  trades: HeatmapTrade[],
  series: LiquiditySnapshot[],
  minPrice: number,
  maxPrice: number,
  priceStep: number,
): PreparedTradeBubbles {
  const visible = filterTradesForHeatmap(trades, series, minPrice, maxPrice);
  const grouped = groupTradeBubbles(visible, priceStep);
  return { visible, grouped };
}

export function formatTradeRxPerSec(rx: number | null | undefined): string {
  if (rx == null || !Number.isFinite(rx)) return "—";
  return rx.toFixed(1);
}

export type TradeBubbleStyle = {
  fill: string;
  stroke: string;
  glow: string;
  lineWidth: number;
};

export function getTradeBubbleStyle(sizeBtc: number, side: "buy" | "sell"): TradeBubbleStyle {
  const isBuy = side === "buy";
  const baseFill = isBuy ? "rgba(40, 220, 120, 0.65)" : "rgba(255, 75, 75, 0.65)";
  const baseStroke = isBuy ? "rgba(130, 255, 180, 0.95)" : "rgba(255, 150, 150, 0.95)";
  const baseGlow = isBuy ? "rgba(40, 220, 120, 0.3)" : "rgba(255, 75, 75, 0.3)";

  if (sizeBtc >= TRADE_BUBBLE_HUGE_BTC) {
    return {
      fill: isBuy ? "rgba(40, 220, 120, 0.88)" : "rgba(255, 75, 75, 0.88)",
      stroke: isBuy ? "rgba(170, 255, 210, 1)" : "rgba(255, 190, 190, 1)",
      glow: isBuy ? "rgba(40, 220, 120, 0.55)" : "rgba(255, 75, 75, 0.55)",
      lineWidth: 2.5,
    };
  }
  if (sizeBtc >= TRADE_BUBBLE_STRONG_BTC) {
    return {
      fill: isBuy ? "rgba(40, 220, 120, 0.78)" : "rgba(255, 75, 75, 0.78)",
      stroke: baseStroke,
      glow: isBuy ? "rgba(40, 220, 120, 0.45)" : "rgba(255, 75, 75, 0.45)",
      lineWidth: 2,
    };
  }
  if (sizeBtc >= TRADE_BUBBLE_VISIBLE_BTC) {
    return { fill: baseFill, stroke: baseStroke, glow: baseGlow, lineWidth: 1.25 };
  }
  return {
    fill: isBuy ? "rgba(40, 220, 120, 0.42)" : "rgba(255, 75, 75, 0.42)",
    stroke: isBuy ? "rgba(100, 220, 150, 0.7)" : "rgba(255, 120, 120, 0.7)",
    glow: "transparent",
    lineWidth: 0.75,
  };
}
