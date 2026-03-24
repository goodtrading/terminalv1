/** @deprecated Use `@/lib/terminalSettings` */
import type { ChartSettings } from "./chartSettingsTypes";
import {
  DEFAULT_CHART_SETTINGS,
  DEFAULT_SETTINGS,
  loadTerminalSettings,
  saveTerminalSettings,
} from "@/lib/terminalSettings";

export { DEFAULT_CHART_SETTINGS, DEFAULT_SETTINGS };

export function loadChartSettings(): ChartSettings {
  return loadTerminalSettings();
}

export function saveChartSettings(settings: ChartSettings): void {
  saveTerminalSettings(settings);
}
