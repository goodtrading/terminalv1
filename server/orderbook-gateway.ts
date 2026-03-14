import { z } from "zod";
import { processVacuumDetection, type VacuumEvent, type VacuumState } from "./engine/liquidityVacuum";
import { getOrderBook, isBinanceHealthy } from "./services/orderbookService";
import { getKrakenOrderBook } from "./kraken-gateway";

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
  totalQuantity: z.number(),
  gammaWeightedLiquidity: z.number().optional(),
});

export const liquidityConfluenceZoneSchema = z.object({
  priceStart: z.number(),
  priceEnd: z.number(),
  confluenceScore: z.number(),
  sources: z.array(z.string()),
  side: z.enum(["BID", "ASK", "NEUTRAL"])
});

export const vacuumEventSchema = z.object({
  type: z.literal("LIQUIDITY_VACUUM"),
  direction: z.enum(["UP", "DOWN"]),
  priceStart: z.number(),
  priceEnd: z.number(),
  strength: z.number(),
  strengthClass: z.enum(["LOW", "MEDIUM", "HIGH", "EXTREME"]),
  timestamp: z.number(),
});

export const vacuumStateSchema = z.object({
  vacuumRisk: z.enum(["LOW", "MEDIUM", "HIGH", "EXTREME"]),
  activeZones: z.array(vacuumEventSchema),
  depthRatio: z.number(),
  spreadRatio: z.number(),
  vacuumProximity: z.number(),
  predictiveRisk: z.enum(["LOW", "MEDIUM", "HIGH", "IMMINENT"]),
  nearestThinLiquidityZone: z.number().nullable(),
  nearestThinLiquidityDirection: z.enum(["UP", "DOWN"]).nullable(),
  nearestThinLiquidityScore: z.number(),
  confirmedVacuumActive: z.boolean(),
});

const orderBookLevelSchema = z.object({ price: z.number(), size: z.number() });

export const gammaAccelerationZoneSchema = z.object({
  start: z.number(),
  end: z.number(),
  direction: z.enum(["UP", "DOWN"]),
  score: z.number(),
});

export const liquidityHeatmapSchema = z.object({
  liquidityHeatZones: z.array(liquidityHeatZoneSchema),
  liquidityConfluenceZones: z.array(liquidityConfluenceZoneSchema),
  liquidityPressure: z.enum(["BID_HEAVY", "ASK_HEAVY", "BALANCED"]),
  bids: z.array(orderBookLevelSchema).optional(),
  asks: z.array(orderBookLevelSchema).optional(),
  heatmapSummary: z.object({
    totalBidLiquidity: z.number(),
    totalAskLiquidity: z.number(),
    strongestBidZone: z.number().nullable(),
    strongestAskZone: z.number().nullable(),
    nearestVoid: z.number().nullable(),
    voidSide: z.enum(["ABOVE", "BELOW"]).nullable(),
    bidAskRatio: z.number(),
    source: z.string(),
    timestamp: z.number()
  }),
  liquidityMapLines: z.array(z.string()),
  liquidityVacuum: vacuumStateSchema.optional(),
  gammaAccelerationZones: z.array(gammaAccelerationZoneSchema).optional(),
});

export type LiquidityHeatZone = z.infer<typeof liquidityHeatZoneSchema>;
export type LiquidityConfluenceZone = z.infer<typeof liquidityConfluenceZoneSchema>;
export type LiquidityHeatmap = z.infer<typeof liquidityHeatmapSchema>;

