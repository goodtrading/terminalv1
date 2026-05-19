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
  restAggTradesUrl: string;
  logTag: string;
};

const RETENTION_MS = 90 * 60 * 1000;
const COMPACT_AFTER_DROPPED = 40_000;
const SEED_REST_LIMIT = 1000;
const MAX_BUFFER_RETURN = 120_000;
const DEBUG = process.env.NODE_ENV === "development";

function createAggTradeBuffer(config: BufferConfig) {
  const { streamSymbol, wsBase, wsPath, restAggTradesUrl, logTag } = config;
  let ws: WebSocket | null = null;
  let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  let reconnectAttempt = 0;
  let connected = false;
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
      for (const fn of listeners) fn(t);
      return;
    }
    backing.push(t);
    for (const fn of listeners) fn(t);
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
    try {
      const params = new URLSearchParams({
        symbol: streamSymbol,
        limit: String(SEED_REST_LIMIT),
        startTime: String(startMs),
        endTime: String(end),
      });
      const res = await fetch(`${restAggTradesUrl}?${params}`);
      if (!res.ok) return;
      const data = await res.json();
      if (!Array.isArray(data)) return;
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
      log(`Seeded ${data.length} rows from REST`);
    } catch (e) {
      console.warn(`[${logTag}] REST seed failed:`, e instanceof Error ? e.message : e);
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
      console.error(`[${logTag}] connect failed:`, e);
      scheduleReconnect();
      return;
    }
    ws.on("open", () => {
      connected = true;
      reconnectAttempt = 0;
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
      console.warn(`[${logTag}] WebSocket error:`, err.message);
    });
  }

  connect();

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
  };
}

const spotBuffer = createAggTradeBuffer({
  market: "spot",
  streamSymbol: "BTCUSDT",
  wsBase: "wss://stream.binance.com:9443",
  wsPath: "/ws/btcusdt@aggTrade",
  restAggTradesUrl: "https://api.binance.com/api/v3/aggTrades",
  logTag: "AggTradeBuffer:spot",
});

const perpBuffer = createAggTradeBuffer({
  market: "perp",
  streamSymbol: "BTCUSDT",
  wsBase: "wss://fstream.binance.com",
  wsPath: "/ws/btcusdt@aggTrade",
  restAggTradesUrl: "https://fapi.binance.com/fapi/v1/aggTrades",
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
