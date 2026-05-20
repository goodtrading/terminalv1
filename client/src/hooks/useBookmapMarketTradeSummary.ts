import { useQuery } from "@tanstack/react-query";
import { parseRawTradeEvent } from "@/components/flows/tradeFeedParse";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { parseBookmapMarket } from "@shared/bookmapMarket";

export type TradeAggressionSnapshot = {
  buyVolume: number;
  sellVolume: number;
  delta: number;
  volume: number;
  imbalancePct: number;
  tradeCount: number;
};

const WINDOW_MS = 90_000;
const REFETCH_MS = 3_000;

function buildSummary(rows: unknown[]): TradeAggressionSnapshot {
  let buyVolume = 0;
  let sellVolume = 0;
  let tradeCount = 0;
  for (const row of rows) {
    const t = parseRawTradeEvent(row);
    if (!t || t.sizeBtc <= 0) continue;
    tradeCount += 1;
    if (t.side === "buy") buyVolume += t.sizeBtc;
    else sellVolume += t.sizeBtc;
  }
  const volume = buyVolume + sellVolume;
  const delta = buyVolume - sellVolume;
  const imbalancePct = volume > 0 ? (delta / volume) * 100 : 0;
  return { buyVolume, sellVolume, delta, volume, imbalancePct, tradeCount };
}

const EMPTY: TradeAggressionSnapshot = {
  buyVolume: 0,
  sellVolume: 0,
  delta: 0,
  volume: 0,
  imbalancePct: 0,
  tradeCount: 0,
};

export function useBookmapMarketTradeSummary(
  symbol: string,
  market: BookmapMarketSource,
  enabled: boolean,
) {
  const m = parseBookmapMarket(market);

  const query = useQuery({
    queryKey: ["/api/market/agg-trades/summary", symbol, m],
    queryFn: async () => {
      const endMs = Date.now();
      const startMs = endMs - WINDOW_MS;
      const params = new URLSearchParams({
        symbol,
        market: m,
        startTime: String(startMs),
        endTime: String(endMs),
        limit: "2000",
      });
      const res = await fetch(`/api/market/agg-trades?${params}`);
      if (!res.ok) throw new Error(`Trades ${res.status}`);
      const rows = (await res.json()) as unknown[];
      return buildSummary(Array.isArray(rows) ? rows : []);
    },
    enabled,
    refetchInterval: REFETCH_MS,
    staleTime: REFETCH_MS * 0.5,
    refetchOnWindowFocus: false,
  });

  return {
    summary: query.data ?? EMPTY,
    isFetching: query.isFetching,
    error: query.error,
  };
}
