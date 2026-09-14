import type { CanonicalL2Quality } from "./canonicalL2Book";
import type { CanonicalTrade, CanonicalTradeQuality } from "./canonicalTradeTape";
import type { LiquidityLifecycleEvent } from "./liquidityLifecycle";
import type { OrderFlowIdentity, OrderFlowState } from "./orderFlowState";

export type OrderFlowFeatureWindow = {
  startTime: number;
  endTime: number;
  startSequence?: number | null;
  endSequence?: number | null;
  maxEvents?: number;
  depthLevels?: number;
  priceBand?: { low: number; high: number };
};

export type OrderFlowFeatureConfig = { window: Readonly<OrderFlowFeatureWindow> };
export type FeatureAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
export type FeatureSource = "book" | "trades" | "lifecycle" | "history";
export type FeatureUnit = "quantity" | "count" | "ratio" | "per-second" | "milliseconds" | "price";

export type FeatureEvidence = {
  metric: string;
  value: number | string | boolean | null;
  unit: FeatureUnit;
  window: Readonly<OrderFlowFeatureWindow>;
  source: FeatureSource;
  provenance: unknown;
};

export type DerivedMetric<T> = {
  value: T | null;
  availability: FeatureAvailability;
  evidence: readonly FeatureEvidence[];
};

export type PersistenceObservation = {
  side: "bid" | "ask";
  price: number;
  firstSeenTime: number | null;
  lastSeenTime: number | null;
  observedLifetime: number | null;
  reappearanceCount: number;
  quantityPersistence: number;
};

export type OrderFlowFeatures = {
  identity: Readonly<OrderFlowIdentity>;
  window: Readonly<OrderFlowFeatureWindow>;
  derived: {
    totalVolume: DerivedMetric<number>;
    aggressiveBuyVolume: DerivedMetric<number>;
    aggressiveSellVolume: DerivedMetric<number>;
    delta: DerivedMetric<number>;
    cvd: DerivedMetric<readonly number[]>;
    tradeCount: DerivedMetric<number>;
    tradeVelocity: DerivedMetric<number>;
    volumeVelocity: DerivedMetric<number>;
    aggressiveBuyVelocity: DerivedMetric<number>;
    aggressiveSellVelocity: DerivedMetric<number>;
    bookImbalance: DerivedMetric<number>;
    tradeImbalance: DerivedMetric<number>;
    bidDepth: DerivedMetric<number>;
    askDepth: DerivedMetric<number>;
    liquidityAdded: DerivedMetric<number>;
    liquidityRemoved: DerivedMetric<number>;
    bidAdded: DerivedMetric<number>;
    askAdded: DerivedMetric<number>;
    bidRemoved: DerivedMetric<number>;
    askRemoved: DerivedMetric<number>;
    liquidityAddRate: DerivedMetric<number>;
    liquidityRemoveRate: DerivedMetric<number>;
    persistence: DerivedMetric<readonly PersistenceObservation[]>;
  };
  quality: Readonly<OrderFlowState["quality"]>;
  timestamps: Readonly<OrderFlowState["timestamps"]>;
  provenance: Readonly<OrderFlowState["provenance"]>;
};

const unusableBook = new Set<CanonicalL2Quality | "UNAVAILABLE">(["GAP", "RESYNCING", "DISCONNECTED", "UNAVAILABLE"]);
const degradedTrade = new Set<CanonicalTradeQuality | "UNAVAILABLE">(["DISCONNECTED", "RESYNCING", "UNAVAILABLE"]);
const degradedLifecycle = new Set<CanonicalL2Quality | "UNAVAILABLE">(["GAP", "RESYNCING", "DISCONNECTED", "UNAVAILABLE"]);

