import { z } from "zod";
import { storage } from "./storage";
import { MarketDataGateway, tickerSchema } from "./market-gateway";

export const terminalStateSchema = z.object({
  market: z.any(),
  exposure: z.any(),
  positioning: z.any(),
  levels: z.any(),
  ticker: tickerSchema.nullable(),
  timestamp: z.number()
});

export type TerminalState = z.infer<typeof terminalStateSchema>;

export async function getTerminalState(): Promise<TerminalState> {
  const [market, exposure, positioning, levels] = await Promise.all([
    storage.getMarketState(),
    storage.getDealerExposure(),
    storage.getOptionsPositioning(),
    storage.getKeyLevels()
  ]);

  let ticker = null;
  try {
    // This uses the cached/last-fetched ticker from the gateway or a fast fetch
    // To keep this endpoint read-mostly, we assume the gateway is being polled
    // or we do a very fast fetch here.
    ticker = await MarketDataGateway.getTicker("BTCUSDT");
  } catch (e) {
    console.warn("[TerminalState] Ticker fetch failed for state aggregation");
  }

  return {
    market,
    exposure,
    positioning,
    levels,
    ticker,
    timestamp: Date.now()
  };
}
