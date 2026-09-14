import type { GammaContext, MarketLevel, MarketTruth, MarketTruthComponentQuality, MarketTruthTimestamps, OptionsReferenceIdentity } from "./marketTruth";
import type { OrderFlowFeatures, OrderFlowInferenceStatus } from "./orderFlowFeatures";
import type { OrderFlowState } from "./orderFlowState";

export type GeometryRelation = "BELOW" | "ABOVE" | "AT_LEVEL" | "INSIDE_ZONE" | "OUTSIDE_ZONE";
export type GeometryBand = { mode: "ABSOLUTE" | "RATIO"; value: number };
export type MarketTruthGeometryConfig = {
  atLevelTolerance?: number;
  levelBand?: GeometryBand;
  proximityBand?: GeometryBand;
  referenceSamples?: readonly { time: number; price: number }[];
};
export type LevelGeometry = {
  level: MarketLevel;
  startPrice: number;
  endPrice: number | null;
  executionPrice: number | null;
  referencePrice: number | null;
  executionPriceSource: string | null;
  referencePriceSource: string | null;
  levelReferenceIdentity: Readonly<OptionsReferenceIdentity>;
  absoluteDistance: number | null;
  signedDistance: number | null;
  distanceRatio: number | null;
  relation: GeometryRelation;
  levelAgeMs: number | null;
  referencePriceAgeMs: number | null;
  referenceAlignment: "ALIGNED" | "MISMATCH" | "UNAVAILABLE";
  quality: MarketTruthComponentQuality;
  timestamps: Readonly<MarketTruthTimestamps>;
  provenance: Readonly<Record<string, unknown>>;
};
export type LevelCrossing = {
  level: MarketLevel;
  fromSide: "BELOW" | "ABOVE";
  toSide: "BELOW" | "ABOVE";
  previousSampleTime: number;
  currentSampleTime: number;
  observedCrossingTime: number;
};
export type LevelCrossingState = {
  crossingCount: number;
  reCrossingCount: number;
  latestFromSide: "BELOW" | "ABOVE" | null;
  latestToSide: "BELOW" | "ABOVE" | null;
  latestObservedCrossingTime: number | null;
  crossings: readonly LevelCrossing[];
  quality: MarketTruthComponentQuality;
};
export type LevelResidence = {
  level: MarketLevel;
  proximityBand: GeometryBand;
  samplesNearLevel: number;
  totalUsableSamples: number;
  presenceRatioNearLevel: number | null;
  firstNearTime: number | null;
  lastNearTime: number | null;
  observedResidenceSpan: number | null;
  quality: MarketTruthComponentQuality;
};
export type LevelOrderFlowContext = {
  level: MarketLevel;
  priceBand: GeometryBand;
  interactionTradeCount: number | null;
  interactionVolume: number | null;
  buyInteractionVolume: number | null;
  sellInteractionVolume: number | null;
  liquidityAdded: number | null;
  liquidityRemoved: number | null;
  absorptionStatus: OrderFlowInferenceStatus | null;
  compressionStatus: OrderFlowInferenceStatus | null;
  sweepStatus: OrderFlowInferenceStatus | null;
  passiveDefenseStatus: OrderFlowInferenceStatus | null;
  quality: MarketTruthComponentQuality;
  provenance: Readonly<Record<string, unknown>>;
};
export type MarketTruthGeometry = {
  nearestLevel: LevelGeometry | null;
  gammaFlip: LevelGeometry | null;
  levels: readonly LevelGeometry[];
  crossings: readonly LevelCrossing[];
  crossingState: Readonly<Record<string, LevelCrossingState>>;
  residence: readonly LevelResidence[];
  orderFlowNearLevels: readonly LevelOrderFlowContext[];
  quality: { geometry: MarketTruthComponentQuality; crossings: MarketTruthComponentQuality; residence: MarketTruthComponentQuality; orderFlow: MarketTruthComponentQuality };
  timestamps: Readonly<MarketTruthTimestamps>;
  provenance: Readonly<Record<string, unknown>>;
};

