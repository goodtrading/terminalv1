import {
  TRADE_DOT_COLOR_MODE,
  type TradeDotColorMode,
} from "@/lib/bookmapEngineConfig";
import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import type { BookmapVisualSettings } from "@/components/terminal/bookmap/bookmapSettings";
import { computeTradeDotRadius } from "@/components/terminal/bookmap/bookmapSettings";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import type { BookmapTrade } from "./bookmapTradeTypes";
import { HEATMAP_PAD } from "./bookmapHeatmapRenderer";

export { TRADE_DOT_COLOR_MODE, type TradeDotColorMode };

export const ENGINE_TRADE_DOT_MAX = 1_000;
export const ENGINE_TRADE_DOT_MIN_BTC = 0.01;

const HALO_SCALE = 1.48;
const CORE_SCALE = 0.52;
const GLOW_MID_SCALE = 1.18;

export type EngineTradeDot = {
  timestamp: number;
  price: number;
  sizeBtc: number;
  side: "buy" | "sell";
  tradeCount: number;
  buyVolume: number;
  sellVolume: number;
  /** Stable key for deterministic jitter. */
  jitterKey: number;
  /** True when buy/sell volume in cluster is nearly balanced. */
  mixedDominance: boolean;
};

export type EngineTradeDotStats = {
  tradeCount: number;
  visibleTrades: number;
  dotCount: number;
  groupedCount: number;
  buyDots: number;
  sellDots: number;
  dotRadiusMin: number;
  dotRadiusMax: number;
  clusterMs: number;
};

export type TradeDotVisualContext = {
  settings: BookmapVisualSettings;
  spot: number | null;
  visibleLow: number;
  visibleHigh: number;
};

export type PrepareEngineTradeDotsParams = {
  trades: BookmapTrade[];
  minPrice: number;
  maxPrice: number;
  visibleStartTime: number;
  visibleEndTime: number;
  verticalMode: VerticalCompressionMode;
  heatmapBucketSize: number;
  domBucketSize: number;
  market?: BookmapMarketSource;
  maxDots?: number;
  visual?: TradeDotVisualContext;
};

export type PreparedEngineTradeDots = {
  dots: EngineTradeDot[];
  stats: EngineTradeDotStats;
};

const EMPTY_STATS: EngineTradeDotStats = {
  tradeCount: 0,
  visibleTrades: 0,
  dotCount: 0,
  groupedCount: 0,
  buyDots: 0,
  sellDots: 0,
  dotRadiusMin: 0,
  dotRadiusMax: 0,
  clusterMs: 0,
};

type DotSizing = { min: number; max: number; factor: number };

export function tradeDotSizing(verticalMode: VerticalCompressionMode): DotSizing {
  switch (verticalMode) {
    case "micro":
      return { min: 3.8, max: 30, factor: 3.1 };
    case "intraday":
      return { min: 3.5, max: 24, factor: 2.6 };
    case "macro":
      return { min: 3, max: 18, factor: 2.2 };
    case "fullDepth":
    default:
      return { min: 2.6, max: 15, factor: 1.8 };
  }
}

/** @deprecated use tradeDotSizing */
export function tradeDotRadiusBounds(verticalMode: VerticalCompressionMode) {
  const s = tradeDotSizing(verticalMode);
  return { min: s.min, max: s.max };
}

export function tradeDotClusterParams(
  verticalMode: VerticalCompressionMode,
  heatmapBucketSize: number,
  domBucketSize: number,
): { timeClusterMs: number; priceCluster: number } {
  switch (verticalMode) {
    case "micro":
      return {
        timeClusterMs: 300,
        priceCluster: Math.max(1, heatmapBucketSize * 0.5),
      };
    case "intraday":
      return {
        timeClusterMs: 1_800,
        priceCluster: Math.max(1, heatmapBucketSize),
      };
    case "macro":
      return {
        timeClusterMs: 8_000,
        priceCluster: Math.max(heatmapBucketSize, domBucketSize),
      };
    case "fullDepth":
    default:
      return {
        timeClusterMs: 15_000,
        priceCluster: Math.max(domBucketSize, heatmapBucketSize),
      };
  }
}

export type TradeDotSizeTier = "small" | "medium" | "large" | "huge";

export function sizeTierFromRadius(radius: number): TradeDotSizeTier {
  if (radius >= 22) return "huge";
  if (radius >= 14) return "large";
  if (radius >= 8) return "medium";
  return "small";
}

