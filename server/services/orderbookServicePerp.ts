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
import { publishPerpBbo, publishPerpQuoteUnavailable } from "./nautilusQuoteStream";
import type { OrderBookLevel, OrderBookSnapshot } from "./orderbookService";
import { shouldAcceptMarketDataUpdate } from "@shared/marketDataTruth";
import { CanonicalL2BookOwner, type CanonicalL2Book } from "@shared/canonicalL2Book";
import { LiquidityLifecycleProjector, type LiquidityLifecycleEvent } from "@shared/liquidityLifecycle";


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

const canonicalOwner = new CanonicalL2BookOwner({
  instrument: "BTCUSDT",
  venue: "Binance",
  marketType: "Perpetual",
});
const lifecycleProjector = new LiquidityLifecycleProjector();
let previousCanonicalBook: CanonicalL2Book | null = null;
const recentLifecycleEvents: LiquidityLifecycleEvent[] = [];

let snapshot: OrderBookSnapshot = { bids: [], asks: [] };
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let healthInterval: ReturnType<typeof setInterval> | null = null;

let resyncInFlight = false;
let lastResyncAttemptMs = 0;
let sourceStarted = false;
const RESYNC_COOLDOWN_MS = 4_000;

export type PerpOrderBookSyncState = "BOOTSTRAPPING" | "SYNCHRONIZED" | "DESYNCHRONIZED";
export type PerpDepthUpdateDecision = "APPLY" | "STALE" | "GAP";

export function shouldAcquirePerpMarketData(_heatmapEnabled: boolean, sourceStarted = false): boolean {
  return !sourceStarted;
}

export function classifyPerpDepthUpdate(
  lastUpdateId: number | null,
  firstUpdateId: number | null,
  finalUpdateId: number | null,
  previousFinalUpdateId: number | null = null,
  previousUpdateId: number | null = null,
): PerpDepthUpdateDecision {
  if (
    lastUpdateId == null ||
    firstUpdateId == null ||
    finalUpdateId == null ||
    !Number.isFinite(lastUpdateId) ||
    !Number.isFinite(firstUpdateId) ||
    !Number.isFinite(finalUpdateId)
  ) return "GAP";
  if (previousFinalUpdateId != null) {
    if (finalUpdateId <= previousFinalUpdateId) return "STALE";
    if (previousUpdateId == null || previousUpdateId !== previousFinalUpdateId) return "GAP";
  } else {
    if (finalUpdateId < lastUpdateId) return "STALE";
    if (!(firstUpdateId <= lastUpdateId && lastUpdateId <= finalUpdateId)) return "GAP";
  }
  return "APPLY";
}

const health = {
  connected: false,
  lastMessageTs: 0,
  latestUpdateId: null as number | null,
  reconnectCount: 0,
};
let lastAppliedUpdateId: number | null = null;
let previousFinalUpdateId: number | null = null;
let syncState: PerpOrderBookSyncState = "BOOTSTRAPPING";

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
  const appliedAt = Date.now();
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
      timestamp: appliedAt,
    };
  } else {
    snapshot = {
      bids: deltaBids.sort((a, b) => b.price - a.price),
      asks: deltaAsks.sort((a, b) => a.price - b.price),
      timestamp: appliedAt,
    };
  }
}

function invalidatePerpSnapshot(): void {
  snapshot = {
    bids: [],
    asks: [],
    eventTime: null,
    receiveTime: Date.now(),
    source: "websocket",
    sequence: null,
    quality: "RESYNCING",
  };
  syncState = "DESYNCHRONIZED";
  health.lastMessageTs = 0;
  health.latestUpdateId = null;
  lastAppliedUpdateId = null;
  previousFinalUpdateId = null;
  publishPerpQuoteUnavailable();
}