function copy<T>(value: T): T { return structuredClone(value); }
function identityEqual(a: OptionsReferenceIdentity, b: OptionsReferenceIdentity): boolean { return a.referenceAsset === b.referenceAsset && a.venue === b.venue && a.referenceType === b.referenceType; }
function zoneEnd(level: MarketLevel): number | null {
  const value = level.provenance.identifiers?.end;
  return typeof value === "number" && Number.isFinite(value) ? value : null;
}
function relation(price: number, start: number, end: number | null, tolerance: number): GeometryRelation {
  if (end != null) {
    const min = Math.min(start, end); const max = Math.max(start, end);
    return price >= min && price <= max ? "INSIDE_ZONE" : "OUTSIDE_ZONE";
  }
  if (Math.abs(price - start) <= tolerance) return "AT_LEVEL";
  return price < start ? "BELOW" : "ABOVE";
}
function bandContains(distance: number, reference: number, band: GeometryBand): boolean {
  if (band.mode === "ABSOLUTE") return distance <= band.value;
  return reference > 0 && distance / reference <= band.value;
}
function usableLevel(level: MarketLevel): boolean { return level.price != null && Number.isFinite(level.price) && level.quality !== "UNAVAILABLE"; }
function qualityForLevel(level: MarketLevel, aligned: boolean, ref: number | null): MarketTruthComponentQuality {
  if (!usableLevel(level) || ref == null || !aligned) return "UNAVAILABLE";
  return level.quality;
}
function sampleSide(price: number, level: number, tolerance: number): "BELOW" | "ABOVE" | null { return Math.abs(price - level) <= tolerance ? null : price < level ? "BELOW" : "ABOVE"; }
function inferenceStatus(features: OrderFlowFeatures, name: "absorption" | "compression" | "sweep" | "passiveDefense"): OrderFlowInferenceStatus | null {
  return features.inference[name]?.status ?? null;
}
export function computeMarketTruthGeometry(truth: MarketTruth, config: MarketTruthGeometryConfig): MarketTruthGeometry {
  if (config.atLevelTolerance != null && (!Number.isFinite(config.atLevelTolerance) || config.atLevelTolerance < 0)) throw new Error("Invalid atLevelTolerance");
  for (const band of [config.levelBand, config.proximityBand]) if (band && (!Number.isFinite(band.value) || band.value < 0)) throw new Error("Invalid geometry band");
  const executionPrice = truth.orderFlow.state.bbo?.mid ?? null;
  const reference = truth.options.referencePrice;
  const referencePrice = reference?.value ?? null;
  const executionSource = executionPrice == null ? null : `${truth.identity.venue} ${truth.identity.marketType}`;
  const aligned = reference != null && referencePrice != null && reference.quality !== "UNAVAILABLE";
  const levels = truth.options.keyLevels.filter(usableLevel).map((level) => {
    const startPrice = level.price!; const endPrice = zoneEnd(level); const absoluteDistance = referencePrice == null ? null : Math.abs(referencePrice - startPrice);
    const signedDistance = referencePrice == null ? null : referencePrice - startPrice;
    const levelTime = level.calculatedAt; const refTime = reference?.eventTime ?? reference?.provenance.eventTime ?? null;
    return {
      level: copy(level), startPrice, endPrice, executionPrice, referencePrice,
      executionPriceSource: executionSource, referencePriceSource: reference?.source ?? null,
      levelReferenceIdentity: copy(level.referenceIdentity), absoluteDistance, signedDistance,
      distanceRatio: absoluteDistance != null && referencePrice != null && referencePrice > 0 ? absoluteDistance / referencePrice : null,
      relation: referencePrice == null ? "OUTSIDE_ZONE" : relation(referencePrice, startPrice, endPrice, config.atLevelTolerance ?? 0),
      levelAgeMs: levelTime != null ? Math.max(0, truth.capturedAt - levelTime) : null,
      referencePriceAgeMs: refTime != null ? Math.max(0, truth.capturedAt - refTime) : null,
      referenceAlignment: !reference ? "UNAVAILABLE" : identityEqual(level.referenceIdentity, truth.options.referenceIdentity) ? "ALIGNED" : "MISMATCH",
      quality: qualityForLevel(level, aligned && identityEqual(level.referenceIdentity, truth.options.referenceIdentity), referencePrice),
      timestamps: { calculatedAt: level.calculatedAt, eventTime: reference?.eventTime ?? null, receiveTime: reference?.receiveTime ?? null },
      provenance: { level: copy(level.provenance), executionMarket: copy(truth.identity), referencePrice: reference ? copy(reference.provenance) : null },
    } satisfies LevelGeometry;
  }).sort((a, b) => (a.absoluteDistance ?? Infinity) - (b.absoluteDistance ?? Infinity) || a.level.type.localeCompare(b.level.type) || a.startPrice - b.startPrice || String(a.level.provenance.identifiers?.snapshotId ?? "").localeCompare(String(b.level.provenance.identifiers?.snapshotId ?? "")));
  const nearestLevel = levels[0] ?? null;
  const gammaFlip = levels.find((item) => item.level.type === "GAMMA_FLIP") ?? null;
  const geometryQuality: MarketTruthComponentQuality = reference == null || referencePrice == null ? "UNAVAILABLE" : levels.length === 0 ? "UNAVAILABLE" : levels.some((level) => level.quality === "UNAVAILABLE") ? "PARTIAL" : levels[0]!.quality;
  const samples = [...(config.referenceSamples ?? [])].sort((a, b) => a.time - b.time);
  const crossings: LevelCrossing[] = []; const crossingState: Record<string, LevelCrossingState> = {};
  for (const item of levels) {
    const level = item.level; const sides = samples.map((sample) => ({ sample, side: sampleSide(sample.price, item.startPrice, config.atLevelTolerance ?? 0) })).filter((x): x is { sample: { time: number; price: number }; side: "BELOW" | "ABOVE" } => x.side != null);
    const own = sides.flatMap((entry, index) => index === 0 || sides[index - 1]!.side === entry.side ? [] : [{ level: copy(level), fromSide: sides[index - 1]!.side, toSide: entry.side, previousSampleTime: sides[index - 1]!.sample.time, currentSampleTime: entry.sample.time, observedCrossingTime: entry.sample.time }]);
    crossings.push(...own); const key = `${level.type}:${item.startPrice}:${level.provenance.identifiers?.snapshotId ?? ""}`;
    crossingState[key] = { crossingCount: own.length, reCrossingCount: Math.max(0, own.length - 1), latestFromSide: own.at(-1)?.fromSide ?? null, latestToSide: own.at(-1)?.toSide ?? null, latestObservedCrossingTime: own.at(-1)?.observedCrossingTime ?? null, crossings: own, quality: samples.length >= 2 ? "VALID" : "UNAVAILABLE" };
  }
  const residenceBand = config.proximityBand;
  const residence = levels.map((item) => {
    if (!residenceBand || samples.length === 0 || referencePrice == null) return { level: copy(item.level), proximityBand: residenceBand ?? { mode: "ABSOLUTE", value: 0 }, samplesNearLevel: 0, totalUsableSamples: 0, presenceRatioNearLevel: null, firstNearTime: null, lastNearTime: null, observedResidenceSpan: null, quality: "UNAVAILABLE" as const };
    const usable = samples.filter((sample) => Number.isFinite(sample.price) && Number.isFinite(sample.time)); const near = usable.filter((sample) => bandContains(Math.abs(sample.price - item.startPrice), sample.price, residenceBand));
    return { level: copy(item.level), proximityBand: copy(residenceBand), samplesNearLevel: near.length, totalUsableSamples: usable.length, presenceRatioNearLevel: usable.length ? near.length / usable.length : null, firstNearTime: near[0]?.time ?? null, lastNearTime: near.at(-1)?.time ?? null, observedResidenceSpan: near.length >= 2 ? near.at(-1)!.time - near[0]!.time : near.length === 1 ? 0 : null, quality: usable.length ? "VALID" as const : "PARTIAL" as const };
  });
  const orderFlow = config.levelBand ? levels.map((item) => {
    const band = config.levelBand!; const trades = truth.orderFlow.state.trades.filter((trade) => bandContains(Math.abs(trade.price - item.startPrice), item.startPrice, band)); const lifecycle = truth.orderFlow.state.liquidityLifecycle.filter((event) => bandContains(Math.abs(event.price - item.startPrice), item.startPrice, band)); const tradeQuality = truth.orderFlow.state.quality.trades === "VALID"; const lifecycleQuality = truth.orderFlow.state.quality.lifecycle === "VALID";
    return { level: copy(item.level), priceBand: copy(band), interactionTradeCount: tradeQuality ? trades.length : null, interactionVolume: tradeQuality ? trades.reduce((sum, trade) => sum + trade.quantity, 0) : null, buyInteractionVolume: tradeQuality ? trades.filter((trade) => trade.aggressorSide === "BUY").reduce((sum, trade) => sum + trade.quantity, 0) : null, sellInteractionVolume: tradeQuality ? trades.filter((trade) => trade.aggressorSide === "SELL").reduce((sum, trade) => sum + trade.quantity, 0) : null, liquidityAdded: lifecycleQuality ? lifecycle.filter((event) => event.eventType === "ADD" || event.eventType === "UPDATE").reduce((sum, event) => sum + Math.max(0, event.deltaQuantity), 0) : null, liquidityRemoved: lifecycleQuality ? lifecycle.filter((event) => event.eventType === "DECREASE" || event.eventType === "REMOVE").reduce((sum, event) => sum + Math.max(0, -event.deltaQuantity), 0) : null, absorptionStatus: inferenceStatus(truth.orderFlow.features, "absorption"), compressionStatus: inferenceStatus(truth.orderFlow.features, "compression"), sweepStatus: inferenceStatus(truth.orderFlow.features, "sweep"), passiveDefenseStatus: inferenceStatus(truth.orderFlow.features, "passiveDefense"), quality: tradeQuality && lifecycleQuality ? "VALID" as const : "PARTIAL" as const, provenance: { executionMarket: copy(truth.identity), orderFlow: copy(truth.orderFlow.provenance), sourceLevel: copy(item.level.provenance) } };
  }) : [];
  return { nearestLevel, gammaFlip, levels, crossings, crossingState, residence, orderFlowNearLevels: orderFlow, quality: { geometry: geometryQuality, crossings: samples.length >= 2 ? "VALID" : "UNAVAILABLE", residence: residenceBand && samples.length >= 1 ? "VALID" : "UNAVAILABLE", orderFlow: config.levelBand ? (truth.orderFlow.state.quality.trades === "VALID" ? "VALID" : "UNAVAILABLE") : "UNAVAILABLE" }, timestamps: { eventTime: reference?.eventTime ?? null, receiveTime: reference?.receiveTime ?? null, snapshotTime: reference?.provenance.snapshotTime ?? null, calculatedAt: reference?.provenance.calculatedAt ?? null }, provenance: { executionMarket: copy(truth.identity), optionsReference: copy(truth.options.referenceIdentity), referencePrice: reference ? copy(reference.provenance) : null, config: copy(config) } };
}
