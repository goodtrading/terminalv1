import { useSyncExternalStore } from "react";
import type { ChartSettings } from "./chartSettingsTypes";
import {
  DEFAULT_SETTINGS,
  loadTerminalSettings,
  resetTerminalSettingsStorage,
  saveTerminalSettings,
} from "@/lib/terminalSettings";

const PERSIST_DEBOUNCE_MS = 220;

let state: ChartSettings = loadTerminalSettings();
const listeners = new Set<() => void>();
let persistTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((fn) => fn());
}

function schedulePersist() {
  if (persistTimer) clearTimeout(persistTimer);
  persistTimer = setTimeout(() => {
    persistTimer = null;
    saveTerminalSettings(state);
  }, PERSIST_DEBOUNCE_MS);
}

export function getChartSettings(): ChartSettings {
  return state;
}

export function setChartSettings(partial: Partial<ChartSettings>): void {
  state = {
    appearance: partial.appearance ? { ...state.appearance, ...partial.appearance } : state.appearance,
    scales: partial.scales ? { ...state.scales, ...partial.scales } : state.scales,
    overlays: partial.overlays ? { ...state.overlays, ...partial.overlays } : state.overlays,
    interaction: partial.interaction ? { ...state.interaction, ...partial.interaction } : state.interaction,
    drawings: partial.drawings ? { ...state.drawings, ...partial.drawings } : state.drawings,
    performance: partial.performance ? { ...state.performance, ...partial.performance } : state.performance,
  };
  emit();
  schedulePersist();
}

export function replaceChartSettings(next: ChartSettings): void {
  state = JSON.parse(JSON.stringify(next)) as ChartSettings;
  emit();
  schedulePersist();
}

export function resetChartSettings(): void {
  state = resetTerminalSettingsStorage();
  emit();
  saveTerminalSettings(state);
}

export function subscribeChartSettings(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function useChartSettings(): ChartSettings {
  return useSyncExternalStore(subscribeChartSettings, getChartSettings, getChartSettings);
}

export function useChartSettingsSelector<T>(selector: (settings: ChartSettings) => T): T {
  return useSyncExternalStore(subscribeChartSettings, () => selector(getChartSettings()), () => selector(getChartSettings()));
}
