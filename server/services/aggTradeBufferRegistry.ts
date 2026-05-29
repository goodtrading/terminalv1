/**
 * Dual-market aggTrade buffers — spot (legacy) + Binance USDT-M perp.
 * Spot: stream.binance.com / api v3
 * Perp: fstream.binance.com / fapi v1
 */

import WebSocket from "ws";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { DEFAULT_BOOKMAP_MARKET, parseBookmapMarket } from "@shared/bookmapMarket";

export type BufferedAggTrade = {
  id: string;
  price: number;
  qty: number;
  time: number;
  side: "buy" | "sell";
};

type BufferConfig = {
  market: BookmapMarketSource;
  streamSymbol: string;
  wsBase: string;
  wsPath: string;
  restAggTradesUrls: string[];
  logTag: string;
};

const RETENTION_MS = 90 * 60 * 1000;
const COMPACT_AFTER_DROPPED = 40_000;
const SEED_REST_LIMIT = 1000;
const MAX_BUFFER_RETURN = 120_000;
const DEBUG = process.env.NODE_ENV === "development";
const TRADE_STALE_MS = 3_000;
const TRADE_HEALTH_MS = 2_000;

let perpSseClients = 0;
let spotSseClients = 0;

function createAggTradeBuffer(config: BufferConfig) {
  const { market, streamSymbol, wsBase, wsPath, restAggTradesUrls, logTag } = config;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let connected = false;
  let lastMessageTs = 0;
  let lastTrade: BufferedAggTrade | null = null;
  let healthTimer: ReturnType<typeof setInterval> | null = null;
  let lastError: string | null = null;
  let lastRestSeedTs = 0;
  const listeners = new Set<(trade: BufferedAggTrade) => void>();
  const backing: BufferedAggTrade[] = [];
  let start = 0;

  function log(msg: string): void {
    if (DEBUG) console.log(`[${logTag}] ${msg}`);
  }

  function trimByRetention(): void {
    const cutoff = Date.now() - RETENTION_MS;
    while (start < backing.length && backing[start]!.time < cutoff) {
      start++;
    }
    if (start >= COMPACT_AFTER_DROPPED) {
      backing.splice(0, start);
      start = 0;
    }
  }

  function lowerBound(from: number, to: number, timeMs: number): number {
    let lo = from;
    let hi = to;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (backing[mid]!.time < timeMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function upperBound(from: number, to: number, timeMs: number): number {
    let lo = from;
    let hi = to;
    while (lo < hi) {
      const mid = (lo + hi) >> 1;
      if (backing[mid]!.time <= timeMs) lo = mid + 1;
      else hi = mid;
    }
    return lo;
  }

  function pushTrade(t: BufferedAggTrade): void {
    trimByRetention();
    const scanFrom = Math.max(start, backing.length - 80);
    for (let i = scanFrom; i < backing.length; i++) {
      if (backing[i]!.id === t.id) return;
    }
    const last = backing[backing.length - 1];
    if (last && t.time < last.time) {
      const idx = lowerBound(start, backing.length, t.time);
      if (backing[idx]?.id === t.id) return;
      backing.splice(idx, 0, t);
      lastMessageTs = Date.now();
      lastTrade = t;
      for (const fn of listeners) fn(t);
      return;
    }
    backing.push(t);
    lastMessageTs = Date.now();
    lastTrade = t;
    for (const fn of listeners) fn(t);
  }

  function logTradesHealth(reason?: string): void {
    if (!DEBUG && process.env.NODE_ENV !== "production") return;
    const ageMs = lastMessageTs > 0 ? Date.now() - lastMessageTs : null;
    console.debug("[AGG_TRADES_HEALTH]", {
      market,
      reason,
      connected,
      lastMessageTs: lastMessageTs || null,
      latestTradeTs: lastTrade?.time ?? null,
      latestAgeMs: lastTrade?.time != null ? Date.now() - lastTrade.time : ageMs,
      tradesInBuffer: Math.max(0, backing.length - start),
      bufferKey: aggTradeBufferKey(streamSymbol, market),
      reconnectCount: reconnectAttempt,
      sseClients: market === "perp" ? perpSseClients : spotSseClients,
      lastTradePrice: lastTrade?.price ?? null,
      lastTradeSize: lastTrade?.qty ?? null,
      lastTradeSide: lastTrade?.side ?? null,
      lastError,
      lastRestSeedTs: lastRestSeedTs || null,
    });
  }

  function runTradeHealthCheck(): void {
    const ageMs = lastMessageTs > 0 ? Date.now() - lastMessageTs : Infinity;
    if (ageMs > TRADE_STALE_MS && (connected || backing.length > start)) {
      logTradesHealth("stale");
      void seedFromRest();
      if (ws?.readyState !== WebSocket.OPEN) connect();
    } else if (backing.length <= start) {
      logTradesHealth("empty");
      void seedFromRest();
    }
  }

  function parseAggTradePayload(raw: string): BufferedAggTrade | null {
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch {
      return null;
    }
    if (!parsed || typeof parsed !== "object") return null;
    const root = parsed as Record<string, unknown>;
    const row = (root.data && typeof root.data === "object" ? root.data : root) as Record<
      string,
      unknown
    >;
    if (row.e !== "aggTrade") return null;
    const p = parseFloat(String(row.p));
    const q = parseFloat(String(row.q));
    const time = Number(row.T);
    if (!Number.isFinite(p) || !Number.isFinite(q) || !Number.isFinite(time) || q <= 0) {
      return null;
    }
    return {
      id: String(row.a),
      price: p,
      qty: q,
      time,
      side: row.m === true ? "sell" : "buy",
    };
  }

  async function seedFromRest(): Promise<void> {
    const end = Date.now();
    const startMs = end - RETENTION_MS;
    let lastSeedError: string | null = null;
    try {
      const params = new URLSearchParams({
        symbol: streamSymbol,
        limit: String(SEED_REST_LIMIT),
        startTime: String(startMs),
        endTime: String(end),
      });
      let data: unknown = null;
      let provider: string | null = null;
      for (const restAggTradesUrl of restAggTradesUrls) {
        try {
          const res = await fetch(`${restAggTradesUrl}?${params}`);
          if (!res.ok) {
            lastSeedError = `${restAggTradesUrl} status ${res.status}`;
            continue;
          }
          data = await res.json();
          provider = restAggTradesUrl;
          break;
        } catch (error) {
          lastSeedError =
            error instanceof Error
              ? `${restAggTradesUrl} ${error.message}`
              : `${restAggTradesUrl} ${String(error)}`;
        }
      }
      if (!Array.isArray(data)) {
        lastError = lastSeedError ?? "REST seed returned non-array";
        return;
      }
      const seen = new Set<string>();
      for (let i = start; i < backing.length; i++) seen.add(backing[i]!.id);
      for (const row of data) {
        const t: BufferedAggTrade = {
          id: String(row.a),
          price: parseFloat(row.p),
          qty: parseFloat(row.q),
          time: Number(row.T),
          side: row.m === true ? "sell" : "buy",
        };
        if (!seen.has(t.id)) {
          seen.add(t.id);
          pushTrade(t);
        }
      }
      lastError = null;
      lastRestSeedTs = Date.now();
      log(`Seeded ${data.length} rows from REST${provider ? ` (${provider})` : ""}`);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.warn(`[${logTag}] REST seed failed:`, lastError);
    }
  }

  function scheduleReconnect(): void {
    if (reconnectTimer != null) return;
    const delay = Math.min(30_000, 800 + reconnectAttempt * 900);
    reconnectTimer = setTimeout(() => {
      reconnectTimer = null;
      reconnectAttempt++;
      connect();
    }, delay);
  }

  function connect(): void {
    if (ws?.readyState === WebSocket.OPEN) return;
    try {
      ws = new WebSocket(`${wsBase}${wsPath}`);
    } catch (e) {
      lastError = e instanceof Error ? e.message : String(e);
      console.error(`[${logTag}] connect failed:`, e);
      scheduleReconnect();
      return;
    }
    ws.on("open", () => {
      connected = true;
      reconnectAttempt = 0;
      lastError = null;
      console.log(`[${logTag}] WebSocket connected`);
      void seedFromRest();
    });
    ws.on("message", (data: Buffer | string) => {
      const raw = typeof data === "string" ? data : data.toString();
      const trade = parseAggTradePayload(raw);
      if (trade) pushTrade(trade);
    });
    ws.on("close", () => {
      connected = false;
      ws = null;
      scheduleReconnect();
    });
    ws.on("error", (err) => {
      lastError = err.message;
      console.warn(`[${logTag}] WebSocket error:`, err.message);
    });
  }

  connect();
  void seedFromRest();
  healthTimer = setInterval(runTradeHealthCheck, TRADE_HEALTH_MS);

  return {
    query(symbol: string, startMs: number, endMs: number): BufferedAggTrade[] {
      const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || streamSymbol;
      if (sym !== streamSymbol) return [];
      trimByRetention();
      const end = backing.length;
      if (start >= end) return [];
      const lo = lowerBound(start, end, startMs);
      const hi = upperBound(lo, end, endMs);
      const slice = backing.slice(lo, hi);
      if (slice.length <= MAX_BUFFER_RETURN) return slice;
      return slice.slice(0, MAX_BUFFER_RETURN);
    },
    subscribe(symbol: string, listener: (trade: BufferedAggTrade) => void): () => void {
      const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || streamSymbol;
      if (sym !== streamSymbol) return () => {};
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    getCoverage(symbol: string) {
      const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || streamSymbol;
      if (sym !== streamSymbol) {
        return { connected: false, oldestMs: null, newestMs: null, size: 0 };
      }
      trimByRetention();
      const end = backing.length;
      if (start >= end) {
        return { connected, oldestMs: null, newestMs: null, size: 0 };
      }
      return {
        connected,
        oldestMs: backing[start]!.time,
        newestMs: backing[end - 1]!.time,
        size: end - start,
      };
    },
    getHealth(symbol: string) {
      const cov = this.getCoverage(symbol);
      return {
        ...cov,
        lastMessageTs: lastMessageTs || null,
        latestTradeTs: lastTrade?.time ?? null,
        latestAgeMs:
          lastTrade?.time != null
            ? Date.now() - lastTrade.time
            : lastMessageTs > 0
              ? Date.now() - lastMessageTs
              : null,
        reconnectCount: reconnectAttempt,
        sseClients: market === "perp" ? perpSseClients : spotSseClients,
        bufferKey: aggTradeBufferKey(streamSymbol, market),
        lastError,
        lastRestSeedTs: lastRestSeedTs || null,
      };
    },
  };
}

const spotBuffer = createAggTradeBuffer({
  market: "spot",
  streamSymbol: "BTCUSDT",
  wsBase: "wss://stream.binance.com:9443",
  wsPath: "/ws/btcusdt@aggTrade",
  restAggTradesUrls: [
    "https://api1.binance.com/api/v3/aggTrades",
    "https://api2.binance.com/api/v3/aggTrades",
    "https://api3.binance.com/api/v3/aggTrades",
    "https://api.binance.com/api/v3/aggTrades",
  ],
  logTag: "AggTradeBuffer:spot",
});

const perpBuffer = createAggTradeBuffer({
  market: "perp",
  streamSymbol: "BTCUSDT",
  wsBase: "wss://fstream.binance.com",
  wsPath: "/ws/btcusdt@aggTrade",
  restAggTradesUrls: ["https://fapi.binance.com/fapi/v1/aggTrades"],
  logTag: "AggTradeBuffer:perp",
});

const buffers: Record<BookmapMarketSource, ReturnType<typeof createAggTradeBuffer>> = {
  spot: spotBuffer,
  perp: perpBuffer,
};

function resolveBuffer(market?: unknown): ReturnType<typeof createAggTradeBuffer> {
  return buffers[parseBookmapMarket(market)];
}

export function queryBufferedAggTrades(
  symbol: string,
  startMs: number,
  endMs: number,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): BufferedAggTrade[] {
  return resolveBuffer(market).query(symbol, startMs, endMs);
}

export function subscribeAggTradeBuffer(
  symbol: string,
  listener: (trade: BufferedAggTrade) => void,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): () => void {
  return resolveBuffer(market).subscribe(symbol, listener);
}

export function getBufferCoverage(
  symbol: string,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
) {
  return resolveBuffer(market).getCoverage(symbol);
}

/** Stable buffer id for diagnostics (exchange:symbol:market). */
export function aggTradeBufferKey(
  symbol: string,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): string {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
  const m = parseBookmapMarket(market);
  return `binance:${sym}:${m}`;
}

export function trackAggTradeSseClient(
  market: BookmapMarketSource,
  delta: 1 | -1,
): void {
  if (parseBookmapMarket(market) === "perp") {
    perpSseClients = Math.max(0, perpSseClients + delta);
  } else {
    spotSseClients = Math.max(0, spotSseClients + delta);
  }
}

export function getPerpTradesBufferHealth() {
  return perpBuffer.getHealth("BTCUSDT");
}

export function getTradesBufferHealth(
  symbol = "BTCUSDT",
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
) {
  return resolveBuffer(market).getHealth(symbol);
}
