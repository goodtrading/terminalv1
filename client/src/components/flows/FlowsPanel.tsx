import { LiquidityHeatmapPanel } from "./LiquidityHeatmapPanel";

export function FlowsPanel() {
  return (
    <div className="w-full h-full min-w-0 min-h-0 flex flex-1 flex-col overflow-hidden bg-terminal-bg text-terminal-text">
      <LiquidityHeatmapPanel />
    </div>
  );
}
