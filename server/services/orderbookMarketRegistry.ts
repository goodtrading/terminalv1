import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { DEFAULT_BOOKMAP_MARKET, parseBookmapMarket } from "@shared/bookmapMarket";
import { getOrderBook, getCanonicalL2Book as getSpotCanonicalL2Book, getLiquidityLifecycle as getSpotLiquidityLifecycle, type OrderBookSnapshot } from "./orderbookService";
import { getPerpOrderBook, getCanonicalL2Book as getPerpCanonicalL2Book, getLiquidityLifecycle as getPerpLiquidityLifecycle } from "./orderbookServicePerp";
import type { CanonicalL2Book } from "@shared/canonicalL2Book";
import type { LiquidityLifecycleEvent } from "@shared/liquidityLifecycle";

export function getOrderBookForMarket(
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): OrderBookSnapshot {
  return market === "perp" ? getPerpOrderBook() : getOrderBook();
}

export function getCanonicalL2BookForMarket(
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): CanonicalL2Book {
  return market === "perp" ? getPerpCanonicalL2Book() : getSpotCanonicalL2Book();
}

export function getLiquidityLifecycleForMarket(
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): LiquidityLifecycleEvent[] {
  return market === "perp" ? getPerpLiquidityLifecycle() : getSpotLiquidityLifecycle();
}

export { parseBookmapMarket };
