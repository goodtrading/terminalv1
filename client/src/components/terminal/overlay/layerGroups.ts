export interface LayerGroupState {
  levels: boolean;
  gamma: boolean;
  cascade: boolean;
  squeeze: boolean;
  heatmap: boolean;
  accel: boolean;
  absorb: boolean;
  gravity: boolean;
}

export const LAYER_GROUP_NAMES = {
  levels: 'LEVELS',
  gamma: 'GAMMA',
  cascade: 'CASCADE',
  squeeze: 'SQUEEZE',
  heatmap: 'HEATMAP',
  accel: 'ACCEL',
  absorb: 'ABSORB',
  gravity: 'GRAVITY',
} as const;

export type LayerGroup = keyof LayerGroupState;

// Mapping from layer groups to overlay types
export const LAYER_GROUP_OVERLAYS = {
  levels: ['liquidityLevels'],
  gamma: ['gammaLevels', 'cliffLevels'],
  cascade: ['cascadeLevels'],
  squeeze: ['squeezeLevels'],
  heatmap: ['heatmap'],
  accel: ['accelZones'],
  absorb: ['absorptionZones'],
  gravity: ['gravityZones', 'oiLabels'],
} as const;
