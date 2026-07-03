import { useMemo, useState } from "react";
import type { AlertDomain, AlertSeverity } from "@shared/alerts";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Input } from "@/components/ui/input";
import { Switch } from "@/components/ui/switch";
import { useAlertActions, useAlertPreferences, useAlerts } from "@/hooks/useAlerts";
import { saveAlertPreferences } from "@/lib/alertsClient";
import { queryClient } from "@/lib/queryClient";
import { AlertListItem } from "./AlertListItem";
import {
  alertMatchesSymbol,
  buildAlertCenterQueryFilters,
  resetAlertFilters,
  statusOptions,
  type AlertStatusFilter,
} from "./AlertCenterFilters";

const severityOptions: Array<AlertSeverity | "all"> = ["all", "P0", "P1", "P2", "P3", "P4"];
const domainOptions: Array<AlertDomain | "all"> = ["all", "gamma", "market", "flow", "account", "system"];

function alertLoadMessage(error: unknown): { title: string; detail?: string } {
  const raw = error instanceof Error ? error.message : String(error ?? "");
  if (raw.includes("ALERTS_DISABLED")) return { title: "El sistema de alertas está deshabilitado." };
  if (raw.includes("ALERTS_PERSISTENCE_UNAVAILABLE") || raw.includes("alert_migration_missing")) {
    return { title: "Persistencia de alertas no disponible." };
  }
  if (raw.startsWith("401:") || raw.includes("UNAUTHORIZED")) return { title: "No hay sesión activa para cargar alertas." };
  if (raw.startsWith("403:") || raw.includes("SUBSCRIPTION_REQUIRED")) return { title: "Sin permisos para cargar el historial de alertas." };
  return {
    title: "No se pudo cargar el historial de alertas.",
    detail: import.meta.env.DEV && raw ? raw.slice(0, 220) : undefined,
  };
}

export function AlertCenter() {
  const [statusFilter, setStatusFilter] = useState<AlertStatusFilter>("all");
  const [severity, setSeverity] = useState<AlertSeverity | "all">("all");
  const [domain, setDomain] = useState<AlertDomain | "all">("all");
  const [symbol, setSymbol] = useState("");
  const filters = useMemo(
    () => buildAlertCenterQueryFilters(statusFilter, severity, domain),
    [domain, severity, statusFilter],
  );
  const alerts = useAlerts(filters);
  const prefs = useAlertPreferences();
  const actions = useAlertActions();
  const filteredAlerts = useMemo(() => {
    const rows = alerts.data?.alerts ?? [];
    const byStatus =
      statusFilter === "ack_required"
        ? rows.filter((alert) => alert.requiresAcknowledgement && alert.status !== "acknowledged")
        : rows;
    return byStatus.filter((alert) => alertMatchesSymbol(alert.symbol, symbol));
  }, [alerts.data?.alerts, statusFilter, symbol]);
  const hasActiveFilters = statusFilter !== "all" || severity !== "all" || domain !== "all" || symbol.trim() !== "";
  const hasNoResults = !alerts.isLoading && !alerts.isError && alerts.data != null && filteredAlerts.length === 0;
  const emptyMessage = hasActiveFilters
    ? "No hay alertas que coincidan con los filtros actuales."
    : "Todavía no se generaron alertas.";
  const loadError = alerts.isError ? alertLoadMessage(alerts.error) : null;

  const clearFilters = () => {
    const next = resetAlertFilters();
    setStatusFilter(next.statusFilter);
    setSeverity(next.severity);
    setDomain(next.domain);
    setSymbol(next.symbol);
  };

  const toggleAlerts = async (enabled: boolean) => {
    if (!prefs.data) return;
    await saveAlertPreferences({ ...prefs.data, enabled });
    await queryClient.invalidateQueries({ queryKey: ["/api/alerts/preferences"] });
  };

  return (
    <section className="flex h-full min-h-0 flex-col bg-terminal-bg text-terminal-text">
      <div className="shrink-0 border-b border-terminal-border bg-terminal-panel/40 px-4 py-3">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h1 className="text-sm font-semibold uppercase tracking-wide text-white">Centro de alertas</h1>
            <p className="mt-1 text-xs text-terminal-muted">Historial visible, filtros y preferencias principales.</p>
          </div>
          <label className="flex items-center gap-2 text-xs text-terminal-muted">
            <Switch checked={prefs.data?.enabled ?? true} onCheckedChange={toggleAlerts} />
            Alertas activas
          </label>
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Select value={statusFilter} onValueChange={(value) => setStatusFilter(value as AlertStatusFilter)}>
            <SelectTrigger className="h-8 w-48 border-terminal-border bg-terminal-panel/70 text-xs text-terminal-text">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[100] border-terminal-border bg-terminal-panel text-terminal-text">
              {statusOptions.map((item) => (
                <SelectItem key={item.value} value={item.value} className="text-xs">
                  {item.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={severity} onValueChange={(value) => setSeverity(value as AlertSeverity | "all")}>
            <SelectTrigger className="h-8 w-28 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              {severityOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item === "all" ? "Todas" : item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Select value={domain} onValueChange={(value) => setDomain(value as AlertDomain | "all")}>
            <SelectTrigger className="h-8 w-32 text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent className="z-[100]">
              {domainOptions.map((item) => (
                <SelectItem key={item} value={item}>
                  {item === "all" ? "Todos" : item}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Input
            value={symbol}
            onChange={(event) => setSymbol(event.target.value.toUpperCase())}
            placeholder="Símbolo"
            className="h-8 w-32 text-xs"
          />
        </div>
      </div>

      <div className="min-h-0 flex-1 overflow-auto p-4">
        {loadError ? (
          <div className="rounded border border-red-500/30 bg-red-950/20 p-3 text-sm text-red-200">
            <p>{loadError.title}</p>
            {loadError.detail ? <p className="mt-1 break-words text-xs text-red-200/70">{loadError.detail}</p> : null}
          </div>
        ) : null}
        {alerts.isLoading ? <p className="text-sm text-terminal-muted">Cargando alertas...</p> : null}
        {hasNoResults ? (
          <div className="flex h-full flex-col items-center justify-center gap-3 text-sm text-terminal-muted">
            <span>{emptyMessage}</span>
            {hasActiveFilters ? (
              <Button variant="outline" size="sm" className="h-8 text-xs" onClick={clearFilters}>
                Limpiar filtros
              </Button>
            ) : null}
          </div>
        ) : null}
        <div className="grid gap-2 xl:grid-cols-2">
          {filteredAlerts.map((alert) => (
            <AlertListItem
              key={alert.id}
              alert={alert}
              onRead={(id) => actions.mutate({ id, action: "read" })}
              onAcknowledge={(id) => actions.mutate({ id, action: "acknowledge" })}
              onDismiss={(id) => actions.mutate({ id, action: "dismiss" })}
            />
          ))}
        </div>
      </div>
    </section>
  );
}
