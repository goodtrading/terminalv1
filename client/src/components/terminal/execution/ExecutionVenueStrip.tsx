import {
  DEFAULT_TERMINAL_EXECUTION_CONTEXT,
  formatChartSymbolDisplay,
  formatExecutionSymbolDisplay,
} from "./executionContext";

type ExecutionVenueStripProps = {
  chartSymbol?: string;
  liveTradingEnabled?: boolean;
  /** When set, shows Mode row (e.g. paper). */
  mode?: "paper" | "live";
  className?: string;
};

export function ExecutionVenueStrip({
  chartSymbol = DEFAULT_TERMINAL_EXECUTION_CONTEXT.chartSymbol,
  liveTradingEnabled = false,
  mode,
  className,
}: ExecutionVenueStripProps) {
  const ctx = DEFAULT_TERMINAL_EXECUTION_CONTEXT;
  const chartLabel = `${ctx.chartExchange.charAt(0).toUpperCase()}${ctx.chartExchange.slice(1)} ${ctx.chartMarketType === "spot" ? "Spot" : ctx.chartMarketType} ${formatChartSymbolDisplay(chartSymbol)}`;
  const execLabel = `BingX Perpetual ${formatExecutionSymbolDisplay(ctx.executionSymbol)}`;

  return (
    <div
      className={
        className ??
        "rounded border border-terminal-border/80 bg-black/40 px-2 py-1 space-y-0.5 text-[8px] font-mono text-slate-500"
      }
    >
      <div className="text-[7px] font-bold uppercase tracking-widest text-slate-600 mb-0.5">
        Execution context
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-slate-600">Chart</span>
        <span className="text-slate-300 text-right">{chartLabel}</span>
      </div>
      <div className="flex justify-between gap-2">
        <span className="text-slate-600">Execution</span>
        <span className="text-cyan-300/90 text-right">{execLabel}</span>
      </div>
      {mode ? (
        <div className="flex justify-between gap-2">
          <span className="text-slate-600">Mode</span>
          <span className={mode === "paper" ? "text-cyan-300/90" : "text-slate-300"}>
            {mode === "paper" ? "Paper" : "Live"}
          </span>
        </div>
      ) : null}
      <div className="flex justify-between gap-2">
        <span className="text-slate-600">Live</span>
        <span className={liveTradingEnabled ? "text-amber-300" : "text-red-300/90"}>
          {liveTradingEnabled ? "Enabled" : "Locked"}
        </span>
      </div>
    </div>
  );
}
