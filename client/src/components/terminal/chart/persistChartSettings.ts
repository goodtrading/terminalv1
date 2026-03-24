import type { ChartSettings } from "./chartSettingsTypes";

const STORAGE_KEY = "gt-chart-settings-v1";

export const DEFAULT_CHART_SETTINGS: ChartSettings = {
  appearance: {
    background: "#000000",
    showGrid: true,
    gridOpacity: 0.12,
    candleUpColor: "#22c55e",
    candleDownColor: "#ef4444",
    textColor: "#ffffff",
  },
  scales: {
    autoScale: true,
    showPriceScale: true,
    showTimeScale: true,
    pricePrecision: 2,
  },
  overlays: {
    showGamma: false,
    showHeatmap: false,
    showLiquidity: true,
    showSweeps: false,
    showAbsorptions: true,
    showMagnets: false,
  },
  interaction: {
    lockCrosshairByTime: false,
    showCrosshairHorizontal: true,
    showCrosshairVertical: true,
    rightClickEnabled: true,
  },
  drawings: {
    defaultColor: "#ef4444",
    defaultLineWidth: 2,
    defaultOpacity: 0.9,
    defaultTextSize: 12,
  },
  performance: {
    safeMode: true,
    reduceLabels: false,
    throttleRedraw: false,
  },
};

function cloneDefaults(): ChartSettings {
  return JSON.parse(JSON.stringify(DEFAULT_CHART_SETTINGS)) as ChartSettings;
}

export function loadChartSettings(): ChartSettings {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return cloneDefaults();
    const parsed = JSON.parse(raw) as Partial<ChartSettings>;
    const d = cloneDefaults();
    return {
      appearance: { ...d.appearance, ...parsed.appearance },
      scales: { ...d.scales, ...parsed.scales },
      overlays: { ...d.overlays, ...parsed.overlays },
      interaction: { ...d.interaction, ...parsed.interaction },
      drawings: { ...d.drawings, ...parsed.drawings },
      performance: { ...d.performance, ...parsed.performance },
    };
  } catch {
    return cloneDefaults();
  }
}

export function saveChartSettings(settings: ChartSettings): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota / private mode */
  }
}
