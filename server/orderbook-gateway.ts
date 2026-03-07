import { z } from "zod";

const orderBookEntrySchema = z.object({
  price: z.number(),
  quantity: z.number()
});

const orderBookSchema = z.object({
  bids: z.array(orderBookEntrySchema),
  asks: z.array(orderBookEntrySchema),
  timestamp: z.number(),
  source: z.string()
});

export type OrderBookEntry = z.infer<typeof orderBookEntrySchema>;
export type OrderBook = z.infer<typeof orderBookSchema>;

export const liquidityHeatZoneSchema = z.object({
  priceStart: z.number(),
  priceEnd: z.number(),
  side: z.enum(["BID", "ASK"]),
  intensity: z.number(),
  totalQuantity: z.number()
});

export const liquidityConfluenceZoneSchema = z.object({
  priceStart: z.number(),
  priceEnd: z.number(),
  confluenceScore: z.number(),
  sources: z.array(z.string()),
  side: z.enum(["BID", "ASK", "NEUTRAL"])
});

export const liquidityHeatmapSchema = z.object({
  liquidityHeatZones: z.array(liquidityHeatZoneSchema),
  liquidityConfluenceZones: z.array(liquidityConfluenceZoneSchema),
  liquidityPressure: z.enum(["BID_HEAVY", "ASK_HEAVY", "BALANCED"]),
  heatmapSummary: z.object({
    totalBidLiquidity: z.number(),
    totalAskLiquidity: z.number(),
    strongestBidZone: z.number().nullable(),
    strongestAskZone: z.number().nullable(),
    bidAskRatio: z.number(),
    source: z.string(),
    timestamp: z.number()
  })
});

export type LiquidityHeatZone = z.infer<typeof liquidityHeatZoneSchema>;
export type LiquidityConfluenceZone = z.infer<typeof liquidityConfluenceZoneSchema>;
export type LiquidityHeatmap = z.infer<typeof liquidityHeatmapSchema>;

let cachedHeatmap: LiquidityHeatmap | null = null;
let lastFetchTime = 0;
const CACHE_TTL_MS = 15000;

interface HistoricalBin {
  totalQuantity: number;
  count: number;
}
const persistenceMap = new Map<string, HistoricalBin>();
const PERSISTENCE_DECAY = 0.85;

async function fetchWithTimeout(url: string, timeout = 5000): Promise<Response> {
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    const response = await fetch(url, { signal: controller.signal });
    clearTimeout(id);
    return response;
  } catch (e) {
    clearTimeout(id);
    throw e;
  }
}

async function fetchOrderBook(symbol: string = "BTCUSDT", limit: number = 500): Promise<OrderBook> {
  const providers = [
    {
      name: "Binance",
      fetch: async () => {
        const mirrors = ["https://api1.binance.com", "https://api2.binance.com", "https://api.binance.com"];
        for (const mirror of mirrors) {
          try {
            const res = await fetchWithTimeout(`${mirror}/api/v3/depth?symbol=${symbol}&limit=${limit}`);
            if (res.status === 451) throw new Error("GEO_BLOCKED");
            if (res.ok) {
              const data = await res.json();
              return {
                bids: data.bids.map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
                asks: data.asks.map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
                timestamp: Date.now(),
                source: "Binance"
              };
            }
          } catch (e: any) {
            if (e.message === "GEO_BLOCKED") throw e;
          }
        }
        throw new Error("Binance mirrors exhausted");
      }
    },
    {
      name: "Bybit",
      fetch: async () => {
        const res = await fetchWithTimeout(`https://api.bybit.com/v5/market/orderbook?category=spot&symbol=${symbol}&limit=${Math.min(limit, 200)}`);
        if (!res.ok) throw new Error(`Bybit ${res.status}`);
        const data = await res.json();
        const book = data.result;
        return {
          bids: book.b.map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
          asks: book.a.map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
          timestamp: Date.now(),
          source: "Bybit"
        };
      }
    },
    {
      name: "Coinbase",
      fetch: async () => {
        const cbSymbol = symbol.replace("USDT", "-USDT");
        const res = await fetchWithTimeout(`https://api.exchange.coinbase.com/products/${cbSymbol}/book?level=2`, 8000);
        if (!res.ok) throw new Error(`Coinbase ${res.status}`);
        const data = await res.json();
        return {
          bids: (data.bids || []).slice(0, limit).map((b: string[]) => ({ price: parseFloat(b[0]), quantity: parseFloat(b[1]) })),
          asks: (data.asks || []).slice(0, limit).map((a: string[]) => ({ price: parseFloat(a[0]), quantity: parseFloat(a[1]) })),
          timestamp: Date.now(),
          source: "Coinbase"
        };
      }
    }
  ];

  let lastError = "";
  for (const provider of providers) {
    try {
      const book = await provider.fetch();
      console.log(`[OrderBook] ${provider.name}: ${book.bids.length} bids, ${book.asks.length} asks`);
      return book;
    } catch (e: any) {
      lastError = `${provider.name}: ${e.message}`;
      console.warn(`[OrderBook] ${lastError}`);
    }
  }
  throw new Error(`Order book unavailable: ${lastError}`);
}

