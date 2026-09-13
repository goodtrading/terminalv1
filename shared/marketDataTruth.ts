export const MARKET_DATA_QUALITY = [
  "VALID",
  "STALE",
  "GAP",
  "RESYNCING",
  "PARTIAL",
  "DISCONNECTED",
] as const;

export type MarketDataQuality = (typeof MARKET_DATA_QUALITY)[number];
export type MarketDataSource = "websocket" | "rest";
export type MarketDataMarketType = "Spot" | "Perpetual";

export type MarketDataTruth = {
  instrument: string;
  venue: "Binance";
  marketType: MarketDataMarketType;
  bid: number | null;
  ask: number | null;
  mid: number | null;
  last: number | null;
  eventTime: number | null;
  receiveTime: number;
  source: MarketDataSource;
  sequence: number | null;
  quality: MarketDataQuality;
};

export type MarketDataTruthInput = Omit<MarketDataTruth, "mid"> & {
  mid?: number | null;
};

export type MarketDataUpdateMetadata = {
  source: MarketDataSource;
  eventTime: number | null;
  receiveTime: number;
  sequence: number | null;
};

export function shouldAcceptMarketDataUpdate(
  current: MarketDataUpdateMetadata | null,
  incoming: MarketDataUpdateMetadata,
): boolean {
  if (!current) return true;
  if (incoming.source === "rest" && current.source === "websocket") {
    if (current.sequence == null || incoming.sequence == null) return false;
    return incoming.sequence > current.sequence;
  }
  if (current.sequence != null && incoming.sequence != null && incoming.sequence < current.sequence) {
    return false;
  }
  if (current.eventTime != null && incoming.eventTime != null && incoming.eventTime < current.eventTime) {
    return false;
  }
  return incoming.receiveTime >= current.receiveTime;
}

export function deriveMarketDataQuality(input: {
  connected: boolean;
  hasBbo: boolean;
  ageMs: number | null;
  marketType: MarketDataMarketType;
  syncState?: "BOOTSTRAPPING" | "SYNCHRONIZED" | "DESYNCHRONIZED";
}): MarketDataQuality {
  if (!input.connected) return "DISCONNECTED";
  if (input.marketType === "Perpetual" && input.syncState !== "SYNCHRONIZED") return "RESYNCING";
  if (!input.hasBbo) return "PARTIAL";
  if (input.ageMs != null && input.ageMs > (input.marketType === "Perpetual" ? 3_000 : 10_000)) return "STALE";
  return "VALID";
}

export function usableMarketDataPrice(truth: MarketDataTruth): number | null {
  if (truth.quality !== "VALID") return null;
  const price = truth.last ?? truth.mid;
  return price != null && Number.isFinite(price) && price > 0 ? price : null;
}
function validPrice(value: number | null): value is number {
  return value != null && Number.isFinite(value) && value > 0;
}
function validBbo(bid: number | null, ask: number | null): boolean {
  return validPrice(bid) && validPrice(ask) && bid < ask;
}

export function buildMarketDataTruth(input: MarketDataTruthInput): MarketDataTruth {
  if (!input.instrument.trim()) throw new Error("Market truth instrument is required");
  if (input.venue !== "Binance") throw new Error("Unsupported market truth venue");
  if (input.marketType !== "Spot" && input.marketType !== "Perpetual") {
    throw new Error("Market truth marketType is required");
  }
  if (input.source !== "websocket" && input.source !== "rest") {
    throw new Error("Market truth source is required");
  }
  if (!Number.isFinite(input.receiveTime) || input.receiveTime <= 0) {
    throw new Error("Market truth receiveTime is required");
  }

  const bid = validPrice(input.bid) ? input.bid : null;
  const ask = validPrice(input.ask) ? input.ask : null;
  const mid = validBbo(bid, ask) ? (bid + ask) / 2 : null;
  const eventTime =
    input.eventTime != null && Number.isFinite(input.eventTime) && input.eventTime > 0
      ? input.eventTime
      : null;
  const last = validPrice(input.last) ? input.last : null;
  const sequence =
    input.sequence != null && Number.isFinite(input.sequence) && input.sequence >= 0
      ? input.sequence
      : null;

  return {
    instrument: input.instrument,
    venue: "Binance",
    marketType: input.marketType,
    bid,
    ask,
    mid,
    last,
    eventTime,
    receiveTime: input.receiveTime,
    source: input.source,
    sequence,
    quality: input.quality,
  };
}
