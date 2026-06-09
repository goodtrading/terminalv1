/**
 * Binance **USDT-M perpetual** order book service (Phase 1 composite — perp leg).
 * - WS: wss://fstream.binance.com/ws/btcusdt@depth
 * - REST: https://fapi.binance.com/fapi/v1/depth
 * Feeds `feedBinanceOrderBook(..., "perp")` — isolated from spot engine state.
 */

import WebSocket from "ws";
import {
  BOOKMAP_HISTORY_SAMPLER_ENABLED,
  BOOKMAP_SNAPSHOT_SAMPLE_MS,
  feedBinanceOrderBook,
  runBookmapLimitHistorySnapshotSample,
} from "./bookmapEngine";
import { recordBboFromOrderBook } from "./bboHistoryRegistry";
import type { OrderBookLevel, OrderBookSnapshot } from "./orderbookService";

const WS_URL = "wss://fstream.binance.com/ws/btcusdt@depth";
const REST_DEPTH_URL = "https://fapi.binance.com/fapi/v1/depth";
const DEPTH_LEVELS = 1000;
const DEBUG_ENABLED = process.env.NODE_ENV === "development";
const STALE_MS = 3_000;
const HEALTH_INTERVAL_MS = 1_500;
const RECONNECT_MS = 5_000;

if (DEBUG_ENABLED) {
  console.debug("[OrderBookServicePerp] Using WebSocket URL:", WS_URL, "depth:", DEPTH_LEVELS);
}

let snapshot: OrderBookSnapshot = { bids: [], asks: [] };
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let healthInterval: ReturnType<typeof setInterval> | null = null;
let resyncInFlight = false;
let lastResyncAttemptMs = 0;
const RESYNC_COOLDOWN_MS = 4_000;

const health = {
  connected: false,
  lastMessageTs: 0,
  latestUpdateId: null as number | null,
  reconnectCount: 0,
};

function parseLevels(arr: [string, string][]): OrderBookLevel[] {
  if (!Array.isArray(arr)) return [];
  return arr
    .filter(([_, qty]) => parseFloat(qty || "0") > 0)
    .map(([price, qty]) => ({
      price: parseFloat(price),
      size: parseFloat(qty),
    }));
}

function parseLevelsWithRemovals(arr: [string, string][]): OrderBookLevel[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(([price, qty]) => ({
    price: parseFloat(price),
    size: parseFloat(qty || "0"),
  }));
}

function normalizePayload(parsed: unknown): { bids: [string, string][]; asks: [string, string][] } {
  const payload =
    parsed && typeof parsed === "object" && "data" in parsed
      ? (parsed as { data: unknown }).data
      : parsed;
  const row = payload as {
    bids?: [string, string][];
    asks?: [string, string][];
    b?: [string, string][];
    a?: [string, string][];
  };
  return {
    bids: row.bids || row.b || [],
    asks: row.asks || row.a || [],
  };
}

function getBboFromSnapshot(ob: OrderBookSnapshot): {
  bestBid: number | null;
  bestAsk: number | null;
  spread: number | null;
} {
  const bestBid = ob.bids[0]?.price ?? null;
  const bestAsk = ob.asks[0]?.price ?? null;
  const spread =
    bestBid != null && bestAsk != null && bestAsk > bestBid ? bestAsk - bestBid : null;
  return { bestBid, bestAsk, spread };
}

export function isPerpBboValid(ob: OrderBookSnapshot = snapshot): boolean {
  const { bestBid, bestAsk } = getBboFromSnapshot(ob);
  if (bestBid == null || bestAsk == null) return false;
  if (!Number.isFinite(bestBid) || !Number.isFinite(bestAsk)) return false;
  if (bestBid <= 0 || bestAsk <= 0) return false;
  return bestBid < bestAsk;
}

