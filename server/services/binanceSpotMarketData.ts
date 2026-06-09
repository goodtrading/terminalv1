/**
 * Binance spot market data endpoints.
 * Vision (data-api.binance.vision) avoids HTTP 451 geo-blocks on US datacenters (e.g. Railway).
 * @see https://github.com/binance/binance-spot-api-docs/blob/master/faqs/market_data_only.md
 */

export const BINANCE_SPOT_VISION_REST = "https://data-api.binance.vision";
export const BINANCE_SPOT_VISION_WS_BASE = "wss://data-stream.binance.vision";
export const BINANCE_SPOT_PRIMARY_WS_BASE = "wss://stream.binance.com:9443";

const STANDARD_REST_MIRRORS = [
  "https://api1.binance.com",
  "https://api2.binance.com",
  "https://api3.binance.com",
  "https://api.binance.com",
];

/** True in production unless BINANCE_USE_VISION_API=false. */
export function shouldUseBinanceSpotVision(): boolean {
  const flag = String(process.env.BINANCE_USE_VISION_API ?? "").toLowerCase();
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV === "production";
}

export function getSpotRestMirrors(): string[] {
  if (shouldUseBinanceSpotVision()) {
    return [BINANCE_SPOT_VISION_REST, ...STANDARD_REST_MIRRORS];
  }
  return [...STANDARD_REST_MIRRORS];
}

export function getSpotDepthWsUrl(symbol = "btcusdt"): string {
  const stream = `${symbol.toLowerCase()}@depth`;
  if (shouldUseBinanceSpotVision()) {
    return `${BINANCE_SPOT_VISION_WS_BASE}/ws/${stream}`;
  }
  return `${BINANCE_SPOT_PRIMARY_WS_BASE}/ws/${stream}`;
}

export function getSpotAggTradeWsBase(): string {
  return shouldUseBinanceSpotVision()
    ? BINANCE_SPOT_VISION_WS_BASE
    : BINANCE_SPOT_PRIMARY_WS_BASE;
}

export function getSpotAggTradesRestUrls(): string[] {
  return getSpotRestMirrors().map((mirror) => `${mirror}/api/v3/aggTrades`);
}
