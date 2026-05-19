/**
 * @deprecated Import from `aggTradeBufferRegistry` — re-exports spot-default API for backward compatibility.
 * Live buffers: spot (stream.binance.com) + perp (fstream.binance.com) via registry.
 */
export type { BufferedAggTrade } from "./aggTradeBufferRegistry";
export {
  queryBufferedAggTrades,
  subscribeAggTradeBuffer,
  getBufferCoverage,
} from "./aggTradeBufferRegistry";
