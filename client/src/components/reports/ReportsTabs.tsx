import { cn } from "@/lib/utils";
import type { ReportsTabId } from "./reportsTypes";

export function ReportsTabs({
  tabs,
  activeId,
  onChange,
}: {
  tabs: readonly { id: ReportsTabId; label: string }[];
  activeId: ReportsTabId;
  onChange: (id: ReportsTabId) => void;
}) {
  return (
    <nav
      className="flex flex-wrap gap-0 border-b border-terminal-border shrink-0"
      aria-label="Reports sections"
    >
      {tabs.map((tab) => {
        const active = tab.id === activeId;
        return (
          <button
            key={tab.id}
            type="button"
            onClick={() => onChange(tab.id)}
            className={cn(
              "px-4 py-2.5 text-[10px] font-bold uppercase tracking-[0.14em] border-b-2 transition-colors",
              active
                ? "border-terminal-accent text-white bg-terminal-accent/10"
                : "border-transparent text-slate-500 hover:text-slate-300 hover:bg-white/[0.02]",
            )}
          >
            {tab.label}
          </button>
        );
      })}
    </nav>
  );
}
