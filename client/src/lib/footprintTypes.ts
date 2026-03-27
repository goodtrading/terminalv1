/**
 * Footprint / order-flow primitives (client). Aligns with server `/api/market/agg-trades`.
 */

export type FootprintAggTrade = {
  id: string;
  price: number;
  qty: number;
  /** ms since epoch */
  time: number;
  /** Aggressor / taker side */
  side: "buy" | "sell";
};

export type FootprintLevel = {
  price: number;
  /** Volume from aggressive sells (hit bid) */
  bidVolume: number;
  /** Volume from aggressive buys (lift ask) */
  askVolume: number;
  delta: number;
  totalVolume: number;
};

export type FootprintCandle = {
  /** Bar open time (UTC seconds) */
  time: number;
  open: number;
  high: number;
  low: number;
  close: number;
  levels: FootprintLevel[];
};