let cachedHeatmap: LiquidityHeatmap | null = null;
let lastFetchTime = 0;
let lastActiveOrderbookSource: string | null = null;
const CACHE_TTL_MS = 15000;
const BINANCE_SOURCES = ["Binance-WS", "Binance"];

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
    },
    {
      name: "Kraken",
      fetch: async () => {
        const ob = await getKrakenOrderBook(symbol, limit);
        return {
          bids: ob.bids.map((b) => ({ price: b.price, quantity: b.size })),
          asks: ob.asks.map((a) => ({ price: a.price, quantity: a.size })),
          timestamp: ob.timestamp,
          source: "Kraken"
        };
      }
    }
  ];

  let lastError = "";
  for (const provider of providers) {
    try {
      const book = await provider.fetch();
      console.log(`[OrderBook] ${provider.name}: ${book.bids.length} bids, ${book.asks.length} asks`);
      if (provider.name === "Coinbase") {
        console.log("[Orderbook] Coinbase connected (fallback)");
      }
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
    gammaContext?: { gammaFlip: number | null; gammaMagnets: number[] }
  ): Promise<LiquidityHeatmap> {
    const now = Date.now();
    const cachedSource = cachedHeatmap?.heatmapSummary?.source ?? null;
    const cacheFromFallback = cachedSource && !BINANCE_SOURCES.includes(cachedSource);

    // Reclaim: if cache is from fallback and Binance is now healthy, bypass cache and use Binance
    if (cachedHeatmap && now - lastFetchTime < CACHE_TTL_MS && cacheFromFallback && isBinanceHealthy()) {
      const ob = getOrderBook();
      if (ob.bids.length >= 10 || ob.asks.length >= 10) {
        console.log("[Orderbook] switching to Binance");
        const book: OrderBook = {
          bids: ob.bids.map((b) => ({ price: b.price, quantity: b.size })),
          asks: ob.asks.map((a) => ({ price: a.price, quantity: a.size })),
          timestamp: ob.timestamp ?? now,
          source: "Binance-WS",
        };
        const result = this.computeHeatmap(book, spotPrice, gammaContext);
        cachedHeatmap = result;
        lastFetchTime = now;
        lastActiveOrderbookSource = "Binance-WS";
        return result;
      }
    }

    if (cachedHeatmap && now - lastFetchTime < CACHE_TTL_MS) {
      return cachedHeatmap;
    }

    try {
      const ob = getOrderBook();
      let book: OrderBook;
      if (ob.bids.length > 0 || ob.asks.length > 0) {
        const wasFallback = lastActiveOrderbookSource && !BINANCE_SOURCES.includes(lastActiveOrderbookSource);
        if (wasFallback) {
          console.log("[Orderbook] switching to Binance");
        }
        book = {
          bids: ob.bids.map((b) => ({ price: b.price, quantity: b.size })),
          asks: ob.asks.map((a) => ({ price: a.price, quantity: a.size })),
          timestamp: ob.timestamp ?? now,
          source: "Binance-WS",
        };
        lastActiveOrderbookSource = "Binance-WS";
      } else {
        if (process.env.NODE_ENV === "production") {
          console.warn("[OrderBook] WS empty, falling back to REST (bids:", ob.bids.length, "asks:", ob.asks.length, ")");
        }
        book = await fetchOrderBook("BTCUSDT", 500);
        const isFallback = !BINANCE_SOURCES.includes(book.source);
        if (isFallback) {
          console.log(`[Orderbook] activating ${book.source} fallback`);
        }
        lastActiveOrderbookSource = book.source;
      }
      const result = this.computeHeatmap(book, spotPrice, gammaContext);
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
    gammaContext?: { gammaFlip: number | null; gammaMagnets: number[] }
  ): LiquidityHeatmap {
    const range = spotPrice * 0.03;
    const binSize = spotPrice > 50000 ? 250 : spotPrice > 10000 ? 100 : 50;
    const gammaDecay = spotPrice * 0.01;
    const GAMMA_FLIP_WEIGHT = 0.65;

    const bidBins = aggregateIntoBins(book.bids, spotPrice, binSize, range);
    const askBins = aggregateIntoBins(book.asks, spotPrice, binSize, range);

    const allQuantities = [...bidBins.values(), ...askBins.values()];
    const maxQty = Math.max(...allQuantities, 0.001);

    const heatZones: LiquidityHeatZone[] = [];

    const nearestMagnet = (midPrice: number): number | null => {
      if (!gammaContext?.gammaMagnets?.length) return null;
      return gammaContext.gammaMagnets.reduce((best, p) =>
        Math.abs(p - midPrice) < Math.abs(best - midPrice) ? p : best
      );
    };

    const gammaWeight = (midPrice: number, levelSize: number): number => {
      if (!gammaContext) return levelSize;
      let magnetInfluence = 0;
      let flipInfluence = 0;
      const magnet = nearestMagnet(midPrice);
      if (magnet != null) {
        const distMagnet = Math.abs(midPrice - magnet);
        magnetInfluence = Math.exp(-distMagnet / gammaDecay);
      }
      if (gammaContext.gammaFlip != null) {
        const distFlip = Math.abs(midPrice - gammaContext.gammaFlip);
        flipInfluence = Math.exp(-distFlip / gammaDecay) * GAMMA_FLIP_WEIGHT;
      }
      const gammaInfluence = Math.max(magnetInfluence, flipInfluence);
      if (gammaInfluence <= 0) return levelSize;
      return levelSize * gammaInfluence;
    };

    for (const [binKey, qty] of bidBins) {
      const intensity = qty / maxQty;
      if (intensity < 0.02) continue;
      computePersistence("BID", binKey, qty);
      const mid = binKey + binSize / 2;
      const gw = gammaWeight(mid, qty);
      heatZones.push({
        priceStart: binKey,
        priceEnd: binKey + binSize,
        side: "BID",
        intensity: Math.round(intensity * 100) / 100,
        totalQuantity: Math.round(qty * 1000) / 1000,
        ...(gammaContext ? { gammaWeightedLiquidity: Math.round(gw * 1000) / 1000 } : undefined),
      });
    }

    for (const [binKey, qty] of askBins) {
      const intensity = qty / maxQty;
      if (intensity < 0.02) continue;
      computePersistence("ASK", binKey, qty);
      const mid = binKey + binSize / 2;
      const gw = gammaWeight(mid, qty);
      heatZones.push({
        priceStart: binKey,
        priceEnd: binKey + binSize,
        side: "ASK",
        intensity: Math.round(intensity * 100) / 100,
        totalQuantity: Math.round(qty * 1000) / 1000,
        ...(gammaContext ? { gammaWeightedLiquidity: Math.round(gw * 1000) / 1000 } : undefined),
      });
    }

    heatZones.sort((a, b) => b.intensity - a.intensity);

    const confluenceZones: LiquidityConfluenceZone[] = [];
    const topConfluence = confluenceZones.slice(0, 6);

    const totalBid = [...bidBins.values()].reduce((s, v) => s + v, 0);
    const totalAsk = [...askBins.values()].reduce((s, v) => s + v, 0);
    const ratio = totalAsk > 0 ? totalBid / totalAsk : 1;

    const bidZonesSorted = heatZones.filter(z => z.side === "BID").sort((a, b) => b.intensity - a.intensity);
    const askZonesSorted = heatZones.filter(z => z.side === "ASK").sort((a, b) => b.intensity - a.intensity);

    let pressure: "BID_HEAVY" | "ASK_HEAVY" | "BALANCED" = "BALANCED";
    if (ratio > 1.3) pressure = "BID_HEAVY";
    else if (ratio < 0.7) pressure = "ASK_HEAVY";

    let nearestVoid: number | null = null;
    let voidSide: "ABOVE" | "BELOW" | null = null;
    const numBins = Math.floor((range * 2) / binSize);
    const lowerBound = spotPrice - range;
    for (let i = 0; i < numBins; i++) {
      const binKey = Math.round(Math.floor((lowerBound + i * binSize) / binSize) * binSize);
      const hasBid = bidBins.has(binKey) && (bidBins.get(binKey)! / maxQty) > 0.02;
      const hasAsk = askBins.has(binKey) && (askBins.get(binKey)! / maxQty) > 0.02;
      if (!hasBid && !hasAsk) {
        const mid = binKey + binSize / 2;
        if (nearestVoid === null || Math.abs(mid - spotPrice) < Math.abs(nearestVoid - spotPrice)) {
          nearestVoid = mid;
          voidSide = mid > spotPrice ? "ABOVE" : "BELOW";
        }
      }
    }

    const formatK = (p: number) => p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k" : String(Math.round(p));
    const mapLines: string[] = [];
    if (askZonesSorted.length > 0) {
      const askMid = askZonesSorted[0].priceStart + binSize / 2;
      mapLines.push(askMid > spotPrice ? `Heavy asks above spot near ${formatK(askMid)}` : `Ask cluster near ${formatK(askMid)}`);
    }
    if (bidZonesSorted.length > 0) {
      const bidMid = bidZonesSorted[0].priceStart + binSize / 2;
      mapLines.push(bidMid < spotPrice ? `Strong bids below spot near ${formatK(bidMid)}` : `Bid cluster near ${formatK(bidMid)}`);
    }
    if (nearestVoid !== null) {
      mapLines.push(`Liquidity void ${voidSide?.toLowerCase()} spot near ${formatK(nearestVoid)}`);
    }
    if (mapLines.length === 0) mapLines.push("Order book data limited");

    let liquidityVacuum: VacuumState | undefined;
    try {
      liquidityVacuum = processVacuumDetection(book.bids, book.asks, spotPrice);
    } catch (e) {
      console.warn("[OrderBook] Vacuum detection failed:", e);
    }

    return {
      liquidityHeatZones: heatZones.slice(0, 40),
      liquidityConfluenceZones: topConfluence,
      liquidityPressure: pressure,
      bids: book.bids.map((b) => ({ price: b.price, size: b.quantity })),
      asks: book.asks.map((a) => ({ price: a.price, size: a.quantity })),
      heatmapSummary: {
        totalBidLiquidity: Math.round(totalBid * 1000) / 1000,
        totalAskLiquidity: Math.round(totalAsk * 1000) / 1000,
        strongestBidZone: bidZonesSorted[0]?.priceStart ?? null,
        strongestAskZone: askZonesSorted[0]?.priceStart ?? null,
        nearestVoid,
        voidSide,
        bidAskRatio: Math.round(ratio * 100) / 100,
        source: book.source,
        timestamp: book.timestamp
      },
      liquidityMapLines: mapLines.slice(0, 4),
      liquidityVacuum,
    };
  }

  private static fallbackHeatmap(spotPrice: number): LiquidityHeatmap {
    return {
      liquidityHeatZones: [],
      liquidityConfluenceZones: [],
      liquidityPressure: "BALANCED",
      bids: [],
      asks: [],
      heatmapSummary: {
        totalBidLiquidity: 0,
        totalAskLiquidity: 0,
        strongestBidZone: null,
        strongestAskZone: null,
        nearestVoid: null,
        voidSide: null,
        bidAskRatio: 1,
        source: "UNAVAILABLE",
        timestamp: Date.now()
      },
      liquidityMapLines: ["Order book data unavailable"],
      liquidityVacuum: { vacuumRisk: "LOW", activeZones: [], depthRatio: 1, spreadRatio: 1, vacuumProximity: 0, predictiveRisk: "LOW" as const, nearestThinLiquidityZone: null, nearestThinLiquidityDirection: null, nearestThinLiquidityScore: 0, confirmedVacuumActive: false },
    };
  }
}
