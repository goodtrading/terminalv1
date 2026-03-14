/**
 * Binance WebSocket order book service.
 * Maintains full depth snapshot for Bookmap-style order book tracking.
 */

import WebSocket from "ws";

export interface OrderBookLevel {
  price: number;
  size: number;
}

export interface OrderBookSnapshot {
  bids: OrderBookLevel[];
  asks: OrderBookLevel[];
  timestamp?: number;
}

// Enhanced configuration for Bookmap-style tracking
const WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@depth";
const REST_DEPTH_URL = "https://api.binance.com/api/v3/depth";
const DEPTH_LEVELS = 1000; // Fetch 1000 levels per side for Bookmap
const DEBUG_ENABLED = process.env.NODE_ENV === 'development';

if (DEBUG_ENABLED) console.debug("[OrderBookService] Using WebSocket URL:", WS_URL, "with depth:", DEPTH_LEVELS);

let snapshot: OrderBookSnapshot = { bids: [], asks: [] };
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
let binanceConnected = false;
const RECONNECT_MS = 5000;
const MIN_LEVELS_FOR_HEALTHY = 10;

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

export async function initializeFullDepth(): Promise<void> {
  try {
    const response = await fetch(`${REST_DEPTH_URL}?symbol=BTCUSDT&limit=${DEPTH_LEVELS}`);
    const data = await response.json();
    
    const bids = parseLevels(data.bids);
    const asks = parseLevels(data.asks);
    
    snapshot = {
      bids: bids.sort((a, b) => b.price - a.price),
      asks: asks.sort((a, b) => a.price - b.price),
      timestamp: data.lastUpdateId || Date.now()
    };
    if (!binanceConnected && (snapshot.bids.length >= MIN_LEVELS_FOR_HEALTHY || snapshot.asks.length >= MIN_LEVELS_FOR_HEALTHY)) {
      binanceConnected = true;
      console.log("[Orderbook] Binance connected (REST init)");
    }
    if (DEBUG_ENABLED) {
      console.debug("[OrderBookService] Full depth initialized:", {
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
    console.error("[OrderBookService] Failed to initialize full depth:", error);
    throw error;
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
    console.log("[Orderbook] Binance WebSocket connected");
  });

  ws.on("message", (data: Buffer | string) => {
    const raw = typeof data === "string" ? data : data.toString();
    
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizePayload(parsed);
      
      const deltaBids = parseLevels(normalized.bids);
      const deltaAsks = parseLevels(normalized.asks);
      
      if (deltaBids.length === 0 && deltaAsks.length === 0) return;

      // Binance @depth sends PARTIAL updates (5–20 levels). Merge into snapshot instead of replacing
      // so we preserve full depth from initializeFullDepth.
      const ts = parsed.E || Date.now();
      const hasFullSnapshot = snapshot.bids.length >= 50 || snapshot.asks.length >= 50;
      
      if (hasFullSnapshot && (deltaBids.length < 50 || deltaAsks.length < 50)) {
        const bidMap = new Map(snapshot.bids.map((b) => [b.price, b]));
        const askMap = new Map(snapshot.asks.map((a) => [a.price, a]));
        deltaBids.forEach((b) => bidMap.set(b.price, b));
        deltaAsks.forEach((a) => askMap.set(a.price, a));
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
      const nowHealthy = (snapshot.bids.length >= MIN_LEVELS_FOR_HEALTHY || snapshot.asks.length >= MIN_LEVELS_FOR_HEALTHY);
      if (nowHealthy && !binanceConnected) {
        binanceConnected = true;
        console.log("[Orderbook] Binance connected");
      }
    } catch (e) {
      console.warn("[OrderBookService] Parse error:", e, "Raw data length:", raw.length);
    }
  });

  ws.on("close", () => {
    if (binanceConnected) {
      binanceConnected = false;
      console.log("[Orderbook] Binance disconnected");
    }
    ws = null;
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    console.warn("[OrderBookService] WebSocket error:", err.message);
  });
}

function scheduleReconnect(): void {
  if (reconnectTimeout) return;
  reconnectTimeout = setTimeout(() => {
    reconnectTimeout = null;
    connect();
  }, RECONNECT_MS);
}

connect();

/**
 * Returns the current order book snapshot from Binance depth WebSocket.
 * Large liquidity = higher size values.
 */
export function getOrderBook(): OrderBookSnapshot {
  return { ...snapshot };
}

/** True when Binance WS has sufficient data for bookmap/heatmap. */
export function isBinanceHealthy(): boolean {
  return binanceConnected || (snapshot.bids.length >= MIN_LEVELS_FOR_HEALTHY && snapshot.asks.length >= MIN_LEVELS_FOR_HEALTHY);
}
