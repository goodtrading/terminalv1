/**
 * Binance **spot** WebSocket order book service (legacy default Bookmap feed).
 * - WS: wss://stream.binance.com:9443/ws/btcusdt@depth
 * - REST: https://api.binance.com/api/v3/depth
 * Perpetual feed: `orderbookServicePerp.ts` → `feedBinanceOrderBook(..., "perp")`.
 */

import WebSocket from "ws";
import {
  BOOKMAP_HISTORY_SAMPLER_ENABLED,
  BOOKMAP_SNAPSHOT_SAMPLE_MS,
  feedBinanceOrderBook,
  runBookmapLimitHistorySnapshotSample,
} from "./bookmapEngine";
import { recordBboFromOrderBook } from "./bboHistoryRegistry";
import {
  getSpotDepthWsUrl,
  getSpotRestMirrors,
  shouldUseBinanceSpotVision,
} from "./binanceSpotMarketData";
import { isHeatmapEnabled } from "../lib/runtimeEnv";
import type { MarketDataQuality, MarketDataSource } from "@shared/marketDataTruth";
import { shouldAcceptMarketDataUpdate } from "@shared/marketDataTruth";
import { CanonicalL2BookOwner, type CanonicalL2Book } from "@shared/canonicalL2Book";
import { LiquidityLifecycleProjector, appendLiquidityLifecycleEvents, type LiquidityLifecycleEvent } from "@shared/liquidityLifecycle";

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp?: number;
  eventTime?: number | null;
  receiveTime?: number;
  source?: MarketDataSource;
  sequence?: number | null;
  quality?: MarketDataQuality;
}

// Enhanced configuration for Bookmap-style tracking
const WS_URL = getSpotDepthWsUrl("btcusdt");
const REST_DEPTH_MIRRORS = getSpotRestMirrors();
const REST_DEPTH_URL = `${REST_DEPTH_MIRRORS[0]}/api/v3/depth`;
const DEPTH_LEVELS = 1000; // Fetch 1000 levels per side for Bookmap
const DEBUG_ENABLED = process.env.NODE_ENV === 'development';
const STALE_MS = 10_000;
const HEALTH_INTERVAL_MS = 5_000;
const HEATMAP_ENABLED = isHeatmapEnabled();

if (HEATMAP_ENABLED && (DEBUG_ENABLED || process.env.NODE_ENV === "production")) {
  console.log("[OrderBookService] Spot feed config:", {
    vision: shouldUseBinanceSpotVision(),
    wsUrl: WS_URL,
    restPrimary: REST_DEPTH_URL,
  });
}

const canonicalOwner = new CanonicalL2BookOwner({
  instrument: "BTCUSDT",
  venue: "Binance",
  marketType: "Spot",
});
const lifecycleProjector = new LiquidityLifecycleProjector();
const recentLifecycleEvents: LiquidityLifecycleEvent[] = [];

function toLegacySnapshot(book: CanonicalL2Book): OrderBookSnapshot {
  return {
    bids: book.bids.map(({ price, quantity }) => ({ price, size: quantity })),
    asks: book.asks.map(({ price, quantity }) => ({ price, size: quantity })),
    timestamp: book.receiveTime,
    eventTime: book.eventTime,
    receiveTime: book.receiveTime,
    source: book.provenance.source,
    sequence: book.sequence,
    quality: book.quality,
  };
}

let snapshot: OrderBookSnapshot = toLegacySnapshot(canonicalOwner.getBook());
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let healthInterval: ReturnType<typeof setInterval> | null = null;
let resyncInFlight = false;
let resyncPromise: Promise<void> | null = null;
let lastResyncAttemptMs = 0;
const RECONNECT_MS = 5000;
const RESYNC_COOLDOWN_MS = 15_000;

const health = {
  connected: false,
  lastMessageTs: 0,
  latestUpdateId: null as number | null,
  reconnectCount: 0,
  lastError: null as string | null,
  lastRestSyncTs: 0,
};

async function fetchWithTimeout(url: string, timeoutMs = 6_000): Promise<Response> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { signal: controller.signal });
  } finally {
    clearTimeout(timeout);
  }
}

