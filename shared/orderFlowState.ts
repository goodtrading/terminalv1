import type { CanonicalL2Book, CanonicalL2Quality } from "./canonicalL2Book";
import type { CanonicalTrade, CanonicalTradeQuality } from "./canonicalTradeTape";
import type { LiquidityLifecycleEvent } from "./liquidityLifecycle";
import type { HistoricalLiquidityFrame, HistoricalLiquidityTruth } from "./historicalLiquidityTruth";

export type OrderFlowIdentity = {
  instrument: string;
  venue: "Binance";
  marketType: "Spot" | "Perpetual";
};

export type OrderFlowAvailability = CanonicalL2Quality | CanonicalTradeQuality | "UNAVAILABLE";
export type OrderFlowOverallQuality = "VALID" | "STALE" | "PARTIAL" | "GAP" | "RESYNCING" | "DISCONNECTED";

export type OrderFlowQuality = {
  book: CanonicalL2Quality | "UNAVAILABLE";
  trades: CanonicalTradeQuality | "UNAVAILABLE";
  lifecycle: CanonicalL2Quality | "UNAVAILABLE";
  history: CanonicalL2Quality | "UNAVAILABLE";
  overall: OrderFlowOverallQuality;
};

export type OrderFlowBbo = {
  bid: number;
  ask: number;
  spread: number;
  mid: number;
};

export type OrderFlowTimestamps = {
  book: { eventTime: number | null; receiveTime: number | null };
  trades: { oldestEventTime: number | null; newestEventTime: number | null; latestReceiveTime: number | null };
  lifecycle: { oldestEventTime: number | null; newestEventTime: number | null; latestReceiveTime: number | null };
  history: { latestEventTime: number | null; latestReceiveTime: number | null };
};

export type OrderFlowProvenance = {
  book: CanonicalL2Book["provenance"] | null;
  trades: { source: CanonicalTrade["source"] | null; latest: CanonicalTrade["provenance"] | null };
  lifecycle: { source: CanonicalL2Book["provenance"]["source"] | null; latest: CanonicalL2Book["provenance"] | null };
  history: CanonicalL2Book["provenance"] | null;
};

export type OrderFlowConsistency = {
  status: "CONSISTENT" | "PARTIAL" | "INCONSISTENT";
  bookSequence: number | null;
  bookSnapshotId: number | null;
  latestTradeId: string | null;
  latestLifecycleSequence: number | null;
  historySequence: number | null;
  capturedAt: number;
};

export type OrderFlowState = {
  identity: Readonly<OrderFlowIdentity>;
  book: Readonly<CanonicalL2Book> | null;
  bbo: Readonly<OrderFlowBbo> | null;
  trades: readonly Readonly<CanonicalTrade>[];
  liquidityLifecycle: readonly Readonly<LiquidityLifecycleEvent>[];
  historicalLiquidity: {
    latestFrame: Readonly<HistoricalLiquidityFrame> | null;
    bookAt: (time: number) => Readonly<HistoricalLiquidityFrame> | null;
  };
  quality: Readonly<OrderFlowQuality>;
  timestamps: Readonly<OrderFlowTimestamps>;
  provenance: Readonly<OrderFlowProvenance>;
  consistency: Readonly<OrderFlowConsistency>;
  capturedAt: number;
};

export type OrderFlowCompositionInput = {
  identity: OrderFlowIdentity;
  book: CanonicalL2Book | null;
  trades: readonly CanonicalTrade[];
  tradeQuality: CanonicalTradeQuality | "UNAVAILABLE";
  liquidityLifecycle: readonly LiquidityLifecycleEvent[];
  lifecycleQuality?: CanonicalL2Quality | "UNAVAILABLE";
  historicalLiquidity: HistoricalLiquidityTruth | null;
  capturedAt: number;
};

const unusableBook = new Set<CanonicalL2Quality>(["GAP", "RESYNCING", "DISCONNECTED"]);

function cloneBook(book: CanonicalL2Book): CanonicalL2Book {
  return { ...book, bids: book.bids.map((x) => ({ ...x })), asks: book.asks.map((x) => ({ ...x })), bbo: { ...book.bbo }, provenance: { ...book.provenance } };
}
function cloneTrade(trade: CanonicalTrade): CanonicalTrade { return { ...trade, provenance: { ...trade.provenance } }; }
function cloneLifecycle(event: LiquidityLifecycleEvent): LiquidityLifecycleEvent { return { ...event, provenance: { ...event.provenance } }; }
function cloneFrame(frame: HistoricalLiquidityFrame | null): HistoricalLiquidityFrame | null {
  return frame ? { ...frame, bids: frame.bids.map((x) => ({ ...x })), asks: frame.asks.map((x) => ({ ...x })), provenance: { ...frame.provenance } } : null;
}
function sameIdentity(a: OrderFlowIdentity, b: { instrument: string; venue: "Binance"; marketType: "Spot" | "Perpetual" }): boolean {
  return a.instrument === b.instrument && a.venue === b.venue && a.marketType === b.marketType;
}
function requireIdentity(identity: OrderFlowIdentity): void {
  if (!identity.instrument.trim() || !identity.venue || !identity.marketType) throw new Error("OrderFlowState requires complete market identity");
}
function assertIdentity(identity: OrderFlowIdentity, component: { instrument: string; venue: "Binance"; marketType: "Spot" | "Perpetual" }, name: string): void {
  if (!sameIdentity(identity, component)) throw new Error(`OrderFlowState ${name} identity mismatch`);
}
function deriveOverall(quality: OrderFlowQuality): OrderFlowOverallQuality {
  if (quality.book === "DISCONNECTED") return "DISCONNECTED";
  if (quality.book === "RESYNCING") return "RESYNCING";
  if (quality.book === "GAP") return "GAP";
  if (quality.book === "STALE" || quality.trades === "STALE") return "STALE";
  if (quality.book === "PARTIAL" || quality.trades !== "VALID" || quality.lifecycle !== "VALID" || quality.history === "UNAVAILABLE" || quality.history === "PARTIAL") return "PARTIAL";
  return "VALID";
}

