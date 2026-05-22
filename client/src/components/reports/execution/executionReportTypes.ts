export type ExecutionGrade = "A+" | "A" | "B+" | "B" | "C+" | "C" | "D";

export type ExecutionReportSource = "paper" | "bingx" | "all";

export type BingxHistoryStatus = "loaded" | "unavailable" | "empty";

export interface ExecutionReportSummary {
  source: ExecutionReportSource;
  mode?: "simulated" | "read-only";
  generatedAt: string;
  totalTrades: number;
  closedTrades: number;
  openOrders: number;
  openPosition: boolean;
  realizedPnlUsdt: number;
  unrealizedPnlUsdt: number;
  winRate: number | null;
  avgR: number | null;
  bestTradeR: number | null;
  worstTradeR: number | null;
  executionQualityScore: number | null;
  grade: ExecutionGrade | "—";
  scoreEstimate?: boolean;
  scoreReason?: string;
  historyStatus?: BingxHistoryStatus;
  historyMessage?: string;
  tradingLocked?: boolean;
}

export interface ExecutionProfileData {
  timing: "Early" | "Optimal" | "Late" | "Mixed" | "No data";
  discipline: "Strong" | "Moderate" | "Weak" | "No data";
  contextAlignmentPct: number | null;
  confirmationQuality: "High" | "Moderate" | "Low" | "No data";
}

export interface ExecutionDiagnostics {
  mainIssue: string;
  bestBehavior: string;
  warning?: string;
  riskWarnings?: string[];
}

export interface ExecutionContextSnapshot {
  timestamp: number;
  symbol: string;
  source: "paper" | "bingx";
  brokerMode: "paper" | "read-only";
  market: {
    spotPrice?: number;
    markPrice?: number;
    marketDataHealth?: "healthy" | "degraded" | "error" | "unknown";
  };
  gamma: {
    regime?: "long_gamma" | "short_gamma" | "transition" | "unknown";
    flip?: number;
    transitionZone?: { lower?: number; upper?: number };
    nearestMagnet?: {
      price: number;
      distancePct: number;
      type?: "call_wall" | "put_wall" | "gex_magnet" | "unknown";
    };
  };
  liquidity: {
    nearestMagnet?: {
      price: number;
      distancePct: number;
      side?: "bid" | "ask" | "unknown";
      sizeBtc?: number;
    };
    nearestSupport?: { price: number; distancePct: number; source: string };
    nearestResistance?: { price: number; distancePct: number; source: string };
  };
  risk: {
    riskMirrorStatus?: "aligned" | "neutral" | "conflicted" | "danger" | "unknown";
    riskMirrorConfidence?: number;
    stopLossDetected: boolean;
    takeProfitDetected: boolean;
    stopLossPrice?: number;
    takeProfitPrice?: number;
    estimatedLossUsdt?: number;
    estimatedLossAccountPct?: number;
    estimatedGainUsdt?: number;
    estimatedGainAccountPct?: number;
    liquidationPrice?: number;
    distanceToLiquidationPct?: number;
  };
  diagnostics: {
    contextAlignment: "aligned" | "neutral" | "conflicted" | "danger" | "unknown";
    warnings: string[];
    positives: string[];
    summary: string;
  };
}

export type ExecutionPlaybookId =
  | "sweep_absorption"
  | "gamma_magnet_continuation"
  | "flip_rejection"
  | "liquidity_vacuum"
  | "failed_auction"
  | "absorption_scalp"
  | "no_match";

export interface ExecutionPlaybookMatch {
  id: ExecutionPlaybookId;
  name: string;
  confidence: number;
  status: "matched" | "partial" | "no_match";
  directionBias?: "long" | "short" | "neutral" | "unknown";
  reasons: string[];
  warnings: string[];
  invalidations: string[];
  tags: string[];
}

export interface PlaybookMatchResult {
  primary: ExecutionPlaybookMatch;
  candidates: ExecutionPlaybookMatch[];
  summary: string;
}

export type PlaybookDeltaStatus =
  | "held"
  | "weakened"
  | "invalidated"
  | "improved"
  | "changed"
  | "unknown";

export type ExitQuality =
  | "good_exit"
  | "early_exit"
  | "late_exit"
  | "forced_exit"
  | "unjustified_hold"
  | "unknown";

export interface PlaybookEntryExitDelta {
  status: PlaybookDeltaStatus;
  exitQuality: ExitQuality;
  entryPlaybookName?: string;
  exitPlaybookName?: string;
  entryConfidence?: number;
  exitConfidence?: number;
  confidenceDelta?: number;
  contextAlignmentDelta?: {
    entry?: string;
    exit?: string;
    changed: boolean;
  };
  riskDelta?: {
    entryRisk?: string;
    exitRisk?: string;
    worsened: boolean;
    improved: boolean;
  };
  reasons: string[];
  warnings: string[];
  summary: string;
}

export type TradeReviewStatus =
  | "open"
  | "closed"
  | "partial"
  | "cancelled"
  | "rejected"
  | "unknown";

export interface ExecutionTradeReviewRow {
  id: string;
  time: string;
  direction: "Long" | "Short";
  setup: string;
  entry: number | null;
  exit: number | null;
  r: number | null;
  pnlUsdt: number | null;
  pnlAccountPct?: number | null;
  quality: ExecutionGrade | "—";
  mistakes: string;
  notes: string;
  tags: string;
  status: TradeReviewStatus;
  source?: "paper" | "bingx";
  contextAtEntry?: ExecutionContextSnapshot;
  contextAtExit?: ExecutionContextSnapshot;
  playbookMatch?: PlaybookMatchResult;
  playbookAtEntry?: PlaybookMatchResult;
  playbookAtExit?: PlaybookMatchResult;
  playbookDelta?: PlaybookEntryExitDelta;
}

export interface ExecutionReportPayload {
  summary: ExecutionReportSummary;
  profile: ExecutionProfileData;
  diagnostics: ExecutionDiagnostics;
  trades: ExecutionTradeReviewRow[];
  bestTrade?: ExecutionTradeReviewRow | null;
  worstTrade?: ExecutionTradeReviewRow | null;
  empty: boolean;
}

export interface ExecutionReportApiResponse {
  success: boolean;
  source: ExecutionReportSource;
  report: ExecutionReportPayload;
}

/** Payload used by UI hooks (unwrapped from API). */
export type ExecutionReportResponse = ExecutionReportPayload;