function eventTime(value: { eventTime: number | null; receiveTime: number }): number { return value.eventTime ?? value.receiveTime; }
function compareTrades(a: CanonicalTrade, b: CanonicalTrade): number { return eventTime(a) - eventTime(b) || a.tradeId.localeCompare(b.tradeId); }
function compareLifecycle(a: LiquidityLifecycleEvent, b: LiquidityLifecycleEvent): number {
  return (a.sequence != null && b.sequence != null ? a.sequence - b.sequence : 0) || eventTime(a) - eventTime(b) || (a.sequence == null ? "" : String(a.sequence)).localeCompare(b.sequence == null ? "" : String(b.sequence)) || a.side.localeCompare(b.side) || a.price - b.price;
}
function evidence(metric: string, value: number | string | boolean | null, unit: FeatureUnit, window: Readonly<OrderFlowFeatureWindow>, source: FeatureSource, provenance: unknown): FeatureEvidence[] {
  return [{ metric, value, unit, window: { ...window, priceBand: window.priceBand ? { ...window.priceBand } : undefined }, source, provenance }];
}
function available<T>(value: T, metric: string, unit: FeatureUnit, window: Readonly<OrderFlowFeatureWindow>, source: FeatureSource, provenance: unknown, availability: FeatureAvailability = "AVAILABLE"): DerivedMetric<T> {
  return { value, availability, evidence: evidence(metric, typeof value === "number" || typeof value === "string" || typeof value === "boolean" ? value : null, unit, window, source, provenance) };
}
function unavailable<T>(metric: string, unit: FeatureUnit, window: Readonly<OrderFlowFeatureWindow>, source: FeatureSource, provenance: unknown, availability: FeatureAvailability = "UNAVAILABLE"): DerivedMetric<T> {
  return { value: null, availability, evidence: evidence(metric, null, unit, window, source, provenance) };
}
function validateWindow(window: Readonly<OrderFlowFeatureWindow>): void {
  if (!Number.isFinite(window.startTime) || !Number.isFinite(window.endTime) || window.endTime <= window.startTime) throw new Error("OrderFlowFeatureWindow duration must be positive");
  if (window.maxEvents != null && (!Number.isInteger(window.maxEvents) || window.maxEvents <= 0)) throw new Error("Invalid maxEvents");
  if (window.depthLevels != null && (!Number.isInteger(window.depthLevels) || window.depthLevels <= 0)) throw new Error("Invalid depthLevels");
  if (window.priceBand && (!(window.priceBand.low <= window.priceBand.high) || !Number.isFinite(window.priceBand.low) || !Number.isFinite(window.priceBand.high))) throw new Error("Invalid priceBand");
}
function inWindow(time: number, window: Readonly<OrderFlowFeatureWindow>): boolean { return time >= window.startTime && time <= window.endTime; }
function inSequence(sequence: number | null, window: Readonly<OrderFlowFeatureWindow>): boolean { return window.startSequence == null || (sequence != null && sequence >= window.startSequence && (window.endSequence == null || sequence <= window.endSequence)); }
function scopedLevels(levels: readonly { price: number; quantity: number }[], window: Readonly<OrderFlowFeatureWindow>, descending: boolean): readonly { price: number; quantity: number }[] {
  let result = [...levels].sort((a, b) => descending ? b.price - a.price : a.price - b.price);
  if (window.priceBand) result = result.filter((level) => level.price >= window.priceBand!.low && level.price <= window.priceBand!.high);
  if (window.depthLevels != null) result = result.slice(0, window.depthLevels);
  return result;
}
function metricPair<T>(value: T, metric: string, unit: FeatureUnit, window: Readonly<OrderFlowFeatureWindow>, source: FeatureSource, provenance: unknown, partial: boolean): DerivedMetric<T> { return available(value, metric, unit, window, source, provenance, partial ? "PARTIAL" : "AVAILABLE"); }
function cloneTimestamps(timestamps: OrderFlowState["timestamps"]): OrderFlowState["timestamps"] {
  return { book: { ...timestamps.book }, trades: { ...timestamps.trades }, lifecycle: { ...timestamps.lifecycle }, history: { ...timestamps.history } };
}
function cloneProvenance(provenance: OrderFlowState["provenance"]): OrderFlowState["provenance"] {
  return { book: provenance.book ? { ...provenance.book } : null, trades: { source: provenance.trades.source, latest: provenance.trades.latest ? { ...provenance.trades.latest } : null }, lifecycle: { source: provenance.lifecycle.source, latest: provenance.lifecycle.latest ? { ...provenance.lifecycle.latest } : null }, history: provenance.history ? { ...provenance.history } : null };
}

