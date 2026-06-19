/** Stable data availability states for mobile market-state v2. */
export type DataStatus =
  | "available"
  | "unavailable"
  | "stale"
  | "not_applicable"
  | "calculation_error";

export type MarketMode =
  | "micro"
  | "macro"
  | "both";

export type SpotPosition = "above_spot" | "below_spot" | "at_spot";

export type DriverImpact = "positive" | "negative" | "neutral" | "mixed";

export type ContextTag = "micro" | "macro" | "shared";

export interface ValueWithStatus<T> {
  value: T | null;
  status: DataStatus;
}

export interface DistanceMetrics {
  /** Signed delta: level - spot */
  signedDistanceUsd: number | null;
  /** Absolute distance in USD */
  distanceUsd: number | null;
  /** Signed percent: ((level - spot) / spot) * 100 */
  signedDistancePct: number | null;
  /** Absolute percent distance */
  distancePct: number | null;
  position: SpotPosition | null;
  status: DataStatus;
}

export interface DominantExpiryBlock {
  date: string | null;
  instrumentCode: string | null;
  daysToExpiry: number | null;
  status: DataStatus;
}

export interface AssetBlock {
  symbol: string;
  pair: string;
  spot: ValueWithStatus<number>;
  spotSource: ValueWithStatus<string>;
  tickerTimestamp: ValueWithStatus<number>;
  tickerAgeMs: ValueWithStatus<number>;
}

export interface GammaFlipBlock {
  type: "local" | "global" | "operational";
  price: ValueWithStatus<number>;
  distance: DistanceMetrics;
  reason: ValueWithStatus<string>;
  source: ValueWithStatus<string>;
}

export interface LevelRef {
  id: string;
  type: string;
  price: number | null;
  lower: number | null;
  upper: number | null;
  strength: number | null;
  distance: DistanceMetrics;
  context: ContextTag;
  source: string;
  status: DataStatus;
}

export interface TransitionZone {
  start: ValueWithStatus<number>;
  end: ValueWithStatus<number>;
}

export interface GammaBlock {
  totalGex: ValueWithStatus<number>;
  normalizedGex: ValueWithStatus<number>;
  regime: ValueWithStatus<string>;
  regimeLabel: ValueWithStatus<string>;
  confidence: ValueWithStatus<number>;
  flip: GammaFlipBlock;
  dealerPivot: LevelRef | null;
  transitionZone: TransitionZone;
  gammaMagnets: { items: LevelRef[]; status: DataStatus };
  shortGammaPockets: { items: LevelRef[]; status: DataStatus };
  dominantExpiry: DominantExpiryBlock;
}

export interface MarketDriver {
  code: string;
  label: string;
  impact: DriverImpact;
  weight: number | null;
  context: ContextTag;
  status: DataStatus;
}

export interface MarketStateBlock {
  classification: ValueWithStatus<string>;
  label: ValueWithStatus<string>;
  confidence: ValueWithStatus<number>;
  tradeState: ValueWithStatus<string>;
  volatilityState: ValueWithStatus<string>;
  drivers: { items: MarketDriver[]; status: DataStatus };
}

export interface BiasBlock {
  direction: ValueWithStatus<string>;
  label: ValueWithStatus<string>;
  confidence: ValueWithStatus<number>;
  horizon: {
    code: string;
    label: string;
    status: DataStatus;
  };
  thesis: ValueWithStatus<string>;
  supportingFactors: { items: string[]; status: DataStatus };
  invalidation: ValueWithStatus<string>;
}

export interface RiskMetricBlock {
  level: ValueWithStatus<string>;
  probability: ValueWithStatus<number>;
  direction: ValueWithStatus<string>;
  status: DataStatus;
}

export interface RiskBlock {
  cascade: RiskMetricBlock;
  squeeze: RiskMetricBlock;
  volatility: {
    state: ValueWithStatus<string>;
    score: ValueWithStatus<number>;
    status: DataStatus;
  };
}

export interface ScenarioBlock {
  id: number;
  type: "base" | "alternative" | "tail";
  probability: ValueWithStatus<number>;
  /** Raw storage probability before normalization (e.g. 55 meaning 55%). */
  probabilityRaw: ValueWithStatus<number>;
  direction: ValueWithStatus<string>;
  title: ValueWithStatus<string>;
  thesis: ValueWithStatus<string>;
  targets: { items: string[]; status: DataStatus };
  relevantLevels: { items: string[]; status: DataStatus };
  confirmations: { items: string[]; status: DataStatus };
  invalidations: { items: string[]; status: DataStatus };
  horizon: {
    code: string | null;
    label: string | null;
    status: DataStatus;
  };
  classification: "intraday" | "structural" | "tail" | "unclassified";
  status: DataStatus;
}

