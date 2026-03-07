import { z } from "zod";
import { storage } from "./storage";
import { MarketDataGateway, tickerSchema } from "./market-gateway";

export const terminalStateSchema = z.object({
  market: z.any(),
  exposure: z.any(),
  positioning: z.any(),
  levels: z.any(),
  ticker: tickerSchema.nullable(),
  tickerStatus: z.enum(["fresh", "stale", "unavailable"]),
  timestamp: z.number()
});

export type TerminalState = z.infer<typeof terminalStateSchema>;

const STALE_THRESHOLD_MS = 10000; // 10 seconds

export async function getTerminalState(): Promise<TerminalState> {
  // Aggregated quantitative state from DB (fast read)
  const [market, exposure, positioning, levels] = await Promise.all([
    storage.getMarketState(),
    storage.getDealerExposure(),
    storage.getOptionsPositioning(),
    storage.getKeyLevels()
  ]);

  // Read from in-memory cache ONLY (deterministic latency, no side effects)
  const ticker = MarketDataGateway.getCachedTicker();
  const now = Date.now();
  
  let tickerStatus: "fresh" | "stale" | "unavailable" = "unavailable";
  if (ticker) {
    const age = now - ticker.timestamp;
    tickerStatus = age < STALE_THRESHOLD_MS ? "fresh" : "stale";
  }

  return {
    market,
    exposure,
    positioning,
    levels,
    ticker,
    tickerStatus,
    timestamp: now
  };
}
