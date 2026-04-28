export type DeribitOptionSide = {
  instrumentName: string;
  openInterest: number | null;
  delta: number | null;
  bidIv: number | null;
  bidPrice: number | null;
  bidSize: number | null;
  askPrice: number | null;
  askSize: number | null;
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
};
