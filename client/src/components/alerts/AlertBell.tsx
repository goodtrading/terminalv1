import { Bell, ExternalLink } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { useAlertActions, useLatestAlerts, useUnreadAlertCount } from "@/hooks/useAlerts";
import { AlertListItem } from "./AlertListItem";

interface AlertBellProps {
  onOpenCenter?: () => void;
}

export function AlertBell({ onOpenCenter }: AlertBellProps) {
  const count = useUnreadAlertCount();
  const latest = useLatestAlerts(5);
  const actions = useAlertActions();
  const unread = count.data?.count ?? 0;

  return (
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-8 w-8" title="Alertas">
          <Bell className="h-4 w-4" />
          {unread > 0 ? (
            <span className="absolute -right-1 -top-1 min-w-4 rounded-full bg-red-500 px-1 text-[10px] font-semibold text-white">
              {unread > 99 ? "99+" : unread}
            </span>
          ) : null}
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-[380px] border-terminal-border bg-terminal-panel p-2 text-terminal-text">
        <div className="mb-2 flex items-center justify-between gap-2 border-b border-terminal-border pb-2">
          <div>
            <h2 className="text-xs font-semibold uppercase tracking-wide text-white">Alertas</h2>
            <p className="text-[11px] text-terminal-muted">{unread} sin leer</p>
          </div>
          <Button variant="ghost" size="sm" className="h-7 gap-1 px-2 text-[11px]" onClick={onOpenCenter}>
            <ExternalLink className="h-3.5 w-3.5" />
            Centro
          </Button>
        </div>
        <div className="max-h-[420px] space-y-2 overflow-auto">
          {latest.isError ? <p className="p-3 text-xs text-red-300">No se pudieron cargar alertas.</p> : null}
          {latest.isLoading ? <p className="p-3 text-xs text-terminal-muted">Cargando...</p> : null}
          {latest.data?.alerts.length === 0 ? (
            <p className="p-3 text-xs text-terminal-muted">Sin alertas recientes.</p>
          ) : null}
          {latest.data?.alerts.map((alert) => (
            <AlertListItem
              key={alert.id}
              alert={alert}
              compact
              onRead={(id) => actions.mutate({ id, action: "read" })}
              onAcknowledge={(id) => actions.mutate({ id, action: "acknowledge" })}
              onDismiss={(id) => actions.mutate({ id, action: "dismiss" })}
            />
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
}
