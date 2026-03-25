/**
 * When true, the candlestick series only refreshes on full resync (hydrate / TF change),
 * matching the old "safe stream" behaviour.
 * Set `VITE_DISABLE_LIVE_CANDLE_CHART=true` to freeze OHLC on screen between refetches.
 */
export const LIVE_CANDLE_CHART_DISABLED =
  import.meta.env.VITE_DISABLE_LIVE_CANDLE_CHART === "true";

/** REST ticker poll interval — pushes ticks into the market engine (separate from OHLC history refetch). */
export const BTC_TICKER_REFETCH_MS = 500;
