/**
 * Terminal / chart UI settings — defaults, persistence, migration.
 * Chart store (`chartSettingsStore`) hydrates from here; no React imports to avoid cycles.
 */
import type { ChartSettings } from "@/components/terminal/chart/chartSettingsTypes";

export const TERMINAL_SETTINGS_STORAGE_KEY = "gt_terminal_settings";
export const LEGACY_CHART_SETTINGS_STORAGE_KEY = "gt-chart-settings-v1";

export const DEFAULT_SETTINGS: ChartSettings = {
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

/** @deprecated Use DEFAULT_SETTINGS */
export const DEFAULT_CHART_SETTINGS = DEFAULT_SETTINGS;

function cloneDefaults(): ChartSettings {
  return JSON.parse(JSON.stringify(DEFAULT_SETTINGS)) as ChartSettings;
}

function mergeWithDefaults(parsed: Partial<ChartSettings>): ChartSettings {
  const d = cloneDefaults();
  return {
    appearance: { ...d.appearance, ...parsed.appearance },
    scales: { ...d.scales, ...parsed.scales },
    overlays: { ...d.overlays, ...parsed.overlays },
    interaction: { ...d.interaction, ...parsed.interaction },
    drawings: { ...d.drawings, ...parsed.drawings },
    performance: { ...d.performance, ...parsed.performance },
  };
}

function readRawFromStorage(): string | null {
  try {
    const next = localStorage.getItem(TERMINAL_SETTINGS_STORAGE_KEY);
    if (next) return next;
    const legacy = localStorage.getItem(LEGACY_CHART_SETTINGS_STORAGE_KEY);
    if (legacy) {
      localStorage.setItem(TERMINAL_SETTINGS_STORAGE_KEY, legacy);
      localStorage.removeItem(LEGACY_CHART_SETTINGS_STORAGE_KEY);
      return legacy;
    }
  } catch {
    /* ignore */
  }
  return null;
}

export function loadTerminalSettings(): ChartSettings {
  try {
    const raw = readRawFromStorage();
    if (!raw) return cloneDefaults();
    const unverified = JSON.parse(raw) as unknown;
    if (!unverified || typeof unverified !== "object") return cloneDefaults();
    const parsed = unverified as Partial<ChartSettings>;
    return mergeWithDefaults(parsed);
  } catch {
    return cloneDefaults();
  }
}

export function saveTerminalSettings(settings: ChartSettings): void {
  try {
    localStorage.setItem(TERMINAL_SETTINGS_STORAGE_KEY, JSON.stringify(settings));
  } catch {
    /* quota / private mode */
  }
}

/** Clears persisted keys and returns fresh defaults. */
export function resetTerminalSettingsStorage(): ChartSettings {
  try {
    localStorage.removeItem(TERMINAL_SETTINGS_STORAGE_KEY);
    localStorage.removeItem(LEGACY_CHART_SETTINGS_STORAGE_KEY);
  } catch {
    /* ignore */
  }
  return cloneDefaults();
}