function aggregateIntoBins(entries: OrderBookEntry[], spotPrice: number, binSize: number, range: number): Map<number, number> {
  const bins = new Map<number, number>();
  const lowerBound = spotPrice - range;
  const upperBound = spotPrice + range;

  for (const entry of entries) {
    if (entry.price < lowerBound || entry.price > upperBound) continue;
    const binKey = Math.round(Math.floor(entry.price / binSize) * binSize);
    bins.set(binKey, (bins.get(binKey) || 0) + entry.quantity);
  }
  return bins;
}

function computePersistence(side: string, binKey: number, currentQty: number): number {
  const key = `${side}_${binKey}`;
  const prev = persistenceMap.get(key);
  if (prev) {
    const blended = prev.totalQuantity * PERSISTENCE_DECAY + currentQty;
    const count = prev.count + 1;
    persistenceMap.set(key, { totalQuantity: blended, count });
    return Math.min(1, count / 10);
  } else {
    persistenceMap.set(key, { totalQuantity: currentQty, count: 1 });
    return 0.1;
  }
}

export class OrderBookGateway {
  static getCachedHeatmap(): LiquidityHeatmap | null {
    return cachedHeatmap;
  }

  static async getLiquidityHeatmap(
    spotPrice: number,
    gammaData?: {
      gammaMagnets?: number[];
      callWall?: number;
      putWall?: number;
      dealerPivot?: number;
      gammaCliffs?: { strike: number; strength: number }[];
    }
  ): Promise<LiquidityHeatmap> {
    const now = Date.now();
    if (cachedHeatmap && now - lastFetchTime < CACHE_TTL_MS) {
      return cachedHeatmap;
    }

    try {
      const book = await fetchOrderBook("BTCUSDT", 500);
      const result = this.computeHeatmap(book, spotPrice, gammaData);
      cachedHeatmap = result;
      lastFetchTime = now;
      return result;
    } catch (e: any) {
      console.error(`[OrderBook] Heatmap computation failed: ${e.message}`);
      if (cachedHeatmap) return cachedHeatmap;
      return this.fallbackHeatmap(spotPrice);
    }
  }

