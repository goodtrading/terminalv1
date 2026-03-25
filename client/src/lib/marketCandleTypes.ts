/**
 * Canonical OHLC types for the client Market Engine.
 * Times are UTC seconds (same convention as Lightweight Charts UTCTimestamp).
 */

import type { ChartTimeframeId } from "@/lib/chartTimeframes";

/** Alias for spec / docs — chart TFs currently supported by the engine */
export type MarketTimeframe = ChartTimeframeId;

export type MarketCandle = {
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume?: number;
};

/** Snapshot shape for debugging / future devtools — not used as React state */
export type MarketEngineState = {
  baseCandles: MarketCandle[];
  candlesByTimeframe: Record<MarketTimeframe, MarketCandle[]>;
  activeTimeframe: MarketTimeframe;
  baseBarSec: number;
  lastUpdateTs?: number;
};
