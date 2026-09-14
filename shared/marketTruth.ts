import type { OrderFlowFeatures } from "./orderFlowFeatures";
import type { OrderFlowIdentity, OrderFlowState } from "./orderFlowState";

export type MarketTruthOrigin = "RAW" | "DERIVED" | "INFERRED";
export type MarketTruthComponentQuality =
  | "VALID"
  | "STALE"
  | "PARTIAL"
  | "GAP"
  | "RESYNCING"
  | "DISCONNECTED"
  | "UNAVAILABLE";
export type MarketTruthOverallQuality = "VALID" | "PARTIAL" | "DEGRADED" | "UNAVAILABLE";
export type MarketTruthAvailability = "AVAILABLE" | "PARTIAL" | "UNAVAILABLE";
export type OptionsReferenceType = "OPTIONS_UNDERLYING" | "INDEX";

export type ExecutionMarketIdentity = {
  instrument: string;
  venue: string;
  marketType: "Spot" | "Perpetual";
};
export type OptionsReferenceIdentity = {
  referenceAsset: string;
  venue: string;
  referenceType: OptionsReferenceType;
};
export type MarketIdentity = ExecutionMarketIdentity | OptionsReferenceIdentity;

export type MarketTruthTimestamps = {
  eventTime?: number | null;
  receiveTime?: number | null;
  snapshotTime?: number | null;
  calculatedAt?: number | null;
};

export type MarketTruthProvenance = {
  origin: MarketTruthOrigin;
  source?: string;
  venue?: string;
  instrument?: string;
  marketType?: "Spot" | "Perpetual";
  referenceIdentity?: OptionsReferenceIdentity;
  eventTime?: number | null;
  receiveTime?: number | null;
  snapshotTime?: number | null;
  calculatedAt?: number | null;
  identifiers?: Readonly<Record<string, string | number | null>>;
  upstream?: unknown;
};

export type MarketTruthValue<T> = {
  value: T | null;
  unit: string;
  quality: MarketTruthComponentQuality;
  timestamps: Readonly<MarketTruthTimestamps>;
  provenance: Readonly<MarketTruthProvenance>;
};

export type MarketReferencePrice = {
  value: number | null;
  source: string;
  eventTime: number | null;
  receiveTime: number | null;
  quality: MarketTruthComponentQuality;
  provenance: Readonly<MarketTruthProvenance>;
};

export type MarketLevelType = "GAMMA_FLIP" | "CALL_WALL" | "PUT_WALL" | "GAMMA_MAGNET" | "SHORT_GAMMA_ZONE" | "TRANSITION_ZONE";
export type MarketLevel = {
  type: MarketLevelType;
  price: number | null;
  referenceIdentity: Readonly<OptionsReferenceIdentity>;
  source: string;
  origin: MarketTruthOrigin;
  calculatedAt: number | null;
  quality: MarketTruthComponentQuality;
  provenance: Readonly<MarketTruthProvenance>;
};

export type GammaContext = {
  totalGex?: MarketTruthValue<number>;
  gammaFlip?: MarketTruthValue<number>;
  callWall?: MarketTruthValue<number>;
  putWall?: MarketTruthValue<number>;
  gammaMagnets?: readonly MarketTruthValue<number>[];
  shortGammaZones?: readonly MarketLevel[];
  transitionZones?: readonly MarketLevel[];
  vanna?: MarketTruthValue<number>;
  charm?: MarketTruthValue<number>;
  dealerHedgeContext?: unknown;
  quality: MarketTruthComponentQuality;
  timestamps: Readonly<MarketTruthTimestamps>;
  provenance: Readonly<MarketTruthProvenance>;
};

export type OpenInterestMeasurement = {
  kind: "RAW" | "AGGREGATED";
  value: number | null;
  unit: string;
  quality: MarketTruthComponentQuality;
  timestamps: Readonly<MarketTruthTimestamps>;
  provenance: Readonly<MarketTruthProvenance>;
};
export type OptionsOIContext = {
  measurements: readonly OpenInterestMeasurement[];
  quality: MarketTruthComponentQuality;
  timestamps: Readonly<MarketTruthTimestamps>;
  provenance: Readonly<MarketTruthProvenance>;
};
export type FuturesOIContext = OptionsOIContext;