function parseLevels(arr: [string, string][]): OrderBookLevel[] {
  if (!Array.isArray(arr)) {
    console.warn("[OrderBookService] Invalid levels array:", arr);
    return [];
  }
  const levels = arr
    .filter(([_, qty]) => parseFloat(qty || "0") > 0)
    .map(([price, qty]) => ({
      price: parseFloat(price),
      size: parseFloat(qty),
    }));
  
  return levels;
}

/** Includes zero-size levels so the Bookmap engine can process explicit removals. */
function parseLevelsWithRemovals(arr: [string, string][]): OrderBookLevel[] {
  if (!Array.isArray(arr)) return [];
  return arr.map(([price, qty]) => ({
    price: parseFloat(price),
    size: parseFloat(qty || "0"),
  }));
}

function normalizePayload(parsed: any): { bids: [string, string][], asks: [string, string][] } {
  // Handle wrapped payload { stream: "...", data: {...} }
  const payload = parsed.data || parsed;
  
  // Support both partial depth (bids/asks) and diff depth (b/a)
  const rawBids = payload.bids || payload.b || [];
  const rawAsks = payload.asks || payload.a || [];

  return {
    bids: rawBids as [string, string][],
    asks: rawAsks as [string, string][]
  };
}

async function fetchSpotDepthFromRest(): Promise<{
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  latestUpdateId: number | null;
  provider: string;
}> {
  let lastError = "Binance spot depth mirrors failed";
  for (const mirror of REST_DEPTH_MIRRORS) {
    try {
      const response = await fetchWithTimeout(
        `${mirror}/api/v3/depth?symbol=BTCUSDT&limit=${DEPTH_LEVELS}`,
      );
      if (!response.ok) {
        lastError = `${mirror} status ${response.status}`;
        continue;
      }
      const data = await response.json();
      const bids = parseLevels(data.bids);
      const asks = parseLevels(data.asks);
      if (bids.length === 0 && asks.length === 0) {
        lastError = `${mirror} returned empty spot depth`;
        continue;
      }
      return {
        bids,
        asks,
        latestUpdateId:
          data.lastUpdateId != null && Number.isFinite(Number(data.lastUpdateId))
            ? Number(data.lastUpdateId)
            : null,
        provider: mirror,
      };
    } catch (error) {
      lastError = error instanceof Error ? `${mirror} ${error.message}` : `${mirror} ${String(error)}`;
    }
  }
  throw new Error(lastError);
}

export async function initializeFullDepth(): Promise<void> {
  if (!HEATMAP_ENABLED) return;
  try {
    const depth = await fetchSpotDepthFromRest();
    const ts = Date.now();
    const incoming = {
      source: "rest" as const,
      eventTime: null,
      receiveTime: ts,
      sequence: depth.latestUpdateId,
    };
    const current = snapshot.source
      ? {
          source: snapshot.source,
          eventTime: snapshot.eventTime ?? null,
          receiveTime: snapshot.receiveTime ?? 0,
          sequence: snapshot.sequence ?? null,
        }
      : null;
    if (snapshot.bids.length > 0 && snapshot.asks.length > 0 && !shouldAcceptMarketDataUpdate(current, incoming)) {
      return;
    }

    const canonical = canonicalOwner.applySnapshot({
      bids: depth.bids.map(({ price, size }) => ({ price, quantity: size })),
      asks: depth.asks.map(({ price, size }) => ({ price, quantity: size })),
      sequence: depth.latestUpdateId,
      snapshotId: depth.latestUpdateId,
      eventTime: null,
      receiveTime: ts,
      source: "rest",
      quality: "PARTIAL",
    });
    snapshot = toLegacySnapshot(canonical);
    recentLifecycleEvents.length = 0;
    health.lastMessageTs = ts;
    health.latestUpdateId = depth.latestUpdateId;
    health.lastError = null;
    health.lastRestSyncTs = ts;
    
    feedBinanceOrderBook(
      { bids: snapshot.bids, asks: snapshot.asks, timestamp: snapshot.timestamp },
      "snapshot",
      "spot",
    );
    recordBboFromOrderBook(
      "spot",
      "BTCUSDT",
      snapshot.bids,
      snapshot.asks,
      snapshot.timestamp,
    );

    if (DEBUG_ENABLED) {
      console.debug("[OrderBookService] Full depth initialized:", {
        provider: depth.provider,
        bidCount: snapshot.bids.length,
        askCount: snapshot.asks.length,
        topBid: snapshot.bids[0],
        topAsk: snapshot.asks[0],
        depthRange: {
          bidLow: snapshot.bids[snapshot.bids.length - 1]?.price || 0,
          askHigh: snapshot.asks[snapshot.asks.length - 1]?.price || 0
        }
      });
    }
  } catch (error) {
    health.lastError = error instanceof Error ? error.message : String(error);
    console.error("[OrderBookService] Failed to initialize full depth:", error);
    throw error;
  }
}

