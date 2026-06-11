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
        "inline-flex items-center rounded-sm border border-terminal-border/70 bg-terminal-panel/50 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide transition-colors",
        panelsVisible
          ? "text-terminal-muted hover:text-white hover:border-white/25"
          : "text-terminal-accent border-terminal-accent/35 bg-terminal-accent/10 hover:bg-terminal-accent/15",
        className,
      )}
      title="Hide side and bottom panels to focus on the chart"
      data-testid="desktop-panel-visibility-toggle"
    >
      {panelsVisible ? "Ocultar paneles" : "Mostrar paneles"}
    </button>
  );
}
