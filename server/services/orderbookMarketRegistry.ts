import type { BookmapMarketSource } from "@shared/bookmapMarket";
import { DEFAULT_BOOKMAP_MARKET, parseBookmapMarket } from "@shared/bookmapMarket";
import { getOrderBook, type OrderBookSnapshot } from "./orderbookService";
import { getPerpOrderBook } from "./orderbookServicePerp";

export function getOrderBookForMarket(
  market: BookmapMarketSource = DEFAULT_BOOKMAP_MARKET,
): OrderBookSnapshot {
  return market === "perp" ? getPerpOrderBook() : getOrderBook();
}

export { parseBookmapMarket };
