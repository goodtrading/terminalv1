import { z } from "zod";
import { getKrakenTicker, getKrakenCandles } from "./kraken-gateway";
import { aggregateOhlcvCandles } from "./lib/candleAggregation";
import {
  getBufferCoverage,
  queryBufferedAggTrades,
  type BufferedAggTrade,
} from "./services/aggTradeBufferService";

/** Bybit spot kline `interval` param (minutes or D/W/M). */
function bybitIntervalFromApi(iv: string): string {
  const m: Record<string, string> = {
    "1m": "1",
    "3m": "3",
    "5m": "5",
    "15m": "15",
    "30m": "30",
    "1h": "60",
    "2h": "120",
    "4h": "240",
    "6h": "360",
    "12h": "720",
    "1d": "D",
  };
  return m[iv] ?? iv;
}

/** Coinbase candles granularity in seconds. */
function coinbaseGranularitySeconds(iv: string): number {
  const m: Record<string, number> = {
    "1m": 60,
    "5m": 300,
    "15m": 900,
    "1h": 3600,
    "6h": 21600,
    "1d": 86400,
  };
  return m[iv] ?? 900;
}

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

/** Normalized Binance aggTrades row — `side` is aggressor (market) side */
export type AggTrade = {
  id: string;
  price: number;
  qty: number;
  /** Exchange event time (ms) */
  time: number;
  side: "buy" | "sell";
};

// --- In-Memory Cache for Deterministic Access ---
let lastTickerCache: Ticker | null = null;
let isRefreshing = false;

export class MarketDataGateway {
  // Prevent heavy per-request logging during frequent polling.
  private static DEBUG_GATEWAY = false;

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

  /**
   * 15s bars from Binance 1s klines (max 1000 → ~66 fifteen-second bars). No other provider in this path.
   */
  private static async getCandles15sFrom1s(symbol: string, limit: number): Promise<Candle[]> {
    const BINANCE_1S_MAX = 1000;
    const out = await this.fetchBinance(
      `/api/v3/klines?symbol=${symbol}&interval=1s&limit=${BINANCE_1S_MAX}`,
    );
    const oneSec = this.validateAndSort(this.normalizeBinance(out.data));
    if (oneSec.length === 0) return [];
    const asAgg = oneSec.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    const fifteen = aggregateOhlcvCandles(asAgg, 15);
    return fifteen.slice(-limit);
  }

  static async getCandles(symbol: string, interval: string = "15m", limit: number = 500, preferredSource?: string): Promise<Candle[]> {
    const iv = interval.trim().toLowerCase();
    if (iv === "15s") {
      try {
        return await this.getCandles15sFrom1s(symbol, limit);
      } catch (e: any) {
        console.warn("[Gateway] 15s via 1s failed:", e?.message ?? e);
        throw e;
      }
    }

    const krakenProvider = {
      name: 'Kraken',
      fetch: async (): Promise<{ data: Candle[]; provider: string; latency: number }> => {
        const candles = await getKrakenCandles(symbol, iv, limit);
        return { data: candles, provider: 'Kraken', latency: 0 };
      },
      normalize: (d: Candle[]) => d
    };
    const baseProviders = [
      { name: 'Binance', fetch: () => this.fetchBinance(`/api/v3/klines?symbol=${symbol}&interval=${iv}&limit=${limit}`), normalize: (d: any) => this.normalizeBinance(d) },
      {
        name: 'Bybit',
        fetch: () =>
          this.fetchBybit(
            `/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitIntervalFromApi(iv)}&limit=${limit}`,
          ),
        normalize: (d: any) => this.normalizeBybit(d),
      },
      {
        name: 'Coinbase',
        fetch: () =>
          this.fetchCoinbase(
            `/products/${symbol.replace('USDT', '-USDT')}/candles?granularity=${coinbaseGranularitySeconds(iv)}`,
          ),
        normalize: (d: any) => this.normalizeCoinbase(d),
      },
    ];
    const providers = preferredSource === 'kraken'
      ? [krakenProvider, ...baseProviders]
      : [...baseProviders, krakenProvider];

    let lastError = null;
    for (const provider of providers) {
      try {
        const out = await provider.fetch();
        const candles = provider.normalize(out.data).slice(0, limit);
        const validated = this.validateAndSort(candles);
        if (MarketDataGateway.DEBUG_GATEWAY) {
          console.log(`[Gateway] Provider: ${out.provider} | Latency: ${out.latency}ms | Count: ${validated.length}`);
        }
        return validated;
      } catch (e: any) {
        lastError = e.message;
      }
    }
    throw new Error(lastError || "All providers failed");
  }

