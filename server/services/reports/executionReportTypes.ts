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

export interface ExecutionProfile {
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

import type { ExecutionContextSnapshot } from "./executionContextTypes";
import type { PlaybookMatchResult } from "./playbookMatchTypes";
import type { PlaybookEntryExitDelta } from "./playbookDeltaTypes";

export type { ExecutionContextSnapshot } from "./executionContextTypes";
export type { PlaybookMatchResult, ExecutionPlaybookMatch } from "./playbookMatchTypes";
export type {
  PlaybookEntryExitDelta,
  PlaybookDeltaStatus,
  ExitQuality,
} from "./playbookDeltaTypes";

export type TradeReviewStatus =
  | "open"
  | "closed"
  | "partial"
  | "cancelled"
  | "rejected"
  | "unknown";

export interface TradeReviewRow {
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
  profile: ExecutionProfile;
  diagnostics: ExecutionDiagnostics;
  trades: TradeReviewRow[];
  bestTrade?: TradeReviewRow | null;
  worstTrade?: TradeReviewRow | null;
  empty: boolean;
}

/** Unified API response for GET /api/reports/execution */
export interface ExecutionReportApiResponse {
  success: boolean;
  source: ExecutionReportSource;
  report: ExecutionReportPayload;
}

/** @deprecated Direct paper JSON — use ExecutionReportApiResponse */
export type ExecutionReportResponse = ExecutionReportPayload;
