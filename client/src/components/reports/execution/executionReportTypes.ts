export type ExecutionGrade = "A+" | "A" | "B+" | "B" | "C+" | "C" | "D";

export interface ExecutionReportSummary {
  source: "paper";
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
  executionQualityScore: number;
  grade: ExecutionGrade;
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
}

export interface ExecutionTradeReviewRow {
  id: string;
  time: string;
  direction: "Long" | "Short";
  setup: string;
  entry: number | null;
  exit: number | null;
  r: number | null;
  pnlUsdt: number | null;
  quality: ExecutionGrade | "—";
  mistakes: string;
  notes: string;
  tags: string;
  status: "open" | "closed" | "cancelled" | "rejected";
}

export interface ExecutionReportResponse {
  summary: ExecutionReportSummary;
  profile: ExecutionProfileData;
  diagnostics: ExecutionDiagnostics;
  trades: ExecutionTradeReviewRow[];
  bestTrade?: ExecutionTradeReviewRow | null;
  worstTrade?: ExecutionTradeReviewRow | null;
  empty: boolean;
}
