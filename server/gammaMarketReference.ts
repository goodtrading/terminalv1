import { MarketDataGateway } from "./market-gateway";
import { usableMarketDataPrice } from "@shared/marketDataTruth";

export function getGammaSpotReference(): number | null {
  const truth = MarketDataGateway.getMarketTruth({
    instrument: "BTCUSDT",
    venue: "Binance",
    marketType: "Spot",
  });
  return usableMarketDataPrice(truth);
}
