import { z } from "zod";
import { storage } from "./storage";
import { MarketDataGateway, tickerSchema } from "./market-gateway";
import { DeribitOptionsGateway } from "./deribit-gateway";

export const terminalStateSchema = z.object({
  market: z.any(),
  exposure: z.any(),
  positioning: z.any(),
  levels: z.any(),
  scenarios: z.array(z.any()),
  ticker: tickerSchema.nullable(),
  tickerStatus: z.enum(["fresh", "stale", "unavailable"]),
  timestamp: z.number()
});

export type TerminalState = z.infer<typeof terminalStateSchema>;

const STALE_THRESHOLD_MS = 10000; // 10 seconds

export async function getTerminalState(): Promise<TerminalState> {
  // Aggregated quantitative state from DB (fast read)
  const [market, exposure, positioning, levels, scenarios] = await Promise.all([
    storage.getMarketState(),
    storage.getDealerExposure(),
    storage.getOptionsPositioning(),
    storage.getKeyLevels(),
    storage.getTradingScenarios()
  ]);

  // Inject live playbook from Deribit Gateway for the frontend
  let livePlaybook = null;
  try {
    const rawOptions = await DeribitOptionsGateway.ingestLatestCSV();
    const cachedTicker = MarketDataGateway.getCachedTicker();
    const summary = await DeribitOptionsGateway.getSummary(rawOptions, cachedTicker?.price);
    livePlaybook = summary.tradingPlaybook || null;
  } catch (e) {
    console.error("[TerminalState] Playbook injection failed:", e);
  }

  const enrichedPositioning = positioning ? { ...positioning, tradingPlaybook: livePlaybook } : positioning;

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
    positioning: enrichedPositioning,
    levels,
    scenarios,
    ticker,
    tickerStatus,
    timestamp: now
  };
}
