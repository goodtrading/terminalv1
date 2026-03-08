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

// --- In-Memory Cache for Deterministic Access ---
let lastTickerCache: Ticker | null = null;
let isRefreshing = false;

export class MarketDataGateway {
  private static binanceMirrors = [
    "https://api1.binance.com",
    "https://api2.binance.com",
    "https://api3.binance.com",
    "https://api.binance.com"
  ];

  private static async fetchWithTimeout(url: string, options: any = {}, timeout: number = 5000): Promise<Response> {
    const controller = new AbortController();
    const id = setTimeout(() => controller.abort(), timeout);
    try {
      const response = await fetch(url, { ...options, signal: controller.signal });
      clearTimeout(id);
      return response;
    } catch (e) {
      clearTimeout(id);
      throw e;
    }
  }

  private static async fetchBinance(path: string): Promise<{ data: any; provider: string; latency: number }> {
    let lastError = null;
    for (const mirror of this.binanceMirrors) {
      const start = Date.now();
      try {
        const response = await this.fetchWithTimeout(`${mirror}${path}`);
        const latency = Date.now() - start;
        if (response.ok) return { data: await response.json(), provider: `Binance(${mirror})`, latency };
        if (response.status === 451) throw new Error("GEO_BLOCKED");
        lastError = `Status ${response.status}`;
      } catch (e: any) {
        lastError = e.message;
        if (e.message === "GEO_BLOCKED") break;
      }
    }
    throw new Error(lastError || "Binance mirrors failed");
  }

  private static async fetchBybit(path: string): Promise<{ data: any; provider: string; latency: number }> {
    const start = Date.now();
    const response = await this.fetchWithTimeout(`https://api.bybit.com${path}`);
    const latency = Date.now() - start;
    if (!response.ok) throw new Error(`Bybit status ${response.status}`);
    return { data: await response.json(), provider: "Bybit", latency };
  }

  private static async fetchCoinbase(path: string): Promise<{ data: any; provider: string; latency: number }> {
    const start = Date.now();
    const response = await this.fetchWithTimeout(`https://api.exchange.coinbase.com${path}`, {
      headers: { 'User-Agent': 'QuantumSys-Gateway' }
    });
    const latency = Date.now() - start;
    if (!response.ok) throw new Error(`Coinbase status ${response.status}`);
    return { data: await response.json(), provider: "Coinbase", latency };
  }

  static async getCandles(symbol: string, interval: string = "15m", limit: number = 500): Promise<Candle[]> {
    const providers = [
      { name: 'Binance', fetch: () => this.fetchBinance(`/api/v3/klines?symbol=${symbol}&interval=${interval}&limit=${limit}`), normalize: (d: any) => this.normalizeBinance(d) },
      { name: 'Bybit', fetch: () => this.fetchBybit(`/v5/market/kline?category=spot&symbol=${symbol}&interval=${interval === '15m' ? '15' : interval}&limit=${limit}`), normalize: (d: any) => this.normalizeBybit(d) },
      { name: 'Coinbase', fetch: () => this.fetchCoinbase(`/products/${symbol.replace('USDT', '-USDT')}/candles?granularity=${interval === '15m' ? 900 : 3600}`), normalize: (d: any) => this.normalizeCoinbase(d) }
    ];

    let lastError = null;
    for (const provider of providers) {
      try {
        const { data, provider: source, latency } = await provider.fetch();
        const candles = provider.normalize(data).slice(0, limit);
        const validated = this.validateAndSort(candles);
        
        console.log(`[Gateway] Provider: ${source} | Latency: ${latency}ms | Count: ${validated.length}`);
        return validated;
      } catch (e: any) {
        lastError = e.message;
      }
    }
    throw new Error(lastError || "All providers failed");
  }

  static async getTicker(symbol: string): Promise<Ticker> {
    const providers = [
      { name: 'Binance', fetch: () => this.fetchBinance(`/api/v3/ticker/price?symbol=${symbol}`), normalize: (d: any, s: string) => ({ symbol: d.symbol, price: parseFloat(d.price), timestamp: Date.now(), source: s }) },
      { name: 'Bybit', fetch: () => this.fetchBybit(`/v5/market/tickers?category=spot&symbol=${symbol}`), normalize: (d: any, s: string) => ({ symbol: d.result.list[0].symbol, price: parseFloat(d.result.list[0].lastPrice), timestamp: Date.now(), source: s }) },
      { name: 'Coinbase', fetch: () => this.fetchCoinbase(`/products/${symbol.replace('USDT', '-USDT')}/ticker`), normalize: (d: any, s: string) => ({ symbol: symbol, price: parseFloat(d.price), timestamp: Date.now(), source: s }) }
    ];

    for (const provider of providers) {
      try {
        const { data, provider: source, latency } = await provider.fetch();
        const ticker = provider.normalize(data, source);
        const validated = tickerSchema.parse(ticker);
        // Cache the successful result
        lastTickerCache = validated;
        return validated;
      } catch (e: any) {
        console.warn(`[Gateway] Ticker ${provider.name} failed: ${e.message}`);
      }
    }
    throw new Error("Ticker unavailable from all providers");
  }

  // Pure read-only access to cached ticker
  static getCachedTicker(): Ticker | null {
    return lastTickerCache;
  }

  // Background refresh logic
  static async refreshTicker(symbol: string = "BTCUSDT") {
    if (isRefreshing) return;
    isRefreshing = true;
    try {
      await this.getTicker(symbol);
    } catch (e) {
      console.warn(`[Gateway] Background ticker refresh failed: ${e instanceof Error ? e.message : 'Unknown error'}`);
    } finally {
      isRefreshing = false;
    }
  }

  private static normalizeBinance(data: any[]): Candle[] {
    return data.map(k => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  }

  private static normalizeBybit(data: any): Candle[] {
    return data.result.list.map((k: any) => ({
      time: Math.floor(Number(k[0]) / 1000),
      open: parseFloat(k[1]),
      high: parseFloat(k[2]),
      low: parseFloat(k[3]),
      close: parseFloat(k[4]),
      volume: parseFloat(k[5])
    }));
  }

  private static normalizeCoinbase(data: any[]): Candle[] {
    return data.map(k => ({
      time: Math.floor(Number(k[0]) / 1000),
      low: Number(k[1]),
      high: Number(k[2]),
      open: Number(k[3]),
      close: Number(k[4]),
      volume: Number(k[5])
    }));
  }

  private static validateAndSort(candles: Candle[]): Candle[] {
    const valid = candles.filter(c => 
      Number.isFinite(c.time) && 
      Number.isFinite(c.open) && 
      Number.isFinite(c.high) && 
      Number.isFinite(c.low) && 
      Number.isFinite(c.close) &&
      Number.isFinite(c.volume)
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
}

// Start background ticker refresh loop
setInterval(() => {
  MarketDataGateway.refreshTicker("BTCUSDT");
}, 2000);