function applyDeltaToSnapshot(
  deltaBids: OrderBookLevel[],
  deltaAsks: OrderBookLevel[],
  removalBids: OrderBookLevel[],
  removalAsks: OrderBookLevel[],
  ts: number,
): void {
  const hasFullSnapshot = snapshot.bids.length >= 50 || snapshot.asks.length >= 50;

  if (hasFullSnapshot) {
    const bidMap = new Map(snapshot.bids.map((b) => [b.price, b]));
    const askMap = new Map(snapshot.asks.map((a) => [a.price, a]));

    for (const b of removalBids) {
      if (b.size <= 0) bidMap.delete(b.price);
      else bidMap.set(b.price, b);
    }
    for (const a of removalAsks) {
      if (a.size <= 0) askMap.delete(a.price);
      else askMap.set(a.price, a);
    }
    for (const b of deltaBids) bidMap.set(b.price, b);
    for (const a of deltaAsks) askMap.set(a.price, a);

    snapshot = {
      bids: Array.from(bidMap.values()).sort((a, b) => b.price - a.price),
      asks: Array.from(askMap.values()).sort((a, b) => a.price - b.price),
      timestamp: ts,
    };
  } else {
    snapshot = {
      bids: deltaBids.sort((a, b) => b.price - a.price),
      asks: deltaAsks.sort((a, b) => a.price - b.price),
      timestamp: ts,
    };
  }
}

function logPerpHealth(reason?: string): void {
  if (!DEBUG_ENABLED) return;
  const ageMs = health.lastMessageTs > 0 ? Date.now() - health.lastMessageTs : null;
  const { bestBid, bestAsk, spread } = getBboFromSnapshot(snapshot);
  console.debug("[PERP_ORDERBOOK_HEALTH]", {
    reason,
    connected: health.connected,
    lastMessageTs: health.lastMessageTs || null,
    latestUpdateId: health.latestUpdateId,
    bidsCount: snapshot.bids.length,
    asksCount: snapshot.asks.length,
    bestBid,
    bestAsk,
    spread,
    bboValid: isPerpBboValid(),
    ageMs,
    reconnectCount: health.reconnectCount,
  });
}

export async function initializePerpFullDepth(): Promise<void> {
  const response = await fetch(`${REST_DEPTH_URL}?symbol=BTCUSDT&limit=${DEPTH_LEVELS}`);
  if (!response.ok) {
    throw new Error(`Perp REST depth failed: ${response.status}`);
  }
  const data = await response.json();
  const bids = parseLevels(data.bids);
  const asks = parseLevels(data.asks);
  const ts = Date.now();
  snapshot = {
    bids: bids.sort((a, b) => b.price - a.price),
    asks: asks.sort((a, b) => a.price - b.price),
    timestamp: ts,
  };
  health.lastMessageTs = ts;
  health.latestUpdateId =
    data.lastUpdateId != null && Number.isFinite(Number(data.lastUpdateId))
      ? Number(data.lastUpdateId)
      : null;

  feedBinanceOrderBook(
    { bids: snapshot.bids, asks: snapshot.asks, timestamp: ts },
    "snapshot",
    "perp",
  );
  recordBboFromOrderBook("perp", "BTCUSDT", snapshot.bids, snapshot.asks, ts);

  if (DEBUG_ENABLED) {
    console.debug("[OrderBookServicePerp] Full depth initialized:", {
      bidCount: snapshot.bids.length,
      askCount: snapshot.asks.length,
    });
    logPerpHealth("rest-init");
  }
}

export async function resyncPerpOrderBook(reason: string): Promise<void> {
  if (resyncInFlight) return;
  const now = Date.now();
  if (now - lastResyncAttemptMs < RESYNC_COOLDOWN_MS) return;
  lastResyncAttemptMs = now;
  resyncInFlight = true;
  try {
    if (DEBUG_ENABLED) {
      console.warn("[OrderBookServicePerp] Resyncing from REST:", reason);
    }
    await initializePerpFullDepth();
    if (ws?.readyState !== WebSocket.OPEN) {
      connect();
    }
    logPerpHealth(`resync:${reason}`);
  } catch (e) {
    console.error("[OrderBookServicePerp] Resync failed:", e);
  } finally {
    resyncInFlight = false;
  }
}

function shouldResync(): string | null {
  const ageMs = health.lastMessageTs > 0 ? Date.now() - health.lastMessageTs : Infinity;
  if (!health.connected && ageMs > STALE_MS) return "ws-disconnected";
  if (ageMs > STALE_MS) return "stale-age";
  if (snapshot.bids.length === 0 || snapshot.asks.length === 0) return "empty-book";
  if (!isPerpBboValid()) return "crossed-bbo";
  return null;
}

