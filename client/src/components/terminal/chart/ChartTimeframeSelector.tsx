import { CHART_TIMEFRAMES } from "@/lib/chartTimeframes";
import { setChartTimeframe, useChartTimeframe } from "@/stores/chartTimeframeStore";
import { cn } from "@/lib/utils";

export function ChartTimeframeSelector() {
  const tf = useChartTimeframe();

  return (
    <div
      className="flex items-center gap-0.5 rounded border border-white/10 bg-black/55 px-1 py-0.5 backdrop-blur-sm"
      title="Timeframe"
      role="group"
      aria-label="Chart timeframe"
    >
      {CHART_TIMEFRAMES.map((t) => (
        <button
          key={t.id}
          type="button"
          onClick={() => setChartTimeframe(t.id)}
          className={cn(
            "min-w-[2.25rem] px-2 py-0.5 text-[10px] font-mono uppercase tracking-wider rounded-sm transition-colors",
            tf === t.id
              ? "bg-red-950/70 text-red-300 border border-red-500/40"
              : "text-white/50 hover:text-white/90 border border-transparent hover:bg-white/[0.06]",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
