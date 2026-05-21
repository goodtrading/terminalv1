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
