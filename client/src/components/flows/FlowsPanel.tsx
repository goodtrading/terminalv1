import { lazy, Suspense } from "react";
import { isFlowsEnabled } from "@/lib/runtimeFeatures";
import { FlowsDesktopUpsell } from "./FlowsDesktopUpsell";

const LiquidityHeatmapPanel = lazy(async () => {
  const mod = await import("./LiquidityHeatmapPanel");
  return { default: mod.LiquidityHeatmapPanel };
});

export function FlowsPanel() {
  if (!isFlowsEnabled()) {
    return <FlowsDesktopUpsell />;
  }

  return (
    <div className="flex h-full min-h-0 w-full min-w-0 flex-1 flex-col overflow-hidden bg-terminal-bg text-terminal-text">
      <Suspense
        fallback={
          <div className="flex h-full min-h-0 w-full flex-1 items-center justify-center bg-black px-4 py-3 text-center text-sm font-mono text-slate-500">
            Loading Flows…
          </div>
        }
      >
        <LiquidityHeatmapPanel />
      </Suspense>
    </div>
  );
}
