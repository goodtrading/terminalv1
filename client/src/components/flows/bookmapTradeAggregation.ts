import type { HeatmapTrade } from "./liquidityHeatmapUtils";
import type {
  BookmapTrade,
  BookmapTradeScope,
  BookmapTradeSessionSummary,
  DeltaVolumeBucket,
} from "./bookmapTradeTypes";

const DEFAULT_BUCKET_MS = 30_000;

export function heatmapTradeToBookmapTrade(t: HeatmapTrade): BookmapTrade {
  return {
    id: t.id,
    timestamp: t.ts,
    price: t.price,
    sizeBtc: t.sizeBtc,
    side: t.side,
  };
}

export function normalizeBookmapTrades(raw: HeatmapTrade[]): BookmapTrade[] {
  return raw.map(heatmapTradeToBookmapTrade);
}

/** Adaptive time bucket from visible duration (default 30s when unknown). */
export function chooseTimeBucketMs(visibleDurationMs: number | null): number {
  const d =
    visibleDurationMs != null && Number.isFinite(visibleDurationMs) && visibleDurationMs > 0
      ? visibleDurationMs
      : 30 * 60_000;

  if (d <= 2 * 60_000) return 1_000;
  if (d <= 8 * 60_000) return 5_000;
  if (d <= 45 * 60_000) return 15_000;
  if (d <= 3 * 60 * 60_000) return 30_000;
  if (d <= 12 * 60 * 60_000) return 60_000;
  return 300_000;
}

export function filterTradesByScope(
  trades: BookmapTrade[],
  scope: BookmapTradeScope,
  visibleTimeMin?: number | null,
  visibleTimeMax?: number | null,
): BookmapTrade[] {
  if (scope !== "visible") return trades;
  if (
    visibleTimeMin == null ||
    visibleTimeMax == null ||
    !Number.isFinite(visibleTimeMin) ||
    !Number.isFinite(visibleTimeMax)
  ) {
    return trades;
  }
  return trades.filter(
    (t) => t.timestamp >= visibleTimeMin && t.timestamp <= visibleTimeMax,
  );
}

export function aggregateTradesToDeltaBuckets(
  trades: BookmapTrade[],
  bucketMs: number,
): DeltaVolumeBucket[] {
  const ms = Math.max(1_000, bucketMs);
  const map = new Map<
    number,
    {
      buyVolume: number;
      sellVolume: number;
      tradeCount: number;
    }
  >();

  for (const t of trades) {
    if (!Number.isFinite(t.timestamp) || t.sizeBtc <= 0) continue;
    const timeBucket = Math.floor(t.timestamp / ms) * ms;
    const slot = map.get(timeBucket) ?? {
      buyVolume: 0,
      sellVolume: 0,
      tradeCount: 0,
    };
    if (t.side === "buy") slot.buyVolume += t.sizeBtc;
    else slot.sellVolume += t.sizeBtc;
    slot.tradeCount += 1;
    map.set(timeBucket, slot);
  }

  const sorted = Array.from(map.entries()).sort((a, b) => a[0] - b[0]);
  let cvd = 0;
  const out: DeltaVolumeBucket[] = [];

  for (const [timeBucket, slot] of sorted) {
    const buyVolume = slot.buyVolume;
    const sellVolume = slot.sellVolume;
    const volume = buyVolume + sellVolume;
    const delta = buyVolume - sellVolume;
    cvd += delta;
    out.push({
      timeBucket,
      buyVolume,
      sellVolume,
      volume,
      delta,
      cvd,
      tradeCount: slot.tradeCount,
    });
  }

  return out;
}

