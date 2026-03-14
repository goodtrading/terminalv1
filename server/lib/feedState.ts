/**
 * Central feed state: price, orderbook, options.
 * Source selection is derived from health + priority rules, never "first connected wins".
 */

export type PriceSource = "binance" | "coinbase" | "none";
export type OrderbookSource = "binance" | "coinbase" | "none";
export type OptionsSource = "deribit" | "none";

export interface FeedState {
  priceSource: PriceSource;
  orderbookSource: OrderbookSource;
  optionsSource: OptionsSource;
  isBinancePriceHealthy: boolean;
  isCoinbasePriceHealthy: boolean;
  isBinanceOrderbookHealthy: boolean;
  isCoinbaseOrderbookHealthy: boolean;
  isDeribitOptionsHealthy: boolean;
  isOrderbookFallbackActive: boolean;
  isPriceFallbackActive: boolean;
}

let lastLoggedOrderbook = "";
let lastLoggedPrice = "";
const FEED_LOG_THROTTLE_MS = 15000;

function normalizeSource(s: string | undefined): string {
  if (!s) return "none";
  const lower = s.toLowerCase();
  if (lower.includes("binance")) return "binance";
  if (lower.includes("coinbase")) return "coinbase";
  if (lower.includes("deribit")) return "deribit";
  return "none";
}

/**
 * Derive feed state from current inputs. Priority rules only—never lock fallback.
 */
export function computeFeedState(params: {
  tickerSource: string | undefined;
  heatmapSource: string | undefined;
  optionsSourceRaw: string | undefined;
  isBinanceOrderbookHealthy: boolean;
  optionsStrikeCount: number;
  hasHeatmapData: boolean;
}): FeedState {
  const {
    tickerSource,
    heatmapSource,
    optionsSourceRaw,
    isBinanceOrderbookHealthy,
    optionsStrikeCount,
    hasHeatmapData,
  } = params;

  // Price: Binance primary, Coinbase fallback. Others (Bybit/Kraken) treated as fallback for display.
  const priceNorm = normalizeSource(tickerSource);
  const isBinancePriceHealthy = priceNorm === "binance";
  const isCoinbasePriceHealthy = priceNorm === "coinbase" || (priceNorm !== "binance" && priceNorm !== "none");
  let priceSource: PriceSource = "none";
  if (isBinancePriceHealthy) priceSource = "binance";
  else if (isCoinbasePriceHealthy) priceSource = "coinbase";
  const isPriceFallbackActive = priceSource === "coinbase" || (priceNorm !== "none" && priceNorm !== "binance");

  // Orderbook: reflect actual heatmap source. Binance primary, Coinbase fallback. Never lock fallback.
  const obNorm = normalizeSource(heatmapSource);
  const isCoinbaseOrderbookHealthy = hasHeatmapData && obNorm === "coinbase";
  const orderbookSource: OrderbookSource = hasHeatmapData ? (obNorm === "binance" ? "binance" : obNorm === "coinbase" ? "coinbase" : "none") : "none";
  const isOrderbookFallbackActive = orderbookSource === "coinbase";

  // Options: Deribit only
  const isDeribitOptionsHealthy = optionsStrikeCount > 0;
  const optionsSource: OptionsSource = isDeribitOptionsHealthy ? "deribit" : "none";

  // Throttled logs for transitions
  const now = Date.now();
  const obKey = `${orderbookSource}-${isOrderbookFallbackActive}`;
  if (obKey !== lastLoggedOrderbook) {
    lastLoggedOrderbook = obKey;
    if (orderbookSource === "binance") {
      console.log("[FeedState] Binance orderbook recovered, restoring Binance as primary");
    } else if (isOrderbookFallbackActive) {
      console.log("[FeedState] Binance orderbook unhealthy, activating Coinbase fallback");
    }
  }

  const priceKey = `${priceSource}-${isPriceFallbackActive}`;
  if (priceKey !== lastLoggedPrice) {
    lastLoggedPrice = priceKey;
  }

  return {
    priceSource,
    orderbookSource,
    optionsSource,
    isBinancePriceHealthy,
    isCoinbasePriceHealthy,
    isBinanceOrderbookHealthy,
    isCoinbaseOrderbookHealthy,
    isDeribitOptionsHealthy,
    isOrderbookFallbackActive,
    isPriceFallbackActive,
  };
}
