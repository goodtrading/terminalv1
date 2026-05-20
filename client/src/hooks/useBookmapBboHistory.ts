import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import type { BookmapBboPoint, BookmapBboHistoryResponse } from "@shared/bookmapBboHistory";
import { isValidBboPair } from "@shared/bookmapBboHistory";
import {
  DEFAULT_BOOKMAP_MARKET,
  parseBookmapMarket,
  type BookmapMarketSource,
} from "@shared/bookmapMarket";

const CLIENT_MAX_POINTS = 20_000;
const MIN_APPEND_MS = 80;
const REFETCH_MS = 8_000;

function mergePoints(server: BookmapBboPoint[], client: BookmapBboPoint[]): BookmapBboPoint[] {
  const map = new Map<number, BookmapBboPoint>();
  for (const p of server) {
    map.set(p.timestamp, p);
  }
  for (const p of client) {
    map.set(p.timestamp, p);
  }
  const merged = Array.from(map.values()).sort((a, b) => a.timestamp - b.timestamp);
  if (merged.length <= CLIENT_MAX_POINTS) return merged;
  return merged.slice(-CLIENT_MAX_POINTS);
}

export type UseBookmapBboHistoryOptions = {
  symbol?: string;
  market?: BookmapMarketSource;
  enabled?: boolean;
};

export function useBookmapBboHistory(options: UseBookmapBboHistoryOptions = {}) {
  const symbol = (options.symbol ?? "BTCUSDT").toUpperCase();
  const market = parseBookmapMarket(options.market ?? DEFAULT_BOOKMAP_MARKET);
  const enabled = options.enabled !== false;

  const clientPointsRef = useRef<BookmapBboPoint[]>([]);
  const lastAppendRef = useRef<{ bid: number; ask: number; ts: number } | null>(null);
  const [clientVersion, setClientVersion] = useState(0);

  const query = useQuery<BookmapBboHistoryResponse>({
    queryKey: ["/api/bookmap/bbo-history", symbol, market],
    queryFn: async () => {
      const params = new URLSearchParams({ symbol, market });
      const res = await fetch(`/api/bookmap/bbo-history?${params}`);
      if (!res.ok) throw new Error(`BBO history ${res.status}`);
      return (await res.json()) as BookmapBboHistoryResponse;
    },
    enabled,
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS * 0.4,
    refetchOnWindowFocus: false,
  });

  useEffect(() => {
    clientPointsRef.current = [];
    lastAppendRef.current = null;
    setClientVersion(0);
  }, [symbol, market]);

  const appendLiveBbo = useCallback(
    (bestBid: number, bestAsk: number, timestamp?: number) => {
      if (!enabled || !isValidBboPair(bestBid, bestAsk)) return;
      const ts = Number.isFinite(timestamp) && timestamp! > 0 ? timestamp! : Date.now();
      const last = lastAppendRef.current;
      if (
        last &&
        last.bid === bestBid &&
        last.ask === bestAsk &&
        ts - last.ts < MIN_APPEND_MS
      ) {
        return;
      }
      lastAppendRef.current = { bid: bestBid, ask: bestAsk, ts };
      const point: BookmapBboPoint = { timestamp: ts, bestBid, bestAsk, market };
      const buf = clientPointsRef.current;
      const tail = buf[buf.length - 1];
      if (tail && ts >= tail.timestamp) {
        buf.push(point);
      } else {
        clientPointsRef.current = [...buf, point].sort((a, b) => a.timestamp - b.timestamp);
      }
      if (clientPointsRef.current.length > CLIENT_MAX_POINTS) {
        clientPointsRef.current = clientPointsRef.current.slice(-CLIENT_MAX_POINTS);
      }
      setClientVersion((v) => v + 1);
    },
    [enabled, market],
  );

  const points = useMemo(() => {
    const serverPts: BookmapBboPoint[] = (query.data?.points ?? []).map((p) => ({
      ...p,
      market,
    }));
    const merged = mergePoints(serverPts, clientPointsRef.current);
    return merged.filter((p) => p.market === market);
  }, [query.data?.points, market, clientVersion]);

  const latest = points.length > 0 ? points[points.length - 1]! : null;
  const latestAgeMs =
    latest != null ? Math.max(0, Date.now() - latest.timestamp) : null;

  return {
    points,
    market,
    symbol,
    isLoading: query.isLoading,
    isFetching: query.isFetching,
    error: query.error,
    refetch: query.refetch,
    appendLiveBbo,
    latestBbo: latest,
    latestAgeMs,
    totalPoints: points.length,
    clientVersion,
  };
}
