/** Chart vs execution venue — shared by client and server. */

export type ChartExchangeId = "binance" | "kraken" | "unknown";
export type ChartMarketType = "spot" | "perpetual" | "unknown";

export type ExecutionExchangeId = "bingx";
export type ExecutionMarketType = "perpetual";

export type ExecutionMode = "read_only" | "paper" | "live";

/** Where signals may originate (chart is visual-only for venue). */
export type SignalSource = "chart" | "manual" | "strategy";

export interface TerminalExecutionContext {
  chartExchange: ChartExchangeId;
  chartMarketType: ChartMarketType;
  chartSymbol: string;

  signalSource: SignalSource;

  executionExchange: ExecutionExchangeId;
  executionMarketType: ExecutionMarketType;
  executionSymbol: string;

  liveTradingEnabled: boolean;
  mode: ExecutionMode;
}

export type NormalizedOrderSide = "buy" | "sell";
export type NormalizedOrderType = "market" | "limit";

/** Order shape for BingXExecutionAdapter (live path — still blocked). */
export interface NormalizedExecutionOrder {
  exchange: ExecutionExchangeId;
  marketType: ExecutionMarketType;
  symbol: string;
  side: NormalizedOrderSide;
  orderType: NormalizedOrderType;
  qty: number;
  reduceOnly?: boolean;
  leverage?: number;
  marginMode?: "isolated" | "cross";
  price?: number;
  /** Audit: chart symbol that produced this order (never used for routing). */
  chartSymbol?: string;
}

export interface ExecutionVenueFields {
  venue: ExecutionExchangeId;
  marketType: ExecutionMarketType;
  symbol: string;
  chartSymbol?: string;
}
