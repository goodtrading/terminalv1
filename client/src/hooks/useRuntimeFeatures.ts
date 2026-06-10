import { useEffect, useState } from "react";

type RuntimeFeatures = {
  heatmapEnabled: boolean;
  loading: boolean;
};

const initialHeatmapEnabled =
  import.meta.env.DEV || import.meta.env.VITE_HEATMAP_ENABLED === "true";

export function useRuntimeFeatures(): RuntimeFeatures {
  const [heatmapEnabled, setHeatmapEnabled] = useState(initialHeatmapEnabled);
  const [loading, setLoading] = useState(!import.meta.env.DEV);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeFeatures() {
      try {
        const res = await fetch("/api/runtime/features", { credentials: "include" });
        if (!res.ok) throw new Error(`features ${res.status}`);
        const data = (await res.json()) as { heatmapEnabled?: unknown };
        if (!cancelled) {
          setHeatmapEnabled(data.heatmapEnabled !== false);
        }
      } catch {
        if (!cancelled) {
          setHeatmapEnabled(import.meta.env.DEV);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadRuntimeFeatures();

    return () => {
      cancelled = true;
    };
  }, []);

  return { heatmapEnabled, loading };
}
