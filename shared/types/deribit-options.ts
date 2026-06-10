export type DeribitOptionSizeStats = {
  current: number | null;
  min: number | null;
  max: number | null;
  delta: number | null;
  spike: boolean;
  spikeAbs: number | null;
  spikePct: number | null;
  samples: number;
};

export type DeribitOptionSide = {
  instrumentName: string;
  openInterest: number | null;
  delta: number | null;
  bidIv: number | null;
  bidPrice: number | null;
  bidSize: number | null;
  askPrice: number | null;
  askSize: number | null;
  bestBidPrice: number | null;
  bestAskPrice: number | null;
  bestBidSize: number | null;
  bestAskSize: number | null;
  deribitReceivedAt?: number | null;
  cacheUpdatedAt?: number | null;
  liquidityUpdatedAt?: number | null;
  liquiditySource?: "ws" | "rest" | "missing";
  bidSizeStats1s?: DeribitOptionSizeStats;
  askSizeStats1s?: DeribitOptionSizeStats;
  askIv: number | null;
  markPrice: number | null;
  volume24h: number | null;
  priceChange24h: number | null;
};

export type DeribitOptionBookRow = {
  strike: number;
  call: DeribitOptionSide | null;
  put: DeribitOptionSide | null;
};

export type DeribitOptionsBookResponse = {
  currency: "BTC" | "ETH";
  underlyingPrice: number | null;
  selectedExpiry: string | null;
  expiries: string[];
  rows: DeribitOptionBookRow[];
  generatedAt: number;
  /** Present when Deribit fetch failed but response is still usable */
  error?: string;
  message?: string;
  degraded?: boolean;
};
