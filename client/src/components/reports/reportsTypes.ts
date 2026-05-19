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
  time: string;
  direction: "Long" | "Short";
  setup: string;
  entry: string;
  exit: string;
  r: string;
  quality: string;
  mistake: string;
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
