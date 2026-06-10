import { useMemo } from "react";
import { keepPreviousData, useQuery } from "@tanstack/react-query";
import { apiUrl } from "@/lib/apiBase";
import {
  BOOKMAP_ENGINE_BUCKET_MS,
  BOOKMAP_ENGINE_PRICE_RANGE_PCT,
  BOOKMAP_ENGINE_REFETCH_MS,
} from "@/lib/bookmapEngineConfig";
import type { BookmapState } from "@/types/bookmapState";
import {
  DEFAULT_BOOKMAP_MARKET,
  type BookmapMarketSource,
} from "@shared/bookmapMarket";

export type UseBookmapStateOptions = {
  symbol?: string;
  exchange?: "binance" | "kraken" | string;
  market?: BookmapMarketSource;
  priceRangePct?: number;
  /** Visible viewport min — requests book depth for DOM across wide ranges. */
  priceMin?: number;
  priceMax?: number;
  bucketMs?: number;
  minWallSize?: number;
  includeStale?: boolean;
  enabled?: boolean;
};

function buildBookmapStateUrl(options: UseBookmapStateOptions): string {
  const symbol = (options.symbol ?? "BTCUSDT").toUpperCase();
  const exchange = (options.exchange ?? "binance").toLowerCase();
  const market = options.market ?? DEFAULT_BOOKMAP_MARKET;
  const params = new URLSearchParams({
    symbol,
    exchange,
    market,
    priceRangePct: String(options.priceRangePct ?? BOOKMAP_ENGINE_PRICE_RANGE_PCT),
    bucketMs: String(options.bucketMs ?? BOOKMAP_ENGINE_BUCKET_MS),
    includeStale: options.includeStale !== false ? "true" : "false",
  });
  if (options.minWallSize != null && Number.isFinite(options.minWallSize)) {
    params.set("minWallSize", String(options.minWallSize));
  }
  if (options.priceMin != null && Number.isFinite(options.priceMin)) {
    params.set("priceMin", String(Math.floor(options.priceMin)));
  }
  if (options.priceMax != null && Number.isFinite(options.priceMax)) {
    params.set("priceMax", String(Math.ceil(options.priceMax)));
  }
  return `/api/bookmap/state?${params.toString()}`;
}

export function useBookmapState(options: UseBookmapStateOptions = {}) {
  const {
    symbol = "BTCUSDT",
    exchange = "binance",
    market = DEFAULT_BOOKMAP_MARKET,
    priceRangePct = BOOKMAP_ENGINE_PRICE_RANGE_PCT,
    bucketMs = BOOKMAP_ENGINE_BUCKET_MS,
    minWallSize,
    priceMin,
    priceMax,
    includeStale = true,
    enabled = true,
  } = options;

  const queryKey = useMemo(
    () =>
      [
        "/api/bookmap/state",
        symbol,
        exchange,
        market,
        priceRangePct,
        priceMin ?? null,
        priceMax ?? null,
        bucketMs,
        minWallSize ?? null,
        includeStale,
      ] as const,
    [symbol, exchange, market, priceRangePct, priceMin, priceMax, bucketMs, minWallSize, includeStale],
  );

  const query = useQuery<BookmapState>({
    queryKey,
    queryFn: async () => {
      const url = buildBookmapStateUrl({
        symbol,
        exchange,
        market,
        priceRangePct,
        bucketMs,
        minWallSize,
        priceMin,
        priceMax,
        includeStale,
      });
      const res = await fetch(apiUrl(url), { credentials: "include" });
      if (!res.ok) {
        const text = (await res.text()) || res.statusText;
        throw new Error(`${res.status}: ${text}`);
      }
      const data = (await res.json()) as BookmapState;
      if (!Array.isArray(data.bids) || !Array.isArray(data.asks) || !Array.isArray(data.heatmapCells)) {
        console.warn("[BOOKMAP_STATE] Invalid response shape", {
          symbol,
          market,
          hasBids: Array.isArray(data.bids),
          hasAsks: Array.isArray(data.asks),
          hasHeatmapCells: Array.isArray(data.heatmapCells),
        });
      } else if (data.bids.length === 0 || data.asks.length === 0 || data.heatmapCells.length === 0) {
        console.warn("[BOOKMAP_STATE] Empty response", {
          symbol,
          market,
          bids: data.bids.length,
          asks: data.asks.length,
          heatmapCells: data.heatmapCells.length,
        });
      }
      return data;
    },
    enabled,
    placeholderData: keepPreviousData,
    refetchInterval: BOOKMAP_ENGINE_REFETCH_MS,
    staleTime: Math.floor(BOOKMAP_ENGINE_REFETCH_MS * 0.4),
    retry: 1,
    refetchOnWindowFocus: false,
  });

  const ageMs =
    query.data?.timestamp != null ? Math.max(0, Date.now() - query.data.timestamp) : null;

  return {
    data: query.data,
    market,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    ageMs,
    dataUpdatedAt: query.dataUpdatedAt,
  };
}
