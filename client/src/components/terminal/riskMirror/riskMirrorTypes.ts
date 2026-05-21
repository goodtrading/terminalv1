export type RiskMirrorWarningSeverity = "info" | "warning" | "danger";

export type RiskMirrorScoreStatus =
  | "aligned"
  | "neutral"
  | "conflicted"
  | "danger"
  | "unknown";

export interface ReadOnlyRiskMirrorSnapshot {
  timestamp: number;
  exchange: "bingx";
  mode: "read-only";
  tradingLocked: true;
  symbol: string;
  account: {
    equityUsdt?: number;
    balanceUsdt?: number;
    availableMarginUsdt?: number;
  };
  position: RiskMirrorPosition | null;
  protection: RiskMirrorProtection;
  context: RiskMirrorContext;
  warnings: RiskMirrorWarning[];
  score: RiskMirrorScore;
}

export interface RiskMirrorProtectionLevel {
  kind: "stop_loss" | "take_profit" | "unknown";
  triggerPrice?: number;
  netPnlUsdt?: number;
  accountPct?: number;
  readOnly: true;
}

export interface RiskMirrorProtection {
  stopLoss: RiskMirrorProtectionLevel | null;
  takeProfit: RiskMirrorProtectionLevel | null;
}

export interface RiskMirrorPosition {
  symbol: string;
  side: "long" | "short";
  quantity: number;
  entryPrice: number;
  markPrice?: number;
  liquidationPrice?: number;
  leverage?: number;
  marginMode?: "cross" | "isolated" | "unknown";
  notionalUsdt?: number;
  unrealizedPnlUsdt?: number;
  unrealizedPnlAccountPct?: number;
  distanceToLiquidationPct?: number;
  distanceToEntryPct?: number;
  roePct?: number;
}

export interface RiskMirrorContext {
  spotPrice?: number;
  gammaState?: "long_gamma" | "short_gamma" | "transition" | "unknown";
  gammaFlip?: number;
  transitionZone?: { lower?: number; upper?: number };
  nearestGammaMagnet?: {
    price: number;
    distancePct: number;
    type?: string;
  };
  nearestLiquidityMagnet?: {
    price: number;
    distancePct: number;
    side?: string;
    sizeBtc?: number;
  };
  nearestSupport?: { price: number; distancePct: number; source: string };
  nearestResistance?: { price: number; distancePct: number; source: string };
}

export interface RiskMirrorWarning {
  id: string;
  severity: RiskMirrorWarningSeverity;
  title: string;
  message: string;
  source: string;
}

export interface RiskMirrorScore {
  status: RiskMirrorScoreStatus;
  confidence: number;
  summary: string;
}
