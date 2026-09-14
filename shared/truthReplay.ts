import { CanonicalL2BookOwner, type CanonicalL2Book, type CanonicalL2Bbo, type CanonicalL2Quality } from "./canonicalL2Book";
import { LiquidityLifecycleProjector, type LiquidityLifecycleEvent } from "./liquidityLifecycle";
import { CanonicalTradeTape, type CanonicalTrade, type CanonicalTradeAggressorSide, type CanonicalTradeQuality } from "./canonicalTradeTape";
import { HistoricalLiquidityTruth, type HistoricalLiquidityFrame } from "./historicalLiquidityTruth";

export type TruthReplayIdentity = { instrument: string; venue: "Binance"; marketType: "Spot" | "Perpetual" };
export type TruthReplaySource = "rest" | "websocket";
export type TruthReplayQuality = CanonicalL2Quality | CanonicalTradeQuality;

type ReplayMeta = TruthReplayIdentity & { eventTime: number | null; receiveTime: number; quality: TruthReplayQuality; source: TruthReplaySource; provenance?: Record<string, unknown> };
type ReplayL2 = ReplayMeta & { bids: Array<{ price: number; quantity: number }>; asks: Array<{ price: number; quantity: number }>; sequence: number | null; snapshotId?: number | null; firstUpdateId?: number | null; previousUpdateId?: number | null };
type ReplayTrade = ReplayMeta & { tradeId: string; price: number; quantity: number; aggressorSide: CanonicalTradeAggressorSide };
type ReplayControl = ReplayMeta;

export type TruthReplayEvent =
  | (ReplayL2 & { type: "L2_SNAPSHOT" })
  | (ReplayL2 & { type: "RESNAPSHOT" })
  | (ReplayL2 & { type: "L2_DELTA" })
  | (ReplayTrade & { type: "TRADE" })
  | (ReplayControl & { type: "DISCONNECT" | "RECONNECT" | "RESYNC" })
  | (ReplayControl & { type: "ADVANCE_TIME" });

export type TruthReplayResult = {
  l2Book: CanonicalL2Book | null;
  bbo: CanonicalL2Bbo | null;
  lifecycleEvents: LiquidityLifecycleEvent[];
  tradeTape: CanonicalTrade[];
  historicalState: HistoricalLiquidityFrame | null;
};

type MarketState = {
  l2: CanonicalL2BookOwner;
  projector: LiquidityLifecycleProjector;
  history: HistoricalLiquidityTruth;
  previous: CanonicalL2Book;
};

function identityKey(identity: TruthReplayIdentity): string { return `${identity.instrument}|${identity.venue}|${identity.marketType}`; }
function sameIdentity(a: TruthReplayIdentity, b: TruthReplayIdentity): boolean { return identityKey(a) === identityKey(b); }
function cloneBook(book: CanonicalL2Book): CanonicalL2Book { return { ...book, bids: book.bids.map((x) => ({ ...x })), asks: book.asks.map((x) => ({ ...x })), bbo: { ...book.bbo }, provenance: { ...book.provenance } }; }
function cloneLifecycle(event: LiquidityLifecycleEvent): LiquidityLifecycleEvent { return { ...event, provenance: { ...event.provenance } }; }
function cloneTrade(trade: CanonicalTrade): CanonicalTrade { return { ...trade, provenance: { ...trade.provenance } }; }
function validIdentity(identity: TruthReplayIdentity): boolean { return identity.instrument.length > 0 && identity.venue === "Binance" && (identity.marketType === "Spot" || identity.marketType === "Perpetual"); }
function validTime(meta: ReplayMeta): boolean { return Number.isFinite(meta.receiveTime) && meta.receiveTime > 0 && (meta.eventTime == null || Number.isFinite(meta.eventTime)); }
function validLevels(levels: Array<{ price: number; quantity: number }>): boolean { return levels.every((x) => Number.isFinite(x.price) && x.price > 0 && Number.isFinite(x.quantity)); }
function eventTime(event: { eventTime: number | null; receiveTime: number }): number { return event.eventTime ?? event.receiveTime; }
function compareLifecycle(a: LiquidityLifecycleEvent, b: LiquidityLifecycleEvent): number { return (a.sequence != null && b.sequence != null ? a.sequence - b.sequence : 0) || eventTime(a) - eventTime(b) || a.side.localeCompare(b.side) || a.price - b.price; }
function compareTrade(a: CanonicalTrade, b: CanonicalTrade): number { return (a.eventTime ?? Number.POSITIVE_INFINITY) - (b.eventTime ?? Number.POSITIVE_INFINITY) || a.tradeId.localeCompare(b.tradeId); }
function canonicalLevels(levels: Array<{ price: number; quantity: number }>, descending: boolean) { return levels.map((x) => ({ ...x })).sort((a, b) => descending ? b.price - a.price : a.price - b.price); }

