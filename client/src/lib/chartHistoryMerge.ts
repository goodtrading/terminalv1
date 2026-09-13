import type { MarketCandle } from "@/lib/marketCandleTypes";

export function mergeHistoricalCandles(
  existing: MarketCandle[],
  incoming: MarketCandle[],
): MarketCandle[] {
  if (!incoming.length && !existing.length) return [];
  const byTime = new Map<number, MarketCandle>();
  for (const candle of [...existing, ...incoming]) {
    if (!candle || !Number.isFinite(candle.time)) continue;
    byTime.set(candle.time, { ...candle });
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}
