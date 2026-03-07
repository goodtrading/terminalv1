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

  private static async fetchBinance(path: string): Promise<{ data: any; provider: string; latency: number }> {
    for (const mirror of this.binanceMirrors) {
      const start = Date.now();
      try {
        const response = await fetch(`${mirror}${path}`, { signal: AbortSignal.timeout(3000) });
        const latency = Date.now() - start;
        if (response.ok) return { data: await response.json(), provider: `Binance(${mirror})`, latency };
        if (response.status === 451) throw new Error("GEO_BLOCKED");
      } catch (e: any) {
        if (e.message === "GEO_BLOCKED") throw e;
      }
    }
    throw new Error("Binance mirrors failed");
  }

  private static async fetchBybit(path: string): Promise<{ data: any; provider: string; latency: number }> {
    const start = Date.now();
    const response = await fetch(`https://api.bybit.com${path}`, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    if (!response.ok) throw new Error(`Bybit failed: ${response.status}`);
    return { data: await response.json(), provider: "Bybit", latency };
  }

  private static async fetchCoinbase(path: string): Promise<{ data: any; provider: string; latency: number }> {
    const start = Date.now();
    const response = await fetch(`https://api.exchange.coinbase.com${path}`, { signal: AbortSignal.timeout(5000) });
    const latency = Date.now() - start;
    if (!response.ok) throw new Error(`Coinbase failed: ${response.status}`);
    return { data: await response.json(), provider: "Coinbase", latency };
  }

  static async getCandles(symbol: string, interval: string = "15m", limit: number = 500): Promise<Candle[]> {
    let lastError = null;

    // 1. Binance
    try {
      const { data, provider, latency } = await this.fetchBinance(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`);
      const candles = this.normalizeBinanceCandles(data);
      this.logSuccess(provider, latency, candles);
      return candles;
    } catch (e: any) { lastError = e.message; }

    // 2. Bybit
    try {
      const bybitInterval = interval === "15m" ? "15" : interval;
      const { data, provider, latency } = await this.fetchBybit(`/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitInterval}&limit=${limit}`);
      const candles = this.normalizeBybitCandles(data);
      this.logSuccess(provider, latency, candles);
      return candles;
    } catch (e: any) { lastError = e.message; }

    // 3. Coinbase
    try {
      const cbGranularity = interval === "15m" ? 900 : 3600;
      const { data, provider, latency } = await this.fetchCoinbase(`/products/${symbol.replace("USDT", "-USDT")}/candles?granularity=${cbGranularity}`);
      const candles = this.normalizeCoinbaseCandles(data);
      this.logSuccess(provider, latency, candles.slice(0, limit));
      return candles.slice(0, limit);
    } catch (e: any) { lastError = e.message; }

    throw new Error(lastError || "All providers failed");
  }

  static async getTicker(symbol: string): Promise<Ticker> {
    let lastError = null;
    try {
      const { data, provider, latency } = await this.fetchBinance(`/api/v3/ticker/price?symbol=${symbol}`);
      const ticker = { symbol: data.symbol, price: parseFloat(data.price), timestamp: Date.now(), source: provider };
      console.log(`[Gateway] Ticker: ${provider} (${latency}ms)`);
      return tickerSchema.parse(ticker);
    } catch (e: any) { lastError = e.message; }

    try {
      const { data, provider, latency } = await this.fetchBybit(`/v5/market/tickers?category=spot&symbol=${symbol}`);
      const result = data.result.list[0];
      const ticker = { symbol: result.symbol, price: parseFloat(result.lastPrice), timestamp: Date.now(), source: provider };
      console.log(`[Gateway] Ticker: ${provider} (${latency}ms)`);
      return tickerSchema.parse(ticker);
    } catch (e: any) { lastError = e.message; }

    throw new Error(lastError || "Ticker unavailable");
  }

  private static normalizeBinanceCandles(data: any[]): Candle[] {
    return this.validateAndSort(data.map(k => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })));
  }

  private static normalizeBybitCandles(data: any): Candle[] {
    return this.validateAndSort(data.result.list.map((k: any) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    })));
  }

  private static normalizeCoinbaseCandles(data: any[]): Candle[] {
    return this.validateAndSort(data.map(k => ({
      time: Number(k[0]),
      open: Number(k[3]),
      high: Number(k[1]),
      low: Number(k[2]),
      close: Number(k[4]),
      volume: Number(k[5])
    })));
  }

  private static validateAndSort(candles: Candle[]): Candle[] {
    const valid = candles.filter(c => 
      Number.isFinite(c.time) && Number.isFinite(c.open) && 
      Number.isFinite(c.high) && Number.isFinite(c.low) && 
      Number.isFinite(c.close) && Number.isFinite(c.volume)
    ).sort((a, b) => a.time - b.time);

    const unique: Candle[] = [];
    const seen = new Set<number>();
    for (const c of valid) {
      if (!seen.has(c.time)) {
        seen.add(c.time);
        unique.push(c);
      }
    }
    return unique;
  }

  private static logSuccess(provider: string, latency: number, candles: Candle[]) {
    console.log(`[Gateway] Provider: ${provider} | Latency: ${latency}ms | Count: ${candles.length}`);
    if (candles.length > 0) {
      console.log(`[Gateway] Range: ${candles[0].time} -> ${candles[candles.length - 1].time}`);
    }
  }
}
