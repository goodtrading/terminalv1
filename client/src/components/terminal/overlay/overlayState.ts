export interface OverlayState {
  gammaLevels: boolean;
  liquidityLevels: boolean;
  sweepLevels: boolean;
  cliffLevels: boolean;
  cascadeLevels: boolean;
  squeezeLevels: boolean;
  heatmap: boolean;
}

export const OVERLAY_NAMES = {
  gammaLevels: 'Gamma Levels',
  liquidityLevels: 'Liquidity Levels', 
  sweepLevels: 'Sweep Levels',
  cliffLevels: 'Cliff Levels',
  cascadeLevels: 'Cascade Levels',
  squeezeLevels: 'Squeeze Levels',
  heatmap: 'Heatmap'
} as const;

export const OVERLAY_SHORT_LABELS = {
  gammaLevels: 'GAM',
  liquidityLevels: 'LIQ',
  sweepLevels: 'SWP',
  cliffLevels: 'CLF',
  cascadeLevels: 'CSC',
  squeezeLevels: 'SQZ',
  heatmap: 'HEAT'
} as const;

export type OverlayType = keyof OverlayState;
