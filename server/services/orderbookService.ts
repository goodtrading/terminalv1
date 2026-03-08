/**
 * Binance WebSocket order book service.
 * Maintains a rolling depth snapshot from wss://stream.binance.com:9443/ws/btcusdt@depth20@100ms
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

const WS_URL = "wss://stream.binance.com:9443/ws/btcusdt@depth20@100ms";

console.debug("[OrderBookService] Using WebSocket URL:", WS_URL);

let snapshot: OrderBookSnapshot = { bids: [], asks: [] };
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
const RECONNECT_MS = 5000;

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
  
  console.debug("[OrderBookService] Parsed levels:", {
    inputCount: arr.length,
    outputCount: levels.length,
    sampleLevel: levels[0] || null
  });
  
  return levels;
}

function normalizePayload(parsed: any): { bids: [string, string][], asks: [string, string][] } {
  console.debug("[OrderBookService] Raw payload analysis:", {
    hasData: !!(parsed.data),
    hasStream: !!(parsed.stream),
    hasBids: !!(parsed.bids),
    hasAsks: !!(parsed.asks),
    hasB: !!(parsed.b),
    hasA: !!(parsed.a),
    keys: Object.keys(parsed),
    payloadType: parsed.data ? 'wrapped' : 'direct'
  });

  // Handle wrapped payload { stream: "...", data: {...} }
  const payload = parsed.data || parsed;
  
  console.debug("[OrderBookService] Normalized payload:", {
    hasBids: !!(payload.bids),
    hasAsks: !!(payload.asks),
    hasB: !!(payload.b),
    hasA: !!(payload.a),
    lastUpdateId: payload.lastUpdateId,
    eventTime: payload.E
  });

  // Support both partial depth (bids/asks) and diff depth (b/a)
  const rawBids = payload.bids || payload.b || [];
  const rawAsks = payload.asks || payload.a || [];

  console.debug("[OrderBookService] Final arrays:", {
    bidSource: payload.bids ? 'bids' : payload.b ? 'b' : 'none',
    askSource: payload.asks ? 'asks' : payload.a ? 'a' : 'none',
    bidCount: rawBids.length,
    askCount: rawAsks.length
  });

  return {
    bids: rawBids as [string, string][],
    asks: rawAsks as [string, string][]
  };
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
    console.log("[OrderBookService] Binance depth WebSocket connected");
  });

  ws.on("message", (data: Buffer | string) => {
    const raw = typeof data === "string" ? data : data.toString();
    console.debug("[OrderBookService] Raw WebSocket message:", raw);
    
    try {
      const parsed = JSON.parse(raw);
      const normalized = normalizePayload(parsed);
      
      const bids = parseLevels(normalized.bids);
      const asks = parseLevels(normalized.asks);
      
      if (bids.length > 0 || asks.length > 0) {
        snapshot = {
          bids: bids.sort((a, b) => b.price - a.price),
          asks: asks.sort((a, b) => a.price - b.price),
          timestamp: parsed.E || Date.now(),
        };
        
        console.debug("[OrderBookService] Snapshot updated:", {
          bidCount: snapshot.bids.length,
          askCount: snapshot.asks.length,
          topBid: snapshot.bids[0],
          topAsk: snapshot.asks[0],
          timestamp: snapshot.timestamp
        });
      } else {
        console.debug("[OrderBookService] No valid levels in message");
      }
    } catch (e) {
      console.warn("[OrderBookService] Parse error:", e, "Raw data:", raw);
    }
  });

  ws.on("close", () => {
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
