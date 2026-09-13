import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { DEFAULT_BOOKMAP_MARKET, parseBookmapMarket } from "@shared/bookmapMarket";
import { getOrderBook, getCanonicalL2Book as getSpotCanonicalL2Book, type OrderBookSnapshot } from "./orderbookService";
import { getPerpOrderBook, getCanonicalL2Book as getPerpCanonicalL2Book } from "./orderbookServicePerp";
import type { CanonicalL2Book } from "@shared/canonicalL2Book";

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

export { parseBookmapMarket };
