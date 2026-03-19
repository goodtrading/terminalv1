import { useQuery } from "@tanstack/react-query";
import { OptionsPositioning, MarketState, KeyLevels, DealerExposure, TradingScenario } from "@shared/schema";

export interface TerminalState {
  market: MarketState;
  exposure: DealerExposure;
  positioning: OptionsPositioning;
  levels: KeyLevels;
  scenarios: TradingScenario[];
  ticker: {
    symbol: string;
    price: number;
    timestamp: number;
    source: string;
  } | null;
  tickerStatus: "fresh" | "stale" | "unavailable";
  timestamp: number;
}

export function useTerminalState() {
  return useQuery<TerminalState>({
    queryKey: ["/api/terminal/state"],
    // Polling del panel principal. Este endpoint es caro en el server
    // (recalcula engines/heatmap/coherence), así que evitamos 2s por defecto.
    refetchInterval: 5000,
    staleTime: 2000,
  });
}