export type VolatilityMeasurement = {
  kind: "IMPLIED" | "REALIZED" | "OTHER";
  value: number | null;
  unit: string;
  reference: string;
  origin: MarketTruthOrigin;
  quality: MarketTruthComponentQuality;
  timestamps: Readonly<MarketTruthTimestamps>;
  provenance: Readonly<MarketTruthProvenance>;
};
export type VolatilityContext = {
  measurements: readonly VolatilityMeasurement[];
  quality: MarketTruthComponentQuality;
  timestamps: Readonly<MarketTruthTimestamps>;
  provenance: Readonly<MarketTruthProvenance>;
};

export type RegimeContext = {
  label: string | null;
  inputs: Readonly<Record<string, unknown>>;
  quality: MarketTruthComponentQuality;
  timestamps: Readonly<MarketTruthTimestamps>;
  provenance: Readonly<MarketTruthProvenance>;
};

export type MarketTruthComponentTimestamps = {
  orderFlow: Readonly<MarketTruthTimestamps>;
  features: Readonly<MarketTruthTimestamps>;
  gamma: Readonly<MarketTruthTimestamps>;
  optionsOI: Readonly<MarketTruthTimestamps>;
  futuresOI: Readonly<MarketTruthTimestamps>;
  volatility: Readonly<MarketTruthTimestamps>;
  regime: Readonly<MarketTruthTimestamps>;
  capturedAt: number;
};

export type MarketTruthConsistency = {
  status: "ALIGNED" | "PARTIAL" | "INCONSISTENT";
  componentAges: Readonly<Record<keyof Omit<MarketTruthComponentTimestamps, "capturedAt">, number | null>>;
  timestampSpread: number | null;
  staleComponents: readonly string[];
  missingComponents: readonly string[];
  referenceMismatch: boolean;
};

export type MarketTruthQuality = {
  orderFlow: MarketTruthComponentQuality;
  features: MarketTruthComponentQuality;
  gamma: MarketTruthComponentQuality;
  optionsOI: MarketTruthComponentQuality;
  futuresOI: MarketTruthComponentQuality;
  volatility: MarketTruthComponentQuality;
  regime: MarketTruthComponentQuality;
  overall: MarketTruthOverallQuality;
};

export type MarketTruthOrderFlow = {
  state: Readonly<OrderFlowState>;
  features: Readonly<OrderFlowFeatures>;
  quality: Readonly<{ orderFlow: MarketTruthComponentQuality; features: MarketTruthComponentQuality }>;
  timestamps: Readonly<{ orderFlow: MarketTruthTimestamps; features: MarketTruthTimestamps }>;
  provenance: Readonly<{ orderFlow: MarketTruthProvenance; features: MarketTruthProvenance }>;
};

export type MarketTruthOptions = {
  referenceIdentity: Readonly<OptionsReferenceIdentity>;
  referencePrice: MarketReferencePrice | null;
  gamma: GammaContext | null;
  optionsOpenInterest: OptionsOIContext | null;
  keyLevels: readonly MarketLevel[];
  quality: Readonly<{ gamma: MarketTruthComponentQuality; optionsOI: MarketTruthComponentQuality }>;
  timestamps: Readonly<{ gamma: MarketTruthTimestamps; optionsOI: MarketTruthTimestamps }>;
  provenance: Readonly<{ gamma: MarketTruthProvenance; optionsOI: MarketTruthProvenance }>;
};

export type MarketTruth = {
  identity: Readonly<ExecutionMarketIdentity>;
  orderFlow: MarketTruthOrderFlow;
  options: MarketTruthOptions;
  futuresOpenInterest: FuturesOIContext | null;
  volatility: VolatilityContext | null;
  regime: RegimeContext | null;
  quality: Readonly<MarketTruthQuality>;
  timestamps: Readonly<MarketTruthComponentTimestamps>;
  provenance: Readonly<Record<"orderFlow" | "features" | "gamma" | "optionsOI" | "futuresOI" | "volatility" | "regime", MarketTruthProvenance>>;
  consistency: Readonly<MarketTruthConsistency>;
  capturedAt: number;
};

export type MarketTruthInput = {
  identity: ExecutionMarketIdentity;
  orderFlow: { state: OrderFlowState; features: OrderFlowFeatures };
  options: {
    referenceIdentity: OptionsReferenceIdentity;
    referencePrice: MarketReferencePrice | null;
    gamma: GammaContext | null;
    optionsOpenInterest: OptionsOIContext | null;
    keyLevels: readonly MarketLevel[];
  };
  futuresOpenInterest?: FuturesOIContext | null;
  volatility?: VolatilityContext | null;
  regime?: RegimeContext | null;
  capturedAt: number;
};

