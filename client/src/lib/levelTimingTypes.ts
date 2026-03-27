export type LevelTimingHorizon = "scalp" | "intraday" | "swing";
export type LevelTimingUrgency = "high" | "medium" | "low";
export type LevelTimingState = "active" | "pending" | "invalidated";

export type LevelTimingReason =
  | "near_price"
  | "far_from_price"
  | "high_liquidity_cluster"
  | "weak_cluster"
  | "gamma_magnet"
  | "gamma_flip_near"
  | "short_gamma_acceleration"
  | "long_gamma_mean_reversion"
  | "active_absorption"
  | "active_sweep"
  | "structure_break_risk"
  | "expired_context";

export type OperationalLevelKind =
  | "gamma_flip"
  | "gamma_magnet"
  | "call_wall"
  | "put_wall"
  | "dealer_pivot"
  | "sweep_trigger"
  | "sweep_zone"
  | "absorption_zone"
  | "vacuum_zone"
  | "acceleration_zone"
  | "structure_level"
  | "oi_wall"
  | "unknown";

export type OperationalLevelSource =
  | "gamma"
  | "options"
  | "liquidity"
  | "sweep"
  | "absorption"
  | "pressure"
  | "playbook"
  | "chart-overlay"
  | "unknown";

export interface LevelTimingMeta {
  horizon: LevelTimingHorizon;
  urgency: LevelTimingUrgency;
  state: LevelTimingState;
  score: number; // 0-100
  confidence?: number; // 0-1
  reasons: LevelTimingReason[];
  updatedAt: number;
}

export interface OperationalLevel {
  kind: OperationalLevelKind;
  price: number;
  label: string;
  source: OperationalLevelSource;
  strength?: number; // 0-1 normalized if available
  structural?: boolean;
  timingMeta?: LevelTimingMeta;
}

export interface LevelTimingContext {
  nowTs: number;
  currentPrice: number;
  timeframeSec?: number;
  gammaRegime?: string;
  gammaFlip?: number | null;
  transitionZoneStart?: number | null;
  transitionZoneEnd?: number | null;
  sweepRisk?: string;
  sweepDirection?: string;
  absorptionStatus?: string;
  liquidityPressure?: string;
  playbookState?: string;
  playbookBias?: string;
  // 0..1 confidence / strength proxies (optional, degraded gracefully if absent)
  clusterStrength?: number;
  interactionScore?: number;
}