export async function resyncSpotOrderBook(reason: string): Promise<void> {
  if (!HEATMAP_ENABLED) return;
  if (resyncInFlight) return resyncPromise ?? Promise.resolve();
  const now = Date.now();
  if (now - lastResyncAttemptMs < RESYNC_COOLDOWN_MS) return;
  lastResyncAttemptMs = now;
  resyncInFlight = true;
  resyncPromise = (async () => {
    try {
      if (DEBUG_ENABLED || process.env.NODE_ENV === "production") {
        console.warn("[OrderBookService] Resyncing Binance spot depth from REST:", reason);
      }
      await initializeFullDepth();
      if (ws?.readyState !== WebSocket.OPEN) {
        connect();
      }
    } catch (error) {
      health.lastError = error instanceof Error ? error.message : String(error);
      console.error("[OrderBookService] Spot depth resync failed:", health.lastError);
    } finally {
      resyncInFlight = false;
      resyncPromise = null;
    }
  })();
  return resyncPromise;
}

function shouldResync(): string | null {
  const ageMs = health.lastMessageTs > 0 ? Date.now() - health.lastMessageTs : Infinity;
  if (!health.connected && ageMs > STALE_MS) return "ws-disconnected";
  if (ageMs > STALE_MS) return "stale-age";
  if (snapshot.bids.length === 0 || snapshot.asks.length === 0) return "empty-book";
  return null;
}

function logSpotHealth(reason?: string): void {
  if (!DEBUG_ENABLED && process.env.NODE_ENV !== "production") return;
  const ageMs = health.lastMessageTs > 0 ? Date.now() - health.lastMessageTs : null;
  console.debug("[SPOT_ORDERBOOK_HEALTH]", {
    reason,
    connected: health.connected,
    lastMessageTs: health.lastMessageTs || null,
    ageMs,
    latestUpdateId: health.latestUpdateId,
    bidsCount: snapshot.bids.length,
    asksCount: snapshot.asks.length,
    topBid: snapshot.bids[0]?.price ?? null,
    topAsk: snapshot.asks[0]?.price ?? null,
    reconnectCount: health.reconnectCount,
    lastError: health.lastError,
    lastRestSyncTs: health.lastRestSyncTs || null,
  });
}

function runHealthCheck(): void {
  const reason = shouldResync();
  if (reason != null) {
    logSpotHealth(reason);
    void resyncSpotOrderBook(reason);
  }
}

