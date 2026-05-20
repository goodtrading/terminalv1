/**
 * Historical BBO path buffer — isolated per exchange:symbol:market.
 */

import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { DEFAULT_BOOKMAP_MARKET, parseBookmapMarket } from "@shared/bookmapMarket";
import {
  bboHistoryBufferKey,
  isValidBboPair,
  type BookmapBboPoint,
} from "@shared/bookmapBboHistory";

const MAX_POINTS = 20_000;
const MAX_AGE_MS = 4 * 60 * 60 * 1000;
const MIN_DEDUPE_MS = 80;
const DEFAULT_EXCHANGE = "binance";
const DEFAULT_SYMBOL = "BTCUSDT";

type MarketBuffer = {
  points: BookmapBboPoint[];
  lastBid: number | null;
  lastAsk: number | null;
  lastTs: number;
};

const buffers = new Map<string, MarketBuffer>();

function bufferFor(
  market: BookmapMarketSource,
  symbol = DEFAULT_SYMBOL,
  exchange = DEFAULT_EXCHANGE,
): MarketBuffer {
  const key = bboHistoryBufferKey(exchange, symbol, market);
  let buf = buffers.get(key);
  if (!buf) {
    buf = { points: [], lastBid: null, lastAsk: null, lastTs: 0 };
    buffers.set(key, buf);
  }
  return buf;
}

function prune(buf: MarketBuffer, now = Date.now()): void {
  const cutoff = now - MAX_AGE_MS;
  let start = 0;
  while (start < buf.points.length && buf.points[start]!.timestamp < cutoff) {
    start++;
  }
  if (start > 0) {
    buf.points = buf.points.slice(start);
  }
  if (buf.points.length > MAX_POINTS) {
    buf.points = buf.points.slice(-MAX_POINTS);
  }
}

export function recordBboFromOrderBook(
  market: BookmapMarketSource,
  symbol: string,
  bids: Array<{ price: number; size?: number }>,
  asks: Array<{ price: number; size?: number }>,
  timestamp?: number,
  exchange = DEFAULT_EXCHANGE,
): void {
  const m = parseBookmapMarket(market);
  if (!bids.length || !asks.length) return;

  const bestBid = bids[0]?.price;
  const bestAsk = asks[0]?.price;
  if (!isValidBboPair(bestBid, bestAsk)) return;

  const ts = Number.isFinite(timestamp) && timestamp! > 0 ? timestamp! : Date.now();
  const buf = bufferFor(m, symbol, exchange);

  if (
    buf.lastBid === bestBid &&
    buf.lastAsk === bestAsk &&
    ts - buf.lastTs < MIN_DEDUPE_MS
  ) {
    return;
  }

  buf.lastBid = bestBid;
  buf.lastAsk = bestAsk;
  buf.lastTs = ts;

  const point: BookmapBboPoint = {
    timestamp: ts,
    bestBid,
    bestAsk,
    market: m,
  };

  const last = buf.points[buf.points.length - 1];
  if (last && ts < last.timestamp) {
    const idx = buf.points.findIndex((p) => p.timestamp >= ts);
    buf.points.splice(idx >= 0 ? idx : buf.points.length, 0, point);
  } else {
    buf.points.push(point);
  }

  prune(buf, ts);
}

export function queryBboHistory(
  symbol: string,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
  opts?: { startMs?: number; endMs?: number; exchange?: string },
): BookmapBboPoint[] {
  const m = parseBookmapMarket(market);
  const buf = bufferFor(m, symbol, opts?.exchange ?? DEFAULT_EXCHANGE);
  prune(buf);
  const startMs = opts?.startMs;
  const endMs = opts?.endMs;
  if (startMs == null && endMs == null) {
    return buf.points.map((p) => ({ ...p }));
  }
  const lo = startMs ?? 0;
  const hi = endMs ?? Number.MAX_SAFE_INTEGER;
  return buf.points.filter((p) => p.timestamp >= lo && p.timestamp <= hi).map((p) => ({ ...p }));
}

export function getBboHistoryStats(
  symbol: string,
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
  exchange = DEFAULT_EXCHANGE,
) {
  const m = parseBookmapMarket(market);
  const buf = bufferFor(m, symbol, exchange);
  prune(buf);
  const last = buf.points[buf.points.length - 1];
  return {
    bufferKey: bboHistoryBufferKey(exchange, symbol, m),
    totalPoints: buf.points.length,
    latestBbo: last
      ? { bestBid: last.bestBid, bestAsk: last.bestAsk, timestamp: last.timestamp }
      : null,
    latestAgeMs: last ? Date.now() - last.timestamp : null,
  };
}
