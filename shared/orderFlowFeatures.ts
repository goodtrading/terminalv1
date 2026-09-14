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
  priceBand?:
    | { mode: "absolute"; minPrice: number; maxPrice: number }
    | { mode: "relativeToMid"; minDistance: number; maxDistance: number };
  sampleTimes?: readonly number[];
};

export type OrderFlowFeatureConfig = { window: Readonly<OrderFlowFeatureWindow> };
export type FeatureAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
export type FeatureSource = "book" | "trades" | "lifecycle" | "history";
export type FeatureUnit = "quantity" | "count" | "ratio" | "per-second" | "milliseconds" | "price";
export type SequenceContinuity = "CONTIGUOUS" | "PARTIAL" | "UNAVAILABLE";

export type FeatureEvidence = {
  metric: string;
  value: number | string | boolean | null;
  unit: FeatureUnit;
  window: Readonly<OrderFlowFeatureWindow>;
  source: FeatureSource;
  provenance: unknown;
  priceBand?: OrderFlowFeatureWindow["priceBand"];
  depthRange?: { depthLevels?: number; priceBand?: OrderFlowFeatureWindow["priceBand"] };
  sequenceRange?: { startSequence: number | null; endSequence: number | null };
  sampleTimes?: readonly number[];
  sampleCount?: number;
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
  firstObservedTime: number | null;
  lastObservedTime: number | null;
  observedLifetime: number | null;
  reappearanceCount: number;
  quantityPersistence: number;
  presenceEventCount: number;
  disappearanceCount: number;
  presenceRatio?: number | null;
};

export type TemporalObservation<T> = {
  time: number;
  value: T | null;
  quality: OrderFlowState["quality"]["history"];
  provenance: OrderFlowState["provenance"]["history"];
};

export type SequenceCoverage = {
  startSequence: number | null;
  endSequence: number | null;
  observedEvents: number;
  continuity: SequenceContinuity;
};

export type LiquidityReappearanceObservation = {
  side: "bid" | "ask";
  price: number;
  reappearanceCount: number;
  reappearedQuantity: number;
  firstRemovalTime: number | null;
  firstReappearanceTime: number | null;
  delayToReappearance: number | null;
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
    bidLevelCount: DerivedMetric<number>;
    askLevelCount: DerivedMetric<number>;
    nearestBidDistance: DerivedMetric<number>;
    nearestAskDistance: DerivedMetric<number>;
    startMid: DerivedMetric<number>;
    endMid: DerivedMetric<number>;
    absolutePriceChange: DerivedMetric<number>;
    signedPriceChange: DerivedMetric<number>;
    priceRange: DerivedMetric<number>;
    midSeries: DerivedMetric<readonly TemporalObservation<number>[]>;
    spreadSeries: DerivedMetric<readonly TemporalObservation<number>[]>;
    bidDepthSeries: DerivedMetric<readonly TemporalObservation<number>[]>;
    askDepthSeries: DerivedMetric<readonly TemporalObservation<number>[]>;
    levelCountSeries: DerivedMetric<readonly TemporalObservation<number>[]>;
    interactionTradeCount: DerivedMetric<number>;
    interactionVolume: DerivedMetric<number>;
    aggressiveBuyInteractionVolume: DerivedMetric<number>;
    aggressiveSellInteractionVolume: DerivedMetric<number>;
    firstInteractionTime: DerivedMetric<number>;
    lastInteractionTime: DerivedMetric<number>;
    liquidityReappearance: DerivedMetric<readonly LiquidityReappearanceObservation[]>;
    sequenceCoverage: DerivedMetric<SequenceCoverage>;
    additionEventCount: DerivedMetric<number>;
    removalEventCount: DerivedMetric<number>;
    positiveUpdateCount: DerivedMetric<number>;
    decreaseCount: DerivedMetric<number>;
    removeCount: DerivedMetric<number>;
    netLiquidityChange: DerivedMetric<number>;
    bidNetLiquidityChange: DerivedMetric<number>;
    askNetLiquidityChange: DerivedMetric<number>;
  };
  quality: Readonly<OrderFlowState["quality"]>;
  timestamps: Readonly<OrderFlowState["timestamps"]>;
  provenance: Readonly<OrderFlowState["provenance"]>;
};