function assertExecutionIdentity(identity: ExecutionMarketIdentity): void {
  if (!identity || !identity.instrument?.trim() || !identity.venue?.trim() || !identity.marketType) {
    throw new Error("MarketTruth requires complete execution identity");
  }
}
function assertOptionsIdentity(identity: OptionsReferenceIdentity): void {
  if (!identity || !identity.referenceAsset?.trim() || !identity.venue?.trim() || !identity.referenceType) {
    throw new Error("MarketTruth requires complete options reference identity");
  }
}
function clone<T>(value: T): T {
  return structuredClone(value);
}
function cloneState(state: OrderFlowState): OrderFlowState {
  return {
    ...state,
    identity: clone(state.identity),
    book: clone(state.book),
    bbo: clone(state.bbo),
    trades: clone(state.trades),
    liquidityLifecycle: clone(state.liquidityLifecycle),
    historicalLiquidity: {
      latestFrame: clone(state.historicalLiquidity.latestFrame),
      bookAt: (time: number) => clone(state.historicalLiquidity.bookAt(time)),
    },
    quality: clone(state.quality),
    timestamps: clone(state.timestamps),
    provenance: clone(state.provenance),
    consistency: clone(state.consistency),
  };
}
function primaryTime(timestamps: MarketTruthTimestamps): number | null {
  return timestamps.calculatedAt ?? timestamps.snapshotTime ?? timestamps.eventTime ?? timestamps.receiveTime ?? null;
}
function componentQuality(value: { quality: MarketTruthComponentQuality } | null | undefined): MarketTruthComponentQuality {
  return value?.quality ?? "UNAVAILABLE";
}
function componentTimestamps(value: { timestamps: MarketTruthTimestamps } | null | undefined): MarketTruthTimestamps {
  return clone(value?.timestamps ?? {});
}
function componentProvenance(value: { provenance: MarketTruthProvenance } | null | undefined): MarketTruthProvenance {
  return clone(value?.provenance ?? { origin: "RAW" });
}
function overallQuality(qualities: readonly MarketTruthComponentQuality[]): MarketTruthOverallQuality {
  const available = qualities.filter((quality) => quality !== "UNAVAILABLE");
  if (available.length === 0) return "UNAVAILABLE";
  if (qualities.some((quality) => ["GAP", "RESYNCING", "DISCONNECTED"].includes(quality))) return "DEGRADED";
  if (qualities.some((quality) => ["STALE", "PARTIAL", "UNAVAILABLE"].includes(quality))) return "PARTIAL";
  return "VALID";
}
function sameReference(a: OptionsReferenceIdentity | undefined, b: OptionsReferenceIdentity): boolean {
  return !!a && a.referenceAsset === b.referenceAsset && a.venue === b.venue && a.referenceType === b.referenceType;
}

