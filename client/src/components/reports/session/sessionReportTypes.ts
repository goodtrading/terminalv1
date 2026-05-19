import type { TerminalState } from "@/hooks/useTerminalState";
import type { MarketCandle } from "@/lib/marketCandleTypes";

export type MarketClarity = "Low" | "Moderate" | "High";

export type MagnetLevelType =
  | "Gamma Magnet"
  | "Call Wall"
  | "Put Wall"
  | "Key Level"
  | "Gravity Magnet"
  | "Fallback Level";

export type LevelSpotRelation = "Above Spot" | "Below Spot" | "Testing" | "N/A";

export type MacroMagnetLabel = "Structural Magnet" | "Macro Gravity Level" | "Far Magnet";

export type LevelContext = {
  price: number | null;
  type: MagnetLevelType | "Local Flip" | MacroMagnetLabel | "Liquidity Wall" | string;
  distancePct: number | null;
  /** Signed distance from spot, e.g. +0.40% or -2.34% */
  distanceLabel: string;
  relation: LevelSpotRelation;
  /** Intraday operational target vs macro context only. */
  role?: "intraday" | "macro";
  isIntradayTarget?: boolean;
  farMacroStatus?: string;
  warning?: string;
  levelStatus?: string;
};

export type IntradayDecisionLevel = LevelContext & {
  levelStatus: string;
};

export type ActiveTradingMagnetLevel = {
  price: number | null;
  type: string;
  distancePct: number | null;
  distanceLabel: string;
  direction: "Downside" | "Upside" | "N/A";
  condition: string;
  levelStatus: string;
  valid: boolean;
};

export type MacroGravityLevel = LevelContext & {
  levelStatus: string;
};

export type SessionLevelHierarchy = {
  intradayDecision: IntradayDecisionLevel;
  activeTrading: ActiveTradingMagnetLevel;
  macroGravity: MacroGravityLevel;
  localFlip: number | null;
};

export type LiquidityEventType =
  | "sweep"
  | "absorption"
  | "pull"
  | "magnet"
  | "vacuum"
  | "flip"
  | "gamma"
  | "structure"
  | "generic";

export type SessionReportLiquidityEvent = {
  label: string;
  type: LiquidityEventType;
  price?: number;
  importance?: "low" | "medium" | "high";
  /** True when derived from live terminal levels (not legacy mock copy). */
  isStructural?: boolean;
};

export type SessionReportRisks = {
  primaryRisk: string;
  secondaryRisk: string | null;
};

export type SessionReportSnapshot = {
  sessionQuality: number | null;
  marketClarity: MarketClarity;
  bestEdge: string;
  bestEdgeCondition: string | null;
  alternativeEdge: string | null;
  mainRisk: string;
};

export type SessionReportRegime = {
  gammaState: string;
  bias: string;
  volatilityState: string;
  localFlip: number | null;
  status: string;
  levelHierarchy: SessionLevelHierarchy;
};

export type SessionReportStructure = {
  high: number | null;
  low: number | null;
  open: number | null;
  last: number | null;
  rangePct: number | null;
  currentLocation: string;
  marketBehavior: string;
  isLive: boolean;
};

export type SessionReportIntelligence = {
  whatHappened: string;
  whyHappened: string[];
  bestOpportunity: string;
  mainRisk: string;
  tomorrowFocus: string[];
  institutionalTakeaway: string;
  usesLiveData: boolean;
};

export type SessionReportData = {
  snapshot: SessionReportSnapshot;
  regime: SessionReportRegime;
  structure: SessionReportStructure;
  risks: SessionReportRisks;
  liquidityEvents: SessionReportLiquidityEvent[];
  resolution: string;
  intelligence: SessionReportIntelligence;
  sessionSummary: {
    sessionBias: string;
    gammaState: string;
    activeTradingMagnet: string;
    intradayDecision: string;
    localFlip: string;
    volatilityState: string;
  };
};

export type SessionReportDataMode = "live" | "partial" | "mock";

export type SessionReportResult = SessionReportData & {
  dataMode: SessionReportDataMode;
  spot: number | null;
  /** True when any field was filled from Phase 1 mock merge. */
  usedMockFallback: boolean;
};

export type SessionTerminalInput = TerminalState & {
  gravityMap?: {
    status?: string;
    primaryMagnet?: { price?: number; label?: string; strength?: string } | number | null;
    summary?: string;
  } | null;
};

export type BuildSessionReportOptions = {
  terminal?: SessionTerminalInput | null;
  candles?: readonly MarketCandle[];
};
