export type AuditEventSeverity = "info" | "warning" | "error";

export type AuditEventType =
  | "bingx_connected"
  | "bingx_disconnected"
  | "bingx_saved_connection_restored"
  | "bingx_credential_saved"
  | "bingx_credential_deleted"
  | "bingx_snapshot_synced"
  | "bingx_sync_error"
  | "broker_switched"
  | "paper_order_submitted"
  | "paper_order_cancelled"
  | "paper_position_closed"
  | "paper_partial_close"
  | "security_guard_event"
  | "market_data_error"
  | "system_health_error"
  | "risk_mirror_warning"
  | "risk_mirror_error"
  | "credential_saved"
  | "credential_deleted"
  | "system";

export type TerminalAuditLevel = "info" | "warn" | "error";

export type TerminalAuditEntry = {
  id: string;
  ts: number;
  type: AuditEventType | string;
  level: TerminalAuditLevel;
  message: string;
  metadataSummary?: string;
  persistent?: boolean;
};

export type PersistentAuditLogResponse = {
  success: boolean;
  events: Array<{
    id: string;
    userId?: number;
    type: AuditEventType;
    severity: AuditEventSeverity;
    timestamp: number;
    message: string;
    metadata?: Record<string, unknown>;
  }>;
};

export const CLIENT_PERSISTABLE_AUDIT_TYPES = new Set<string>([
  "broker_switched",
  "bingx_saved_connection_restored",
  "system_health_error",
]);

export function severityToLevel(severity: AuditEventSeverity): TerminalAuditLevel {
  if (severity === "error") return "error";
  if (severity === "warning") return "warn";
  return "info";
}

export function summarizeAuditMetadata(
  metadata?: Record<string, unknown>,
): string | undefined {
  if (!metadata || typeof metadata !== "object") return undefined;
  const parts: string[] = [];
  const pick = (key: string) => {
    const v = metadata[key];
    if (v == null || v === "") return;
    parts.push(`${key}=${String(v)}`);
  };
  pick("exchange");
  pick("mode");
  pick("apiKeyMasked");
  pick("connectionId");
  pick("symbol");
  pick("side");
  pick("type");
  pick("orderType");
  pick("percent");
  pick("scoreStatus");
  pick("warningId");
  pick("warningSeverity");
  pick("distanceToLiquidationPct");
  pick("unrealizedPnlAccountPct");
  if (metadata.tradingLocked === true) parts.push("tradingLocked=true");
  if (metadata.paper === true) parts.push("paper=true");
  return parts.length > 0 ? parts.join(" · ") : undefined;
}
