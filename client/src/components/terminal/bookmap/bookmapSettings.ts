export type DotScaleMode = "linear" | "log" | "adaptive";
export type AggressorColorMode = "classic" | "bookmap" | "orangeAsk" | "custom";
export type HeatmapIntensityMode = "classic" | "adaptive" | "microstructure";

export interface BookmapVisualSettings {
  trades: {
    enabled: boolean;
    baseSize: number;
    minSize: number;
    maxSize: number;
    /** Perceptual volume → radius multiplier (replaces fixed internal scale). */
    scaleFactor: number;
    opacity: number;
    scaleMode: DotScaleMode;
    adaptiveMicrostructure: boolean;
    clusterTrades: boolean;
    hideSmallTrades: boolean;
    minTradeSize: number;
    buyColorMode: "green" | "cyan";
    sellColorMode: "red" | "orange";
  };
  liquidity: {
    showMajorWalls: boolean;
    showAllImportantWalls: boolean;
    minWallSizeBtc: number;
    persistenceEnabled: boolean;
    adaptiveIntensity: boolean;
  };
  heatmap: {
    intensityMode: HeatmapIntensityMode;
    opacity: number;
    contrast: number;
  };
  dom: {
    enabled: boolean;
    compactMode: boolean;
    showCob: boolean;
    showBidAskBars: boolean;
  };
  layout: {
    rightSpacePct: number;
    showDebug: boolean;
    showTopMetrics: boolean;
  };
}

export const BOOKMAP_VISUAL_SETTINGS_KEY = "goodtrading.bookmap.visualSettings.v1";

export const DEFAULT_BOOKMAP_VISUAL_SETTINGS: BookmapVisualSettings = {
  trades: {
    enabled: true,
    baseSize: 4.5,
    minSize: 4,
    maxSize: 28,
    scaleFactor: 2.2,
    opacity: 0.72,
    scaleMode: "adaptive",
    adaptiveMicrostructure: true,
    clusterTrades: true,
    hideSmallTrades: false,
    minTradeSize: 0,
    buyColorMode: "green",
    sellColorMode: "orange",
  },
  liquidity: {
    showMajorWalls: true,
    showAllImportantWalls: true,
    minWallSizeBtc: 5,
    persistenceEnabled: true,
    adaptiveIntensity: true,
  },
  heatmap: {
    intensityMode: "adaptive",
    opacity: 0.9,
    contrast: 1,
  },
  dom: {
    enabled: true,
    compactMode: false,
    showCob: true,
    showBidAskBars: true,
  },
  layout: {
    rightSpacePct: 20,
    showDebug: false,
    showTopMetrics: true,
  },
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function mergeTrades(
  base: BookmapVisualSettings["trades"],
  patch?: Partial<BookmapVisualSettings["trades"]>,
): BookmapVisualSettings["trades"] {
  if (!patch) return base;
  return {
    ...base,
    ...patch,
    baseSize: clamp(patch.baseSize ?? base.baseSize, 2, 14),
    minSize: clamp(patch.minSize ?? base.minSize, 2, 12),
    maxSize: clamp(patch.maxSize ?? base.maxSize, 10, 50),
    scaleFactor: clamp(
      patch.scaleFactor ?? base.scaleFactor ?? DEFAULT_BOOKMAP_VISUAL_SETTINGS.trades.scaleFactor,
      1,
      6,
    ),
    opacity: clamp(patch.opacity ?? base.opacity, 0.2, 1),
    minTradeSize: clamp(patch.minTradeSize ?? base.minTradeSize, 0, 20),
  };
}

export function mergeBookmapVisualSettings(
  base: BookmapVisualSettings = DEFAULT_BOOKMAP_VISUAL_SETTINGS,
  patch?: Partial<BookmapVisualSettings> | null,
): BookmapVisualSettings {
  if (!patch) return structuredClone(base);

  return {
    trades: mergeTrades(base.trades, patch.trades),
    liquidity: { ...base.liquidity, ...patch.liquidity },
    heatmap: {
      ...base.heatmap,
      ...patch.heatmap,
      opacity: clamp(patch.heatmap?.opacity ?? base.heatmap.opacity, 0.2, 1),
      contrast: clamp(patch.heatmap?.contrast ?? base.heatmap.contrast, 0.5, 2),
    },
    dom: { ...base.dom, ...patch.dom },
    layout: {
      ...base.layout,
      ...patch.layout,
      rightSpacePct: clamp(
        patch.layout?.rightSpacePct ?? base.layout.rightSpacePct,
        10,
        35,
      ),
    },
  };
}

export function loadBookmapVisualSettings(): BookmapVisualSettings {
  try {
    const raw = localStorage.getItem(BOOKMAP_VISUAL_SETTINGS_KEY);
    if (!raw) return mergeBookmapVisualSettings();
    const parsed = JSON.parse(raw) as Partial<BookmapVisualSettings>;
    return mergeBookmapVisualSettings(DEFAULT_BOOKMAP_VISUAL_SETTINGS, parsed);
  } catch {
    return mergeBookmapVisualSettings();
  }
}

export function saveBookmapVisualSettings(settings: BookmapVisualSettings): void {
  try {
    localStorage.setItem(BOOKMAP_VISUAL_SETTINGS_KEY, JSON.stringify(settings));
  } catch {
    /* ignore quota / private mode */
  }
}

export function getVisibleRangePct(
  low: number,
  high: number,
  spot: number,
): number {
  if (!spot || spot <= 0) return 1;
  return Math.abs(high - low) / spot;
}

export function getMicrostructureDotMultiplier(visibleRangePct: number): number {
  if (visibleRangePct < 0.0015) return 1.8;
  if (visibleRangePct < 0.003) return 1.45;
  if (visibleRangePct < 0.006) return 1.2;
  return 1;
}

export function computeTradeDotRadius(params: {
  sizeBtc: number;
  visibleLow: number;
  visibleHigh: number;
  spot: number;
  settings: BookmapVisualSettings;
}): number {
  const { sizeBtc, visibleLow, visibleHigh, spot, settings } = params;
  const tradeSettings = settings.trades;

  let volumeScale = 1;
  const vol = Math.max(sizeBtc, 0.01);

  if (tradeSettings.scaleMode === "linear") {
    volumeScale = Math.sqrt(vol);
  } else if (tradeSettings.scaleMode === "log") {
    volumeScale = Math.log1p(vol);
  } else {
    volumeScale = Math.log1p(vol) * 1.15;
  }

  const visibleRangePct = getVisibleRangePct(visibleLow, visibleHigh, spot);

  const microMultiplier = tradeSettings.adaptiveMicrostructure
    ? getMicrostructureDotMultiplier(visibleRangePct)
    : 1;

  const scaleFactor =
    tradeSettings.scaleFactor > 0
      ? tradeSettings.scaleFactor
      : DEFAULT_BOOKMAP_VISUAL_SETTINGS.trades.scaleFactor;

  return clamp(
    tradeSettings.baseSize * volumeScale * microMultiplier * scaleFactor,
    tradeSettings.minSize,
    tradeSettings.maxSize,
  );
}
