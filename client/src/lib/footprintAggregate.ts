import type { FootprintAggTrade, FootprintCandle, FootprintLevel } from "@/lib/footprintTypes";
import { FOOTPRINT_MAX_PRICE_LEVELS, FOOTPRINT_PIPELINE_DEBUG } from "@/lib/footprintConfig";

let barDebugBudget = 40;

/** @deprecated Usar `getFootprintPriceStepUsd(barSec, barWidthPx)` desde `footprintConfig` */
export function getFootprintPriceClusterUsd(barSec: number): number {
  const s = Math.max(1, Math.floor(Number(barSec)));
  if (s <= 15) return 10;
  if (s <= 60) return 10;
  if (s <= 300) return 15;
  return 25;
}

/** Precio de bucket (piso al múltiplo del cluster), ej. tick 10 → 70803 → 70800 */
export function getFootprintPriceBucket(price: number, tickSizeUsd: number): number {
  if (!Number.isFinite(price) || !Number.isFinite(tickSizeUsd) || tickSizeUsd <= 0) return price;
  return Math.floor(price / tickSizeUsd) * tickSizeUsd;
}

/** @deprecated Prefer `getFootprintPriceClusterUsd` + bucket; kept for compat */
export function choosePriceTick(low: number, high: number, maxLevels: number): number {
  const range = Math.max(high - low, 1e-9);
  const raw = range / Math.max(4, maxLevels);
  const exp = Math.floor(Math.log10(raw));
  const step = Math.pow(10, exp);
  const candidates = [1, 2, 5, 10].map((m) => m * step);
  const tick = candidates.find((c) => c >= raw) ?? step * 10;
  return Math.max(tick, 1e-8);
}

function filterLowVolumeLevels(levels: FootprintLevel[], minRatioOfMax: number): FootprintLevel[] {
  if (levels.length === 0) return levels;
  const maxV = Math.max(...levels.map((l) => l.totalVolume));
  if (maxV <= 0) return [];
  const minV = Math.max(maxV * minRatioOfMax, 1e-12);
  return levels.filter((l) => l.totalVolume >= minV);
}

/** Si hay demasiados buckets, quedarse con los de mayor volumen y ordenar otra vez por precio desc. */
function capLevelsByVolumeRank(levels: FootprintLevel[], max: number): FootprintLevel[] {
  if (levels.length <= max) return levels;
  const byVol = [...levels].sort((a, b) => b.totalVolume - a.totalVolume);
  const keep = new Set(byVol.slice(0, max).map((l) => l.price));
  return levels.filter((l) => keep.has(l.price)).sort((a, b) => b.price - a.price);
}

/**
 * Bar open / exclusive end in ms. Candle `time` is Unix **seconds** on-chart; if a feed sends ms (>1e10), fold to seconds first (same as MainChart / btcMarketBaseFetch).
 */
export function getFootprintBarWindowMs(
  ohlc: { time: number },
  barSec: number,
): { barStartMs: number; barEndMsExclusive: number; t0Sec: number } {
  const raw = Number(ohlc.time);
  if (!Number.isFinite(raw)) {
    const bs = 0;
    return { t0Sec: 0, barStartMs: bs, barEndMsExclusive: bs + Math.max(1, barSec) * 1000 };
  }
  const t0Sec = raw > 1e10 ? Math.floor(raw / 1000) : Math.floor(raw);
  const barStartMs = t0Sec * 1000;
  const barEndMsExclusive = barStartMs + Math.max(1, barSec) * 1000;
  return { t0Sec, barStartMs, barEndMsExclusive };
}

/**
 * Bucket agg trades into price levels for [barStartMs, barEndMsExclusive).
 * Bid column = aggressive sell volume; ask column = aggressive buy volume.
 * @param tickSizeUsd cluster en USD (ej. 10 → niveles cada $10)
 */
export function tradesToFootprintLevels(
  trades: FootprintAggTrade[],
  barStartMs: number,
  barEndMsExclusive: number,
  tickSizeUsd: number,
): FootprintLevel[] {
  const map = new Map<number, { bid: number; ask: number }>();
  for (const t of trades) {
    if (!Number.isFinite(t.time) || t.time < barStartMs || t.time >= barEndMsExclusive) continue;
    if (!Number.isFinite(t.price) || !Number.isFinite(t.qty) || t.qty <= 0) continue;
    const p = getFootprintPriceBucket(t.price, tickSizeUsd);
    const row = map.get(p) ?? { bid: 0, ask: 0 };
    if (t.side === "sell") row.bid += t.qty;
    else row.ask += t.qty;
    map.set(p, row);
  }
  const levels = [...map.entries()]
    .map(([price, { bid, ask }]) => ({
      price,
      bidVolume: bid,
      askVolume: ask,
      delta: ask - bid,
      totalVolume: bid + ask,
    }))
    .filter((l) => l.totalVolume > 0)
    .sort((a, b) => b.price - a.price);
  const pruned = filterLowVolumeLevels(levels, 0.012);
  return pruned;
}

export function buildFootprintForBar(
  ohlc: { time: number; open: number; high: number; low: number; close: number },
  trades: FootprintAggTrade[],
  barSec: number,
  /** Mismo paso que `getFootprintPriceStepUsd` en el cliente — grilla global */
  priceStepUsd: number,
  maxLevels = FOOTPRINT_MAX_PRICE_LEVELS,
): FootprintCandle {
  const { t0Sec, barStartMs, barEndMsExclusive } = getFootprintBarWindowMs(ohlc, barSec);
  if (FOOTPRINT_PIPELINE_DEBUG && barDebugBudget > 0 && trades.length > 0) {
    barDebugBudget--;
    const tradesInBar = trades.filter((t) => t.time >= barStartMs && t.time < barEndMsExclusive);
    console.log("BAR DEBUG", {
      ohlcTime: ohlc.time,
      barStartMs,
      barEndMs: barEndMsExclusive,
      sampleTrade: trades[0]?.time,
      tradesInBar: tradesInBar.length,
    });
  }
  const step = Number.isFinite(priceStepUsd) && priceStepUsd > 0 ? priceStepUsd : 10;
  const raw = tradesToFootprintLevels(trades, barStartMs, barEndMsExclusive, step);
  const levels = capLevelsByVolumeRank(raw, maxLevels);
  return {
    time: t0Sec,
    open: ohlc.open,
    high: ohlc.high,
    low: ohlc.low,
    close: ohlc.close,
    levels,
  };
}
