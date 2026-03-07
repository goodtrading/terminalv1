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
    refetchInterval: 2000,
    staleTime: 1000,
  });
}
