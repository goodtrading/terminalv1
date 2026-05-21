export type SpotPerpDivergenceType =
  | "SPOT_CONFIRMS_PERP"
  | "PERP_LEADS_SPOT"
  | "SPOT_ABSORPTION_PERP_AGGRESSION"
  | "PERP_PRESSURE_NO_SPOT_CONFIRMATION"
  | "SPOT_WALL_ONLY"
  | "PERP_WALL_ONLY"
  | "BID_CONFLUENCE"
  | "ASK_CONFLUENCE";

export type SpotPerpDivergenceSide =
  | "bid"
  | "ask"
  | "bullish"
  | "bearish"
  | "neutral";

export type SpotPerpDivergenceSeverity = "low" | "medium" | "high";

export type DivergenceSignalContext =
  | "continuation"
  | "trap"
  | "absorption"
  | "confluence"
  | "liquidity_warning"
  | "neutral";

export type DivergenceSignalBias =
  | "bullish"
  | "bearish"
  | "two_sided"
  | "wait";

export interface SpotPerpDivergenceSignal {
  id: string;
  type: SpotPerpDivergenceType;
  side: SpotPerpDivergenceSide;
  price: number;
  confidence: number;
  severity: SpotPerpDivergenceSeverity;
  explanation: string;
  timestamp: number;
  context: DivergenceSignalContext;
  invalidation: string;
  invalidationPrice?: number;
  bias: DivergenceSignalBias;
}

export type DivergenceFilterPrefs = {
  passiveLiquidity: boolean;
  aggressionDivergence: boolean;
  confluenceSignals: boolean;
};

export type DivergenceQualityDebug = {
  candidates: number;
  filteredByDistance: number;
  filteredByPersistence: number;
  filteredByStrength: number;
  filteredByType: number;
  duplicateSuppressed: number;
  filteredByCooldown: number;
  filtered: number;
  activeSignals: number;
  rejectedLowConfidence: number;
  strongestSignal: SpotPerpDivergenceSignal | null;
};
