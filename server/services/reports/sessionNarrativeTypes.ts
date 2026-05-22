export interface SessionExecutionNarrative {
  status: "available" | "partial" | "unavailable";
  generatedAt: number;
  source: "paper" | "bingx" | "all";
  symbol: string;
  summary: string;
  dominantBehavior: {
    title: string;
    description: string;
    severity: "positive" | "neutral" | "warning" | "danger";
  };
  bestBehavior: {
    title: string;
    description: string;
  };
  worstBehavior: {
    title: string;
    description: string;
  };
  playbookStats: Array<{
    playbookId: string;
    name: string;
    count: number;
    winRate?: number;
    avgPnlUsdt?: number;
    avgR?: number;
    avgConfidence?: number;
  }>;
  repeatedMistakes: Array<{
    id: string;
    label: string;
    count: number;
    impact: "low" | "medium" | "high";
  }>;
  positives: string[];
  warnings: string[];
  nextSessionFocus: string[];
}
