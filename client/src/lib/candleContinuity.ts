/**
 * Interval-aware candle continuity helpers.
 * Pure functions — no side effects, no network, no persistence.
 */

import type { MarketCandle } from "@/lib/marketCandleTypes";
import { getChartTimeframeMeta } from "@/lib/chartTimeframes";

/**
 * Expected bucket interval in milliseconds for a chart timeframe.
 * Derives from canonical `barSec` to avoid hardcoded values.
 */
export function intervalMsFor(timeframe: string): number {
  const meta = getChartTimeframeMeta(timeframe as any);
  return meta.barSec * 1000;
}

/**
 * A single gap between two consecutive candles.
 */
export type CandleGap = {
  /** Timestamp of the candle before the gap (ms epoch) */
  previousTime: number;
  /** Timestamp of the candle after the gap (ms epoch) */
  nextTime: number;
  /** First missing bucket timestamp (ms epoch) */
  missingFrom: number;
  /** Last missing bucket timestamp (ms epoch) — exclusive upper bound for the gap interior */
  missingTo: number;
  /** Number of missing candles in this gap */
  missingCount: number;
};

/**
 * Find all gaps in a time-sorted candle array for the given timeframe.
 * Candles must be sorted by `time` ascending (seconds).
 * Returns gaps where the delta exceeds the expected interval.
 */
export function findGaps(candles: MarketCandle[], timeframe: string): CandleGap[] {
  if (candles.length < 2) return [];

  const expectedMs = intervalMsFor(timeframe);
  const toleranceMs = Math.max(1, expectedMs / 1000); // tiny tolerance for exact bucket alignment

  const gaps: CandleGap[] = [];

  for (let i = 1; i < candles.length; i++) {
    const prevMs = candles[i - 1].time * 1000;
    const nextMs = candles[i].time * 1000;
    const deltaMs = nextMs - prevMs;

    if (deltaMs > expectedMs + toleranceMs) {
      // Number of missing candles = (delta / expected) - 1
      const missingCount = Math.round(deltaMs / expectedMs) - 1;
      gaps.push({
        previousTime: prevMs,
        nextTime: nextMs,
        missingFrom: prevMs + expectedMs,
        missingTo: nextMs,
        missingCount: Math.max(0, missingCount),
      });
    }
  }

  return gaps;
}

/**
 * Result of contiguous suffix analysis.
 */
export type ContiguousSuffix = {
  /** Number of candles in the contiguous suffix reaching the newest boundary */
  count: number;
  /** Oldest timestamp in the contiguous suffix (ms epoch), or null if empty */
  oldestMs: number | null;
  /** Newest timestamp in the contiguous suffix (ms epoch), or null if empty */
  newestMs: number | null;
};

/**
 * Find the contiguous suffix of candles that reaches the newest (most recent) candle.
 *
 * Conceptually:
 * [A A A A A] GAP [B B B] → returns the [B B B] suffix (3 candles)
 *
 * The suffix must be:
 * - Sorted ascending by time
 * - Every consecutive delta == expected interval (within tiny tolerance)
 * - Includes the absolute newest candle in the array
 *
 * @param candles Time-sorted ascending array (oldest first)
 * @param timeframe Chart timeframe ID
 * @returns ContiguousSuffix with count, oldestMs, newestMs
 */
export function getContiguousSuffix(candles: MarketCandle[], timeframe: string): ContiguousSuffix {
  if (candles.length === 0) {
    return { count: 0, oldestMs: null, newestMs: null };
  }

  const expectedMs = intervalMsFor(timeframe);
  const toleranceMs = Math.max(1, expectedMs / 1000);

  // Start from the newest candle and walk backward
  let count = 1;
  const newestMs = candles[candles.length - 1].time * 1000;
  let oldestMs = newestMs;

  for (let i = candles.length - 2; i >= 0; i--) {
    const currentMs = candles[i].time * 1000;
    const nextMs = candles[i + 1].time * 1000;
    const deltaMs = nextMs - currentMs;

    if (Math.abs(deltaMs - expectedMs) <= toleranceMs) {
      count++;
      oldestMs = currentMs;
    } else {
      // Gap found — suffix ends here
      break;
    }
  }

  return { count, oldestMs, newestMs };
}

/**
 * Check if a candle array has sufficient contiguous recent coverage for X5 readiness.
 *
 * X5_READY is true only when the contiguous suffix (reaching newest)
 * has at least `targetCount` candles.
 */
export function isX5Ready(candles: MarketCandle[], timeframe: string, targetCount: number): boolean {
  const suffix = getContiguousSuffix(candles, timeframe);
  return suffix.count >= targetCount;
}

/**
 * Find the most relevant internal gap for repair.
 * Prioritizes the gap closest to the contiguous suffix (i.e., the gap
 * separating the old historical block from the recent/live block).
 */
export function findInternalGapForRepair(candles: MarketCandle[], timeframe: string): CandleGap | null {
  const gaps = findGaps(candles, timeframe);
  if (gaps.length === 0) return null;

  // The most relevant gap for internal repair is the one immediately
  // before the contiguous suffix (separating old history from recent coverage)
  const suffix = getContiguousSuffix(candles, timeframe);
  if (suffix.count === 0 || suffix.oldestMs === null) return null;

  // Find the gap whose nextTime == suffix.oldestMs (the gap right before the suffix)
  // or the gap with nextTime closest to suffix.oldestMs
  let bestGap: CandleGap | null = null;
  let bestDistance = Infinity;

  for (const gap of gaps) {
    const distance = Math.abs(gap.nextTime - suffix.oldestMs!);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestGap = gap;
    }
  }

  return bestGap;
}
