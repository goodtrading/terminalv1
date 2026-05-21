import {
  DEFAULT_TERMINAL_EXECUTION_CONTEXT,
  formatChartSymbolDisplay,
  formatExecutionSymbolDisplay,
} from "./executionContext";

type ExecutionVenueStripProps = {
  chartSymbol?: string;
  liveTradingEnabled?: boolean;
  className?: string;
};

export function ExecutionVenueStrip({
  chartSymbol = DEFAULT_TERMINAL_EXECUTION_CONTEXT.chartSymbol,
  liveTradingEnabled = false,
  className,
}: ExecutionVenueStripProps) {
  const ctx = DEFAULT_TERMINAL_EXECUTION_CONTEXT;
  const chartLabel = `${ctx.chartExchange.charAt(0).toUpperCase()}${ctx.chartExchange.slice(1)} ${ctx.chartMarketType === "spot" ? "Spot" : ctx.chartMarketType} ${formatChartSymbolDisplay(chartSymbol)}`;
  const execLabel = `BingX Perpetual ${formatExecutionSymbolDisplay(ctx.executionSymbol)}`;

  return (
    <div
      className={
        className ??
        "rounded border border-terminal-border/80 bg-black/40 px-2 py-1.5 space-y-0.5 text-[8px] font-mono text-slate-500"
      }
    >
      <div className="flex justify-between gap-2">
        <span className="uppercase tracking-wider text-slate-600">Chart</span>
        <span className="text-slate-300 text-right">{chartLabel}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="uppercase tracking-wider text-slate-600">Execution</span>
        <span className="text-cyan-300/90 text-right">{execLabel}</span>
      </div>
      <div className="flex justify-between gap-2 border-t border-terminal-border/50 pt-0.5">
        <span className="uppercase tracking-wider text-slate-600">Live trading</span>
        <span className={liveTradingEnabled ? "text-amber-300" : "text-red-300/90"}>
          {liveTradingEnabled ? "Enabled" : "Locked"}
        </span>
      </div>
    </div>
  );
}
