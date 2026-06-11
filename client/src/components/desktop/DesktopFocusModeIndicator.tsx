import { cn } from "@/lib/utils";

type DesktopFocusModeIndicatorProps = {
  className?: string;
};

export function DesktopFocusModeIndicator({ className }: DesktopFocusModeIndicatorProps) {
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full border border-slate-600/45 bg-slate-900/35 px-1.5 py-0.5 text-[8px] font-mono uppercase tracking-wide text-slate-400",
        className,
      )}
      title="Side and bottom panels are hidden"
      data-testid="desktop-focus-mode-indicator"
    >
      <span className="h-1 w-1 rounded-full bg-slate-500/80" />
      Focus mode
    </span>
  );
}