export function composeMarketTruth(input: MarketTruthInput): MarketTruth {
  assertExecutionIdentity(input.identity);
  assertOptionsIdentity(input.options.referenceIdentity);
  if (!Number.isFinite(input.capturedAt)) throw new Error("MarketTruth requires finite capturedAt");
  if (input.orderFlow.state.identity.instrument !== input.identity.instrument || input.orderFlow.state.identity.venue !== input.identity.venue || input.orderFlow.state.identity.marketType !== input.identity.marketType) {
    throw new Error("MarketTruth order flow identity mismatch");
  }

  const state = cloneState(input.orderFlow.state);
  const features = clone(input.orderFlow.features);
  const orderFlowQuality = state.quality.overall;
  const featuresQuality: MarketTruthComponentQuality = orderFlowQuality === "VALID" ? "VALID" : orderFlowQuality;
  const orderFlowTimestamps: MarketTruthTimestamps = { eventTime: state.timestamps.book.eventTime, receiveTime: state.timestamps.book.receiveTime };
  const featuresTimestamps: MarketTruthTimestamps = { eventTime: state.timestamps.book.eventTime, receiveTime: state.timestamps.book.receiveTime };
  const orderFlowProvenance: MarketTruthProvenance = { origin: "DERIVED", upstream: clone(state.provenance), eventTime: orderFlowTimestamps.eventTime, receiveTime: orderFlowTimestamps.receiveTime };
  const featuresProvenance: MarketTruthProvenance = { origin: "DERIVED", upstream: clone(state.provenance), eventTime: featuresTimestamps.eventTime, receiveTime: featuresTimestamps.receiveTime };

  const gamma = input.options.gamma ? clone(input.options.gamma) : null;
  const optionsOI = input.options.optionsOpenInterest ? clone(input.options.optionsOpenInterest) : null;
  const futuresOI = input.futuresOpenInterest ? clone(input.futuresOpenInterest) : null;
  const volatility = input.volatility ? clone(input.volatility) : null;
  const regime = input.regime ? clone(input.regime) : null;
  const referencePrice = input.options.referencePrice ? clone(input.options.referencePrice) : null;
  const keyLevels = clone(input.options.keyLevels);
  const timestamps: MarketTruthComponentTimestamps = {
    orderFlow: orderFlowTimestamps,
    features: featuresTimestamps,
    gamma: componentTimestamps(gamma),
    optionsOI: componentTimestamps(optionsOI),
    futuresOI: componentTimestamps(futuresOI),
    volatility: componentTimestamps(volatility),
    regime: componentTimestamps(regime),
    capturedAt: input.capturedAt,
  };
  const provenance = {
    orderFlow: orderFlowProvenance,
    features: featuresProvenance,
    gamma: componentProvenance(gamma),
    optionsOI: componentProvenance(optionsOI),
    futuresOI: componentProvenance(futuresOI),
    volatility: componentProvenance(volatility),
    regime: componentProvenance(regime),
  } as const;
  const quality: MarketTruthQuality = {
    orderFlow: orderFlowQuality,
    features: featuresQuality,
    gamma: componentQuality(gamma),
    optionsOI: componentQuality(optionsOI),
    futuresOI: componentQuality(futuresOI),
    volatility: componentQuality(volatility),
    regime: componentQuality(regime),
    overall: overallQuality([orderFlowQuality, featuresQuality, componentQuality(gamma), componentQuality(optionsOI), componentQuality(futuresOI), componentQuality(volatility), componentQuality(regime)]),
  };
  const names = ["orderFlow", "features", "gamma", "optionsOI", "futuresOI", "volatility", "regime"] as const;
  const ages = Object.fromEntries(names.map((name) => {
    const timestamp = primaryTime(timestamps[name]);
    return [name, timestamp == null ? null : Math.max(0, input.capturedAt - timestamp)];
  })) as MarketTruthConsistency["componentAges"];
  const knownTimes = names.map((name) => primaryTime(timestamps[name])).filter((time): time is number => time != null);
  const referenceMismatch = referencePrice != null && !sameReference(referencePrice.provenance.referenceIdentity, input.options.referenceIdentity);
  const missingComponents = names.filter((name) => quality[name] === "UNAVAILABLE");
  const staleComponents = names.filter((name) => ["STALE", "GAP", "RESYNCING", "DISCONNECTED"].includes(quality[name]));
  const consistencyStatus = referenceMismatch ? "INCONSISTENT" : missingComponents.length > 0 || staleComponents.length > 0 ? "PARTIAL" : "ALIGNED";

  return {
    identity: clone(input.identity),
    orderFlow: { state, features, quality: { orderFlow: orderFlowQuality, features: featuresQuality }, timestamps: { orderFlow: orderFlowTimestamps, features: featuresTimestamps }, provenance: { orderFlow: orderFlowProvenance, features: featuresProvenance } },
    options: { referenceIdentity: clone(input.options.referenceIdentity), referencePrice, gamma, optionsOpenInterest: optionsOI, keyLevels, quality: { gamma: quality.gamma, optionsOI: quality.optionsOI }, timestamps: { gamma: timestamps.gamma, optionsOI: timestamps.optionsOI }, provenance: { gamma: provenance.gamma, optionsOI: provenance.optionsOI } },
    futuresOpenInterest: futuresOI,
    volatility,
    regime,
    quality,
    timestamps,
    provenance,
    consistency: { status: consistencyStatus, componentAges: ages, timestampSpread: knownTimes.length ? Math.max(...knownTimes) - Math.min(...knownTimes) : null, staleComponents, missingComponents, referenceMismatch },
    capturedAt: input.capturedAt,
  };
}