export function canonicalizeReplayResult(result: TruthReplayResult): TruthReplayResult {
  return {
    l2Book: result.l2Book ? { ...cloneBook(result.l2Book), bids: canonicalLevels(result.l2Book.bids, true), asks: canonicalLevels(result.l2Book.asks, false) } : null,
    bbo: result.bbo ? { ...result.bbo } : null,
    lifecycleEvents: result.lifecycleEvents.map(cloneLifecycle).sort(compareLifecycle),
    tradeTape: result.tradeTape.map(cloneTrade).sort(compareTrade),
    historicalState: result.historicalState ? { ...result.historicalState, bids: canonicalLevels(result.historicalState.bids, true), asks: canonicalLevels(result.historicalState.asks, false), provenance: { ...result.historicalState.provenance } } : null,
  };
}

export function replayTruth(events: readonly TruthReplayEvent[]): TruthReplayResult {
  const states = new Map<string, MarketState>();
  const tapes = new Map<string, CanonicalTradeTape>();
  const lifecycleEvents: LiquidityLifecycleEvent[] = [];
  let logicalTime = 0;
  let latestBook: CanonicalL2Book | null = null;
  let latestIdentity: TruthReplayIdentity | null = null;

  const stateFor = (identity: TruthReplayIdentity): MarketState => {
    const key = identityKey(identity); const existing = states.get(key); if (existing) return existing;
    const l2 = new CanonicalL2BookOwner(identity); const history = new HistoricalLiquidityTruth(identity); const initial = l2.getBook();
    const state = { l2, projector: new LiquidityLifecycleProjector(), history, previous: initial }; states.set(key, state); return state;
  };
  const tapeFor = (identity: TruthReplayIdentity): CanonicalTradeTape => {
    const key = identityKey(identity); const existing = tapes.get(key); if (existing) return existing;
    const tape = new CanonicalTradeTape(identity); tapes.set(key, tape); return tape;
  };
  const usableMeta = (event: ReplayMeta): boolean => validIdentity(event) && validTime(event);
  const cut = (state: MarketState, book: CanonicalL2Book): void => { state.history.addCheckpoint(book); state.previous = book; };

  for (const event of events) {
    if (!usableMeta(event)) continue;
    if (event.type === "ADVANCE_TIME") { logicalTime = eventTime(event); continue; }
    if (event.type === "TRADE") {
      if (event.quality !== "VALID" || !event.tradeId || !Number.isFinite(event.price) || event.price <= 0 || !Number.isFinite(event.quantity) || event.quantity <= 0) continue;
      tapeFor(event).ingest({ instrument: event.instrument, venue: event.venue, marketType: event.marketType, tradeId: event.tradeId, price: event.price, quantity: event.quantity, aggressorSide: event.aggressorSide, eventTime: event.eventTime, receiveTime: event.receiveTime, source: event.source, quality: event.quality });
      continue;
    }
    if (event.type === "L2_SNAPSHOT" || event.type === "RESNAPSHOT") {
      if (!validLevels(event.bids) || !validLevels(event.asks) || !Number.isInteger(event.sequence) || event.sequence < 0 || event.quality === "GAP" || event.quality === "RESYNCING" || event.quality === "DISCONNECTED") continue;
      const state = stateFor(event); const book = state.l2.applySnapshot({ bids: event.bids, asks: event.asks, sequence: event.sequence, snapshotId: event.snapshotId ?? event.sequence, eventTime: event.eventTime, receiveTime: event.receiveTime, source: event.source, quality: event.quality as CanonicalL2Quality });
      cut(state, book); latestBook = book; latestIdentity = event; continue;
    }
    if (event.type === "L2_DELTA") {
      if (!validLevels(event.bids) || !validLevels(event.asks) || !Number.isInteger(event.sequence) || event.sequence < 0) continue;
      const state = states.get(identityKey(event)); if (!state) continue;
      const result = state.l2.applyDelta({ bids: event.bids, asks: event.asks, sequence: event.sequence, eventTime: event.eventTime, receiveTime: event.receiveTime, source: event.source, quality: event.quality as CanonicalL2Quality, firstUpdateId: event.firstUpdateId, previousUpdateId: event.previousUpdateId });
      if (result.accepted) { const emitted = state.projector.project(state.previous, result.book); lifecycleEvents.push(...emitted.map(cloneLifecycle)); for (const lifecycle of emitted) state.history.addEvent(lifecycle); state.previous = result.book; latestBook = result.book; latestIdentity = event; } else if (result.reason === "GAP" || result.reason === "INVALID") cut(state, result.book);
      continue;
    }
    const state = states.get(identityKey(event)); if (!state) continue;
    if (event.type === "DISCONNECT") { const book = state.l2.markDisconnected(); cut(state, book); latestBook = book; latestIdentity = event; }
    else if (event.type === "RESYNC") { const book = state.l2.markResyncing(); cut(state, book); latestBook = book; latestIdentity = event; }
    else if (event.type === "RECONNECT") { /* Reconnect alone never restores continuity. */ }
  }

  const historicalState = latestIdentity ? states.get(identityKey(latestIdentity))?.history.bookAt(logicalTime) ?? null : null;
  const tradeTape = [...tapes.values()].flatMap((tape) => tape.getTrades()).sort(compareTrade);
  const result: TruthReplayResult = { l2Book: latestBook ? cloneBook(latestBook) : null, bbo: latestBook ? { ...latestBook.bbo } : null, lifecycleEvents: lifecycleEvents.map(cloneLifecycle), tradeTape, historicalState };
  return canonicalizeReplayResult(result);
}
