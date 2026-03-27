/**
 * In-memory aggTrade buffer fed by Binance WebSocket (@aggTrade).
 * Serves /api/market/agg-trades with near-real-time continuity; REST is fallback.
 */

import WebSocket from "ws";

/** Same shape as `AggTrade` in market-gateway (no import to avoid circular deps). */
export type BufferedAggTrade = {
  id: string;
  price: number;
  qty: number;
  time: number;
  side: "buy" | "sell";
};

const STREAM_SYMBOL = "BTCUSDT";
const WS_PATH = `/ws/${STREAM_SYMBOL.toLowerCase()}@aggTrade`;
const WS_BASE = "wss://stream.binance.com:9443";

/** Rolling retention window — wider so recent pan/zoom stays on-buffer without REST gaps. */
const RETENTION_MS = 90 * 60 * 1000;

/** Compact backing array when many trades were dropped from the logical head. */
const COMPACT_AFTER_DROPPED = 40_000;

/** Backfill recent history on connect to reduce cold-start gaps. */
const SEED_REST_LIMIT = 1000;

const DEBUG = process.env.NODE_ENV === "development";

let ws: WebSocket | null = null;
let reconnectTimer: ReturnType<typeof setTimeout> | null = null;
let reconnectAttempt = 0;
let connected = false;
const listeners = new Set<(trade: BufferedAggTrade) => void>();

/** Monotonic backing store; `start` is first live index after time trimming. */
const backing: BufferedAggTrade[] = [];
let start = 0;

function log(msg: string): void {
  if (DEBUG) console.log(`[AggTradeBuffer] ${msg}`);
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
  const row = (root.data && typeof root.data === "object" ? root.data : root) as Record<string, unknown>;
  if (row.e !== "aggTrade") return null;
  const id = row.a;
  const price = row.p;
  const qty = row.q;
  const time = row.T;
  const isBuyerMaker = row.m === true;
  if (id == null || price == null || qty == null || time == null) return null;
  const p = parseFloat(String(price));
  const q = parseFloat(String(qty));
  const t = Number(time);
  if (!Number.isFinite(p) || !Number.isFinite(q) || !Number.isFinite(t) || q <= 0) return null;
  return {
    id: String(id),
    price: p,
    qty: q,
    time: t,
    side: isBuyerMaker ? "sell" : "buy",
  };
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

function pushTrade(t: BufferedAggTrade): void {
  trimByRetention();
  const scanFrom = Math.max(start, backing.length - 80);
  for (let i = scanFrom; i < backing.length; i++) {
    if (backing[i]!.id === t.id) return;
  }
  const last = backing[backing.length - 1];
  if (last && t.time < last.time) {
    const idx = lowerBound(backing, start, backing.length, t.time);
    if (backing[idx]?.id === t.id) return;
    backing.splice(idx, 0, t);
    for (const fn of listeners) fn(t);
    return;
  }
  backing.push(t);
  for (const fn of listeners) fn(t);
}

function lowerBound(arr: BufferedAggTrade[], from: number, to: number, timeMs: number): number {
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]!.time < timeMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

function upperBound(arr: BufferedAggTrade[], from: number, to: number, timeMs: number): number {
  let lo = from;
  let hi = to;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (arr[mid]!.time <= timeMs) lo = mid + 1;
    else hi = mid;
  }
  return lo;
}

/** Hard cap per query to protect the event loop. */
const MAX_BUFFER_RETURN = 120_000;

/**
 * Trades with time in [startMs, endMs], oldest first (full slice in retention, capped for safety).
 */
export function queryBufferedAggTrades(
  symbol: string,
  startMs: number,
  endMs: number,
): BufferedAggTrade[] {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || STREAM_SYMBOL;
  if (sym !== STREAM_SYMBOL) return [];

  trimByRetention();
  const end = backing.length;
  if (start >= end) return [];

  const lo = lowerBound(backing, start, end, startMs);
  const hi = upperBound(backing, lo, end, endMs);
  const slice = backing.slice(lo, hi);
  if (slice.length <= MAX_BUFFER_RETURN) return slice;
  return slice.slice(0, MAX_BUFFER_RETURN);
}

export function getBufferCoverage(symbol: string): {
  connected: boolean;
  oldestMs: number | null;
  newestMs: number | null;
  size: number;
} {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || STREAM_SYMBOL;
  if (sym !== STREAM_SYMBOL) {
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
}

export function subscribeAggTradeBuffer(
  symbol: string,
  listener: (trade: BufferedAggTrade) => void,
): () => void {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || STREAM_SYMBOL;
  if (sym !== STREAM_SYMBOL) return () => {};
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

async function seedFromRest(): Promise<void> {
  const end = Date.now();
  const startMs = end - RETENTION_MS;
  try {
    const params = new URLSearchParams({
      symbol: STREAM_SYMBOL,
      limit: String(SEED_REST_LIMIT),
      startTime: String(startMs),
      endTime: String(end),
    });
    const res = await fetch(`https://api.binance.com/api/v3/aggTrades?${params}`);
    if (!res.ok) return;
    const data = await res.json();
    if (!Array.isArray(data)) return;
    const seen = new Set<string>();
    for (let i = start; i < backing.length; i++) seen.add(backing[i]!.id);
    for (const row of data) {
      const isBuyerMaker = row.m === true;
      const t: BufferedAggTrade = {
        id: String(row.a),
        price: parseFloat(row.p),
        qty: parseFloat(row.q),
        time: Number(row.T),
        side: isBuyerMaker ? "sell" : "buy",
      };
      if (!seen.has(t.id)) {
        seen.add(t.id);
        pushTrade(t);
      }
    }
    log(`Seeded ${data.length} rows from REST`);
  } catch (e) {
    console.warn("[AggTradeBuffer] REST seed failed:", e instanceof Error ? e.message : e);
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
    ws = new WebSocket(`${WS_BASE}${WS_PATH}`);
  } catch (e) {
    console.error("[AggTradeBuffer] connect failed:", e);
    scheduleReconnect();
    return;
  }

  ws.on("open", () => {
    connected = true;
    reconnectAttempt = 0;
    console.log("[AggTradeBuffer] Binance aggTrade WebSocket connected");
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
    console.warn("[AggTradeBuffer] WebSocket error:", err.message);
  });
}

connect();
