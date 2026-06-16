import {
  isBookmapEnabled,
  isDesktopRuntime,
  isFlowsEnabled,
} from "@/lib/runtimeFeatures";

export type RuntimeFeatures = {
  heatmapEnabled: boolean;
  flowsEnabled: boolean;
  bookmapEnabled: boolean;
  isDesktopRuntime: boolean;
  loading: boolean;
};

export function useRuntimeFeatures(): RuntimeFeatures {
  const flowsEnabled = isFlowsEnabled();

  return {
    heatmapEnabled: flowsEnabled,
    flowsEnabled,
    bookmapEnabled: isBookmapEnabled(),
    isDesktopRuntime: isDesktopRuntime(),
    loading: false,
  };
}