/** Perceptual radius: clamp(minR + sqrt(sizeBtc) * factor, minR, maxR). */
export function tradeDotRadius(
  sizeBtc: number,
  verticalMode: VerticalCompressionMode,
  visual?: TradeDotVisualContext,
): number {
  if (!Number.isFinite(sizeBtc) || sizeBtc <= 0) return 0;
  if (visual?.settings) {
    const spot = visual.spot ?? (visual.visibleLow + visual.visibleHigh) / 2;
    return computeTradeDotRadius({
      sizeBtc,
      visibleLow: visual.visibleLow,
      visibleHigh: visual.visibleHigh,
      spot: spot > 0 ? spot : 1,
      settings: visual.settings,
    });
  }
  const { min, max, factor } = tradeDotSizing(verticalMode);
  const r = min + Math.sqrt(sizeBtc) * factor;
  return Math.min(max, Math.max(min, r));
}

export function clusterDisplaySizeBtc(dot: EngineTradeDot): number {
  if (dot.tradeCount <= 1) return dot.sizeBtc;
  return dot.sizeBtc * (1 + Math.min(0.22, Math.log1p(dot.tradeCount - 1) * 0.08));
}

function snapPrice(price: number, step: number): number {
  const s = Math.max(1, step);
  return Math.round(price / s) * s;
}

function jitterKeyForTrade(t: BookmapTrade): number {
  return t.timestamp ^ Math.round(t.price * 100) ^ Math.round(t.sizeBtc * 1e6);
}

function clusterTrades(
  trades: BookmapTrade[],
  timeClusterMs: number,
  priceCluster: number,
): EngineTradeDot[] {
  const bucketMs = Math.max(50, timeClusterMs);
  const map = new Map<
    string,
    {
      buyVolume: number;
      sellVolume: number;
      priceSum: number;
      timeSum: number;
      vol: number;
      tradeCount: number;
      jitterKey: number;
    }
  >();

  for (const t of trades) {
    const timeKey = Math.floor(t.timestamp / bucketMs);
    const priceKey = snapPrice(t.price, priceCluster);
    const key = `${timeKey}|${priceKey}`;
    const slot = map.get(key) ?? {
      buyVolume: 0,
      sellVolume: 0,
      priceSum: 0,
      timeSum: 0,
      vol: 0,
      tradeCount: 0,
      jitterKey: jitterKeyForTrade(t),
    };
    if (t.side === "buy") slot.buyVolume += t.sizeBtc;
    else slot.sellVolume += t.sizeBtc;
    slot.priceSum += t.price * t.sizeBtc;
    slot.timeSum += t.timestamp * t.sizeBtc;
    slot.vol += t.sizeBtc;
    slot.tradeCount += 1;
    map.set(key, slot);
  }

  const out: EngineTradeDot[] = [];
  for (const slot of Array.from(map.values())) {
    if (slot.vol <= 0) continue;
    const dominance = Math.abs(slot.buyVolume - slot.sellVolume) / slot.vol;
    const side = slot.buyVolume >= slot.sellVolume ? "buy" : "sell";
    out.push({
      timestamp: slot.timeSum / slot.vol,
      price: slot.priceSum / slot.vol,
      sizeBtc: slot.vol,
      side,
      tradeCount: slot.tradeCount,
      buyVolume: slot.buyVolume,
      sellVolume: slot.sellVolume,
      jitterKey: slot.jitterKey,
      mixedDominance: dominance < 0.58,
    });
  }

  return out;
}

function computeDotRenderStats(
  dots: EngineTradeDot[],
  verticalMode: VerticalCompressionMode,
  tradeCount: number,
  visibleTrades: number,
  clusterMs: number,
  visual?: TradeDotVisualContext,
): EngineTradeDotStats {
  let buyDots = 0;
  let sellDots = 0;
  let dotRadiusMin = Infinity;
  let dotRadiusMax = 0;

  for (const d of dots) {
    if (d.side === "buy") buyDots++;
    else sellDots++;
    const r = tradeDotRadius(clusterDisplaySizeBtc(d), verticalMode, visual);
    if (r > 0) {
      dotRadiusMin = Math.min(dotRadiusMin, r);
      dotRadiusMax = Math.max(dotRadiusMax, r);
    }
  }

  const sizing = tradeDotSizing(verticalMode);
  const minR = visual?.settings.trades.minSize ?? sizing.min;
  const maxR = visual?.settings.trades.maxSize ?? sizing.max;

  return {
    tradeCount,
    visibleTrades,
    dotCount: dots.length,
    groupedCount: Math.max(0, visibleTrades - dots.length),
    buyDots,
    sellDots,
    dotRadiusMin: Number.isFinite(dotRadiusMin) ? dotRadiusMin : minR,
    dotRadiusMax: dotRadiusMax > 0 ? dotRadiusMax : maxR,
    clusterMs,
  };
}

