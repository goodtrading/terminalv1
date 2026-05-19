/**
 * Binance **USDT-M perpetual** order book service (Phase 1 composite — perp leg).
 * - WS: wss://fstream.binance.com/ws/btcusdt@depth
 * - REST: https://fapi.binance.com/fapi/v1/depth
 * Feeds `feedBinanceOrderBook(..., "perp")` — isolated from spot engine state.
 */

import WebSocket from "ws";
import { feedBinanceOrderBook } from "./bookmapEngine";
import type { OrderBookLevel, OrderBookSnapshot } from "./orderbookService";

const WS_URL = "wss://fstream.binance.com/ws/btcusdt@depth";
const REST_DEPTH_URL = "https://fapi.binance.com/fapi/v1/depth";
const DEPTH_LEVELS = 1000;
const DEBUG_ENABLED = process.env.NODE_ENV === "development";

if (DEBUG_ENABLED) {
  console.debug("[OrderBookServicePerp] Using WebSocket URL:", WS_URL, "depth:", DEPTH_LEVELS);
}

let snapshot: OrderBookSnapshot = { bids: [], asks: [] };
let ws: WebSocket | null = null;
let reconnectTimeout: ReturnType<typeof setTimeout> | null = null;
const RECONNECT_MS = 5000;

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
  const row = payload as { bids?: [string, string][]; asks?: [string, string][]; b?: [string, string][]; a?: [string, string][] };
  return {
    bids: row.bids || row.b || [],
    asks: row.asks || row.a || [],
  };
}

export async function initializePerpFullDepth(): Promise<void> {
  try {
    const response = await fetch(`${REST_DEPTH_URL}?symbol=BTCUSDT&limit=${DEPTH_LEVELS}`);
    const data = await response.json();
    const bids = parseLevels(data.bids);
    const asks = parseLevels(data.asks);
    snapshot = {
      bids: bids.sort((a, b) => b.price - a.price),
      asks: asks.sort((a, b) => a.price - b.price),
      timestamp: data.lastUpdateId || Date.now(),
    };
    feedBinanceOrderBook(
      { bids: snapshot.bids, asks: snapshot.asks, timestamp: snapshot.timestamp },
      "snapshot",
      "perp",
    );
    if (DEBUG_ENABLED) {
      console.debug("[OrderBookServicePerp] Full depth initialized:", {
        bidCount: snapshot.bids.length,
        askCount: snapshot.asks.length,
      });
    }
  } catch (error) {
    console.error("[OrderBookServicePerp] Failed to initialize full depth:", error);
    throw error;
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
    console.log("[OrderBookServicePerp] Binance futures depth WebSocket connected");
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
      if (
        deltaBids.length === 0 &&
        deltaAsks.length === 0 &&
        bookmapBids.length === 0 &&
        bookmapAsks.length === 0
      ) {
        return;
      }
      const ts =
        parsed && typeof parsed === "object" && "E" in parsed
          ? Number((parsed as { E?: number }).E) || Date.now()
          : Date.now();
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
      if (bookmapBids.length > 0 || bookmapAsks.length > 0) {
        feedBinanceOrderBook(
          { bids: bookmapBids, asks: bookmapAsks, timestamp: ts },
          "delta",
          "perp",
        );
      }
    } catch (e) {
      console.warn("[OrderBookServicePerp] Parse error:", e);
    }
  });

  ws.on("close", () => {
    ws = null;
    scheduleReconnect();
  });

  ws.on("error", (err) => {
    console.warn("[OrderBookServicePerp] WebSocket error:", err.message);
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

export function getPerpOrderBook(): OrderBookSnapshot {
  return { ...snapshot };
}
