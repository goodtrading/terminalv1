import { z } from "zod";

// --- Internal Market Data Schemas ---

export const candleSchema = z.object({
  time: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number()
});

export const tickerSchema = z.object({
  symbol: z.string(),
  price: z.number(),
  timestamp: z.number(),
  source: z.string()
});

export type Candle = z.infer<typeof candleSchema>;
export type Ticker = z.infer<typeof tickerSchema>;

// --- Provider Normalization & Fetching ---

export class MarketDataGateway {
  private static binanceMirrors = [
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://api.binance.com"
  ];

  private static async fetchWithMirrors(path: string): Promise<any> {
    let lastError = null;
    for (const mirror of this.binanceMirrors) {
      try {
        const response = await fetch(`${mirror}${path}`, { signal: AbortSignal.timeout(5000) });
        if (response.ok) return await response.json();
        if (response.status === 451) throw new Error("GEO_BLOCKED");
        lastError = `Status ${response.status}`;
      } catch (e: any) {
        lastError = e.message;
        if (e.message === "GEO_BLOCKED") break;
      }
    }
    throw new Error(lastError || "All mirrors failed");
  }

  static async getCandles(symbol: string, interval: string = "15m", limit: number = 500): Promise<Candle[]> {
    const rawData = await this.fetchWithMirrors(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
    
    if (!Array.isArray(rawData)) throw new Error("INVALID_PROVIDER_RESPONSE");

    const candles: Candle[] = rawData
      .map((k: any[]) => ({
        time: Math.floor(Number(k[0]) / 1000),
        open: parseFloat(k[1]),
        high: parseFloat(k[2]),
        low: parseFloat(k[3]),
        close: parseFloat(k[4]),
        volume: parseFloat(k[5])
      }))
      .filter(c => 
        Number.isFinite(c.time) && 
        Number.isFinite(c.open) && 
        Number.isFinite(c.high) && 
        Number.isFinite(c.low) && 
        Number.isFinite(c.close) &&
        Number.isFinite(c.volume)
      )
      .sort((a, b) => a.time - b.time);

    // Validation: Remove duplicates and ensure strict sequence
    const uniqueCandles: Candle[] = [];
    const seen = new Set<number>();
    for (const c of candles) {
      if (!seen.has(c.time)) {
        seen.add(c.time);
        uniqueCandles.push(c);
      }
    }

    return uniqueCandles;
  }

  static async getTicker(symbol: string): Promise<Ticker> {
    const data = await this.fetchWithMirrors(`/api/v3/ticker/price?symbol=${symbol}`);
    
    const ticker = {
      symbol: data.symbol,
      price: parseFloat(data.price),
      timestamp: Date.now(),
      source: "Binance"
    };

    const validated = tickerSchema.parse(ticker);
    if (!Number.isFinite(validated.price)) throw new Error("INVALID_TICKER_PRICE");
    
    return validated;
  }
}
