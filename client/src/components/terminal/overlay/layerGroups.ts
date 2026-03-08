export interface LayerGroupState {
  levels: boolean;
  gamma: boolean;
  cascade: boolean;
  squeeze: boolean;
  heatmap: boolean;
}

export const LAYER_GROUP_NAMES = {
  levels: 'LEVELS',
  gamma: 'GAMMA',
  cascade: 'CASCADE',
  squeeze: 'SQUEEZE',
  heatmap: 'HEATMAP'
} as const;

export type LayerGroup = keyof LayerGroupState;

// Mapping from layer groups to overlay types
export const LAYER_GROUP_OVERLAYS = {
  levels: ['liquidityLevels'],
  gamma: ['gammaLevels', 'cliffLevels'],
  cascade: ['cascadeLevels'],
  squeeze: ['squeezeLevels'],
  heatmap: ['heatmap']
} as const;