export function computeTradeSessionSummary(
  trades: BookmapTrade[],
  buckets: DeltaVolumeBucket[],
): BookmapTradeSessionSummary {
  let buyVolume = 0;
  let sellVolume = 0;
  let firstTimestamp: number | null = null;
  let lastTimestamp: number | null = null;

  for (const t of trades) {
    if (t.side === "buy") buyVolume += t.sizeBtc;
    else sellVolume += t.sizeBtc;
    if (firstTimestamp == null || t.timestamp < firstTimestamp) {
      firstTimestamp = t.timestamp;
    }
    if (lastTimestamp == null || t.timestamp > lastTimestamp) {
      lastTimestamp = t.timestamp;
    }
  }

  const volume = buyVolume + sellVolume;
  const delta = buyVolume - sellVolume;
  const cvd = buckets.length > 0 ? buckets[buckets.length - 1]!.cvd : delta;
  const latestDelta = buckets.length > 0 ? buckets[buckets.length - 1]!.delta : 0;
  const imbalancePct = volume > 0 ? (delta / volume) * 100 : 0;

  return {
    tradeCount: trades.length,
    buyVolume,
    sellVolume,
    volume,
    delta,
    cvd,
    imbalancePct,
    latestDelta,
    firstTimestamp,
    lastTimestamp,
  };
}

export type BookmapTradeAggregation = {
  trades: BookmapTrade[];
  scopedTrades: BookmapTrade[];
  buckets: DeltaVolumeBucket[];
  bucketMs: number;
  summary: BookmapTradeSessionSummary;
  visibleDurationMs: number | null;
};

export function buildBookmapTradeAggregation(params: {
  rawTrades: HeatmapTrade[];
  scope?: BookmapTradeScope;
  visibleTimeMin?: number | null;
  visibleTimeMax?: number | null;
  bucketMsOverride?: number;
}): BookmapTradeAggregation {
  const trades = normalizeBookmapTrades(params.rawTrades);
  const scope = params.scope ?? "session";
  const scopedTrades = filterTradesByScope(
    trades,
    scope,
    params.visibleTimeMin,
    params.visibleTimeMax,
  );

  let visibleDurationMs: number | null = null;
  if (
    params.visibleTimeMin != null &&
    params.visibleTimeMax != null &&
    Number.isFinite(params.visibleTimeMin) &&
    Number.isFinite(params.visibleTimeMax)
  ) {
    visibleDurationMs = params.visibleTimeMax - params.visibleTimeMin;
  } else if (scopedTrades.length >= 2) {
    const ts = scopedTrades.map((t) => t.timestamp);
    visibleDurationMs = Math.max(...ts) - Math.min(...ts);
  }

  const bucketMs =
    params.bucketMsOverride ?? chooseTimeBucketMs(visibleDurationMs);
  const buckets = aggregateTradesToDeltaBuckets(scopedTrades, bucketMs);
  const summary = computeTradeSessionSummary(scopedTrades, buckets);

  return {
    trades,
    scopedTrades,
    buckets,
    bucketMs,
    summary,
    visibleDurationMs,
  };
}

export function formatBtcCompact(value: number, digits = 1): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 100) return `${sign}${abs.toFixed(0)}`;
  return `${sign}${abs.toFixed(digits)}`;
}

/** ATAS-style compact cell labels: 645.8, 1.2K, -461.6 */
export function formatCompactBtc(value: number): string {
  if (!Number.isFinite(value)) return "—";
  const sign = value < 0 ? "-" : "";
  const abs = Math.abs(value);
  if (abs >= 1000) {
    const k = abs / 1000;
    return `${sign}${k >= 10 ? k.toFixed(0) : k.toFixed(1)}K`;
  }
  return `${sign}${abs.toFixed(1)}`;
}

/** 95th percentile for relative cell intensity (visible window). */
export function percentile95(values: number[]): number {
  if (!values.length) return 1;
  const sorted = values
    .filter((v) => Number.isFinite(v))
    .sort((a, b) => a - b);
  if (!sorted.length) return 1;
  const idx = Math.min(sorted.length - 1, Math.floor(sorted.length * 0.95));
  return Math.max(sorted[idx]!, 0.01);
}

export { DEFAULT_BUCKET_MS };
