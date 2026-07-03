import { apiRequest } from "@/lib/queryClient";
import { formatTerminalTime } from "@/lib/timezone";
import {
  CLIENT_PERSISTABLE_AUDIT_TYPES,
  severityToLevel,
  summarizeAuditMetadata,
  type AuditEventSeverity,
  type AuditEventType,
  type TerminalAuditEntry,
  type TerminalAuditLevel,
} from "./auditTypes";

export type {
  AuditEventType,
  AuditEventSeverity,
  TerminalAuditEntry,
  TerminalAuditLevel,
} from "./auditTypes";

/** @deprecated Use AuditEventType */
export type TerminalAuditEventType = AuditEventType;

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

function persistClientAuditEvent(
  type: string,
  message: string,
  level: TerminalAuditLevel,
  metadata?: Record<string, unknown>,
): void {
  if (!CLIENT_PERSISTABLE_AUDIT_TYPES.has(type)) return;

  const severity: AuditEventSeverity =
    level === "error" ? "error" : level === "warn" ? "warning" : "info";

  void apiRequest("/api/system/audit-log/client-event", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      type,
      severity,
      message,
      metadata,
    }),
    assertOk: false,
  }).catch((err) => {
    if (import.meta.env.DEV) {
      console.debug("[audit] client-event persist failed", type, err);
    }
  });
}

export function emitTerminalAudit(
  type: AuditEventType | string,
  message: string,
  level: TerminalAuditLevel = "info",
  metadata?: Record<string, unknown>,
): void {
  const entry: TerminalAuditEntry = {
    id: `audit-local-${++idSeq}-${Date.now()}`,
    ts: Date.now(),
    type,
    level,
    message,
    metadataSummary: summarizeAuditMetadata(metadata),
    persistent: false,
  };
  entries.unshift(entry);
  if (entries.length > MAX_ENTRIES) {
    entries.length = MAX_ENTRIES;
  }
  notify();
  persistClientAuditEvent(type, message, level, metadata);
}

export function formatAuditTime(ts: number): string {
  return formatTerminalTime(ts);
}

export { severityToLevel, summarizeAuditMetadata };