function runHealthCheck(): void {
  const reason = shouldResync();
  logPerpHealth();
  if (reason != null) {
    void resyncPerpOrderBook(reason);
  }
}

function connect(): void {
  if (ws?.readyState === WebSocket.OPEN) return;
  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    console.error("[OrderBookServicePerp] WebSocket connect failed:", e);
    scheduleReconnect();
    return;
  }

  ws.on("open", () => {
    health.connected = true;
    console.log("[OrderBookServicePerp] Binance futures depth WebSocket connected");
    void resyncPerpOrderBook("ws-open");
  });

  ws.on("message", (data: Buffer | string) => {
    const raw = typeof data === "string" ? data : data.toString();
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizePayload(parsed);
      const removalBids = parseLevelsWithRemovals(normalized.bids);
      const removalAsks = parseLevelsWithRemovals(normalized.asks);
      const deltaBids = parseLevels(normalized.bids);
      const deltaAsks = parseLevels(normalized.asks);
      if (
        deltaBids.length === 0 &&
        deltaAsks.length === 0 &&
        removalBids.length === 0 &&
        removalAsks.length === 0
      ) {
        return;
      }

      const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      const inner =
        root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
      const ts =
        Number(inner.E) ||
        Number(inner.T) ||
        Date.now();
      if (inner.u != null && Number.isFinite(Number(inner.u))) {
        health.latestUpdateId = Number(inner.u);
      } else if (inner.lastUpdateId != null) {
        health.latestUpdateId = Number(inner.lastUpdateId);
      }

      health.lastMessageTs = Date.now();

      applyDeltaToSnapshot(deltaBids, deltaAsks, removalBids, removalAsks, ts);

      if (removalBids.length > 0 || removalAsks.length > 0) {
        feedBinanceOrderBook(
          { bids: removalBids, asks: removalAsks, timestamp: ts },
          "delta",
          "perp",
        );
      }
      recordBboFromOrderBook("perp", "BTCUSDT", snapshot.bids, snapshot.asks, ts);

      if (!isPerpBboValid()) {
        void resyncPerpOrderBook("crossed-bbo-live");
        return;
      }
    } catch (e) {
      console.warn("[OrderBookServicePerp] Parse error:", e);
    }
  });

  ws.on("close", () => {
    health.connected = false;
    ws = null;
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    health.connected = false;
    console.warn("[OrderBookServicePerp] WebSocket error:", err.message);
  });
}

function scheduleReconnect(): void {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    health.reconnectCount += 1;
    connect();
  }, RECONNECT_MS);
}

function runPerpLimitHistorySample(): void {
  if (!BOOKMAP_HISTORY_SAMPLER_ENABLED) return;
  if (snapshot.bids.length === 0 && snapshot.asks.length === 0) return;
  runBookmapLimitHistorySnapshotSample("perp", {
    bids: snapshot.bids,
    asks: snapshot.asks,
    timestamp: snapshot.timestamp ?? Date.now(),
  });
}

connect();
healthInterval = setInterval(runHealthCheck, HEALTH_INTERVAL_MS);
if (BOOKMAP_HISTORY_SAMPLER_ENABLED) {
  setInterval(runPerpLimitHistorySample, BOOKMAP_SNAPSHOT_SAMPLE_MS);
}

export function getPerpOrderBook(): OrderBookSnapshot {
  const ts =
    health.lastMessageTs > 0
      ? health.lastMessageTs
      : snapshot.timestamp ?? Date.now();
  return { ...snapshot, timestamp: ts };
}

export function getPerpOrderBookHealth() {
  const ageMs = health.lastMessageTs > 0 ? Date.now() - health.lastMessageTs : null;
  const { bestBid, bestAsk, spread } = getBboFromSnapshot(snapshot);
  return {
    connected: health.connected,
    lastMessageTs: health.lastMessageTs || null,
    latestUpdateId: health.latestUpdateId,
    bidsCount: snapshot.bids.length,
    asksCount: snapshot.asks.length,
    bestBid,
    bestAsk,
    spread,
    bboValid: isPerpBboValid(),
    ageMs,
    reconnectCount: health.reconnectCount,
  };
}
