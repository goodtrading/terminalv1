import { apiUrl } from "../lib/apiBase";
import { useQuery } from "@tanstack/react-query";
import type { BookmapBboHistoryResponse } from "@shared/bookmapBboHistory";
import type { BookmapMarketSource } from "@shared/bookmapMarket";

export type BboMarketDebugStats = {
  market: BookmapMarketSource;
  points: number;
  latestSec: string;
};

async function fetchBboMarketStats(
  symbol: string,
  market: BookmapMarketSource,
): Promise<BboMarketDebugStats> {
  const params = new URLSearchParams({ symbol, market });
  const res = await fetch(apiUrl(`/api/bookmap/bbo-history?${params}`));
  if (!res.ok) throw new Error(`BBO history ${res.status}`);
  const data = (await res.json()) as BookmapBboHistoryResponse;
  const pts = data.points?.length ?? 0;
  const last = pts > 0 ? data.points[pts - 1]! : null;
  const latestAgeMs =
    last != null ? Math.max(0, Date.now() - last.timestamp) : null;
  return {
    market,
    points: pts,
    latestSec:
      latestAgeMs != null ? `${(latestAgeMs / 1000).toFixed(1)}s` : "—",
  };
}

/** Dev-only compact stats for spot + perp BBO history buffers. */
export function useBookmapBboMarketDebug(symbol: string, enabled: boolean) {
  const spot = useQuery({
    queryKey: ["/api/bookmap/bbo-history", symbol, "spot", "debug"],
    queryFn: () => fetchBboMarketStats(symbol, "spot"),
    enabled,
    refetchInterval: 8_000,
    staleTime: 4_000,
    refetchOnWindowFocus: false,
  });
  const perp = useQuery({
    queryKey: ["/api/bookmap/bbo-history", symbol, "perp", "debug"],
    queryFn: () => fetchBboMarketStats(symbol, "perp"),
    enabled,
    refetchInterval: 8_000,
    staleTime: 4_000,
    refetchOnWindowFocus: false,
  });
  return { spot: spot.data, perp: perp.data };
}