export function computeOrderFlowFeatures(state: Readonly<OrderFlowState>, config: Readonly<OrderFlowFeatureConfig>): OrderFlowFeatures {
  validateWindow(config.window);
  const window = { ...config.window, priceBand: config.window.priceBand ? { ...config.window.priceBand } : undefined };
  const durationSeconds = (window.endTime - window.startTime) / 1000;
  const tradeUsable = !degradedTrade.has(state.quality.trades);
  const lifecycleUsable = !degradedLifecycle.has(state.quality.lifecycle);
  const bookUsable = state.book != null && !unusableBook.has(state.quality.book) && !unusableBook.has(state.book.quality);
  const trades = tradeUsable ? state.trades.filter((trade) => inWindow(eventTime(trade), window) && inSequence(null, window)).sort(compareTrades).slice(0, window.maxEvents) : [];
  const lifecycle = lifecycleUsable ? state.liquidityLifecycle.filter((event) => inWindow(eventTime(event), window) && inSequence(event.sequence, window)).sort(compareLifecycle).slice(0, window.maxEvents) : [];
  const tradePartial = state.quality.trades !== "VALID";
  const lifePartial = state.quality.lifecycle !== "VALID";
  const tradeSource = state.provenance.trades;
  const lifeSource = state.provenance.lifecycle;
  const bookSource = state.provenance.book;

  let buy = 0; let sell = 0;
  for (const trade of trades) trade.aggressorSide === "BUY" ? buy += trade.quantity : sell += trade.quantity;
  const total = buy + sell; const delta = buy - sell;
  const cvdValues: number[] = []; let cvd = 0;
  for (const trade of trades) { cvd += trade.aggressorSide === "BUY" ? trade.quantity : -trade.quantity; cvdValues.push(cvd); }
  const tradeUnavailable = !tradeUsable || (state.trades.length === 0);

  const tradeMetric = <T>(value: T, name: string, unit: FeatureUnit = "quantity"): DerivedMetric<T> => tradeUnavailable ? unavailable<T>(name, unit, window, "trades", tradeSource) : metricPair(value, name, unit, window, "trades", tradeSource, tradePartial);
  const tradeCount = tradeUnavailable ? unavailable<number>("tradeCount", "count", window, "trades", tradeSource) : metricPair(trades.length, "tradeCount", "count", window, "trades", tradeSource, tradePartial);
  const velocity = (value: number, name: string): DerivedMetric<number> => tradeUnavailable ? unavailable<number>(name, "per-second", window, "trades", tradeSource) : metricPair(value / durationSeconds, name, "per-second", window, "trades", tradeSource, tradePartial);

  let bidDepth = 0; let askDepth = 0;
  let bidDepthMetric: DerivedMetric<number>; let askDepthMetric: DerivedMetric<number>; let bookImbalance: DerivedMetric<number>;
  if (!bookUsable || (window.depthLevels == null && !window.priceBand)) {
    bidDepthMetric = unavailable("bidDepth", "quantity", window, "book", bookSource);
    askDepthMetric = unavailable("askDepth", "quantity", window, "book", bookSource);
    bookImbalance = unavailable("bookImbalance", "ratio", window, "book", bookSource);
  } else {
    const bids = scopedLevels(state.book!.bids, window, true); const asks = scopedLevels(state.book!.asks, window, false);
    bidDepth = bids.reduce((sum, level) => sum + level.quantity, 0); askDepth = asks.reduce((sum, level) => sum + level.quantity, 0);
    const denominator = bidDepth + askDepth;
    bidDepthMetric = available(bidDepth, "bidDepth", "quantity", window, "book", bookSource);
    askDepthMetric = available(askDepth, "askDepth", "quantity", window, "book", bookSource);
    bookImbalance = denominator > 0 ? available((bidDepth - askDepth) / denominator, "bookImbalance", "ratio", window, "book", bookSource) : unavailable("bookImbalance", "ratio", window, "book", bookSource);
  }
  const tradeDenominator = total;
  const tradeImbalance = tradeUnavailable ? unavailable("tradeImbalance", "ratio", window, "trades", tradeSource) : (tradeDenominator > 0 ? metricPair(delta / tradeDenominator, "tradeImbalance", "ratio", window, "trades", tradeSource, tradePartial) : metricPair(0, "tradeImbalance", "ratio", window, "trades", tradeSource, tradePartial));

  let added = 0; let removed = 0; let bidAdded = 0; let askAdded = 0; let bidRemoved = 0; let askRemoved = 0;
  for (const event of lifecycle) {
    if ((event.eventType === "ADD" || event.eventType === "UPDATE") && event.deltaQuantity > 0) { added += event.deltaQuantity; if (event.side === "bid") bidAdded += event.deltaQuantity; else askAdded += event.deltaQuantity; }
    if ((event.eventType === "DECREASE" || event.eventType === "REMOVE") && event.deltaQuantity < 0) { const amount = -event.deltaQuantity; removed += amount; if (event.side === "bid") bidRemoved += amount; else askRemoved += amount; }
  }
  const lifecycleMetric = (value: number, name: string, unit: FeatureUnit = "quantity"): DerivedMetric<number> => !lifecycleUsable || lifecycle.length === 0 ? unavailable(name, unit, window, "lifecycle", lifeSource) : metricPair(value, name, unit, window, "lifecycle", lifeSource, lifePartial);

  const historyStart = state.historicalLiquidity.bookAt(window.startTime);
  const historyEnd = state.historicalLiquidity.bookAt(window.endTime);
  const persistence = state.quality.history === "UNAVAILABLE" || (!historyStart && !historyEnd)
    ? unavailable<readonly PersistenceObservation[]>("persistence", "milliseconds", window, "history", state.provenance.history)
    : (() => {
        const groups = new Map<string, PersistenceObservation>();
        for (const event of lifecycle) {
          const key = `${event.side}|${event.price}`; const time = eventTime(event); const existing = groups.get(key);
          const positive = event.eventType === "ADD" || event.eventType === "UPDATE";
          if (!existing) groups.set(key, { side: event.side, price: event.price, firstSeenTime: time, lastSeenTime: time, observedLifetime: 0, reappearanceCount: positive ? 1 : 0, quantityPersistence: Math.max(0, event.newQuantity) });
          else { existing.lastSeenTime = time; existing.observedLifetime = time - (existing.firstSeenTime ?? time); if (positive) existing.reappearanceCount += 1; existing.quantityPersistence += Math.max(0, event.newQuantity); }
        }
        return available([...groups.values()].sort((a, b) => a.side.localeCompare(b.side) || a.price - b.price), "persistence", "milliseconds", window, "history", state.provenance.history);
      })();

  return {
    identity: { ...state.identity }, window,
    derived: {
      totalVolume: tradeMetric(total, "totalVolume"), aggressiveBuyVolume: tradeMetric(buy, "aggressiveBuyVolume"), aggressiveSellVolume: tradeMetric(sell, "aggressiveSellVolume"), delta: tradeMetric(delta, "delta"), cvd: tradeUnavailable ? unavailable("cvd", "quantity", window, "trades", tradeSource) : metricPair(cvdValues, "cvd", "quantity", window, "trades", tradeSource, tradePartial), tradeCount,
      tradeVelocity: velocity(trades.length, "tradeVelocity"), volumeVelocity: velocity(total, "volumeVelocity"), aggressiveBuyVelocity: velocity(buy, "aggressiveBuyVelocity"), aggressiveSellVelocity: velocity(sell, "aggressiveSellVelocity"),
      bookImbalance, tradeImbalance, bidDepth: bidDepthMetric, askDepth: askDepthMetric,
      liquidityAdded: lifecycleMetric(added, "liquidityAdded"), liquidityRemoved: lifecycleMetric(removed, "liquidityRemoved"), bidAdded: lifecycleMetric(bidAdded, "bidAdded"), askAdded: lifecycleMetric(askAdded, "askAdded"), bidRemoved: lifecycleMetric(bidRemoved, "bidRemoved"), askRemoved: lifecycleMetric(askRemoved, "askRemoved"), liquidityAddRate: lifecycleMetric(added / durationSeconds, "liquidityAddRate", "per-second"), liquidityRemoveRate: lifecycleMetric(removed / durationSeconds, "liquidityRemoveRate", "per-second"), persistence,
    }, quality: { ...state.quality }, timestamps: cloneTimestamps(state.timestamps), provenance: cloneProvenance(state.provenance),
  };
}
