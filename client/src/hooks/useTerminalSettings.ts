import { useCallback, useMemo } from "react";
import type { ChartSettings } from "@/components/terminal/chart/chartSettingsTypes";
import {
  replaceChartSettings,
  resetChartSettings,
  setChartSettings,
  useChartSettings,
} from "@/components/terminal/chart/chartSettingsStore";

/**
 * React API for terminal/chart settings (live + auto-persisted via chartSettingsStore).
 */
export function useTerminalSettings(): {
  settings: ChartSettings;
  updateSettings: (partial: Partial<ChartSettings>) => void;
  setSettings: (next: ChartSettings) => void;
  resetSettings: () => void;
} {
  const settings = useChartSettings();

  const updateSettings = useCallback((partial: Partial<ChartSettings>) => {
    setChartSettings(partial);
  }, []);

  const setSettings = useCallback((next: ChartSettings) => {
    replaceChartSettings(next);
  }, []);

  const resetSettings = useCallback(() => {
    resetChartSettings();
  }, []);

  return useMemo(
    () => ({ settings, updateSettings, setSettings, resetSettings }),
    [settings, updateSettings, setSettings, resetSettings],
  );
}
