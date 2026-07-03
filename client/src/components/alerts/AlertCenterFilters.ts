import type { AlertDomain, AlertSeverity } from "@shared/alerts";

export type AlertStatusFilter = "all" | "unread" | "read" | "ack_required" | "dismissed";

export const statusOptions: Array<{ value: AlertStatusFilter; label: string }> = [
  { value: "all", label: "Todas" },
  { value: "unread", label: "No leídas" },
  { value: "read", label: "Leídas" },
  { value: "ack_required", label: "Requieren reconocimiento" },
  { value: "dismissed", label: "Descartadas" },
];

export function normalizeAlertSymbol(value: string): string {
  return value.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

export function alertMatchesSymbol(alertSymbol: string | undefined, filterValue: string): boolean {
  const normalizedFilter = normalizeAlertSymbol(filterValue);
  if (!normalizedFilter) return true;
  const normalizedAlert = normalizeAlertSymbol(alertSymbol ?? "");
  if (!normalizedAlert) return false;
  if (normalizedAlert === normalizedFilter) return true;
  if (!normalizedFilter.endsWith("USDT")) return normalizedAlert === `${normalizedFilter}USDT`;
  return false;
}

export function resetAlertFilters() {
  return {
    statusFilter: "all" as AlertStatusFilter,
    severity: "all" as AlertSeverity | "all",
    domain: "all" as AlertDomain | "all",
    symbol: "",
  };
}

export function buildAlertCenterQueryFilters(
  statusFilter: AlertStatusFilter,
  severity: AlertSeverity | "all",
  domain: AlertDomain | "all",
) {
  return {
    limit: 80,
    unreadOnly: statusFilter === "unread" ? true : undefined,
    status: statusFilter === "read" || statusFilter === "dismissed" ? statusFilter : undefined,
    severity: severity === "all" ? undefined : severity,
    domain: domain === "all" ? undefined : domain,
  };
}
