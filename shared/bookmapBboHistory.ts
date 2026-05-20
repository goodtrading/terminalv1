import type { BookmapMarketSource } from "./bookmapMarket";

/** Single best-bid / best-ask sample at a point in time. */
export interface BookmapBboPoint {
  timestamp: number;
  bestBid: number;
  bestAsk: number;
  market: BookmapMarketSource;
}

export type BookmapBboHistoryResponse = {
  symbol: string;
  market: BookmapMarketSource;
  points: Array<{
    timestamp: number;
    bestBid: number;
    bestAsk: number;
  }>;
  serverTime: number;
};

export function bboHistoryBufferKey(
  exchange: string,
  symbol: string,
  market: BookmapMarketSource,
): string {
  const sym = symbol.replace(/[^A-Z0-9]/gi, "").toUpperCase() || "BTCUSDT";
  return `${exchange.toLowerCase()}:${sym}:${market}`;
}

export function isValidBboPair(bestBid: number, bestAsk: number): boolean {
  return (
    Number.isFinite(bestBid) &&
    Number.isFinite(bestAsk) &&
    bestBid > 0 &&
    bestAsk > 0 &&
    bestBid < bestAsk
  );
}
