import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

export type DesktopEmptyStateStatus =
  | "loading"
  | "waiting"
  | "locked"
  | "error"
  | "coming-soon"
  | "readonly";

type DesktopEmptyStateProps = {
  title: string;
  description?: string;
  status?: DesktopEmptyStateStatus;
  actionLabel?: string;
  onAction?: () => void;
  secondaryActionLabel?: string;
  onSecondaryAction?: () => void;
  compact?: boolean;
  className?: string;
};

const STATUS_META: Record<
  DesktopEmptyStateStatus,
  { pill: string; pillClass: string }
> = {
  loading: { pill: "Loading", pillClass: "border-slate-600/60 text-slate-400 bg-slate-900/40" },
  waiting: { pill: "Waiting", pillClass: "border-amber-500/35 text-amber-200 bg-amber-950/20" },
  locked: { pill: "Locked", pillClass: "border-amber-500/35 text-amber-200 bg-amber-950/20" },
  error: { pill: "Error", pillClass: "border-red-500/35 text-red-200 bg-red-950/20" },
  "coming-soon": { pill: "Coming soon", pillClass: "border-slate-600/60 text-slate-400 bg-slate-900/40" },
  readonly: { pill: "Read-only", pillClass: "border-cyan-500/35 text-cyan-200 bg-cyan-950/20" },
};

export function DesktopEmptyState({
  title,
  description,
  status = "waiting",
  actionLabel,
  onAction,
  secondaryActionLabel,
  onSecondaryAction,
  compact = false,
  className,
}: DesktopEmptyStateProps) {
  const meta = STATUS_META[status];
  const showPrimary = Boolean(actionLabel && onAction);
  const showSecondary = Boolean(secondaryActionLabel && onSecondaryAction);

  return (
    <div
      className={cn(
        "rounded border border-terminal-border/70 bg-terminal-panel/30 font-mono",
        compact ? "p-2.5" : "p-4",
        className,
      )}
    >
      <div className={cn("flex items-start gap-2", compact ? "gap-1.5" : "gap-2.5")}>
        {status === "loading" ? (
          <Loader2 className={cn("shrink-0 animate-spin text-terminal-muted", compact ? "h-3 w-3 mt-0.5" : "h-4 w-4 mt-0.5")} />
        ) : null}
        <div className="min-w-0 flex-1 space-y-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className={cn("font-semibold text-white", compact ? "text-[10px]" : "text-xs")}>
              {title}
            </span>
            <span
              className={cn(
                "rounded-full border px-1.5 py-0.5 text-[8px] uppercase tracking-wide",
                meta.pillClass,
              )}
            >
              {meta.pill}
            </span>
          </div>
          {description ? (
            <p className={cn("text-terminal-muted leading-snug", compact ? "text-[9px]" : "text-[10px]")}>
              {description}
            </p>
          ) : null}
          {showPrimary || showSecondary ? (
            <div className="flex flex-wrap items-center gap-1.5 pt-1">
              {showPrimary ? (
                <button
                  type="button"
                  onClick={onAction}
                  className={cn(
                    "rounded border border-terminal-accent/40 bg-terminal-accent/10 text-terminal-accent hover:bg-terminal-accent/20 transition-colors uppercase tracking-wide",
                    compact ? "px-2 py-0.5 text-[8px]" : "px-2.5 py-1 text-[9px]",
                  )}
                >
                  {actionLabel}
                </button>
              ) : null}
              {showSecondary ? (
                <button
                  type="button"
                  onClick={onSecondaryAction}
                  className={cn(
                    "rounded border border-terminal-border text-slate-400 hover:text-white hover:border-white/25 transition-colors uppercase tracking-wide",
                    compact ? "px-2 py-0.5 text-[8px]" : "px-2.5 py-1 text-[9px]",
                  )}
                >
                  {secondaryActionLabel}
                </button>
              ) : null}
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}
