/**
 * Persisted chart + terminal visualization settings (GoodTrading).
 * Kept serializable for localStorage.
 */
export interface ChartSettings {
  appearance: {
    background: string;
    showGrid: boolean;
    gridOpacity: number;
    candleUpColor: string;
    candleDownColor: string;
    textColor: string;
  };
  scales: {
    autoScale: boolean;
    showPriceScale: boolean;
    showTimeScale: boolean;
    pricePrecision: number;
  };
  overlays: {
    showGamma: boolean;
    showHeatmap: boolean;
    showLiquidity: boolean;
    showSweeps: boolean;
    showAbsorptions: boolean;
    showMagnets: boolean;
  };
  interaction: {
    lockCrosshairByTime: boolean;
    showCrosshairHorizontal: boolean;
    showCrosshairVertical: boolean;
    rightClickEnabled: boolean;
  };
  drawings: {
    defaultColor: string;
    defaultLineWidth: number;
    defaultOpacity: number;
    defaultTextSize: number;
  };
  performance: {
    safeMode: boolean;
    reduceLabels: boolean;
    throttleRedraw: boolean;
  };
}

export type ChartSettingsTabId =
  | "appearance"
  | "scales"
  | "overlays"
  | "interaction"
  | "drawings"
  | "performance";
