import { cn } from "@/lib/utils";
import type { TerminalViewMode } from "@/hooks/useViewMode";

type Props = {
  mode: TerminalViewMode;
  onChange: (m: TerminalViewMode) => void;
  className?: string;
};

/**
 * Toggle SIMPLE / PRO — estilo desk / terminal institucional (no tabs genéricos).
 */
export function ViewModeToggle({ mode, onChange, className }: Props) {
  return (
    <div
      className={cn(
        "inline-flex items-center rounded-sm border border-white/[0.12] bg-black/55 p-0.5 backdrop-blur-sm",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.04)]",
        className
      )}
      role="group"
      aria-label="Modo de vista"
    >
      {(["SIMPLE", "PRO"] as const).map((m) => {
        const active = mode === m;
        return (
          <button
            key={m}
            type="button"
            onClick={() => onChange(m)}
            className={cn(
              "relative px-3 py-1.5 text-[10px] font-semibold uppercase tracking-[0.14em] transition-colors min-w-[4.5rem]",
              active
                ? "text-white bg-white/[0.08] border border-white/10 shadow-sm"
                : "text-white/38 hover:text-white/65 border border-transparent"
            )}
            data-testid={`view-mode-${m.toLowerCase()}`}
          >
            {m === "SIMPLE" ? "Simple" : "Pro"}
          </button>
        );
      })}
    </div>
  );
}
