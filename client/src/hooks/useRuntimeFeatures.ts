import { apiUrl } from "../lib/apiBase";
import { useEffect, useState } from "react";

type RuntimeFeatures = {
  heatmapEnabled: boolean;
  loading: boolean;
};

const isDesktop = import.meta.env.VITE_PLATFORM === "desktop";
const desktopHeatmapEnabled = isDesktop && import.meta.env.VITE_HEATMAP_ENABLED === "true";
const initialHeatmapEnabled = desktopHeatmapEnabled || import.meta.env.DEV;

export function useRuntimeFeatures(): RuntimeFeatures {
  const [heatmapEnabled, setHeatmapEnabled] = useState(initialHeatmapEnabled);
  const [loading, setLoading] = useState(!import.meta.env.DEV && !desktopHeatmapEnabled);

  useEffect(() => {
    let cancelled = false;

    async function loadRuntimeFeatures() {
      try {
        const res = await fetch(apiUrl("/api/runtime/features"), { credentials: "include" });
        if (!res.ok) throw new Error(`features ${res.status}`);
        const data = (await res.json()) as { heatmapEnabled?: unknown };
        if (!cancelled) {
          setHeatmapEnabled(desktopHeatmapEnabled || data.heatmapEnabled !== false);
        }
      } catch {
        if (!cancelled) {
          setHeatmapEnabled(desktopHeatmapEnabled || import.meta.env.DEV);
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
