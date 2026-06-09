const AUDIT_INTERVAL_MS = 2_000;
let lastAuditAt = 0;

export type BookmapRailwayEnableAuditPayload = {
  ok: boolean;
  selectedSource: string;
  effectiveSource: string;
  spotAvailable: boolean;
  perpAvailable: boolean;
  hasOrderbook: boolean;
  hasTrades: boolean;
  heatmapCells: number;
  liveProjectionLevels: number;
  tradeDots: number;
  reasonIfEmpty: string | null;
};

export function logBookmapFrontendDataDiag(payload: Record<string, unknown>): void {
  const now = Date.now();
  if (now - lastAuditAt < AUDIT_INTERVAL_MS) return;
  lastAuditAt = now;
  console.debug("[BOOKMAP_FRONTEND_DATA_DIAG]", payload);
}

export function logBookmapRailwayEnableAudit(payload: BookmapRailwayEnableAuditPayload): void {
  const now = Date.now();
  if (now - lastAuditAt < AUDIT_INTERVAL_MS) return;
  lastAuditAt = now;
  console.debug("[BOOKMAP_RAILWAY_ENABLE_AUDIT]", payload);
}
