export type CanonicalL2MarketType = "Spot" | "Perpetual";
export type CanonicalL2Quality = "VALID" | "STALE" | "GAP" | "RESYNCING" | "PARTIAL" | "DISCONNECTED";
export type CanonicalL2Source = "websocket" | "rest";

export type CanonicalL2Level = { price: number; quantity: number };
export type CanonicalL2Bbo = { bid: number | null; ask: number | null };
export type CanonicalL2Provenance = {
  source: CanonicalL2Source;
  snapshotId: number | null;
  sequence: number | null;
  eventTime: number | null;
  receiveTime: number;
};

export type CanonicalL2Book = {
  instrument: string;
  venue: "Binance";
  marketType: CanonicalL2MarketType;
  bids: CanonicalL2Level[];
  asks: CanonicalL2Level[];
  bbo: CanonicalL2Bbo;
  spread: number | null;
  mid: number | null;
  sequence: number | null;
  snapshotId: number | null;
  eventTime: number | null;
  receiveTime: number;
  quality: CanonicalL2Quality;
  provenance: CanonicalL2Provenance;
};

export type CanonicalL2Update = {
  bids: CanonicalL2Level[];
  asks: CanonicalL2Level[];
  sequence: number | null;
  snapshotId?: number | null;
  eventTime: number | null;
  receiveTime: number;
  source: CanonicalL2Source;
  quality?: CanonicalL2Quality;
  firstUpdateId?: number | null;
  previousUpdateId?: number | null;
};

function validLevel(level: CanonicalL2Level): boolean {
  return Number.isFinite(level.price) && level.price > 0 && Number.isFinite(level.quantity);
}

function cloneLevels(levels: CanonicalL2Level[]): CanonicalL2Level[] {
  return levels.filter(validLevel).map((level) => ({ ...level }));
}

export class CanonicalL2BookOwner {
  private readonly bids = new Map<number, number>();
  private readonly asks = new Map<number, number>();
  private state: CanonicalL2Book;

  constructor(identity: { instrument: string; venue: "Binance"; marketType: CanonicalL2MarketType }) {
    this.state = this.buildState(identity, [], [], {
      sequence: null,
      snapshotId: null,
      eventTime: null,
      receiveTime: Date.now(),
      source: "rest",
      quality: "PARTIAL",
    });
  }

  private buildState(
    identity: Pick<CanonicalL2Book, "instrument" | "venue" | "marketType">,
    bids: CanonicalL2Level[],
    asks: CanonicalL2Level[],
    meta: Omit<CanonicalL2Provenance, "snapshotId"> & { snapshotId?: number | null; quality: CanonicalL2Quality },
  ): CanonicalL2Book {
    const sortedBids = cloneLevels(bids).filter((level) => level.quantity > 0).sort((a, b) => b.price - a.price);
    const sortedAsks = cloneLevels(asks).filter((level) => level.quantity > 0).sort((a, b) => a.price - b.price);
    const bid = sortedBids[0]?.price ?? null;
    const ask = sortedAsks[0]?.price ?? null;
    const validBbo = bid != null && ask != null && bid < ask;
    const quality = meta.quality === "VALID" && !validBbo ? "PARTIAL" : meta.quality;
    return {
      ...identity,
      bids: sortedBids,
      asks: sortedAsks,
      bbo: { bid: validBbo ? bid : null, ask: validBbo ? ask : null },
      spread: validBbo ? ask - bid : null,
      mid: validBbo ? (bid + ask) / 2 : null,
      sequence: meta.sequence,
      snapshotId: meta.snapshotId ?? null,
      eventTime: meta.eventTime,
      receiveTime: meta.receiveTime,
      quality,
      provenance: {
        source: meta.source,
        snapshotId: meta.snapshotId ?? null,
        sequence: meta.sequence,
        eventTime: meta.eventTime,
        receiveTime: meta.receiveTime,
      },
    };
  }

  applySnapshot(update: CanonicalL2Update): CanonicalL2Book {
    if (update.receiveTime <= 0 || !Number.isFinite(update.receiveTime)) throw new Error("Invalid L2 receiveTime");
    this.bids.clear();
    this.asks.clear();
    for (const level of update.bids) if (validLevel(level) && level.quantity > 0) this.bids.set(level.price, level.quantity);
    for (const level of update.asks) if (validLevel(level) && level.quantity > 0) this.asks.set(level.price, level.quantity);
    this.state = this.fromMaps(update);
    return this.getBook();
  }

  applyDelta(update: CanonicalL2Update): { accepted: boolean; reason?: "STALE" | "GAP" | "INVALID"; book: CanonicalL2Book } {
    if (this.state.quality === "DISCONNECTED" || this.state.quality === "RESYNCING") {
      this.state = { ...this.state, quality: "RESYNCING" };
      return { accepted: false, reason: "GAP", book: this.getBook() };
    }
    const current = this.state.sequence;
    if (update.sequence == null || !Number.isFinite(update.sequence) || update.sequence < 0) {
      this.state = { ...this.state, quality: "GAP" };
      return { accepted: false, reason: "INVALID", book: this.getBook() };
    }
    if (current != null && update.sequence <= current) return { accepted: false, reason: "STALE", book: this.getBook() };
    if (this.state.marketType === "Perpetual" && current != null && (update.firstUpdateId == null || update.previousUpdateId == null)) {
      this.state = { ...this.state, quality: "GAP" };
      return { accepted: false, reason: "GAP", book: this.getBook() };
    }
    if (current != null && update.firstUpdateId != null && update.firstUpdateId > current + 1) {
      this.state = { ...this.state, quality: "GAP" };
      return { accepted: false, reason: "GAP", book: this.getBook() };
    }
    if (current != null && update.previousUpdateId != null && update.previousUpdateId !== current) {
      this.state = { ...this.state, quality: "GAP" };
      return { accepted: false, reason: "GAP", book: this.getBook() };
    }
    for (const level of update.bids) if (validLevel(level)) level.quantity <= 0 ? this.bids.delete(level.price) : this.bids.set(level.price, level.quantity);
    for (const level of update.asks) if (validLevel(level)) level.quantity <= 0 ? this.asks.delete(level.price) : this.asks.set(level.price, level.quantity);
    this.state = this.fromMaps(update);
    return { accepted: this.state.quality === "VALID", book: this.getBook() };
  }

  markDisconnected(): CanonicalL2Book {
    this.state = { ...this.state, quality: "DISCONNECTED" };
    return this.getBook();
  }

  markResyncing(): CanonicalL2Book {
    this.state = { ...this.state, quality: "RESYNCING" };
    return this.getBook();
  }

  getBook(): CanonicalL2Book {
    return {
      ...this.state,
      bids: this.state.bids.map((level) => ({ ...level })),
      asks: this.state.asks.map((level) => ({ ...level })),
      bbo: { ...this.state.bbo },
      provenance: { ...this.state.provenance },
    };
  }

  private fromMaps(update: CanonicalL2Update): CanonicalL2Book {
    return this.buildState(
      { instrument: this.state.instrument, venue: this.state.venue, marketType: this.state.marketType },
      Array.from(this.bids, ([price, quantity]) => ({ price, quantity })),
      Array.from(this.asks, ([price, quantity]) => ({ price, quantity })),
      {
        sequence: update.sequence,
        snapshotId: update.snapshotId ?? this.state.snapshotId,
        eventTime: update.eventTime,
        receiveTime: update.receiveTime,
        source: update.source,
        quality: update.quality ?? "VALID",
      },
    );
  }
}
