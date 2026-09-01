/**
 * Read-only live market model for AI-6.1 adapters.
 * NEVER calls buildLiveMarketContext, getTerminalState, or opens sockets.
 */
export type CompactAbsorption = {
  status?: string;
  side?: string;
  confidence?: number;
  intensity?: number;
  summary?: string[];
};

export type CompactSweep = {
  sweepRisk?: string;
  sweepDirection?: string;
  sweepTrigger?: string;
  status?: string;
  direction?: string;
  outcome?: string;
};

export type LiveMarketReadModel = {
  symbol: string;
  capturedAtMs: number;
  ticker?: {
    price: number;
    timestampMs?: number;
    source?: string;
  };
  market?: {
    gammaRegime?: string;
    totalGex?: number;
    gammaFlip?: number | null;
    distanceToFlip?: number | null;
    timestampMs?: number;
  };
  positioning?: {
    callWall?: number;
    putWall?: number;
    oiConcentration?: number;
    dealerPivot?: number;
    timestampMs?: number;
    absorption?: CompactAbsorption;
    sweep?: CompactSweep;
  };
  levels?: {
    gammaMagnets?: number[];
    shortGammaPocketStart?: number;
    shortGammaPocketEnd?: number;
    timestampMs?: number;
  };
  optionsLastUpdatedMs?: number;
  /** Health only — never full book */
  orderBookHealth?: {
    connected?: boolean;
    ageMs?: number | null;
    bidsCount?: number;
    asksCount?: number;
  };
};

export type LiveMarketReader = (symbol: string) => Promise<LiveMarketReadModel> | LiveMarketReadModel;

/**
 * Production reader: MemStorage + cached ticker + optional orderbook health.
 * Side-effect free (no recompute, no WS).
 */
export async function readLiveMarketFromServer(symbol: string): Promise<LiveMarketReadModel> {
  const capturedAtMs = Date.now();
  const normalized = symbol.trim().toUpperCase() || "BTCUSDT";

  // Dynamic imports keep unit tests able to inject fixtures without loading gateways when mocked.
  const { MarketDataGateway } = await import("../../../../market-gateway");
  const { storage } = await import("../../../../storage");

  const ticker = MarketDataGateway.getCachedTicker();
  const [market, positioning, levels] = await Promise.all([
    storage.getMarketState(),
    storage.getOptionsPositioning(),
    storage.getKeyLevels(),
  ]);

  let orderBookHealth: LiveMarketReadModel["orderBookHealth"];
  try {
    const { getSpotOrderBookHealth } = await import("../../../../services/orderbookService");
    const h = getSpotOrderBookHealth();
    orderBookHealth = {
      connected: h.connected,
      ageMs: h.ageMs,
      bidsCount: h.bidsCount,
      asksCount: h.asksCount,
    };
  } catch {
    orderBookHealth = undefined;
  }

  const posAny = positioning as Record<string, unknown> | undefined;
  const absorption = posAny?.absorption as CompactAbsorption | undefined;
  const sweep =
    (posAny?.liquiditySweepDetector as CompactSweep | undefined) ??
    (posAny?.latestSweep as CompactSweep | undefined);

  return {
    symbol: normalized,
    capturedAtMs,
    ticker:
      ticker && typeof ticker.price === "number" && Number.isFinite(ticker.price)
        ? {
            price: ticker.price,
            timestampMs: typeof ticker.timestamp === "number" ? ticker.timestamp : undefined,
            source: typeof ticker.source === "string" ? ticker.source : undefined,
          }
        : undefined,
    market: market
      ? {
          gammaRegime: market.gammaRegime,
          totalGex: market.totalGex,
          gammaFlip: market.gammaFlip,
          distanceToFlip: market.distanceToFlip,
          timestampMs: market.timestamp ? new Date(market.timestamp).getTime() : undefined,
        }
      : undefined,
    positioning: positioning
      ? {
          callWall: positioning.callWall,
          putWall: positioning.putWall,
          oiConcentration: positioning.oiConcentration,
          dealerPivot: positioning.dealerPivot,
          timestampMs: positioning.timestamp
            ? new Date(positioning.timestamp).getTime()
            : undefined,
          absorption: absorption && typeof absorption === "object" ? absorption : undefined,
          sweep: sweep && typeof sweep === "object" ? sweep : undefined,
        }
      : undefined,
    levels: levels
      ? {
          gammaMagnets: Array.isArray(levels.gammaMagnets) ? levels.gammaMagnets.slice(0, 5) : [],
          shortGammaPocketStart: levels.shortGammaPocketStart ?? undefined,
          shortGammaPocketEnd: levels.shortGammaPocketEnd ?? undefined,
          timestampMs: levels.timestamp ? new Date(levels.timestamp).getTime() : undefined,
        }
      : undefined,
    optionsLastUpdatedMs: storage.getOptionsLastUpdated(),
    orderBookHealth,
  };
}
