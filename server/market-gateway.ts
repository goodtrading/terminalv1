import { z } from "zod";
import { getKrakenTicker, getKrakenCandles } from "./kraken-gateway";
import { aggregateOhlcvCandles } from "./lib/candleAggregation";
import { clampCandleLimit, getCandleLimitForTimeframe } from "@shared/candleLimits";
import { parseBookmapMarket, type BookmapMarketSource } from "@shared/bookmapMarket";
import { buildMarketDataTruth, deriveMarketDataQuality, type MarketDataMarketType, type MarketDataTruth } from "@shared/marketDataTruth";
import { getOrderBookForMarket, getCanonicalL2BookForMarket, getLiquidityLifecycleForMarket } from "./services/orderbookMarketRegistry";
import type { LiquidityLifecycleEvent } from "@shared/liquidityLifecycle";
import { getHistoricalLiquidityBook } from "./services/historicalLiquidityRegistry";
import type { CanonicalL2Book } from "@shared/canonicalL2Book";
import { getSpotOrderBookHealth } from "./services/orderbookService";
import { getPerpOrderBookHealth } from "./services/orderbookServicePerp";
import {
  ingestCanonicalAggTrade,
  getBufferCoverage,
  getTradesBufferHealth,
  queryBufferedAggTrades,
  type BufferedAggTrade,
} from "./services/aggTradeBufferRegistry";

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

function apiIntervalSeconds(iv: string): number {
  const m: Record<string, number> = {
    "1s": 1,
    "15s": 15,
    "1m": 60,
    "3m": 180,
    "5m": 300,
    "15m": 900,
    "30m": 1800,
    "1h": 3600,
    "2h": 7200,
    "4h": 14_400,
    "6h": 21_600,
    "12h": 43_200,
    "1d": 86_400,
  };
  return m[iv] ?? 900;
}

function sortAndDedupeCandles(candles: Candle[]): Candle[] {
  const byTime = new Map<number, Candle>();
  for (const candle of candles) {
    if (!candle || !Number.isFinite(candle.time)) continue;
    byTime.set(candle.time, candle);
  }
  return Array.from(byTime.values()).sort((a, b) => a.time - b.time);
}