export function prepareEngineTradeDots(
  params: PrepareEngineTradeDotsParams,
): PreparedEngineTradeDots {
  const maxDots = params.maxDots ?? (params.market === "perp" ? 1_800 : ENGINE_TRADE_DOT_MAX);
  const isMicro = params.verticalMode === "micro";
  const { timeClusterMs, priceCluster: rawPriceCluster } =
    tradeDotClusterParams(
      params.verticalMode,
      params.heatmapBucketSize,
      params.domBucketSize,
    );
  const baseTimeMs =
    params.market === "perp" && !isMicro
      ? Math.max(250, Math.round(timeClusterMs * 0.45))
      : timeClusterMs;
  const basePriceCluster =
    params.market === "perp" && !isMicro
      ? Math.max(1, Math.round(rawPriceCluster * 0.65))
      : rawPriceCluster;

  const tradeCfg = params.visual?.settings.trades;
  const minBtc = tradeCfg?.hideSmallTrades
    ? Math.max(ENGINE_TRADE_DOT_MIN_BTC, tradeCfg.minTradeSize)
    : Math.max(ENGINE_TRADE_DOT_MIN_BTC, tradeCfg?.minTradeSize ?? 0);

  const filtered = params.trades.filter(
    (t) =>
      t.sizeBtc >= minBtc &&
      t.timestamp >= params.visibleStartTime &&
      t.timestamp <= params.visibleEndTime &&
      t.price >= params.minPrice &&
      t.price <= params.maxPrice,
  );

  if (!filtered.length) {
    return { dots: [], stats: { ...EMPTY_STATS } };
  }

  const useCluster = tradeCfg?.clusterTrades !== false;

  let timeMs = baseTimeMs;
  let priceCluster = basePriceCluster;
  let dots: EngineTradeDot[] = useCluster
    ? clusterTrades(filtered, timeMs, priceCluster)
    : filtered.map((t) => ({
        timestamp: t.timestamp,
        price: t.price,
        sizeBtc: t.sizeBtc,
        side: t.side,
        tradeCount: 1,
        buyVolume: t.side === "buy" ? t.sizeBtc : 0,
        sellVolume: t.side === "sell" ? t.sizeBtc : 0,
        jitterKey: jitterKeyForTrade(t),
        mixedDominance: false,
      }));

  const maxPasses = isMicro ? 3 : 6;
  const timeGrow = isMicro ? 1.28 : 1.72;
  const priceGrow = isMicro ? 1.12 : 1.32;

  if (useCluster) {
    for (let i = 0; i < maxPasses && dots.length > maxDots; i++) {
      timeMs = Math.round(timeMs * timeGrow);
      priceCluster = Math.max(
        isMicro ? 1 : priceCluster,
        Math.round(priceCluster * priceGrow),
      );
      dots = clusterTrades(filtered, timeMs, priceCluster);
    }
  }

  if (dots.length > maxDots) {
    dots.sort((a, b) => b.sizeBtc - a.sizeBtc);
    dots = dots.slice(0, maxDots);
  }

  return {
    dots,
    stats: computeDotRenderStats(
      dots,
      params.verticalMode,
      params.trades.length,
      filtered.length,
      timeMs,
      params.visual,
    ),
  };
}

type TierOpacity = { fill: number; halo: number };

const TIER_OPACITY: Record<TradeDotSizeTier, TierOpacity> = {
  small: { fill: 0.7, halo: 0.08 },
  medium: { fill: 0.8, halo: 0.12 },
  large: { fill: 0.9, halo: 0.18 },
  huge: { fill: 0.96, halo: 0.24 },
};

export type BookmapDotLayerStyle = {
  halo: string;
  glowMid: string;
  fill: string;
  core: string;
  stroke: string;
  strokeWidth: number;
};

