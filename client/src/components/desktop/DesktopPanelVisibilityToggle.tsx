import { cn } from "@/lib/utils";

type DesktopPanelVisibilityToggleProps = {
  panelsVisible: boolean;
  onToggle: () => void;
  className?: string;
};

export function DesktopPanelVisibilityToggle({
  panelsVisible,
  onToggle,
  className,
}: DesktopPanelVisibilityToggleProps) {
  return (
    <button
      type="button"
      onClick={onToggle}
      className={cn(
        "inline-flex items-center rounded-sm border px-2 py-0.5 text-[10px] font-mono tracking-wide transition-colors",
        panelsVisible
          ? "border-terminal-border/70 bg-terminal-panel/40 text-slate-400 hover:border-slate-500/50 hover:text-slate-200"
          : "border-slate-500/35 bg-slate-900/25 text-slate-300 hover:border-slate-400/45 hover:text-white",
        className,
      )}
      title={
        panelsVisible
          ? "Hide side and bottom panels to focus on the chart"
          : "Show side and bottom panels"
      }
      data-testid="desktop-panel-visibility-toggle"
    >
      {panelsVisible ? "Hide panels" : "Show panels"}
    </button>
  );
}
