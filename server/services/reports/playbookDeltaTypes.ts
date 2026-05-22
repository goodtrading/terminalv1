export type PlaybookDeltaStatus =
  | "held"
  | "weakened"
  | "invalidated"
  | "improved"
  | "changed"
  | "unknown";

export type ExitQuality =
  | "good_exit"
  | "early_exit"
  | "late_exit"
  | "forced_exit"
  | "unjustified_hold"
  | "unknown";

export interface PlaybookEntryExitDelta {
  status: PlaybookDeltaStatus;
  exitQuality: ExitQuality;
  entryPlaybookName?: string;
  exitPlaybookName?: string;
  entryConfidence?: number;
  exitConfidence?: number;
  confidenceDelta?: number;
  contextAlignmentDelta?: {
    entry?: string;
    exit?: string;
    changed: boolean;
  };
  riskDelta?: {
    entryRisk?: string;
    exitRisk?: string;
    worsened: boolean;
    improved: boolean;
  };
  reasons: string[];
  warnings: string[];
  summary: string;
}
