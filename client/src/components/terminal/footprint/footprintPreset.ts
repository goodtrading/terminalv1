/**
 * Preset base estilo ATAS (Fase 1.2+) — sin UI todavía.
 * Usar como fuente única para ratios, límites y opacidad.
 */
export const FOOTPRINT_PRESET_ATAS = {
  id: "ATAS_DARK_PRO" as const,
  imbalanceRatio: 3,
  stackedLevels: 3,
  minLevelVolumeBtc: 0.25,
  maxLevelsCompact: 5,
  maxLevelsFull: 40,
  showPoc: true,
  showDelta: true,
  showImbalance: true,
  showStackedImbalance: true,
  showUnfinishedAuction: false,
  showAbsorption: false,
  opacity: 0.85,
};
