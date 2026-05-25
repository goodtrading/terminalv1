export interface OverlayState {
  gammaLevels: boolean;
  liquidityLevels: boolean;
  sweepLevels: boolean;
  cliffLevels: boolean;
  cascadeLevels: boolean;
  squeezeLevels: boolean;
  heatmap: boolean;
  shortGammaPockets: boolean;
}

export const OVERLAY_NAMES = {
  gammaLevels: 'Gamma Levels',
  liquidityLevels: 'Liquidity Levels', 
  sweepLevels: 'Sweep Levels',
  cliffLevels: 'Cliff Levels',
  cascadeLevels: 'Cascade Levels',
  squeezeLevels: 'Squeeze Levels',
  heatmap: 'Heatmap',
  shortGammaPockets: 'Short Gamma Pockets'
} as const;

export const OVERLAY_SHORT_LABELS = {
  gammaLevels: 'GAM',
  liquidityLevels: 'LIQ',
  sweepLevels: 'SWP',
  cliffLevels: 'CLF',
  cascadeLevels: 'CSC',
  squeezeLevels: 'SQZ',
  heatmap: 'HEAT',
  shortGammaPockets: 'SGP'
} as const;

export type OverlayType = keyof OverlayState;
