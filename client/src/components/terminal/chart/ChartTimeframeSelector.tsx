import { CHART_TIMEFRAMES } from "@/lib/chartTimeframes";
import { setChartTimeframe, useChartTimeframe } from "@/stores/chartTimeframeStore";
import { cn } from "@/lib/utils";

export function ChartTimeframeSelector() {
  const tf = useChartTimeframe();

  return (
    <div
      className="flex h-6 items-center gap-0.5 rounded-[2px] border border-white/10 bg-black/42 px-0.5 py-0"
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
            "h-[22px] min-w-[2rem] px-1.5 py-0 text-[9px] leading-none font-mono uppercase tracking-wider rounded-[2px] transition-colors",
            tf === t.id
              ? "bg-red-950/60 text-red-300 border border-red-500/35"
              : "text-white/50 hover:text-white/90 border border-transparent hover:bg-white/[0.06]",
          )}
        >
          {t.label}
        </button>
      ))}
    </div>
  );
}
