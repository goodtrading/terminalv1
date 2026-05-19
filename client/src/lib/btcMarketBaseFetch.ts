import type { MarketCandle } from "@/lib/marketCandleTypes";
import { buildMarketCandlesUrl } from "@shared/candleLimits";

export type BtcMarketBasePack = {
  base: MarketCandle[];
  baseBarSec: number;
  /** Server-built 15s series (limit ~200); preferred over client aggregation from 1s when longer. */
  seed15s?: MarketCandle[];
  /** Native 15m from GET ?interval=15m (not client-aggregated from 1s). */
  native15m?: MarketCandle[];
};

function extractTime(value: unknown): number | null {
  if (typeof value === "number") return Number.isFinite(value) ? value : null;
  if (typeof value === "string") {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }
  return null;
}

function normalizeCandle(input: unknown): MarketCandle | null {
  if (!input || typeof input !== "object") return null;
  const obj = input as Record<string, unknown>;
  const timeRaw = obj.time ?? obj.timestamp ?? obj.openTime;
  let time = extractTime(timeRaw);
  if (time === null) return null;
  if (time > 1e10) time = Math.floor(time / 1000);

  const num = (k: string): number | null => {
    const v = obj[k];
    if (typeof v === "number" && Number.isFinite(v)) return v;
    if (typeof v === "string") {
      const n = Number(v);
      return Number.isFinite(n) ? n : null;
    }
    return null;
  };
  const open = num("open");
  const high = num("high");
  const low = num("low");
  const close = num("close");
  if (open === null || high === null || low === null || close === null) return null;
  const volume = num("volume") ?? 0;
  return { time, open, high, low, close, volume };
}

export async function fetchMarketCandles(
  symbol: string,
  interval: string,
  limit?: number,
): Promise<MarketCandle[]> {
  return fetchNormalized(buildMarketCandlesUrl(symbol, interval, limit));
}

async function fetchNormalized(url: string): Promise<MarketCandle[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Candles fetch failed: ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeCandle).filter((c): c is MarketCandle => c !== null);
}

const MIN_BASE_BARS = 8;

/**
 * Prefer 1s as base (client derives 1m / 5m).
 * Always load native 15s seed (~200 bars) + native 15m in parallel.
 * Fallback: 1m base + same 15s seed when 1s is unavailable.
 */
export async function fetchBtcMarketBasePack(): Promise<BtcMarketBasePack> {
  const [oneS, native15mRaw, seed15sRaw] = await Promise.all([
    fetchNormalized(buildMarketCandlesUrl("BTCUSDT", "1s")),
    fetchNormalized(buildMarketCandlesUrl("BTCUSDT", "15m")).catch(() => [] as MarketCandle[]),
    fetchNormalized(buildMarketCandlesUrl("BTCUSDT", "15s")).catch(() => [] as MarketCandle[]),
  ]);
  const native15m = native15mRaw.length ? native15mRaw : undefined;
  const seed15s = seed15sRaw.length ? seed15sRaw : undefined;

  if (oneS.length >= MIN_BASE_BARS) {
    return { base: oneS, baseBarSec: 1, native15m, seed15s };
  }

  const oneM = await fetchNormalized(buildMarketCandlesUrl("BTCUSDT", "1m"));
  return {
    base: oneM,
    baseBarSec: 60,
    seed15s,
    native15m,
  };
}
