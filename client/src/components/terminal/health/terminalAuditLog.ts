export type TerminalAuditEventType =
  | "bingx_connected"
  | "bingx_disconnected"
  | "bingx_snapshot_synced"
  | "bingx_sync_error"
  | "bingx_saved_connection_restored"
  | "broker_switched"
  | "paper_order_submitted"
  | "paper_position_closed"
  | "credential_saved"
  | "credential_deleted"
  | "system";

export type TerminalAuditLevel = "info" | "warn" | "error";

export type TerminalAuditEntry = {
  id: string;
  ts: number;
  type: TerminalAuditEventType;
  level: TerminalAuditLevel;
  message: string;
};

const MAX_ENTRIES = 80;
const entries: TerminalAuditEntry[] = [];
const listeners = new Set<() => void>();

let idSeq = 0;

function notify() {
  for (const fn of listeners) {
    fn();
  }
}

export function getTerminalAuditEntries(): readonly TerminalAuditEntry[] {
  return entries;
}

export function subscribeTerminalAudit(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function emitTerminalAudit(
  type: TerminalAuditEventType,
  message: string,
  level: TerminalAuditLevel = "info",
): void {
  const entry: TerminalAuditEntry = {
    id: `audit-${++idSeq}-${Date.now()}`,
    ts: Date.now(),
    type,
    level,
    message,
  };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
  notify();
}

export function formatAuditTime(ts: number): string {
  return new Date(ts).toLocaleTimeString(undefined, {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}
