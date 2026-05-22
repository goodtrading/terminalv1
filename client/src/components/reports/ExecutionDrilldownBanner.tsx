import { cn } from "@/lib/utils";
import type { ExecutionDrilldownFilter } from "./useReportsDrilldown";

export function ExecutionDrilldownBanner({
  filter,
  filteredCount,
  totalCount,
  onClear,
}: {
  filter: NonNullable<ExecutionDrilldownFilter>;
  filteredCount: number;
  totalCount: number;
  onClear: () => void;
}) {
  const getFilterLabel = (): string => {
    switch (filter.type) {
      case "playbook":
        return `Playbook: ${filter.label}`;
      case "mistake":
        return `Mistake: ${filter.label}`;
      case "delta":
        return `Delta: ${filter.label}`;
      case "quality":
        return `Quality: ${filter.label}`;
      case "risk":
        return `Risk: ${filter.label}`;
      default:
        // TypeScript exhaustive check - should never happen
        const _exhaustive: never = filter;
        return "Unknown filter";
    }
  };

  return (
    <div className="border border-terminal-accent/40 bg-terminal-accent/5 px-3 py-2 mb-4 flex items-center justify-between">
      <div className="flex items-center gap-2">
        <span className="text-[9px] font-bold uppercase tracking-wider text-terminal-accent">
          SESSION DRILLDOWN
        </span>
        <span className="text-[10px] text-slate-300">
          {getFilterLabel()} · {filteredCount}/{totalCount} trades
        </span>
      </div>
      <button
        type="button"
        onClick={onClear}
        className="text-[9px] font-bold uppercase tracking-wider text-cyan-500/80 hover:text-cyan-300"
      >
        CLEAR
      </button>
    </div>
  );
}
