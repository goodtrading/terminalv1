export type ReportsTabId = "session" | "execution" | "edge" | "playbook" | "intelligence";

export type ReportBadgeVariant =
  | "mock"
  | "phase"
  | "live-data"
  | "partial-data"
  | "active-edge"
  | "selective"
  | "high-impact"
  | "neutral"
  | "positive"
  | "negative";

import type {
  ExecutionContextSnapshot,
  ExecutionTimelineReplay,
  PlaybookEntryExitDelta,
  PlaybookMatchResult,
} from "./execution/executionReportTypes";

export type TradeReviewRow = {
  tradeId: string;
  time: string;
  direction: "Long" | "Short";
  setup: string;
  entry: string;
  exit: string;
  r: string;
  pnl: string;
  quality: string;
  mistake: string;
  status: string;
  notesPreview: string;
  editable: boolean;
  context?: ExecutionContextSnapshot | null;
  playbook?: PlaybookMatchResult | null;
  playbookLabel?: string;
  playbookDelta?: PlaybookEntryExitDelta | null;
  deltaLabel?: string;
  timeline?: ExecutionTimelineReplay | null;
};

export type SetupPerformance = {
  name: string;
  trades: number;
  winrate: number;
  avgR: string;
  bestCondition: string;
  status: "Active Edge" | "Selective" | "High Impact";
  grade: string;
  executionRule: string;
};
