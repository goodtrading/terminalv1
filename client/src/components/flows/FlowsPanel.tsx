import { LiquidityHeatmapPanel } from "./LiquidityHeatmapPanel";
import { useRuntimeFeatures } from "@/hooks/useRuntimeFeatures";

export function FlowsPanel() {
  const { heatmapEnabled, loading } = useRuntimeFeatures();

  if (!heatmapEnabled && !loading) {
    return (
      <div className="w-full h-full min-w-0 min-h-0 flex flex-1 items-center justify-center overflow-hidden bg-terminal-bg text-terminal-text">
        <div className="px-4 py-3 text-center text-sm text-terminal-muted">
          Heatmap disponible en GoodTrading Desktop
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="w-full h-full min-w-0 min-h-0 flex flex-1 items-center justify-center overflow-hidden bg-terminal-bg text-terminal-text">
        <div className="px-4 py-3 text-center text-sm text-terminal-muted">
          Loading Flows
        </div>
      </div>
    );
  }

  return (
    <div className="w-full h-full min-w-0 min-h-0 flex flex-1 flex-col overflow-hidden bg-terminal-bg text-terminal-text">
      <LiquidityHeatmapPanel />
    </div>
  );
}