function connect(): void {
  if (ws?.readyState === WebSocket.OPEN) return;

  try {
    ws = new WebSocket(WS_URL);
  } catch (e) {
    console.error("[OrderBookService] WebSocket connect failed:", e);
    scheduleReconnect();
    return;
  }

  ws.on("open", () => {
    health.connected = true;
    health.lastError = null;
    console.log("[OrderBookService] Binance depth WebSocket connected");
    void resyncSpotOrderBook("ws-open");
  });

  ws.on("message", (data: Buffer | string) => {
    const raw = typeof data === "string" ? data : data.toString();
    
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizePayload(parsed);
      
      const deltaBids = parseLevels(normalized.bids);
      const deltaAsks = parseLevels(normalized.asks);
      const bookmapBids = parseLevelsWithRemovals(normalized.bids);
      const bookmapAsks = parseLevelsWithRemovals(normalized.asks);

      if (deltaBids.length === 0 && deltaAsks.length === 0 && bookmapBids.length === 0 && bookmapAsks.length === 0) {
        return;
      }

      const root = parsed && typeof parsed === "object" ? (parsed as Record<string, unknown>) : {};
      const inner = root.data && typeof root.data === "object" ? (root.data as Record<string, unknown>) : root;
      const eventTime = Number(inner.E);
      const sourceEventTime = Number.isFinite(eventTime) && eventTime > 0 ? eventTime : null;
      const incomingSequence = inner.u != null && Number.isFinite(Number(inner.u))
        ? Number(inner.u)
        : inner.lastUpdateId != null && Number.isFinite(Number(inner.lastUpdateId))
          ? Number(inner.lastUpdateId)
          : null;
      const receiveTime = Date.now();
      const ts = receiveTime;
      const previous = canonicalOwner.getBook();
      const result = canonicalOwner.applyDelta({
        bids: normalized.bids.map(([price, quantity]) => ({ price: Number(price), quantity: Number(quantity) })),
        asks: normalized.asks.map(([price, quantity]) => ({ price: Number(price), quantity: Number(quantity) })),
        sequence: incomingSequence,
        eventTime: sourceEventTime,
        receiveTime,
        source: "websocket",
        quality: "VALID",
      });
      if (!result.accepted) return;
      health.latestUpdateId = incomingSequence;
      health.lastMessageTs = receiveTime;
      health.lastError = null;
      snapshot = toLegacySnapshot(result.book);
      appendLiquidityLifecycleEvents(recentLifecycleEvents, lifecycleProjector.project(previous, result.book));

      if (bookmapBids.length > 0 || bookmapAsks.length > 0) {
        feedBinanceOrderBook(
          { bids: bookmapBids, asks: bookmapAsks, timestamp: ts },
          "delta",
          "spot",
        );
      }
      recordBboFromOrderBook("spot", "BTCUSDT", snapshot.bids, snapshot.asks, ts);
    } catch (e) {
      health.lastError = e instanceof Error ? e.message : String(e);
      console.warn("[OrderBookService] Parse error:", e, "Raw data length:", raw.length);
    }
  });

  ws.on("close", () => {
    health.connected = false;
    snapshot = toLegacySnapshot(canonicalOwner.markDisconnected());
    ws = null;
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    health.connected = false;
    health.lastError = err.message;
    console.warn("[OrderBookService] WebSocket error:", err.message);
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

function runSpotLimitHistorySample(): void {
  if (!BOOKMAP_HISTORY_SAMPLER_ENABLED) return;
  if (snapshot.bids.length === 0 && snapshot.asks.length === 0) return;
  runBookmapLimitHistorySnapshotSample("spot", {
    bids: snapshot.bids,
    asks: snapshot.asks,
    timestamp: snapshot.timestamp ?? Date.now(),
  });
}

if (HEATMAP_ENABLED) {
  connect();
  healthInterval = setInterval(runHealthCheck, HEALTH_INTERVAL_MS);
  if (BOOKMAP_HISTORY_SAMPLER_ENABLED) {
    setInterval(runSpotLimitHistorySample, BOOKMAP_SNAPSHOT_SAMPLE_MS);
  }
}

/**
 * Returns the current order book snapshot from Binance depth WebSocket.
 * Large liquidity = higher size values.
 */
export function getCanonicalL2Book(): CanonicalL2Book {
  const book = canonicalOwner.getBook();
  snapshot = toLegacySnapshot(book);
  return book;
}

export function getLiquidityLifecycle(): LiquidityLifecycleEvent[] {
  return recentLifecycleEvents.map((event) => ({ ...event, provenance: { ...event.provenance } }));
}

export function getOrderBook(): OrderBookSnapshot {
  const book = getCanonicalL2Book();
  return {
    bids: book.bids.map(({ price, quantity }) => ({ price, size: quantity })),
    asks: book.asks.map(({ price, quantity }) => ({ price, size: quantity })),
    timestamp: book.receiveTime,
    eventTime: book.eventTime,
    receiveTime: book.receiveTime,
    source: book.provenance.source,
    sequence: book.sequence,
    quality: book.quality,
  };
}

export function getSpotOrderBookHealth() {
  const ageMs = health.lastMessageTs > 0 ? Date.now() - health.lastMessageTs : null;
  return {
    connected: health.connected,
    lastMessageTs: health.lastMessageTs || null,
    latestUpdateId: health.latestUpdateId,
    bidsCount: snapshot.bids.length,
    asksCount: snapshot.asks.length,
    bestBid: snapshot.bids[0]?.price ?? null,
    bestAsk: snapshot.asks[0]?.price ?? null,
    ageMs,
    reconnectCount: health.reconnectCount,
    lastError: health.lastError,
    lastRestSyncTs: health.lastRestSyncTs || null,
    restUrl: REST_DEPTH_URL,
  };
}
