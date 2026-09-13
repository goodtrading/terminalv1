export type CanonicalTradeMarketType = "Spot" | "Perpetual";
export type CanonicalTradeAggressorSide = "BUY" | "SELL";
export type CanonicalTradeSource = "websocket" | "rest";
export type CanonicalTradeQuality = "VALID" | "STALE" | "DISCONNECTED" | "RESYNCING" | "PARTIAL";

export type CanonicalTrade = {
  instrument: string;
  venue: "Binance";
  marketType: CanonicalTradeMarketType;
  tradeId: string;
  price: number;
  quantity: number;
  aggressorSide: CanonicalTradeAggressorSide;
  eventTime: number | null;
  receiveTime: number;
  source: CanonicalTradeSource;
  quality: CanonicalTradeQuality;
  provenance: {
    tradeId: string;
    source: CanonicalTradeSource;
    eventTime: number | null;
    receiveTime: number;
  };
};

export type CanonicalTradeInput = Omit<CanonicalTrade, "provenance">;

function validTrade(trade: CanonicalTradeInput): boolean {
  return trade.instrument.length > 0 && trade.tradeId.length > 0 &&
    Number.isFinite(trade.price) && trade.price > 0 &&
    Number.isFinite(trade.quantity) && trade.quantity > 0 &&
    Number.isFinite(trade.receiveTime) && trade.receiveTime > 0 &&
    (trade.eventTime == null || Number.isFinite(trade.eventTime));
}

function compare(a: CanonicalTrade, b: CanonicalTrade): number {
  const at = a.eventTime ?? Number.POSITIVE_INFINITY;
  const bt = b.eventTime ?? Number.POSITIVE_INFINITY;
  return at - bt || a.tradeId.localeCompare(b.tradeId);
}

function cloneTrade(trade: CanonicalTrade): CanonicalTrade {
  return { ...trade, provenance: { ...trade.provenance } };
}

export class CanonicalTradeTape {
  private readonly tradesById = new Map<string, CanonicalTrade>();
  private connected = true;

  constructor(readonly identity: { instrument: string; venue: "Binance"; marketType: CanonicalTradeMarketType }) {}

  ingest(input: CanonicalTradeInput): { accepted: boolean; reason?: "INVALID" | "DUPLICATE"; trade?: CanonicalTrade } {
    if (input.instrument !== this.identity.instrument || input.venue !== this.identity.venue || input.marketType !== this.identity.marketType || !validTrade(input)) {
      return { accepted: false, reason: "INVALID" };
    }
    if (this.tradesById.has(input.tradeId)) return { accepted: false, reason: "DUPLICATE" };
    const trade: CanonicalTrade = {
      ...input,
      provenance: { tradeId: input.tradeId, source: input.source, eventTime: input.eventTime, receiveTime: input.receiveTime },
    };
    this.tradesById.set(trade.tradeId, trade);
    return { accepted: true, trade: cloneTrade(trade) };
  }

  markDisconnected(): void { this.connected = false; }
  markConnected(): void { this.connected = true; }
  get quality(): CanonicalTradeQuality { return this.connected ? "VALID" : "DISCONNECTED"; }

  getTrades(): CanonicalTrade[] {
    return [...this.tradesById.values()].sort(compare).map(cloneTrade);
  }

  query(startTimeMs = Number.NEGATIVE_INFINITY, endTimeMs = Number.POSITIVE_INFINITY, limit?: number): CanonicalTrade[] {
    const result = this.getTrades().filter((trade) => {
      const time = trade.eventTime ?? trade.receiveTime;
      return time >= startTimeMs && time <= endTimeMs;
    });
    return limit == null ? result : result.slice(0, Math.max(0, limit));
  }

  has(tradeId: string): boolean { return this.tradesById.has(tradeId); }
  get size(): number { return this.tradesById.size; }
  newest(): CanonicalTrade | null { return this.getTrades().at(-1) ?? null; }
  oldest(): CanonicalTrade | null { return this.getTrades()[0] ?? null; }
  trimBefore(timeMs: number): void {
    for (const [id, trade] of this.tradesById) {
      const time = trade.eventTime ?? trade.receiveTime;
      if (time < timeMs) this.tradesById.delete(id);
    }
  }
}

export function classifyBinanceAggressor(buyerIsMaker: boolean): CanonicalTradeAggressorSide {
  return buyerIsMaker ? "SELL" : "BUY";
}

export function deriveTradeVolumes(trades: readonly CanonicalTrade[]) {
  let aggressiveBuyVolume = 0;
  let aggressiveSellVolume = 0;
  for (const trade of trades) {
    if (trade.aggressorSide === "BUY") aggressiveBuyVolume += trade.quantity;
    else aggressiveSellVolume += trade.quantity;
  }
  return { aggressiveBuyVolume, aggressiveSellVolume, totalVolume: aggressiveBuyVolume + aggressiveSellVolume, delta: aggressiveBuyVolume - aggressiveSellVolume };
}

export function deriveCvd(trades: readonly CanonicalTrade[]): number[] {
  let value = 0;
  return trades.slice().sort(compare).map((trade) => {
    value += trade.aggressorSide === "BUY" ? trade.quantity : -trade.quantity;
    return value;
  });
}