  private static computeHeatmap(
    book: OrderBook,
    spotPrice: number,
    gammaData?: {
      gammaMagnets?: number[];
      callWall?: number;
      putWall?: number;
      dealerPivot?: number;
      gammaCliffs?: { strike: number; strength: number }[];
    }
  ): LiquidityHeatmap {
    const range = spotPrice * 0.05;
    const binSize = spotPrice > 50000 ? 250 : spotPrice > 10000 ? 100 : 50;

    const bidBins = aggregateIntoBins(book.bids, spotPrice, binSize, range);
    const askBins = aggregateIntoBins(book.asks, spotPrice, binSize, range);

    const allQuantities = [...bidBins.values(), ...askBins.values()];
    const maxQty = Math.max(...allQuantities, 0.001);

    const heatZones: LiquidityHeatZone[] = [];

    for (const [binKey, qty] of bidBins) {
      const intensity = qty / maxQty;
      if (intensity < 0.05) continue;
      const persistence = computePersistence("BID", binKey, qty);
      heatZones.push({
        priceStart: binKey,
        priceEnd: binKey + binSize,
        side: "BID",
        intensity: Math.round(intensity * 100) / 100,
        totalQuantity: Math.round(qty * 1000) / 1000
      });
    }

    for (const [binKey, qty] of askBins) {
      const intensity = qty / maxQty;
      if (intensity < 0.05) continue;
      const persistence = computePersistence("ASK", binKey, qty);
      heatZones.push({
        priceStart: binKey,
        priceEnd: binKey + binSize,
        side: "ASK",
        intensity: Math.round(intensity * 100) / 100,
        totalQuantity: Math.round(qty * 1000) / 1000
      });
    }

    heatZones.sort((a, b) => b.intensity - a.intensity);

    const confluenceZones: LiquidityConfluenceZone[] = [];
    const gammaLevels: { price: number; label: string }[] = [];

    if (gammaData?.callWall) gammaLevels.push({ price: gammaData.callWall, label: "Call Wall" });
    if (gammaData?.putWall) gammaLevels.push({ price: gammaData.putWall, label: "Put Wall" });
    if (gammaData?.dealerPivot) gammaLevels.push({ price: gammaData.dealerPivot, label: "Dealer Pivot" });
    if (gammaData?.gammaMagnets) {
      gammaData.gammaMagnets.forEach(m => gammaLevels.push({ price: m, label: "Gamma Magnet" }));
    }
    if (gammaData?.gammaCliffs) {
      gammaData.gammaCliffs
        .sort((a, b) => Math.abs(b.strength) - Math.abs(a.strength))
        .slice(0, 6)
        .forEach(c => gammaLevels.push({ price: c.strike, label: "Gamma Cliff" }));
    }

    for (const gl of gammaLevels) {
      const nearbyHeat = heatZones.filter(
        z => gl.price >= z.priceStart - binSize && gl.price <= z.priceEnd + binSize
      );
      if (nearbyHeat.length > 0) {
        const totalIntensity = nearbyHeat.reduce((s, z) => s + z.intensity, 0);
        const sources = [gl.label, ...nearbyHeat.map(z => `${z.side} liquidity`)];
        const uniqueSources = [...new Set(sources)];
        const dominantSide = nearbyHeat[0]?.side || "NEUTRAL";
        confluenceZones.push({
          priceStart: Math.min(gl.price, ...nearbyHeat.map(z => z.priceStart)),
          priceEnd: Math.max(gl.price, ...nearbyHeat.map(z => z.priceEnd)),
          confluenceScore: Math.round(Math.min(1, totalIntensity * 0.8 + 0.3) * 100) / 100,
          sources: uniqueSources.slice(0, 4),
          side: dominantSide as "BID" | "ASK" | "NEUTRAL"
        });
      }
    }

    confluenceZones.sort((a, b) => b.confluenceScore - a.confluenceScore);
    const topConfluence = confluenceZones.slice(0, 6);

    const totalBid = [...bidBins.values()].reduce((s, v) => s + v, 0);
    const totalAsk = [...askBins.values()].reduce((s, v) => s + v, 0);
    const ratio = totalAsk > 0 ? totalBid / totalAsk : 1;

    const bidZonesSorted = heatZones.filter(z => z.side === "BID").sort((a, b) => b.intensity - a.intensity);
    const askZonesSorted = heatZones.filter(z => z.side === "ASK").sort((a, b) => b.intensity - a.intensity);

    let pressure: "BID_HEAVY" | "ASK_HEAVY" | "BALANCED" = "BALANCED";
    if (ratio > 1.3) pressure = "BID_HEAVY";
    else if (ratio < 0.7) pressure = "ASK_HEAVY";

    return {
      liquidityHeatZones: heatZones.slice(0, 30),
      liquidityConfluenceZones: topConfluence,
      liquidityPressure: pressure,
      heatmapSummary: {
        totalBidLiquidity: Math.round(totalBid * 1000) / 1000,
        totalAskLiquidity: Math.round(totalAsk * 1000) / 1000,
        strongestBidZone: bidZonesSorted[0]?.priceStart ?? null,
        strongestAskZone: askZonesSorted[0]?.priceStart ?? null,
        bidAskRatio: Math.round(ratio * 100) / 100,
        source: book.source,
        timestamp: book.timestamp
      }
    };
  }

  private static fallbackHeatmap(spotPrice: number): LiquidityHeatmap {
    return {
      liquidityHeatZones: [],
      liquidityConfluenceZones: [],
      liquidityPressure: "BALANCED",
      heatmapSummary: {
        totalBidLiquidity: 0,
        totalAskLiquidity: 0,
        strongestBidZone: null,
        strongestAskZone: null,
        bidAskRatio: 1,
        source: "UNAVAILABLE",
        timestamp: Date.now()
      }
    };
  }
}
