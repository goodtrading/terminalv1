import { useMemo } from "react";
import {
  buildBookmapTradeAggregation,
  type BookmapTradeAggregation,
} from "@/components/flows/bookmapTradeAggregation";
import type { BookmapTradeScope } from "@/components/flows/bookmapTradeTypes";
import type { HeatmapTrade } from "@/components/flows/liquidityHeatmapUtils";

export type UseBookmapTradesOptions = {
  enabled?: boolean;
  scope?: BookmapTradeScope;
  /** Visible time window (ms) — used when scope is `visible`. */
  visibleTimeMin?: number | null;
  visibleTimeMax?: number | null;
  /** Chart window: only render buckets in this range (bottom panel). */
  chartTimeMin?: number | null;
  chartTimeMax?: number | null;
};

const EMPTY_SUMMARY: BookmapTradeAggregation["summary"] = {
  tradeCount: 0,
  buyVolume: 0,
  sellVolume: 0,
  volume: 0,
  delta: 0,
  cvd: 0,
  imbalancePct: 0,
  latestDelta: 0,
  firstTimestamp: null,
  lastTimestamp: null,
};

export function useBookmapTrades(
  rawTrades: HeatmapTrade[],
  tradeTick: number,
  options: UseBookmapTradesOptions = {},
): BookmapTradeAggregation & { enabled: boolean } {
  const {
    enabled = true,
    scope = "session",
    visibleTimeMin = null,
    visibleTimeMax = null,
    chartTimeMin = null,
    chartTimeMax = null,
  } = options;

  const aggregation = useMemo(() => {
    if (!enabled) {
      return {
        trades: [],
        scopedTrades: [],
        buckets: [],
        bucketMs: 30_000,
        summary: EMPTY_SUMMARY,
        visibleDurationMs: null,
      } satisfies BookmapTradeAggregation;
    }
    return buildBookmapTradeAggregation({
      rawTrades,
      scope,
      visibleTimeMin,
      visibleTimeMax,
    });
  }, [enabled, rawTrades, tradeTick, scope, visibleTimeMin, visibleTimeMax]);

  const chartBuckets = useMemo(() => {
    if (!enabled || aggregation.buckets.length === 0) return [];
    if (chartTimeMin == null || chartTimeMax == null) {
      return aggregation.buckets;
    }
    return aggregation.buckets.filter(
      (b) => b.timeBucket >= chartTimeMin && b.timeBucket <= chartTimeMax,
    );
  }, [enabled, aggregation.buckets, chartTimeMin, chartTimeMax]);

  return {
    ...aggregation,
    buckets: chartBuckets.length > 0 ? chartBuckets : aggregation.buckets,
    enabled,
  };
}