export function composeOrderFlowState(input: OrderFlowCompositionInput): OrderFlowState {
  requireIdentity(input.identity);
  if (!Number.isFinite(input.capturedAt)) throw new Error("OrderFlowState requires finite capturedAt");
  if (input.book) assertIdentity(input.identity, input.book, "book");
  for (const trade of input.trades) assertIdentity(input.identity, trade, "trades");
  for (const event of input.liquidityLifecycle) assertIdentity(input.identity, event, "lifecycle");
  if (input.historicalLiquidity) assertIdentity(input.identity, input.historicalLiquidity.identity, "history");

  const book = input.book ? cloneBook(input.book) : null;
  const trades = input.trades.map(cloneTrade).sort((a, b) => (a.eventTime ?? Infinity) - (b.eventTime ?? Infinity) || a.tradeId.localeCompare(b.tradeId));
  const lifecycle = input.liquidityLifecycle.map(cloneLifecycle).sort((a, b) => (a.sequence ?? Infinity) - (b.sequence ?? Infinity) || (a.eventTime ?? Infinity) - (b.eventTime ?? Infinity));
  const latestFrame = input.historicalLiquidity ? cloneFrame(input.historicalLiquidity.bookAt(input.capturedAt)) : null;
  if (latestFrame) assertIdentity(input.identity, latestFrame, "history frame");

  const quality: OrderFlowQuality = {
    book: book?.quality ?? "UNAVAILABLE",
    trades: input.tradeQuality,
    lifecycle: input.lifecycleQuality ?? (lifecycle.length ? lifecycle.at(-1)!.quality : "UNAVAILABLE"),
    history: latestFrame?.quality ?? "UNAVAILABLE",
    overall: "PARTIAL",
  };
  quality.overall = deriveOverall(quality);

  const oldestTrade = trades[0] ?? null;
  const newestTrade = trades.at(-1) ?? null;
  const oldestLifecycle = lifecycle[0] ?? null;
  const newestLifecycle = lifecycle.at(-1) ?? null;
  const bbo = book && book.bbo.bid != null && book.bbo.ask != null && book.spread != null && book.mid != null
    ? { bid: book.bbo.bid, ask: book.bbo.ask, spread: book.spread, mid: book.mid }
    : null;

  const consistency: OrderFlowConsistency = {
    status: book && latestFrame && latestFrame.sequence != null && book.sequence != null && latestFrame.sequence !== book.sequence ? "PARTIAL" : "CONSISTENT",
    bookSequence: book?.sequence ?? null,
    bookSnapshotId: book?.snapshotId ?? null,
    latestTradeId: newestTrade?.tradeId ?? null,
    latestLifecycleSequence: newestLifecycle?.sequence ?? null,
    historySequence: latestFrame?.sequence ?? null,
    capturedAt: input.capturedAt,
  };

  const historicalOwner = input.historicalLiquidity;
  return {
    identity: { ...input.identity }, book, bbo, trades, liquidityLifecycle: lifecycle,
    historicalLiquidity: {
      latestFrame,
      bookAt: (time: number) => {
        const frame = historicalOwner ? cloneFrame(historicalOwner.bookAt(time)) : null;
        if (frame) assertIdentity(input.identity, frame, "history frame");
        return frame;
      },
    },
    quality,
    timestamps: {
      book: { eventTime: book?.eventTime ?? null, receiveTime: book?.receiveTime ?? null },
      trades: { oldestEventTime: oldestTrade?.eventTime ?? null, newestEventTime: newestTrade?.eventTime ?? null, latestReceiveTime: newestTrade?.receiveTime ?? null },
      lifecycle: { oldestEventTime: oldestLifecycle?.eventTime ?? null, newestEventTime: newestLifecycle?.eventTime ?? null, latestReceiveTime: newestLifecycle?.receiveTime ?? null },
      history: { latestEventTime: latestFrame?.eventTime ?? null, latestReceiveTime: latestFrame?.receiveTime ?? null },
    },
    provenance: {
      book: book?.provenance ?? null,
      trades: { source: newestTrade?.source ?? null, latest: newestTrade?.provenance ?? null },
      lifecycle: { source: newestLifecycle?.provenance.source ?? null, latest: newestLifecycle?.provenance ?? null },
      history: latestFrame?.provenance ?? null,
    },
    consistency,
    capturedAt: input.capturedAt,
  };
}