function publishCurrentPerpBbo(sourceTimestampMs: number): void {
  if (syncState !== "SYNCHRONIZED" || !isPerpBboValid()) return;
  const bid = snapshot.bids[0];
  const ask = snapshot.asks[0];
  if (!bid || !ask || !snapshot.timestamp) return;
  publishPerpBbo({
    bestBidPrice: bid.price.toString(),
    bestBidSize: bid.size.toString(),
    bestAskPrice: ask.price.toString(),
    bestAskSize: ask.size.toString(),
    sourceTimestampMs,
    localAppliedTimestampMs: snapshot.timestamp,
    source: "binance",
    market: "perpetual",
    symbol: "BTCUSDT",
  });
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
  const sequence = data.lastUpdateId != null && Number.isFinite(Number(data.lastUpdateId)) ? Number(data.lastUpdateId) : null;
  const current = snapshot.source
    ? {
        source: snapshot.source,
        eventTime: snapshot.eventTime ?? null,
        receiveTime: snapshot.receiveTime ?? 0,
        sequence: snapshot.sequence ?? null,
      }
    : null;
  if (snapshot.bids.length > 0 && snapshot.asks.length > 0 && !shouldAcceptMarketDataUpdate(current, {
    source: "rest",
    eventTime: null,
    receiveTime: ts,
    sequence,
  })) return;
  syncState = "BOOTSTRAPPING";
  snapshot = {
    bids: bids.sort((a, b) => b.price - a.price),
    asks: asks.sort((a, b) => a.price - b.price),
    timestamp: ts,
    eventTime: null,
    receiveTime: ts,
    source: "rest",
    sequence,
    quality: "PARTIAL",
  };
  health.lastMessageTs = ts;
  health.latestUpdateId =
    data.lastUpdateId != null && Number.isFinite(Number(data.lastUpdateId))
      ? Number(data.lastUpdateId)
      : null;
  lastAppliedUpdateId = health.latestUpdateId;
  previousFinalUpdateId = null;
  if (!isPerpBboValid()) {
    invalidatePerpSnapshot();
    throw new Error("Perp REST depth returned an invalid BBO");
  }
  syncState = "BOOTSTRAPPING";

  feedBinanceOrderBook(
    { bids: snapshot.bids, asks: snapshot.asks, timestamp: ts },
    "snapshot",
    "perp",
  );
  recordBboFromOrderBook("perp", "BTCUSDT", snapshot.bids, snapshot.asks, ts);
  publishCurrentPerpBbo(ts);

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
    const shouldResubscribe =
      reason === "stale-age" || reason === "sequence-gap" || reason === "crossed-bbo-live";
    if (shouldResubscribe && ws?.readyState === WebSocket.OPEN) {
      ws.close();
      ws = null;
      health.connected = false;
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
      const eventTimeCandidate = Number(inner.E) || Number(inner.T);
      const eventTime = Number.isFinite(eventTimeCandidate) && eventTimeCandidate > 0 ? eventTimeCandidate : null;
      const ts = eventTime ?? Date.now();
      const receiveTime = Date.now();
      const firstUpdateId = inner.U != null ? Number(inner.U) : null;
      const finalUpdateId = inner.u != null ? Number(inner.u) : null;
      const previousUpdateId = inner.pu != null ? Number(inner.pu) : null;
      const incomingSequence = finalUpdateId;
      const current = snapshot.source
        ? {
            source: snapshot.source,
            eventTime: snapshot.eventTime ?? null,
            receiveTime: snapshot.receiveTime ?? 0,
            sequence: snapshot.sequence ?? null,
          }
        : null;
      if (!shouldAcceptMarketDataUpdate(current, {
        source: "websocket",
        eventTime,
        receiveTime,
        sequence: incomingSequence,
      })) return;
      const decision = classifyPerpDepthUpdate(
        lastAppliedUpdateId,
        firstUpdateId,
        finalUpdateId,
        previousFinalUpdateId,
        previousUpdateId,
      );
      if (decision === "STALE") {
        return;
      }
      if (decision === "GAP") {
        invalidatePerpSnapshot();
        void resyncPerpOrderBook("sequence-gap");
        return;
      }
      applyDeltaToSnapshot(deltaBids, deltaAsks, removalBids, removalAsks, ts);
      snapshot.eventTime = eventTime;
      snapshot.receiveTime = Date.now();
      snapshot.source = "websocket";
      snapshot.sequence = finalUpdateId;
      snapshot.quality = "VALID";

      if (!isPerpBboValid()) {
        invalidatePerpSnapshot();
        void resyncPerpOrderBook("crossed-bbo-live");
        return;
      }

      health.lastMessageTs = receiveTime;
      syncState = "SYNCHRONIZED";
      if (finalUpdateId != null && Number.isFinite(finalUpdateId)) {
        lastAppliedUpdateId = finalUpdateId;
        previousFinalUpdateId = finalUpdateId;
        health.latestUpdateId = finalUpdateId;
      }

      if (removalBids.length > 0 || removalAsks.length > 0) {
        feedBinanceOrderBook(
          { bids: removalBids, asks: removalAsks, timestamp: ts },
          "delta",
          "perp",
        );
      }
      recordBboFromOrderBook("perp", "BTCUSDT", snapshot.bids, snapshot.asks, ts);
      publishCurrentPerpBbo(ts);

    } catch (e) {
      console.warn("[OrderBookServicePerp] Parse error:", e);
    }
  });

  ws.on("close", () => {
    health.connected = false;
    invalidatePerpSnapshot();
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

export function ensurePerpMarketDataAvailable(): void {
  if (!shouldAcquirePerpMarketData(true, sourceStarted)) return;
  sourceStarted = true;
  connect();
  healthInterval = setInterval(runHealthCheck, HEALTH_INTERVAL_MS);
  if (BOOKMAP_HISTORY_SAMPLER_ENABLED) {
    setInterval(runPerpLimitHistorySample, BOOKMAP_SNAPSHOT_SAMPLE_MS);
  }
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

function recordLifecycle(book: CanonicalL2Book): void {
  if (previousCanonicalBook) recentLifecycleEvents.push(...lifecycleProjector.project(previousCanonicalBook, book));
  previousCanonicalBook = book;
  if (recentLifecycleEvents.length > 500) recentLifecycleEvents.splice(0, recentLifecycleEvents.length - 500);
}

export function getCanonicalL2Book(): CanonicalL2Book {
  const book = canonicalOwner.applySnapshot({
    bids: snapshot.bids.map(({ price, size }) => ({ price, quantity: size })),
    asks: snapshot.asks.map(({ price, size }) => ({ price, quantity: size })),
    sequence: snapshot.sequence ?? health.latestUpdateId ?? null,
    snapshotId: snapshot.sequence ?? health.latestUpdateId ?? null,
    eventTime: snapshot.eventTime ?? null,
    receiveTime: snapshot.receiveTime ?? snapshot.timestamp ?? Date.now(),
    source: snapshot.source ?? "rest",
    quality: syncState === "SYNCHRONIZED" && health.connected ? snapshot.quality ?? "VALID" : syncState === "DESYNCHRONIZED" ? "RESYNCING" : "PARTIAL",
  });
  if (!health.connected) return canonicalOwner.markDisconnected();
  if (syncState === "DESYNCHRONIZED") return canonicalOwner.markResyncing();
  recordLifecycle(book);
  return book;
}

export function getLiquidityLifecycle(): LiquidityLifecycleEvent[] {
  return recentLifecycleEvents.map((event) => ({ ...event, provenance: { ...event.provenance } }));
}

export function getPerpOrderBook(): OrderBookSnapshot {
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

export function getPerpOrderBookHealth() {
  const ageMs = health.lastMessageTs > 0 ? Date.now() - health.lastMessageTs : null;
  const { bestBid, bestAsk, spread } = getBboFromSnapshot(snapshot);
  return {
    connected: health.connected,
    lastMessageTs: health.lastMessageTs || null,
    latestUpdateId: health.latestUpdateId,
    syncState,
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
