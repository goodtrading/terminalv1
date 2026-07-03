export type LiveReadinessStatus =
  | "locked"
  | "not_ready"
  | "ready_for_dry_run"
  | "ready_for_live";

export type LiveReadinessCheckStatus = "pass" | "fail" | "warning";

export interface LiveReadinessCheck {
  id: string;
  label: string;
  status: LiveReadinessCheckStatus;
  message: string;
}

export interface LiveTradingReadiness {
  status: LiveReadinessStatus;
  exchange: "bingx";
  liveTradingEnabled: boolean;
  apiTradingEnabled: boolean;
  orderSubmitEnabled: boolean;
  orderCancelEnabled: boolean;
  positionCloseEnabled: boolean;
  marketOrdersAllowed: boolean;
  killSwitchActive: boolean;
  checks: LiveReadinessCheck[];
  blockers: string[];
  warnings: string[];
  readyForDryRun: boolean;
  readyForLive: boolean;
  readOnlyFreezeActive: boolean;
}

export interface LiveTradingHealthSummary {
  status: LiveReadinessStatus;
  liveTradingEnabled: boolean;
  apiTradingEnabled: boolean;
  blockersCount: number;
  readyForDryRun: boolean;
  readyForLive: boolean;
}