async function collectCandlesBackward(
  targetLimit: number,
  pageSize: number,
  initialBeforeMs: number | null | undefined,
  fetchPage: (beforeMs: number | undefined, pageSize: number) => Promise<Candle[]>,
): Promise<Candle[]> {
  const limit = Math.max(1, targetLimit);
  const safePageSize = Math.max(1, pageSize);
  const maxPages = Math.max(2, Math.ceil(limit / safePageSize) + 4);
  let beforeMs = initialBeforeMs == null || !Number.isFinite(initialBeforeMs) ? undefined : Math.floor(initialBeforeMs) - 1;
  let collected: Candle[] = [];
  for (let page = 0; page < maxPages && collected.length < limit; page += 1) {
    const batch = sortAndDedupeCandles(await fetchPage(beforeMs, safePageSize));
    if (!batch.length) break;
    collected = sortAndDedupeCandles([...batch, ...collected]);
    if (batch.length < safePageSize) break;
    beforeMs = batch[0]!.time * 1000 - 1;
  }
  return collected.slice(-limit);
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
        lastError = `Status ${response.status}`;
      } catch (e: any) {
        lastError = e.message;
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
   * 15s bars from Binance 1s klines. Paginates 1s REST (1000 cap/request) so limits up to 500
   * fifteen-second bars are feasible (~limit×15 one-second samples).
   */
  private static async getCandles15sFrom1s(symbol: string, limit: number, beforeMs?: number): Promise<Candle[]> {
    const BINANCE_1S_MAX = 1000;
    const target15s = clampCandleLimit(limit, getCandleLimitForTimeframe("15s"));
    const oneSecNeeded = target15s * 15;
    const maxPages = 6;

    let allOneSec: Candle[] = [];
    let endTimeMs: number | undefined = beforeMs != null && Number.isFinite(beforeMs) ? Math.floor(beforeMs) - 1 : undefined;

    for (let page = 0; page < maxPages && allOneSec.length < oneSecNeeded; page++) {
      let path = `/api/v3/klines?symbol=${symbol}&interval=1s&limit=${BINANCE_1S_MAX}`;
      if (endTimeMs != null) {
        path += `&endTime=${endTimeMs}`;
      }
      const out = await this.fetchBinance(path);
      const batch = this.validateAndSort(this.normalizeBinance(out.data));
      if (!batch.length) break;

      const merged = page === 0 ? batch : [...batch, ...allOneSec];
      allOneSec = this.validateAndSort(merged);

      if (batch.length < BINANCE_1S_MAX) break;
      endTimeMs = batch[0]!.time * 1000 - 1;
    }

    if (allOneSec.length === 0) return [];
    const asAgg = allOneSec.map((c) => ({
      time: c.time,
      open: c.open,
      high: c.high,
      low: c.low,
      close: c.close,
      volume: c.volume,
    }));
    const fifteen = aggregateOhlcvCandles(asAgg, 15);
    const filtered = beforeMs != null && Number.isFinite(beforeMs)
      ? fifteen.filter((c) => c.time * 1000 < Math.floor(beforeMs))
      : fifteen;
    return filtered.slice(-target15s);
  }

  static async getCandles(symbol: string, interval: string = "15m", limit: number = 500, preferredSource?: string, beforeMs?: number): Promise<Candle[]> {
    const iv = interval.trim().toLowerCase();
    const safeLimit = clampCandleLimit(limit, getCandleLimitForTimeframe(iv));
    const safeBeforeMs = beforeMs != null && Number.isFinite(beforeMs) ? Math.floor(beforeMs) : undefined;
    if (iv === "15s") {
      try {
        return await this.getCandles15sFrom1s(symbol, safeLimit, safeBeforeMs);
      } catch (e: any) {
        console.warn("[Gateway] 15s via 1s failed:", e?.message ?? e);
        throw e;
      }
    }

    const providerAttempts: Array<{
      name: string;
      fetch: () => Promise<{ data: Candle[]; provider: string; latency: number }>;
      normalize: (d: any) => Candle[];
    }> = [
      {
        name: 'Binance',
        fetch: async () => {
          const candles = await collectCandlesBackward(safeLimit, 500, safeBeforeMs, async (before, pageLimit) => {
            let path = `/api/v3/klines?symbol=${symbol}&interval=${iv}&limit=${pageLimit}`;
            if (before != null) path += `&endTime=${before}`;
            const out = await this.fetchBinance(path);
            return this.normalizeBinance(out.data);
          });
          return { data: candles, provider: 'Binance', latency: 0 };
        },
        normalize: (d: any) => this.validateAndSort(d),
      },
      {
        name: 'Bybit',
        fetch: async () => {
          const candles = await collectCandlesBackward(safeLimit, 500, safeBeforeMs, async (before, pageLimit) => {
            let path = `/v5/market/kline?category=spot&symbol=${symbol}&interval=${bybitIntervalFromApi(iv)}&limit=${pageLimit}`;
            if (before != null) path += `&end=${before}`;
            const out = await this.fetchBybit(path);
            return this.normalizeBybit(out.data);
          });
          return { data: candles, provider: 'Bybit', latency: 0 };
        },
        normalize: (d: any) => this.validateAndSort(d),
      },
      {
        name: 'Coinbase',
        fetch: async () => {
          const candles = await collectCandlesBackward(safeLimit, 300, safeBeforeMs, async (before, pageLimit) => {
            const granularity = coinbaseGranularitySeconds(iv);
            const endSec = before != null ? Math.floor(before / 1000) : Math.floor(Date.now() / 1000);
            const windowStart = Math.max(0, endSec - granularity * pageLimit * 2);
            const out = await this.fetchCoinbase(
              `/products/${symbol.replace('USDT', '-USDT')}/candles?granularity=${granularity}&start=${windowStart}&end=${endSec}`,
            );
            return this.normalizeCoinbase(out.data);
          });
          return { data: candles, provider: 'Coinbase', latency: 0 };
        },
        normalize: (d: any) => this.validateAndSort(d),
      },
      {
        name: 'Kraken',
        fetch: async () => {
          const candles = await collectCandlesBackward(safeLimit, 720, safeBeforeMs, async (before, pageLimit) => {
            const intervalCode = iv;
            const lookbackMs = apiIntervalSeconds(intervalCode) * pageLimit * 2 * 1000;
            void lookbackMs;
            return getKrakenCandles(symbol, intervalCode, pageLimit);
          });
          return { data: candles, provider: 'Kraken', latency: 0 };
        },
        normalize: (d: any) => this.validateAndSort(d),
      },
    ];

    const orderedAttempts = preferredSource === 'kraken'
      ? [providerAttempts[3], ...providerAttempts.slice(0, 3)]
      : providerAttempts;

    let lastError: unknown = null;
    for (const provider of orderedAttempts) {
      try {
        if (!provider) continue;
        const out = await provider.fetch();
        const validated = provider.normalize(out.data).slice(-safeLimit);
        if (MarketDataGateway.DEBUG_GATEWAY) {
          console.log(`[Gateway] Provider: ${out.provider} | Latency: ${out.latency}ms | Count: ${validated.length}`);
        }
        return validated;
      } catch (e: any) {
        lastError = e?.message ?? e;
      }
    }
    throw new Error(typeof lastError === 'string' ? lastError : 'All providers failed');
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

  static getCanonicalL2Book(input: {
    instrument: string;
    venue: "Binance";
    marketType: MarketDataMarketType;
  }): CanonicalL2Book {
    if (input.venue !== "Binance") throw new Error("Unsupported canonical L2 venue");
    if (input.instrument.trim().toUpperCase() !== "BTCUSDT") throw new Error("Unsupported canonical L2 instrument");
    return getCanonicalL2BookForMarket(input.marketType === "Perpetual" ? "perp" : "spot");
  }

  static getLiquidityLifecycle(input: {
    instrument: string;
    venue: "Binance";
    marketType: MarketDataMarketType;
  }): LiquidityLifecycleEvent[] {
    if (input.venue !== "Binance") throw new Error("Unsupported liquidity lifecycle venue");
    if (input.instrument.trim().toUpperCase() !== "BTCUSDT") throw new Error("Unsupported liquidity lifecycle instrument");
    return getLiquidityLifecycleForMarket(input.marketType === "Perpetual" ? "perp" : "spot");
  }

  static getHistoricalLiquidityBook(input: { instrument: string; venue: "Binance"; marketType: MarketDataMarketType; time: number }) {
    if (input.venue !== "Binance") throw new Error("Unsupported historical liquidity venue");
    if (input.instrument.trim().toUpperCase() !== "BTCUSDT") throw new Error("Unsupported historical liquidity instrument");
    return getHistoricalLiquidityBook({ instrument: input.instrument.trim().toUpperCase(), venue: input.venue, marketType: input.marketType, time: input.time });
  }

  static getMarketTruth(input: {
    instrument: string;
    venue: "Binance";
    marketType: MarketDataMarketType;
  }): MarketDataTruth {
    if (input.venue !== "Binance") throw new Error("Unsupported market truth venue");
    const market: BookmapMarketSource = input.marketType === "Perpetual" ? "perp" : "spot";
    const orderbook = getOrderBookForMarket(market);
    const bookHealth = market === "perp" ? getPerpOrderBookHealth() : getSpotOrderBookHealth();
    const tradeHealth = getTradesBufferHealth(input.instrument, market);
    const hasBbo = orderbook.bids.length > 0 && orderbook.asks.length > 0;
    const quality = deriveMarketDataQuality({
      connected: bookHealth.connected,
      hasBbo,
      ageMs: bookHealth.ageMs,
      marketType: input.marketType,
      syncState: (bookHealth as { syncState?: "BOOTSTRAPPING" | "SYNCHRONIZED" | "DESYNCHRONIZED" }).syncState,
    });

    return buildMarketDataTruth({
      instrument: input.instrument.trim().toUpperCase(),
      venue: "Binance",
      marketType: input.marketType,
      bid: orderbook.bids[0]?.price ?? null,
      ask: orderbook.asks[0]?.price ?? null,
      last: tradeHealth.lastTradePrice,
      eventTime: orderbook.eventTime ?? null,
      receiveTime: orderbook.receiveTime ?? bookHealth.lastMessageTs ?? Date.now(),
      source: orderbook.source ?? "rest",
      sequence: orderbook.sequence ?? bookHealth.latestUpdateId ?? null,
      quality,
    });
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
  /** Client cap — keep paginated REST bounded to avoid Binance timeouts / 503 to the UI. */
  private static readonly AGG_TRADES_CLIENT_CAP = 5000;
  /** Historical backfill cap for visible-range data reconstruction. */
  private static readonly AGG_TRADES_HISTORICAL_CAP = 220_000;
  /** Safety cap for one paged walk. */
  private static readonly AGG_TRADES_PAGED_HARD_CAP = 220_000;

  private static aggTradesRestUrl(market: BookmapMarketSource): string {
    return market === "perp"
      ? "https://fapi.binance.com/fapi/v1/aggTrades"
      : "https://api.binance.com/api/v3/aggTrades";
  }

  /** Binance REST aggTrades — spot v3 or USDT-M futures fapi v1. */
  private static async fetchAggTradesRest(
    symbol: string,
    market: BookmapMarketSource,
    opts: { startTimeMs?: number; endTimeMs?: number; limit?: number },
  ): Promise<AggTrade[]> {
    const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
    const limit = Math.min(1000, Math.max(1, opts.limit ?? 800));
    const params = new URLSearchParams({ symbol: sym, limit: String(limit) });
    if (opts.startTimeMs != null) params.set("startTime", String(Math.floor(opts.startTimeMs)));
    if (opts.endTimeMs != null) params.set("endTime", String(Math.floor(opts.endTimeMs)));

    let data: unknown;
    if (market === "perp") {
      const res = await this.fetchWithTimeout(
        `${this.aggTradesRestUrl("perp")}?${params.toString()}`,
      );
      if (!res.ok) {
        throw new Error(`Futures aggTrades status ${res.status}`);
      }
      data = await res.json();
    } else {
      const out = await this.fetchBinance(`/api/v3/aggTrades?${params.toString()}`);
      data = out.data;
    }

    if (!Array.isArray(data)) return [];
    const rows: AggTrade[] = [];
    for (const row of data) {
      try {
        const t = this.normalizeAggTradeRow(row);
        if (Number.isFinite(t.price) && Number.isFinite(t.qty) && Number.isFinite(t.time) && t.qty > 0) {
          rows.push(t);
          if (sym === "BTCUSDT") {
            ingestCanonicalAggTrade({ id: t.id, price: t.price, qty: t.qty, time: t.time, eventTime: t.time, side: t.side }, market, "rest");
          }
        }
      } catch {
        /* skip malformed row */
      }
    }
    return rows;
  }

  /**
   * Walk Binance aggTrades in windows of 1000 until range is covered or caps hit.
   * Page count is bounded by `maxRows` so a single user request cannot fan out to hundreds of REST calls.
   */
  private static async fetchAggTradesRestPaged(
    symbol: string,
    market: BookmapMarketSource,
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
        batch = await this.fetchAggTradesRest(sym, market, {
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
   * Recent aggregated trades (Binance aggTrades). Used for market data analysis features.
   * `side` = taker: buy lifted ask, sell hit bid.
   *
   * For `BTCUSDT`, prefers the in-memory WebSocket buffer when the window lies in retention;
   * Binance REST fills gaps (before oldest buffered, or stale tail vs requested `endTime`).
   *
   * Never throws: logs and returns [] on failure so HTTP layer can always emit JSON array.
   */
  static async getAggTrades(
    symbol: string,
    opts: {
      startTimeMs?: number;
      endTimeMs?: number;
      limit?: number;
      fullRange?: boolean;
      market?: BookmapMarketSource;
    } = {},
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
    opts: {
      startTimeMs?: number;
      endTimeMs?: number;
      limit?: number;
      fullRange?: boolean;
      market?: BookmapMarketSource;
    },
  ): Promise<AggTrade[]> {
    const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
    const market = parseBookmapMarket(opts.market);
    const clientLimit = Math.min(this.AGG_TRADES_CLIENT_CAP, Math.max(1, opts.limit ?? this.AGG_TRADES_CLIENT_CAP));
    const effectiveLimit = opts.fullRange ? this.AGG_TRADES_HISTORICAL_CAP : clientLimit;
    const startRaw = opts.startTimeMs;
    const endRaw = opts.endTimeMs;
    const hasWindow = Number.isFinite(startRaw) && Number.isFinite(endRaw);

    if (!hasWindow) {
      try {
        return await this.fetchAggTradesRest(sym, market, { limit: Math.min(1000, clientLimit) });
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

    const cov = getBufferCoverage(sym, market);
    console.log(
      "[getAggTrades]",
      `market=${market} sym=${sym} startMs=${startMs} endMs=${endMs} limit=${effectiveLimit} fullRange=${opts.fullRange ? 1 : 0} buf={connected:${cov.connected} size:${cov.size} oldest:${cov.oldestMs ?? "null"} newest:${cov.newestMs ?? "null"}}`,
    );

    let buf: AggTrade[] = [];
    try {
      const bufRaw = queryBufferedAggTrades(sym, startMs, endMs, market);
      buf = this.bufferedToAgg(bufRaw);
    } catch (e: any) {
      console.error("[getAggTrades] buffer query failed:", e?.message ?? e);
    }

    if (sym !== "BTCUSDT") {
      const paged = await this.fetchAggTradesRestPaged(sym, market, startMs, endMs, effectiveLimit);
      return paged.length <= effectiveLimit ? paged : paged.slice(-effectiveLimit);
    }

    const useBuffer = cov.size > 0 || cov.connected;
    if (!useBuffer) {
      const paged = await this.fetchAggTradesRestPaged(sym, market, startMs, endMs, effectiveLimit);
      return paged.length <= effectiveLimit ? paged : paged.slice(-effectiveLimit);
    }

    const headParts: AggTrade[] = [];
    const tailParts: AggTrade[] = [];

    if (cov.oldestMs != null && startMs < cov.oldestMs) {
      const headEnd = Math.min(endMs, cov.oldestMs - 1);
      if (startMs <= headEnd) {
        headParts.push(
          ...(await this.fetchAggTradesRestPaged(sym, market, startMs, headEnd, effectiveLimit)),
        );
      }
    }

    const TAIL_STALE_MS = 2000;
    if (cov.newestMs != null && endMs > cov.newestMs + TAIL_STALE_MS) {
      const tailStart = Math.max(startMs, cov.newestMs - 1);
      if (tailStart <= endMs) {
        tailParts.push(
          ...(await this.fetchAggTradesRestPaged(sym, market, tailStart, endMs, effectiveLimit)),
        );
      }
    }

    let merged = this.mergeAggTradesById([headParts, buf, tailParts]);

    if (merged.length === 0) {
      merged = await this.fetchAggTradesRestPaged(sym, market, startMs, endMs, effectiveLimit);
    }

    if (merged.length <= effectiveLimit) return merged;
    /** Preferir los trades más recientes del intervalo (cliente footprint / chart visible a la derecha). */
    return merged.slice(-effectiveLimit);
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
