import type { MarketCandle } from "@/lib/marketCandleTypes";
import { fetchMarketCandles } from "@/lib/btcMarketBaseFetch";
import { isDesktopApp } from "@/lib/desktopRuntime";
import { getContiguousSuffix, intervalMsFor } from "./candleContinuity";

export type CandleHistoryKey = {
  exchange: string;
  market: string;
  symbol: string;
  timeframe: string;
};

export type CandleHistoryCacheHit = "CACHE_HIT" | "CACHE_PARTIAL" | "CACHE_MISS" | "NETWORK_FILL" | "WEB_NETWORK_ONLY" | "DISABLED";

export type CandleHistoryPage = {
  candles: MarketCandle[];
  cacheResult: CandleHistoryCacheHit;
  rowCount: number;
  limit: number;
  beforeMs: number | null;
  databasePath: string | null;
};

type CandleHistoryKeyPayload = {
  exchange: string;
  marketType: string;
  symbol: string;
  timeframe: string;
};

type CandleHistoryReadArgs = {
  key: CandleHistoryKeyPayload;
  beforeMs: number | null;
  limit: number;
};

type CandleHistoryUpsertArgs = {
  key: CandleHistoryKeyPayload;
  candles: Array<{
    openTimeMs: number;
    open: number;
    high: number;
    low: number;
    close: number;
    volume: number;
  }>;
};

type CandleStoreInitResult = {
  databasePath: string;
  schemaVersion: number;
};

type CandleStoreStats = {
  databasePath: string;
  schemaVersion: number;
  rowCount: number;
  fileSizeBytes: number;
};

function toPayloadKey(key: CandleHistoryKey): CandleHistoryKeyPayload {
  return {
    exchange: key.exchange,
    marketType: key.market,
    symbol: key.symbol,
    timeframe: key.timeframe,
  };
}

function toRustCandle(candle: MarketCandle) {
  return {
    openTimeMs: Math.trunc(candle.time * 1000),
    open: candle.open,
    high: candle.high,
    low: candle.low,
    close: candle.close,
    volume: candle.volume ?? 0,
  };
}

async function invokeDesktop<T>(command: string, args?: Record<string, unknown>): Promise<T> {
  const { invoke } = await import("@tauri-apps/api/core");
  return invoke<T>(command, args);
}

export async function initCandleHistoryStore(): Promise<CandleStoreInitResult | null> {
  if (!isDesktopApp()) return null;
  try {
    return await invokeDesktop<CandleStoreInitResult>("init_candle_history_store");
  } catch {
    return null;
  }
}

export async function readCandleHistoryPage(request: {
  key: CandleHistoryKey;
  before?: number | null;
  limit: number;
}): Promise<CandleHistoryPage> {
  const beforeMs = request.before ?? null;
  if (!isDesktopApp()) {
    const candles = await fetchMarketCandles(request.key.symbol, request.key.timeframe, request.limit, beforeMs);
    return {
      candles,
      cacheResult: "WEB_NETWORK_ONLY",
      rowCount: candles.length,
      limit: request.limit,
      beforeMs,
      databasePath: null,
    };
  }

  try {
    const page = await invokeDesktop<{
      candles: Array<{ openTimeMs: number; open: number; high: number; low: number; close: number; volume: number }>;
      cacheResult: string;
      rowCount: number;
      limit: number;
      beforeMs: number | null;
      databasePath: string;
    }>("read_candle_history_page", {
      input: {
        key: toPayloadKey(request.key),
        beforeMs,
        limit: request.limit,
      },
    });
    return {
      candles: page.candles.map((candle) => ({
        time: Math.trunc(candle.openTimeMs / 1000),
        open: candle.open,
        high: candle.high,
        low: candle.low,
        close: candle.close,
        volume: candle.volume,
      })),
      cacheResult: page.cacheResult as CandleHistoryCacheHit,
      rowCount: page.rowCount,
      limit: page.limit,
      beforeMs: page.beforeMs,
      databasePath: page.databasePath,
    };
  } catch {
    return {
      candles: [],
      cacheResult: "DISABLED",
      rowCount: 0,
      limit: request.limit,
      beforeMs,
      databasePath: null,
    };
  }
}

export async function upsertCandleHistoryBatch(key: CandleHistoryKey, candles: MarketCandle[]): Promise<void> {
  if (!isDesktopApp() || candles.length === 0) return;
  try {
    await invokeDesktop<number>("upsert_candle_history_batch", {
      input: {
        key: toPayloadKey(key),
        candles: candles.map(toRustCandle),
      } satisfies CandleHistoryUpsertArgs,
    });
  } catch {
    // Cache best-effort only.
  }
}

export async function getCandleHistoryStats(): Promise<CandleStoreStats | null> {
  if (!isDesktopApp()) return null;
  try {
    return await invokeDesktop<CandleStoreStats>("get_candle_history_stats");
  } catch {
    return null;
  }
}

export async function clearCandleHistoryStore(): Promise<void> {
  if (!isDesktopApp()) return;
  try {
    await invokeDesktop<void>("clear_candle_history_store");
  } catch {
    // ignore
  }
}

export async function fetchCachedCandleHistoryPage(request: {
  key: CandleHistoryKey;
  before?: number | null;
  limit: number;
}): Promise<CandleHistoryPage> {
  const cached = await readCandleHistoryPage(request);
  // An unbounded read is cache-first. A bounded read must cover the requested
  // interval, not merely return an older nonempty block from before a hole.
  const intervalMs = intervalMsFor(request.key.timeframe);
  const suffix = getContiguousSuffix(cached.candles, request.key.timeframe);
  const coversBoundary = request.before == null || (
    suffix.newestMs === Math.floor((request.before - 1) / intervalMs) * intervalMs &&
    suffix.count >= request.limit
  );
  if (cached.cacheResult === "WEB_NETWORK_ONLY" ||
      (cached.cacheResult !== "CACHE_MISS" && cached.candles.length > 0 && coversBoundary)) {
    return cached;
  }

  const historyKey = request.key;
  const before = request.before ?? null;
  const limit = request.limit;

  const candles = await fetchMarketCandles(historyKey.symbol, historyKey.timeframe, limit, before);

  if (candles.length > 0) {
    try {
      await upsertCandleHistoryBatch(historyKey, candles);
    } catch (error) {
      console.error("[candleHistoryCache][upsert-error]", error);
    }
  }

  return {
    candles,
    cacheResult: candles.length > 0 ? "NETWORK_FILL" : cached.cacheResult,
    rowCount: candles.length,
    limit: request.limit,
    beforeMs: request.before ?? null,
    databasePath: cached.databasePath,
  };
}
