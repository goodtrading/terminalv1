import type { MarketCandle } from "@/lib/marketCandleTypes";
export type BtcMarketBasePack = {
  base: MarketCandle[];
  baseBarSec: number;
  /** When base is 1m-only, server-aggregated 15s (client cannot derive sub-minute) */
  seed15s?: MarketCandle[];
  /** Native 15m from GET /api/market/candles?interval=15m (not client-aggregated from 1s). */
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

async function fetchNormalized(url: string): Promise<MarketCandle[]> {
  const res = await fetch(url);
  if (!res.ok) throw new Error(`Candles fetch failed: ${res.status}`);
  const raw = await res.json();
  if (!Array.isArray(raw)) return [];
  return raw.map(normalizeCandle).filter((c): c is MarketCandle => c !== null);
}

const MIN_BASE_BARS = 8;

const url15m = `/api/market/candles?symbol=BTCUSDT&interval=${encodeURIComponent("15m")}&limit=500`;

/**
 * Prefer 1s as base (client can derive 15s / 1m / 5m).
 * 15m always loaded from native interval=15m (parallel to base fetch).
 * Fallback: 1m base + optional server 15s seed (see LIMITATIONS in marketEngineStore).
 */
export async function fetchBtcMarketBasePack(): Promise<BtcMarketBasePack> {
  const [oneS, native15mRaw] = await Promise.all([
    fetchNormalized(
      `/api/market/candles?symbol=BTCUSDT&interval=${encodeURIComponent("1s")}&limit=1000`,
    ),
    fetchNormalized(url15m).catch(() => [] as MarketCandle[]),
  ]);
  const native15m = native15mRaw.length ? native15mRaw : undefined;

  if (oneS.length >= MIN_BASE_BARS) {
    return { base: oneS, baseBarSec: 1, native15m };
  }

  const [oneM, seed15sRaw] = await Promise.all([
    fetchNormalized(
      `/api/market/candles?symbol=BTCUSDT&interval=${encodeURIComponent("1m")}&limit=500`,
    ),
    fetchNormalized(
      `/api/market/candles?symbol=BTCUSDT&interval=${encodeURIComponent("15s")}&limit=200`,
    ).catch(() => [] as MarketCandle[]),
  ]);
  const seed15s = seed15sRaw.length ? seed15sRaw : undefined;

  return {
    base: oneM,
    baseBarSec: 60,
    seed15s,
    native15m: native15m ?? undefined,
  };
}