const unusableBook = new Set<CanonicalL2Quality | "UNAVAILABLE">(["GAP", "RESYNCING", "DISCONNECTED", "UNAVAILABLE"]);
const degradedTrade = new Set<CanonicalTradeQuality | "UNAVAILABLE">(["DISCONNECTED", "RESYNCING", "UNAVAILABLE"]);
const degradedLifecycle = new Set<CanonicalL2Quality | "UNAVAILABLE">(["GAP", "RESYNCING", "DISCONNECTED", "UNAVAILABLE"]);
const unusableHistory = new Set<CanonicalL2Quality | "UNAVAILABLE">(["GAP", "RESYNCING", "DISCONNECTED", "UNAVAILABLE"]);

function eventTime(value: { eventTime: number | null; receiveTime: number }): number { return value.eventTime ?? value.receiveTime; }
function compareTrades(a: CanonicalTrade, b: CanonicalTrade): number { return eventTime(a) - eventTime(b) || a.tradeId.localeCompare(b.tradeId); }
function compareLifecycle(a: LiquidityLifecycleEvent, b: LiquidityLifecycleEvent): number {
  return (a.sequence != null && b.sequence != null ? a.sequence - b.sequence : 0) || eventTime(a) - eventTime(b) || (a.sequence == null ? "" : String(a.sequence)).localeCompare(b.sequence == null ? "" : String(b.sequence)) || a.side.localeCompare(b.side) || a.price - b.price;
}
function evidence(metric: string, value: number | string | boolean | null, unit: FeatureUnit, window: Readonly<OrderFlowFeatureWindow>, source: FeatureSource, provenance: unknown, extra: Partial<FeatureEvidence> = {}): FeatureEvidence[] {
  return [{ metric, value, unit, window: { ...window, priceBand: window.priceBand ? { ...window.priceBand } : undefined }, source, provenance, ...extra }];
}
function available<T>(value: T, metric: string, unit: FeatureUnit, window: Readonly<OrderFlowFeatureWindow>, source: FeatureSource, provenance: unknown, availability: FeatureAvailability = "AVAILABLE", extra: Partial<FeatureEvidence> = {}): DerivedMetric<T> {
  return { value, availability, evidence: evidence(metric, typeof value === "number" || typeof value === "string" || typeof value === "boolean" ? value : null, unit, window, source, provenance, extra) };
}
function unavailable<T>(metric: string, unit: FeatureUnit, window: Readonly<OrderFlowFeatureWindow>, source: FeatureSource, provenance: unknown, availability: FeatureAvailability = "UNAVAILABLE", extra: Partial<FeatureEvidence> = {}): DerivedMetric<T> {
  return { value: null, availability, evidence: evidence(metric, null, unit, window, source, provenance, extra) };
}
function validateWindow(window: Readonly<OrderFlowFeatureWindow>): void {
  if (!Number.isFinite(window.startTime) || !Number.isFinite(window.endTime) || window.endTime <= window.startTime) throw new Error("OrderFlowFeatureWindow duration must be positive");
  if (window.maxEvents != null && (!Number.isInteger(window.maxEvents) || window.maxEvents <= 0)) throw new Error("Invalid maxEvents");
  if (window.depthLevels != null && (!Number.isInteger(window.depthLevels) || window.depthLevels <= 0)) throw new Error("Invalid depthLevels");
  if (window.priceBand) {
    const band = window.priceBand;
    const values = band.mode === "absolute" ? [band.minPrice, band.maxPrice] : [band.minDistance, band.maxDistance];
    if (values.some((value) => !Number.isFinite(value) || value <= 0) || values[0]! > values[1]!) throw new Error("Invalid priceBand");
  }
  if (window.sampleTimes?.some((time) => !Number.isFinite(time) || time < window.startTime || time > window.endTime)) throw new Error("sampleTimes must be within window");
}
function inWindow(time: number, window: Readonly<OrderFlowFeatureWindow>): boolean { return time >= window.startTime && time <= window.endTime; }
function inSequence(sequence: number | null, window: Readonly<OrderFlowFeatureWindow>): boolean { return window.startSequence == null || (sequence != null && sequence >= window.startSequence && (window.endSequence == null || sequence <= window.endSequence)); }
function levelInBand(price: number, band: NonNullable<OrderFlowFeatureWindow["priceBand"]>, mid: number | null): boolean {
  if (band.mode === "absolute") return price >= band.minPrice && price <= band.maxPrice;
  if (mid == null || !Number.isFinite(mid)) return false;
  const distance = Math.abs(price - mid);
  return distance >= band.minDistance && distance <= band.maxDistance;
}
function scopedLevels(levels: readonly { price: number; quantity: number }[], window: Readonly<OrderFlowFeatureWindow>, descending: boolean, mid: number | null): readonly { price: number; quantity: number }[] {
  let result = [...levels].sort((a, b) => descending ? b.price - a.price : a.price - b.price);
  if (window.priceBand) result = result.filter((level) => levelInBand(level.price, window.priceBand!, mid));
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
function frameMid(frame: { bids: readonly { price: number }[]; asks: readonly { price: number }[] }): number | null {
  const bid = [...frame.bids].sort((a, b) => b.price - a.price)[0]?.price;
  const ask = [...frame.asks].sort((a, b) => a.price - b.price)[0]?.price;
  return bid != null && ask != null && bid < ask ? (bid + ask) / 2 : null;
}
function frameSpread(frame: { bids: readonly { price: number }[]; asks: readonly { price: number }[] }): number | null {
  const bid = [...frame.bids].sort((a, b) => b.price - a.price)[0]?.price;
  const ask = [...frame.asks].sort((a, b) => a.price - b.price)[0]?.price;
  return bid != null && ask != null && bid < ask ? ask - bid : null;
}
function sampleTimesFor(window: Readonly<OrderFlowFeatureWindow>): number[] { return [...new Set(window.sampleTimes ?? [])].sort((a, b) => a - b); }

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
  const scopeExtra: Partial<FeatureEvidence> = { priceBand: window.priceBand, depthRange: { depthLevels: window.depthLevels, priceBand: window.priceBand }, sequenceRange: { startSequence: window.startSequence ?? null, endSequence: window.endSequence ?? null }, sampleTimes: sampleTimesFor(window), sampleCount: sampleTimesFor(window).length };
  let bidDepthMetric: DerivedMetric<number>; let askDepthMetric: DerivedMetric<number>; let bookImbalance: DerivedMetric<number>;
  const relativeBandNeedsMid = window.priceBand?.mode === "relativeToMid" && state.book?.mid == null;
  if (!bookUsable || relativeBandNeedsMid || (window.depthLevels == null && !window.priceBand)) {
    bidDepthMetric = unavailable("bidDepth", "quantity", window, "book", bookSource);
    askDepthMetric = unavailable("askDepth", "quantity", window, "book", bookSource);
    bookImbalance = unavailable("bookImbalance", "ratio", window, "book", bookSource);
  } else {
    const bids = scopedLevels(state.book!.bids, window, true, state.book!.mid); const asks = scopedLevels(state.book!.asks, window, false, state.book!.mid);
    bidDepth = bids.reduce((sum, level) => sum + level.quantity, 0); askDepth = asks.reduce((sum, level) => sum + level.quantity, 0);
    const denominator = bidDepth + askDepth;
    bidDepthMetric = available(bidDepth, "bidDepth", "quantity", window, "book", bookSource, "AVAILABLE", scopeExtra);
    askDepthMetric = available(askDepth, "askDepth", "quantity", window, "book", bookSource, "AVAILABLE", scopeExtra);
    bookImbalance = denominator > 0 ? available((bidDepth - askDepth) / denominator, "bookImbalance", "ratio", window, "book", bookSource, "AVAILABLE", scopeExtra) : unavailable("bookImbalance", "ratio", window, "book", bookSource, "UNAVAILABLE", scopeExtra);
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
          if (!existing) groups.set(key, { side: event.side, price: event.price, firstSeenTime: time, lastSeenTime: time, firstObservedTime: time, lastObservedTime: time, observedLifetime: 0, reappearanceCount: positive ? 1 : 0, quantityPersistence: Math.max(0, event.newQuantity), presenceEventCount: positive ? 1 : 0, disappearanceCount: event.eventType === "REMOVE" ? 1 : 0 });
          else { existing.lastSeenTime = time; existing.lastObservedTime = time; existing.observedLifetime = time - (existing.firstSeenTime ?? time); if (positive) { existing.reappearanceCount += 1; existing.presenceEventCount += 1; } if (event.eventType === "REMOVE") existing.disappearanceCount += 1; existing.quantityPersistence += Math.max(0, event.newQuantity); }
        }
        return available([...groups.values()].sort((a, b) => a.side.localeCompare(b.side) || a.price - b.price), "persistence", "milliseconds", window, "history", state.provenance.history);
      })();

  const bookMetric = (value: number, name: string, unit: FeatureUnit = "quantity"): DerivedMetric<number> => !bookUsable ? unavailable(name, unit, window, "book", bookSource, "UNAVAILABLE", scopeExtra) : available(value, name, unit, window, "book", bookSource, "AVAILABLE", scopeExtra);
  const bookLevelsBid = bookUsable ? scopedLevels(state.book!.bids, window, true, state.book!.mid) : [];
  const bookLevelsAsk = bookUsable ? scopedLevels(state.book!.asks, window, false, state.book!.mid) : [];
  const bidLevelCount = bookUsable ? bookMetric(bookLevelsBid.length, "bidLevelCount", "count") : unavailable("bidLevelCount", "count", window, "book", bookSource, "UNAVAILABLE", scopeExtra);
  const askLevelCount = bookUsable ? bookMetric(bookLevelsAsk.length, "askLevelCount", "count") : unavailable("askLevelCount", "count", window, "book", bookSource, "UNAVAILABLE", scopeExtra);
  const nearestBidDistance = bookUsable && state.book!.mid != null && bookLevelsBid[0] ? bookMetric(state.book!.mid - bookLevelsBid[0].price, "nearestBidDistance", "price") : unavailable("nearestBidDistance", "price", window, "book", bookSource, "UNAVAILABLE", scopeExtra);
  const nearestAskDistance = bookUsable && state.book!.mid != null && bookLevelsAsk[0] ? bookMetric(bookLevelsAsk[0].price - state.book!.mid, "nearestAskDistance", "price") : unavailable("nearestAskDistance", "price", window, "book", bookSource, "UNAVAILABLE", scopeExtra);
  const startFrame = state.historicalLiquidity.bookAt(window.startTime);
  const endFrame = state.historicalLiquidity.bookAt(window.endTime);
  const startMidValue = startFrame ? frameMid(startFrame) : null;
  const endMidValue = endFrame ? frameMid(endFrame) : (bookUsable ? state.book!.mid : null);
  const historyUsable = !unusableHistory.has(state.quality.history);
  const priceMetric = (value: number | null, name: string): DerivedMetric<number> => !historyUsable || value == null ? unavailable(name, "price", window, "history", state.provenance.history, "UNAVAILABLE", scopeExtra) : available(value, name, "price", window, "history", state.provenance.history, "AVAILABLE", scopeExtra);
  const startMid = priceMetric(startMidValue, "startMid");
  const endMid = priceMetric(endMidValue, "endMid");
  const signedPriceChange = startMidValue != null && endMidValue != null ? priceMetric(endMidValue - startMidValue, "signedPriceChange") : unavailable("signedPriceChange", "price", window, "history", state.provenance.history, "UNAVAILABLE", scopeExtra);
  const absolutePriceChange = signedPriceChange.value == null ? unavailable("absolutePriceChange", "price", window, "history", state.provenance.history, "UNAVAILABLE", scopeExtra) : priceMetric(Math.abs(signedPriceChange.value), "absolutePriceChange");
  const samples = sampleTimesFor(window);
  const frames = samples.map((time) => ({ time, frame: state.historicalLiquidity.bookAt(time) }));
  const temporal = <T>(name: string, values: readonly TemporalObservation<T>[]): DerivedMetric<readonly TemporalObservation<T>[]> => {
    if (samples.length === 0) return unavailable(name, "count", window, "history", state.provenance.history, "UNAVAILABLE", scopeExtra);
    const missing = values.some((point) => point.value == null);
    return available(values, name, "count", window, "history", state.provenance.history, missing ? "PARTIAL" : "AVAILABLE", { ...scopeExtra, sampleTimes: samples, sampleCount: samples.length });
  };
  const midSeries = temporal("midSeries", frames.map(({ time, frame }) => ({ time, value: frame ? frameMid(frame) : null, quality: frame?.quality ?? "UNAVAILABLE", provenance: frame?.provenance ?? null })));
  const spreadSeries = temporal("spreadSeries", frames.map(({ time, frame }) => ({ time, value: frame ? frameSpread(frame) : null, quality: frame?.quality ?? "UNAVAILABLE", provenance: frame?.provenance ?? null })));
  const bidDepthSeries = temporal("bidDepthSeries", frames.map(({ time, frame }) => ({ time, value: frame ? scopedLevels(frame.bids, window, true, frameMid(frame)).reduce((sum, level) => sum + level.quantity, 0) : null, quality: frame?.quality ?? "UNAVAILABLE", provenance: frame?.provenance ?? null })));
  const askDepthSeries = temporal("askDepthSeries", frames.map(({ time, frame }) => ({ time, value: frame ? scopedLevels(frame.asks, window, false, frameMid(frame)).reduce((sum, level) => sum + level.quantity, 0) : null, quality: frame?.quality ?? "UNAVAILABLE", provenance: frame?.provenance ?? null })));
  const levelCountSeries = temporal("levelCountSeries", frames.map(({ time, frame }) => ({ time, value: frame ? scopedLevels(frame.bids, window, true, frameMid(frame)).length + scopedLevels(frame.asks, window, false, frameMid(frame)).length : null, quality: frame?.quality ?? "UNAVAILABLE", provenance: frame?.provenance ?? null })));
  const sampleMids = frames.map(({ frame }) => frame ? frameMid(frame) : null).filter((value): value is number => value != null);
  const priceRange = samples.length > 0 && sampleMids.length === samples.length ? priceMetric(Math.max(...sampleMids) - Math.min(...sampleMids), "priceRange") : unavailable<number>("priceRange", "price", window, "history", state.provenance.history, "UNAVAILABLE", scopeExtra);
  if (persistence.value && samples.length > 0) {
    for (const observation of persistence.value) {
      const usableFrames = frames.filter(({ frame }) => frame && !unusableHistory.has(frame.quality));
      const present = usableFrames.filter(({ frame }) => (observation.side === "bid" ? frame!.bids : frame!.asks).some((level) => level.price === observation.price && level.quantity > 0)).length;
      observation.presenceRatio = usableFrames.length > 0 ? present / usableFrames.length : null;
    }
  }

  const interactionTrades = window.priceBand && tradeUsable ? trades.filter((trade) => levelInBand(trade.price, window.priceBand!, state.book?.mid ?? null)) : [];
  const interactionMetric = (value: number, name: string): DerivedMetric<number> => { const unit: FeatureUnit = name.includes("Count") ? "count" : (name.includes("Time") ? "milliseconds" : "quantity"); return !window.priceBand || !tradeUsable ? unavailable(name, unit, window, "trades", tradeSource, "UNAVAILABLE", scopeExtra) : available(value, name, unit, window, "trades", tradeSource, tradePartial, scopeExtra); };
  const additionEventCount = lifecycleMetric(lifecycle.filter((event) => event.eventType === "ADD").length, "additionEventCount", "count");
  const removalEventCount = lifecycleMetric(lifecycle.filter((event) => event.eventType === "DECREASE" || event.eventType === "REMOVE").length, "removalEventCount", "count");
  const positiveUpdateCount = lifecycleMetric(lifecycle.filter((event) => event.eventType === "UPDATE" && event.deltaQuantity > 0).length, "positiveUpdateCount", "count");
  const decreaseCount = lifecycleMetric(lifecycle.filter((event) => event.eventType === "DECREASE").length, "decreaseCount", "count");
  const removeCount = lifecycleMetric(lifecycle.filter((event) => event.eventType === "REMOVE").length, "removeCount", "count");
  const bidNetLiquidityChange = lifecycleMetric(lifecycle.filter((event) => event.side === "bid").reduce((sum, event) => sum + event.deltaQuantity, 0), "bidNetLiquidityChange");
  const askNetLiquidityChange = lifecycleMetric(lifecycle.filter((event) => event.side === "ask").reduce((sum, event) => sum + event.deltaQuantity, 0), "askNetLiquidityChange");
  const sequenceValues = [...new Set(lifecycle.map((event) => event.sequence).filter((sequence): sequence is number => sequence != null))].sort((a, b) => a - b);
  const sequenceComplete = sequenceValues.length > 0 && (window.startSequence == null || sequenceValues[0] === window.startSequence) && (window.endSequence == null || sequenceValues.at(-1) === window.endSequence);
  const sequenceContinuity: SequenceCoverage = sequenceValues.length === 0 ? { startSequence: null, endSequence: null, observedEvents: 0, continuity: "UNAVAILABLE" } : { startSequence: sequenceValues[0]!, endSequence: sequenceValues.at(-1)!, observedEvents: sequenceValues.length, continuity: state.quality.lifecycle === "VALID" && sequenceComplete && sequenceValues.every((sequence, index) => index === 0 || sequence === sequenceValues[index - 1]! + 1) ? "CONTIGUOUS" : "PARTIAL" };
  const sequenceMetric = available(sequenceContinuity, "sequenceCoverage", "count", window, "lifecycle", lifeSource, sequenceContinuity.continuity === "CONTIGUOUS" ? "AVAILABLE" : "PARTIAL", { ...scopeExtra, sequenceRange: { startSequence: sequenceContinuity.startSequence, endSequence: sequenceContinuity.endSequence } });
  const reappearanceGroups = new Map<string, LiquidityReappearanceObservation & { pendingRemovalTime: number | null }>();
  for (const event of lifecycle) {
    const key = `${event.side}|${event.price}`; const time = eventTime(event); const current = reappearanceGroups.get(key);
    if (event.eventType === "DECREASE" || event.eventType === "REMOVE") {
      if (!current) reappearanceGroups.set(key, { side: event.side, price: event.price, reappearanceCount: 0, reappearedQuantity: 0, firstRemovalTime: time, firstReappearanceTime: null, delayToReappearance: null, pendingRemovalTime: time });
      else if (current.pendingRemovalTime == null) current.pendingRemovalTime = time;
    } else if ((event.eventType === "ADD" || event.eventType === "UPDATE") && event.deltaQuantity > 0 && current?.pendingRemovalTime != null) {
      current.reappearanceCount += 1; current.reappearedQuantity += event.deltaQuantity; current.firstReappearanceTime ??= time; current.delayToReappearance ??= time - current.pendingRemovalTime; current.pendingRemovalTime = null;
    }
  }
  const liquidityReappearance = !lifecycleUsable || lifecycle.length === 0 ? unavailable<readonly LiquidityReappearanceObservation[]>("liquidityReappearance", "quantity", window, "lifecycle", lifeSource, "UNAVAILABLE", scopeExtra) : available([...reappearanceGroups.values()].filter((item) => item.reappearanceCount > 0).map(({ pendingRemovalTime: _pending, ...item }) => item), "liquidityReappearance", "quantity", window, "lifecycle", lifeSource, lifePartial ? "PARTIAL" : "AVAILABLE", scopeExtra);
  const interactionCount = interactionTrades.length;
  const interactionVolume = interactionTrades.reduce((sum, trade) => sum + trade.quantity, 0);
  const interactionBuy = interactionTrades.filter((trade) => trade.aggressorSide === "BUY").reduce((sum, trade) => sum + trade.quantity, 0);
  const interactionSell = interactionTrades.filter((trade) => trade.aggressorSide === "SELL").reduce((sum, trade) => sum + trade.quantity, 0);

  return {
    identity: { ...state.identity }, window,
    derived: {
      totalVolume: tradeMetric(total, "totalVolume"), aggressiveBuyVolume: tradeMetric(buy, "aggressiveBuyVolume"), aggressiveSellVolume: tradeMetric(sell, "aggressiveSellVolume"), delta: tradeMetric(delta, "delta"), cvd: tradeUnavailable ? unavailable("cvd", "quantity", window, "trades", tradeSource) : metricPair(cvdValues, "cvd", "quantity", window, "trades", tradeSource, tradePartial), tradeCount,
      tradeVelocity: velocity(trades.length, "tradeVelocity"), volumeVelocity: velocity(total, "volumeVelocity"), aggressiveBuyVelocity: velocity(buy, "aggressiveBuyVelocity"), aggressiveSellVelocity: velocity(sell, "aggressiveSellVelocity"),
      bookImbalance, tradeImbalance, bidDepth: bidDepthMetric, askDepth: askDepthMetric, bidLevelCount, askLevelCount, nearestBidDistance, nearestAskDistance,
      startMid, endMid, absolutePriceChange, signedPriceChange, priceRange, midSeries, spreadSeries, bidDepthSeries, askDepthSeries, levelCountSeries,
      interactionTradeCount: interactionMetric(interactionCount, "interactionTradeCount"), interactionVolume: interactionMetric(interactionVolume, "interactionVolume"), aggressiveBuyInteractionVolume: interactionMetric(interactionBuy, "aggressiveBuyInteractionVolume"), aggressiveSellInteractionVolume: interactionMetric(interactionSell, "aggressiveSellInteractionVolume"), firstInteractionTime: interactionMetric(interactionTrades[0] ? eventTime(interactionTrades[0]) : 0, "firstInteractionTime"), lastInteractionTime: interactionMetric(interactionTrades.at(-1) ? eventTime(interactionTrades.at(-1)!) : 0, "lastInteractionTime"), liquidityReappearance, sequenceCoverage: sequenceMetric,
      additionEventCount, removalEventCount, positiveUpdateCount, decreaseCount, removeCount, netLiquidityChange: lifecycleMetric(added - removed, "netLiquidityChange"), bidNetLiquidityChange, askNetLiquidityChange,
      liquidityAdded: lifecycleMetric(added, "liquidityAdded"), liquidityRemoved: lifecycleMetric(removed, "liquidityRemoved"), bidAdded: lifecycleMetric(bidAdded, "bidAdded"), askAdded: lifecycleMetric(askAdded, "askAdded"), bidRemoved: lifecycleMetric(bidRemoved, "bidRemoved"), askRemoved: lifecycleMetric(askRemoved, "askRemoved"), liquidityAddRate: lifecycleMetric(added / durationSeconds, "liquidityAddRate", "per-second"), liquidityRemoveRate: lifecycleMetric(removed / durationSeconds, "liquidityRemoveRate", "per-second"), persistence,
    }, quality: { ...state.quality }, timestamps: cloneTimestamps(state.timestamps), provenance: cloneProvenance(state.provenance),
  };
}
