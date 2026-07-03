import type { AlertEvent } from "@shared/alerts";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";
import { presentAlert } from "@/lib/alertPresentation";
import { domainIcon, severityClass, severityDotClass } from "./alertUi";

interface AlertListItemProps {
  alert: AlertEvent;
  compact?: boolean;
  onRead?: (id: string) => void;
  onAcknowledge?: (id: string) => void;
  onDismiss?: (id: string) => void;
}

export function AlertListItem({ alert, compact, onRead, onAcknowledge, onDismiss }: AlertListItemProps) {
  const Icon = domainIcon(alert.domain);
  const presented = presentAlert(alert);
  const resolvedAt = new Date(alert.createdAt).toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
  const isClosed = ["read", "acknowledged", "dismissed"].includes(alert.status);

  return (
    <article className={cn("border px-3 py-2", severityClass(alert.severity), compact ? "rounded-sm" : "rounded-md")}>
      <div className="flex items-start gap-2">
        <span className={cn("mt-1 h-2 w-2 shrink-0 rounded-full", severityDotClass(alert.severity))} />
        <Icon className="mt-0.5 h-4 w-4 shrink-0" />
        <div className="min-w-0 flex-1">
          <div className="flex min-w-0 items-center gap-2">
            <h3 className="truncate text-xs font-semibold text-white">{presented.title}</h3>
            <span className="shrink-0 font-mono text-[10px]">{alert.severity}</span>
            {presented.symbol ? <span className="shrink-0 font-mono text-[10px]">{presented.symbol}</span> : null}
            {presented.simulated ? <span className="shrink-0 text-[10px] uppercase text-amber-300/80">test</span> : null}
          </div>
          <p className={cn("mt-0.5 text-[11px] leading-4", compact ? "line-clamp-2" : "")}>
            {presented.shortMessage}
          </p>
          <div className="mt-2 flex items-center justify-between gap-2 text-[10px] uppercase tracking-wide text-terminal-muted">
            <span>{alert.domain}</span>
            <span>{resolvedAt}</span>
          </div>
          {!compact ? (
            <details className="mt-2 text-[11px] text-terminal-muted">
              <summary className="cursor-pointer">Detalles</summary>
              <pre className="mt-2 max-h-40 overflow-auto rounded-sm bg-black/30 p-2 text-[10px]">
                {JSON.stringify(alert.metadata, null, 2)}
              </pre>
            </details>
          ) : null}
        </div>
      </div>
      <div className="mt-2 flex justify-end gap-2">
        {!isClosed && !alert.requiresAcknowledgement ? (
          <Button size="sm" variant="outline" className="h-7 px-2 text-[11px]" onClick={() => onRead?.(alert.id)}>
            Leida
          </Button>
        ) : null}
        {alert.requiresAcknowledgement && alert.status !== "acknowledged" ? (
          <Button size="sm" className="h-7 px-2 text-[11px]" onClick={() => onAcknowledge?.(alert.id)}>
            Reconocer
          </Button>
        ) : null}
        {!alert.requiresAcknowledgement && alert.status !== "dismissed" ? (
          <Button size="sm" variant="ghost" className="h-7 px-2 text-[11px]" onClick={() => onDismiss?.(alert.id)}>
            Descartar
          </Button>
        ) : null}
      </div>
    </article>
  );
}
