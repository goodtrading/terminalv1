import type { ReportsTabId, SetupPerformance, TradeReviewRow } from "./reportsTypes";

/** Legacy mock labels for non-session tabs only — session quality comes from buildReportSnapshot(). */
export const REPORT_SNAPSHOT = {
  marketClarity: "High",
  bestEdge: "Sweep + Absorption",
  mainRisk: "Flip Acceptance",
} as const;

export const MARKET_REGIME = {
  mainRegime: "Short Gamma",
  bias: "Bearish Reversion",
  volatility: "Expansion Risk",
  primaryMagnet: "81,250",
  localFlip: "80,700",
  statusBadge: "Reactive Auction",
} as const;

export const EXECUTION_PROFILE = {
  timing: "Early",
  discipline: "Strong",
  contextAlignment: "72%",
  confirmationQuality: "Moderate",
} as const;

export const EDGE_HEALTH = {
  overallEdge: "Positive",
  currentStability: "Improving",
  mainStrength: "Short Gamma + Vacuum",
  mainLeak: "Early confirmation",
} as const;

export const EDGE_CONCLUSION =
  "Your edge is strongest when liquidity events align with short gamma expansion. Avoid trades inside long gamma compression unless confirmation quality is high.";

export const INSTITUTIONAL_TAKEAWAY =
  "Market structure favored reactive behavior around the local flip. The highest quality opportunity came after sellers failed to achieve continuation below the lower liquidity pocket.";

export const REPORTS_TABS: { id: ReportsTabId; label: string }[] = [
  { id: "session", label: "Session" },
  { id: "execution", label: "Execution" },
  { id: "edge", label: "Edge" },
  { id: "playbook", label: "Playbook" },
  { id: "intelligence", label: "Intelligence" },
];

export const SESSION_SUMMARY = {
  sessionBias: "Bearish Reversion",
  gammaState: "Short Gamma",
  mainMagnet: "81,250",
  localFlip: "80,700",
  volatilityState: "Expansion Risk",
} as const;

export const MARKET_STRUCTURE = {
  high: "81,420",
  low: "80,080",
  open: "80,960",
  last: "81,180",
  rangePct: "1.67%",
  location: "Below local flip",
  behavior: "Failed breakdown into mean reversion",
} as const;

export const LIQUIDITY_EVENTS = [
  "Downside sweep at 80,150",
  "Passive bid defense near 80,300",
  "Ask liquidity pulled above 80,850",
  "Repricing into 81,250 magnet",
] as const;

export const SESSION_RESOLUTION =
  "The session showed short gamma behavior near the local flip. Aggressive sellers were absorbed below 80,300, creating a failed breakdown and upside repricing into the nearest gamma magnet.";

export const EXECUTION_QUALITY = {
  score: 78,
  grade: "B+",
  mainIssue: "Early entries before confirmation",
  bestBehavior: "Good invalidation discipline",
} as const;

export const MOCK_TRADES: TradeReviewRow[] = [
  {
    tradeId: "mock-1",
    time: "09:35",
    direction: "Long",
    setup: "Sweep + Absorption",
    entry: "80,240",
    exit: "80,920",
    r: "+1.8R",
    pnl: "+120.00",
    quality: "A-",
    mistake: "None",
    status: "closed",
    notesPreview: "",
    editable: false,
  },
  {
    tradeId: "mock-2",
    time: "10:50",
    direction: "Short",
    setup: "Flip Rejection",
    entry: "80,880",
    exit: "81,050",
    r: "-0.5R",
    pnl: "-42.00",
    quality: "C+",
    mistake: "Counter-flow",
    status: "closed",
    notesPreview: "",
    editable: false,
  },
  {
    tradeId: "mock-3",
    time: "12:20",
    direction: "Long",
    setup: "Magnet Continuation",
    entry: "80,960",
    exit: "81,220",
    r: "+1.1R",
    pnl: "+65.00",
    quality: "B+",
    mistake: "Late entry",
    status: "closed",
    notesPreview: "",
    editable: false,
  },
];

export const EXECUTION_HIGHLIGHTS = {
  best: "Sweep + Absorption long after downside sweep",
  worst: "Short into absorbed selling",
} as const;

export const EDGE_METRICS = [
  { label: "Winrate", value: "66%", progress: 66 },
  { label: "Profit Factor", value: "2.15", progress: 72 },
  { label: "Average R", value: "+0.82R", progress: 58, positive: true },
  { label: "Max Drawdown", value: "-1.2R", progress: 24, negative: true },
  { label: "Trades", value: "9", progress: 45 },
  { label: "A+ Trades", value: "3", progress: 33 },
  { label: "Gamma Aligned Trades", value: "72%", progress: 72 },
  { label: "Order Flow Confirmed", value: "68%", progress: 68 },
] as const;

export const EDGE_DIAGNOSIS = {
  strongest: "Short gamma + liquidity vacuum",
  weakest: "Long gamma compression",
  improvement: "Wait for absorption confirmation before entry",
} as const;

export const PLAYBOOK_SETUPS: SetupPerformance[] = [
  {
    name: "Sweep + Absorption",
    trades: 18,
    winrate: 72,
    avgR: "+1.4R",
    bestCondition: "Short Gamma + Thin Liquidity",
    status: "Active Edge",
    grade: "A",
    executionRule:
      "Only execute after failed continuation and passive defense.",
  },
  {
    name: "Gamma Flip Rejection",
    trades: 11,
    winrate: 54,
    avgR: "+0.6R",
    bestCondition: "Local flip + passive wall",
    status: "Selective",
    grade: "B",
    executionRule:
      "Use selectively when price rejects flip with visible passive liquidity.",
  },
  {
    name: "Magnet Continuation",
    trades: 14,
    winrate: 64,
    avgR: "+1.1R",
    bestCondition: "Pulled liquidity + clear magnet",
    status: "Active Edge",
    grade: "B+",
    executionRule: "Avoid late entries after magnet has already been repriced.",
  },
  {
    name: "Vacuum Repricing",
    trades: 7,
    winrate: 71,
    avgR: "+1.7R",
    bestCondition: "Thin book after failed auction",
    status: "High Impact",
    grade: "A-",
    executionRule: "Best after liquidity pull and failed auction.",
  },
];

export const INTELLIGENCE = {
  whatHappened:
    "BTC traded below the local gamma flip early in the session, swept downside liquidity and failed to continue lower. Absorption below 80,300 shifted the auction back toward the 81,250 magnet.",
  whyHappened: [
    "Short gamma increased directional sensitivity.",
    "Sellers were absorbed near the lower liquidity pocket.",
    "Ask liquidity above 80,850 was pulled.",
    "The nearest magnet became the upside target.",
  ],
  bestOpportunity: "Sweep + absorption long after failed downside continuation.",
  mainRisk:
    "If price accepts above the local flip, upside continuation toward the next magnet becomes more probable. If price rejects below the flip again, expect two-sided volatility.",
  tomorrowFocus: [
    "Do not chase first displacement.",
    "Wait for sweep confirmation.",
    "Prioritize trades aligned with gamma regime.",
    "Avoid fading absorption.",
  ],
} as const;