  static async getTicker(symbol: string, preferredSource?: string): Promise<Ticker> {
    const krakenProvider = {
      name: 'Kraken',
      fetch: async (): Promise<{ data: Ticker; provider: string; latency: number }> => {
        const t = await getKrakenTicker(symbol);
        return { data: t, provider: t.source, latency: 0 };
      },
      normalize: (d: Ticker) => d
    };
    const baseProviders = [
      { name: 'Binance', fetch: () => this.fetchBinance(`/api/v3/ticker/price?symbol=${symbol}`), normalize: (d: any, s: string) => ({ symbol: d.symbol, price: parseFloat(d.price), timestamp: Date.now(), source: s }) },
      { name: 'Bybit', fetch: () => this.fetchBybit(`/v5/market/tickers?category=spot&symbol=${symbol}`), normalize: (d: any, s: string) => ({ symbol: d.result.list[0].symbol, price: parseFloat(d.result.list[0].lastPrice), timestamp: Date.now(), source: s }) },
      { name: 'Coinbase', fetch: () => this.fetchCoinbase(`/products/${symbol.replace('USDT', '-USDT')}/ticker`), normalize: (d: any, s: string) => ({ symbol: symbol, price: parseFloat(d.price), timestamp: Date.now(), source: s }) }
    ];
    const providers = preferredSource === 'kraken'
      ? [krakenProvider, ...baseProviders]
      : [...baseProviders, krakenProvider];

    for (const provider of providers) {
      try {
        const out = await provider.fetch() as { data: any; provider: string };
        const ticker = provider.name === 'Kraken' ? out.data : provider.normalize(out.data, out.provider);
        const validated = tickerSchema.parse(ticker);
        // Only update cache when using default chain (terminal state / options use cached ticker)
        if (preferredSource !== 'kraken') lastTickerCache = validated;
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

  private static normalizeAggTradeRow(row: any): AggTrade {
    const isBuyerMaker = row.m === true;
    return {
      id: String(row.a),
      price: parseFloat(row.p),
      qty: parseFloat(row.q),
      time: Number(row.T),
      side: isBuyerMaker ? ("sell" as const) : ("buy" as const),
    };
  }

  private static readonly AGG_TRADES_PAGE = 1000;
  /** Footprint client cap — keep paginated REST bounded to avoid Binance timeouts / 503 to the UI. */
  private static readonly AGG_TRADES_CLIENT_CAP = 5000;
  /** Historical backfill cap for visible-range footprint reconstruction. */
  private static readonly AGG_TRADES_HISTORICAL_CAP = 220_000;
  /** Safety cap for one paged walk. */
  private static readonly AGG_TRADES_PAGED_HARD_CAP = 220_000;

  /** Binance REST aggTrades (max 1000 rows per request). */
  private static async fetchAggTradesRest(
    symbol: string,
    opts: { startTimeMs?: number; endTimeMs?: number; limit?: number },
  ): Promise<AggTrade[]> {
    const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
    const limit = Math.min(1000, Math.max(1, opts.limit ?? 800));
    const params = new URLSearchParams({ symbol: sym, limit: String(limit) });
    if (opts.startTimeMs != null) params.set("startTime", String(Math.floor(opts.startTimeMs)));
    if (opts.endTimeMs != null) params.set("endTime", String(Math.floor(opts.endTimeMs)));
    const { data } = await this.fetchBinance(`/api/v3/aggTrades?${params.toString()}`);
    if (!Array.isArray(data)) return [];
    const out: AggTrade[] = [];
    for (const row of data) {
      try {
        const t = this.normalizeAggTradeRow(row);
        if (Number.isFinite(t.price) && Number.isFinite(t.qty) && Number.isFinite(t.time) && t.qty > 0) {
          out.push(t);
        }
      } catch {
        /* skip malformed row */
      }
    }
    return out;
  }

  /**
   * Walk Binance aggTrades in windows of 1000 until range is covered or caps hit.
   * Page count is bounded by `maxRows` so a single user request cannot fan out to hundreds of REST calls.
   */
  private static async fetchAggTradesRestPaged(
    symbol: string,
    startMs: number,
    endMs: number,
    maxRows: number,
  ): Promise<AggTrade[]> {
    const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
    if (endMs < startMs) return [];
    const cap = Math.min(this.AGG_TRADES_PAGED_HARD_CAP, Math.max(1, maxRows));
    const map = new Map<string, AggTrade>();
    let cursor = startMs;
    let pages = 0;
    const maxPages = Math.min(420, Math.ceil(cap / this.AGG_TRADES_PAGE) + 4);

    while (cursor <= endMs && map.size < cap && pages < maxPages) {
      pages++;
      let batch: AggTrade[];
      try {
        batch = await this.fetchAggTradesRest(sym, {
          startTimeMs: cursor,
          endTimeMs: endMs,
          limit: this.AGG_TRADES_PAGE,
        });
      } catch (e: any) {
        console.error("[fetchAggTradesRestPaged] page failed", { sym, cursor, endMs, page: pages, err: e?.message ?? e });
        break;
      }
      if (batch.length === 0) break;
      for (const t of batch) {
        if (t.time < startMs || t.time > endMs) continue;
        map.set(t.id, t);
      }
      const last = batch[batch.length - 1]!;
      if (last.time >= endMs || batch.length < this.AGG_TRADES_PAGE) break;
      const next = last.time + 1;
      if (next <= cursor) break;
      cursor = next;
    }

    return [...map.values()].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
  }

  private static mergeAggTradesById(parts: AggTrade[][]): AggTrade[] {
    const map = new Map<string, AggTrade>();
    for (const arr of parts) {
      for (const t of arr) map.set(t.id, t);
    }
    const out = [...map.values()].sort((a, b) => a.time - b.time || a.id.localeCompare(b.id));
    return out;
  }

  private static bufferedToAgg(buf: BufferedAggTrade[]): AggTrade[] {
    return buf.map((t) => ({ ...t }));
  }

  /**
   * Recent aggregated trades (Binance aggTrades). Used for footprint / tape style features.
   * `side` = taker: buy lifted ask, sell hit bid.
   *
   * For `BTCUSDT`, prefers the in-memory WebSocket buffer when the window lies in retention;
   * Binance REST fills gaps (before oldest buffered, or stale tail vs requested `endTime`).
   *
   * Never throws: logs and returns [] on failure so HTTP layer can always emit JSON array.
   */
  static async getAggTrades(
    symbol: string,
    opts: { startTimeMs?: number; endTimeMs?: number; limit?: number; fullRange?: boolean } = {},
  ): Promise<AggTrade[]> {
    try {
      return await this.getAggTradesImpl(symbol, opts);
    } catch (e: any) {
      console.error("[MarketDataGateway.getAggTrades] error:", e?.message ?? e, e?.stack);
      return [];
    }
  }

  private static async getAggTradesImpl(
    symbol: string,
    opts: { startTimeMs?: number; endTimeMs?: number; limit?: number; fullRange?: boolean },
  ): Promise<AggTrade[]> {
    const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
    const clientLimit = Math.min(this.AGG_TRADES_CLIENT_CAP, Math.max(1, opts.limit ?? this.AGG_TRADES_CLIENT_CAP));
    const effectiveLimit = opts.fullRange ? this.AGG_TRADES_HISTORICAL_CAP : clientLimit;
    const startRaw = opts.startTimeMs;
    const endRaw = opts.endTimeMs;
    const hasWindow = Number.isFinite(startRaw) && Number.isFinite(endRaw);

    if (!hasWindow) {
      try {
        return await this.fetchAggTradesRest(sym, { limit: Math.min(1000, clientLimit) });
      } catch (e: any) {
        console.error("[getAggTradesImpl] no-window fetch failed:", e?.message ?? e);
        return [];
      }
    }

    let startMs = Math.floor(startRaw!);
    let endMs = Math.floor(endRaw!);
    if (endMs < startMs) [startMs, endMs] = [endMs, startMs];
    const now = Date.now();
    if (endMs > now) endMs = now;
    const MAX_SPAN_MS = 48 * 60 * 60 * 1000;
    if (endMs - startMs > MAX_SPAN_MS) {
      startMs = endMs - MAX_SPAN_MS;
    }

    const cov = getBufferCoverage(sym);
    console.log(
      "[getAggTrades]",
      `sym=${sym} startMs=${startMs} endMs=${endMs} limit=${effectiveLimit} fullRange=${opts.fullRange ? 1 : 0} buf={connected:${cov.connected} size:${cov.size} oldest:${cov.oldestMs ?? "null"} newest:${cov.newestMs ?? "null"}}`,
    );

    let buf: AggTrade[] = [];
    try {
      const bufRaw = queryBufferedAggTrades(sym, startMs, endMs);
      buf = this.bufferedToAgg(bufRaw);
    } catch (e: any) {
      console.error("[getAggTrades] buffer query failed:", e?.message ?? e);
    }

    if (sym !== "BTCUSDT") {
      const paged = await this.fetchAggTradesRestPaged(sym, startMs, endMs, effectiveLimit);
      return paged.length <= effectiveLimit ? paged : paged.slice(0, effectiveLimit);
    }

    const useBuffer = cov.size > 0 || cov.connected;
    if (!useBuffer) {
      const paged = await this.fetchAggTradesRestPaged(sym, startMs, endMs, effectiveLimit);
      return paged.length <= effectiveLimit ? paged : paged.slice(0, effectiveLimit);
    }

    const headParts: AggTrade[] = [];
    const tailParts: AggTrade[] = [];

    if (cov.oldestMs != null && startMs < cov.oldestMs) {
      const headEnd = Math.min(endMs, cov.oldestMs - 1);
      if (startMs <= headEnd) {
        headParts.push(...(await this.fetchAggTradesRestPaged(sym, startMs, headEnd, effectiveLimit)));
      }
    }

    const TAIL_STALE_MS = 2000;
    if (cov.newestMs != null && endMs > cov.newestMs + TAIL_STALE_MS) {
      const tailStart = Math.max(startMs, cov.newestMs - 1);
      if (tailStart <= endMs) {
        tailParts.push(...(await this.fetchAggTradesRestPaged(sym, tailStart, endMs, effectiveLimit)));
      }
    }

    let merged = this.mergeAggTradesById([headParts, buf, tailParts]);

    if (merged.length === 0) {
      merged = await this.fetchAggTradesRestPaged(sym, startMs, endMs, effectiveLimit);
    }

    if (merged.length <= effectiveLimit) return merged;
    return merged.slice(0, effectiveLimit);
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
