export type ExecutionTimelineEventType =
  | "entry"
  | "context_captured"
  | "playbook_detected"
  | "risk_update"
  | "sl_tp_update"
  | "exit"
  | "playbook_delta"
  | "diagnosis";

export type ExecutionTimelineSeverity =
  | "info"
  | "positive"
  | "warning"
  | "danger"
  | "neutral";

export interface ExecutionTimelineEvent {
  id: string;
  timestamp?: number;
  type: ExecutionTimelineEventType;
  severity: ExecutionTimelineSeverity;
  title: string;
  message: string;
  metadata?: {
    price?: number;
    pnlUsdt?: number;
    accountPct?: number;
    playbook?: string;
    confidence?: number;
    riskStatus?: string;
    contextAlignment?: string;
    stopLossDetected?: boolean;
    takeProfitDetected?: boolean;
    deltaStatus?: string;
    exitQuality?: string;
  };
}

export interface ExecutionTimelineReplay {
  status: "available" | "partial" | "unavailable";
  summary: string;
  events: ExecutionTimelineEvent[];
}
