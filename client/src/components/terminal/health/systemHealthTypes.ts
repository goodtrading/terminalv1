export type SystemHealthOverallStatus =
  | "healthy"
  | "degraded"
  | "error"
  | "unknown";

export type RiskMirrorHealthStatus =
  | "healthy"
  | "degraded"
  | "error"
  | "inactive"
  | "unknown";

export interface RiskMirrorSystemHealth {
  status: RiskMirrorHealthStatus;
  active: boolean;
  exchange: "bingx" | "none";
  mode: "read-only";
  symbol?: string;
  scoreStatus?: "aligned" | "neutral" | "conflicted" | "danger" | "unknown";
  scoreConfidence?: number;
  summary?: string;
  warningsCount: number;
  dangerWarningsCount: number;
  warningWarningsCount: number;
  lastCheckedTime?: number;
  positionOpen: boolean;
  tradingLocked: true;
  message?: string;
  recentWarnings?: Array<{
    id: string;
    severity: "info" | "warning" | "danger";
    title: string;
    message: string;
  }>;
}

export interface SystemHealthSnapshot {
  timestamp: number;
  overall: SystemHealthOverallStatus;
  bingx: {
    hasConnection: boolean;
    connectionId?: string;
    health?: string;
    lastSyncTime?: number;
  };
  paper: {
    available: boolean;
    openPosition: boolean;
    pendingOrders: number;
  };
  marketData: {
    tickerFresh: boolean;
    orderbookLevels: number;
  };
  securityGuard: {
    liveTradingEnabled: boolean;
    tradingLocked: boolean;
  };
  liveTrading?: {
    status: "locked" | "not_ready" | "ready_for_dry_run" | "ready_for_live";
    liveTradingEnabled: boolean;
    apiTradingEnabled: boolean;
    blockersCount: number;
    readyForDryRun: boolean;
    readyForLive: boolean;
  };
  riskMirror: RiskMirrorSystemHealth;
}

export interface SystemHealthApiResponse {
  success: boolean;
  snapshot?: SystemHealthSnapshot;
  recentAudit?: Array<{
    id: string;
    type: string;
    severity: string;
    timestamp: number;
    message: string;
    metadata?: Record<string, unknown>;
  }>;
  message?: string;
}