export function bookmapDotLayerStyle(
  side: "buy" | "sell",
  radius: number,
  mixedDominance: boolean,
  colorMode: TradeDotColorMode = TRADE_DOT_COLOR_MODE,
): BookmapDotLayerStyle {
  const tier = sizeTierFromRadius(radius);
  let { fill: fillA, halo: haloA } = TIER_OPACITY[tier];
  if (mixedDominance) {
    fillA *= 0.86;
    haloA *= 0.82;
  }

  const strokeWidth = radius >= 14 ? 1.05 : radius >= 8 ? 0.95 : 0.8;

  if (side === "buy") {
    if (colorMode === "goodtradingOrange") {
      return {
        halo: `rgba(255, 159, 26, ${haloA})`,
        glowMid: `rgba(255, 140, 30, ${haloA * 0.72})`,
        fill: `rgba(255, 159, 26, ${fillA})`,
        core: `rgba(255, 200, 120, 0.45)`,
        stroke: `rgba(255, 220, 160, ${0.28 * (mixedDominance ? 0.85 : 1)})`,
        strokeWidth,
      };
    }
    return {
      halo: `rgba(0, 255, 140, ${haloA})`,
      glowMid: `rgba(30, 220, 130, ${haloA * 0.75})`,
      fill: `rgba(30, 220, 130, ${fillA})`,
      core: `rgba(130, 255, 190, 0.45)`,
      stroke: `rgba(190, 255, 220, ${0.28 * (mixedDominance ? 0.85 : 1)})`,
      strokeWidth,
    };
  }

  return {
    halo: `rgba(255, 80, 100, ${haloA})`,
    glowMid: `rgba(235, 80, 100, ${haloA * 0.75})`,
    fill: `rgba(235, 80, 100, ${fillA})`,
    core: `rgba(255, 165, 175, 0.4)`,
    stroke: `rgba(255, 220, 225, ${0.25 * (mixedDominance ? 0.85 : 1)})`,
    strokeWidth,
  };
}

/** @deprecated */
export type TradeDotPaintStyle = BookmapDotLayerStyle;

/** @deprecated */
export function tradeDotPaintStyle(
  side: "buy" | "sell",
  _sizeBtc: number,
  radius: number,
  colorMode?: TradeDotColorMode,
): BookmapDotLayerStyle {
  return bookmapDotLayerStyle(side, radius, false, colorMode);
}

export function deterministicDotJitter(
  jitterKey: number,
  radius: number,
): { dx: number; dy: number } {
  const h = (jitterKey * 1_103_515_245 + 12_345) >>> 0;
  const hx = (h & 0xffff) / 0xffff - 0.5;
  const hy = ((h >>> 16) & 0xffff) / 0xffff - 0.5;
  const amp = radius >= 14 ? 1 : 1.8;
  return { dx: hx * amp, dy: hy * amp * 0.35 };
}

function drawBookmapLayeredDot(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  radius: number,
  style: BookmapDotLayerStyle,
): void {
  const haloR = radius * HALO_SCALE;
  const midR = radius * GLOW_MID_SCALE;
  const coreR = radius * CORE_SCALE;
  const coreY = y - radius * 0.06;

  ctx.beginPath();
  ctx.arc(x, y, haloR, 0, Math.PI * 2);
  ctx.fillStyle = style.halo;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, midR, 0, Math.PI * 2);
  ctx.fillStyle = style.glowMid;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.fillStyle = style.fill;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, coreY, coreR, 0, Math.PI * 2);
  ctx.fillStyle = style.core;
  ctx.fill();

  ctx.beginPath();
  ctx.arc(x, y, radius, 0, Math.PI * 2);
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.strokeWidth;
  ctx.stroke();
}

export function renderEngineTradeDots(
  ctx: CanvasRenderingContext2D,
  dots: EngineTradeDot[],
  timeToX: (timeMs: number) => number,
  priceToY: (price: number) => number,
  plotW: number,
  plotH: number,
  verticalMode: VerticalCompressionMode,
  visual?: TradeDotVisualContext,
): void {
  if (!dots.length) return;

  const plotLeft = HEATMAP_PAD.left;
  const plotTop = HEATMAP_PAD.top;
  const plotRight = plotLeft + plotW;
  const plotBottom = plotTop + plotH;

  const sorted = [...dots].sort((a, b) => {
    const ra = tradeDotRadius(clusterDisplaySizeBtc(a), verticalMode, visual);
    const rb = tradeDotRadius(clusterDisplaySizeBtc(b), verticalMode, visual);
    return ra - rb;
  });

  for (const dot of sorted) {
    const displaySize = clusterDisplaySizeBtc(dot);
    const radius = tradeDotRadius(displaySize, verticalMode, visual);
    if (radius <= 0) continue;

    const { dx, dy } = deterministicDotJitter(dot.jitterKey, radius);
    const x = timeToX(dot.timestamp) + dx;
    const y = priceToY(dot.price) + dy;
    const pad = radius * HALO_SCALE + 2;

    if (x + pad < plotLeft || x - pad > plotRight) continue;
    if (y + pad < plotTop || y - pad > plotBottom) continue;

    const style = bookmapDotLayerStyle(
      dot.side,
      radius,
      dot.mixedDominance,
      TRADE_DOT_COLOR_MODE,
    );

    drawBookmapLayeredDot(ctx, x, y, radius, style);
  }
}