export interface OptionsStructureBlock {
  callWall: LevelRef | null;
  putWall: LevelRef | null;
  dealerPivot: LevelRef | null;
  gammaMagnets: { items: LevelRef[]; status: DataStatus };
  shortGammaPockets: { items: LevelRef[]; status: DataStatus };
  dominantExpiry: DominantExpiryBlock;
}

export interface ContextQuality {
  scenarioSource: "storage";
  scenarioStatus: DataStatus;
  alertSource: "engine_rules";
  warnings: string[];
}

export interface MarketContext {
  context: "micro" | "macro";
  horizon: {
    code: string;
    label: string;
  };
  gamma: GammaBlock;
  marketState: MarketStateBlock;
  bias: BiasBlock;
  risk: RiskBlock;
  scenarios: { items: ScenarioBlock[]; status: DataStatus };
  optionsStructure: OptionsStructureBlock;
  quality: ContextQuality;
}

export interface RelationshipBlock {
  status: "available" | "not_requested" | "unavailable";
  regimeAlignment: ValueWithStatus<string>;
  microRegime: ValueWithStatus<string>;
  macroRegime: ValueWithStatus<string>;
  biasAlignment: ValueWithStatus<string>;
  flipOrdering: ValueWithStatus<string>;
  conflictLevel: ValueWithStatus<string>;
  tradeImplication: ValueWithStatus<string>;
  descriptionCode: ValueWithStatus<string>;
}

export interface AlertBlock {
  id: string;
  code: string;
  type: string;
  severity: "LOW" | "MEDIUM" | "HIGH" | "EXTREME";
  context: ContextTag;
  triggeredAt: string;
  levelReference: LevelRef | null;
  label: string | null;
  data: Record<string, unknown>;
}

export interface FreshnessBlock {
  ticker: DataStatus;
  options: DataStatus;
  scenarios: DataStatus;
}

export interface CoherenceBlock {
  status: DataStatus;
  score: ValueWithStatus<number>;
  warnings: string[];
}

export interface SnapshotMetadata {
  schemaVersion: "2.0.0";
  modelVersion: string;
  generatedAt: string;
  snapshotId: string;
  asset: string;
  dataSources: {
    ticker: string | null;
    options: string | null;
    market: string | null;
    scenarios: string;
    alerts: string;
  };
  scenarioSource: "storage";
  alertSource: "engine_rules";
  /** terminal_mobile_access inherits from active terminal SaaS subscription. */
  accessModel: "terminal_subscription_inherited";
  requestedMode?: MarketMode;
  freshness: FreshnessBlock;
  coherence: CoherenceBlock;
  warnings: string[];
  buildTimeMs: number;
  cacheHit: boolean;
  approximateResponseBytes: number | null;
}

export interface CanonicalMobileSnapshot {
  asset: AssetBlock;
  micro: MarketContext;
  macro: MarketContext;
  relationship: RelationshipBlock;
  alerts: { items: AlertBlock[]; status: DataStatus };
  metadata: SnapshotMetadata;
}

export type ProjectedMobileMarketState =
  | {
      asset: AssetBlock;
      micro: MarketContext;
      relationship: RelationshipBlock;
      alerts: { items: AlertBlock[]; status: DataStatus };
      metadata: SnapshotMetadata;
    }
  | {
      asset: AssetBlock;
      macro: MarketContext;
      relationship: RelationshipBlock;
      alerts: { items: AlertBlock[]; status: DataStatus };
      metadata: SnapshotMetadata;
    }
  | {
      asset: AssetBlock;
      micro: MarketContext;
      macro: MarketContext;
      relationship: RelationshipBlock;
      alerts: { items: AlertBlock[]; status: DataStatus };
      metadata: SnapshotMetadata;
    };

export const SUPPORTED_ASSETS = ["BTC"] as const;
export type SupportedAsset = (typeof SUPPORTED_ASSETS)[number];

export const MOBILE_V2_SCHEMA_VERSION = "2.0.0" as const;
export const MOBILE_V2_MODEL_VERSION = "terminal-state-aggregate-v1" as const;
export const MOBILE_V2_CACHE_TTL_MS = 2000;
