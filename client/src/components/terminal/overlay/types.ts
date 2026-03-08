export interface OverlayConfig {
  id: string;
  name: string;
  shortLabel: string;
  enabled: boolean;
  priority: number;
}

export interface TabOverlayConfig {
  tabId: string;
  overlays: OverlayConfig[];
}

export interface OverlayState {
  tabs: TabOverlayConfig[];
  activeTab: string;
}

export interface OverlayRenderContext {
  price: number;
  threshold: number;
  positioning?: any;
  market?: any;
  levels?: any;
  positioning_engines?: any;
  sweepDetector?: any;
  vacuumState?: any;
}

export interface OverlayEntry {
  price: number;
  priority: number;
  label: string;
  shortLabel: string;
  color: string;
  style: number;
  width: number;
  axisLabel: boolean;
  isBandFill?: boolean;
}

export type OverlayRenderer = (context: OverlayRenderContext) => OverlayEntry[];

export const OVERLAY_TYPES = {
  GAMMA_LEVELS: 'gammaLevels',
  LIQUIDITY_LEVELS: 'liquidityLevels', 
  SWEEP_ZONES: 'sweepZones',
  CASCADE_LEVELS: 'cascadeLevels',
  SQUEEZE_LEVELS: 'squeezeLevels',
  VACUUM_ZONES: 'vacuumZones',
  THIN_LIQUIDITY: 'thinLiquidity',
  HEATMAP_LIQUIDITY: 'heatmapLiquidity'
} as const;

export const DEFAULT_TAB_CONFIGS: TabOverlayConfig[] = [
  {
    tabId: 'LEVELS',
    overlays: [
      { id: OVERLAY_TYPES.LIQUIDITY_LEVELS, name: 'Liquidity Levels', shortLabel: 'LIQ', enabled: true, priority: 1 },
      { id: OVERLAY_TYPES.GAMMA_LEVELS, name: 'Gamma Levels', shortLabel: 'GAM', enabled: true, priority: 2 },
      { id: OVERLAY_TYPES.SWEEP_ZONES, name: 'Sweep Zones', shortLabel: 'SWP', enabled: true, priority: 3 },
      { id: OVERLAY_TYPES.VACUUM_ZONES, name: 'Vacuum Zones', shortLabel: 'VAC', enabled: true, priority: 4 },
      { id: OVERLAY_TYPES.THIN_LIQUIDITY, name: 'Thin Liquidity', shortLabel: 'THIN', enabled: true, priority: 5 }
    ]
  },
  {
    tabId: 'GAMMA',
    overlays: [
      { id: OVERLAY_TYPES.GAMMA_LEVELS, name: 'Gamma Levels', shortLabel: 'GAM', enabled: true, priority: 1 },
      { id: OVERLAY_TYPES.SWEEP_ZONES, name: 'Sweep Zones', shortLabel: 'SWP', enabled: false, priority: 2 },
      { id: OVERLAY_TYPES.VACUUM_ZONES, name: 'Vacuum Zones', shortLabel: 'VAC', enabled: false, priority: 3 }
    ]
  },
  {
    tabId: 'CASCADE',
    overlays: [
      { id: OVERLAY_TYPES.CASCADE_LEVELS, name: 'Cascade Levels', shortLabel: 'CSC', enabled: true, priority: 1 },
      { id: OVERLAY_TYPES.SWEEP_ZONES, name: 'Sweep Zones', shortLabel: 'SWP', enabled: true, priority: 2 },
      { id: OVERLAY_TYPES.VACUUM_ZONES, name: 'Vacuum Zones', shortLabel: 'VAC', enabled: false, priority: 3 }
    ]
  },
  {
    tabId: 'SQUEEZE',
    overlays: [
      { id: OVERLAY_TYPES.SQUEEZE_LEVELS, name: 'Squeeze Levels', shortLabel: 'SQZ', enabled: true, priority: 1 },
      { id: OVERLAY_TYPES.SWEEP_ZONES, name: 'Sweep Zones', shortLabel: 'SWP', enabled: true, priority: 2 },
      { id: OVERLAY_TYPES.VACUUM_ZONES, name: 'Vacuum Zones', shortLabel: 'VAC', enabled: false, priority: 3 }
    ]
  },
  {
    tabId: 'HEATMAP',
    overlays: [
      { id: OVERLAY_TYPES.HEATMAP_LIQUIDITY, name: 'Liquidity Heatmap', shortLabel: 'HEAT', enabled: true, priority: 1 },
      { id: OVERLAY_TYPES.VACUUM_ZONES, name: 'Vacuum Zones', shortLabel: 'VAC', enabled: false, priority: 2 }
    ]
  }
];
