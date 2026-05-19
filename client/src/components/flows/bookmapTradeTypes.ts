/** Normalized aggressor trade for Bookmap Delta / Volume / CVD. */
export interface BookmapTrade {
  id?: string;
  timestamp: number;
  price: number;
  sizeBtc: number;
  side: "buy" | "sell";
}

export interface DeltaVolumeBucket {
  timeBucket: number;
  buyVolume: number;
  sellVolume: number;
  volume: number;
  delta: number;
  cvd: number;
  tradeCount: number;
}

export type BookmapTradeScope = "session" | "visible";

export interface BookmapTradeSessionSummary {
  tradeCount: number;
  buyVolume: number;
  sellVolume: number;
  volume: number;
  delta: number;
  cvd: number;
  imbalancePct: number;
  latestDelta: number;
  firstTimestamp: number | null;
  lastTimestamp: number | null;
}

export const BOOKMAP_TRADE_BUFFER_MAX = 8_000;
