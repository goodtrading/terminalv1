export type DotScaleMode = "linear" | "log" | "adaptive";
export type AggressorColorMode = "classic" | "bookmap" | "orangeAsk" | "custom";
export type HeatmapIntensityMode = "classic" | "adaptive" | "microstructure";
export type ExecutionRailLength = "short" | "normal" | "long";
export type BidAskLineOpacity = "low" | "normal" | "high";
export type DivergenceMinSeverity = "medium" | "high";

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
    /** Horizontal bid/ask execution tick lines at trade price. */
    executionRailsEnabled: boolean;
    executionRailLength: ExecutionRailLength;
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
  divergence: {
    enabled: boolean;
    minSeverity: DivergenceMinSeverity;
    showPanel: boolean;
    showChartMarkers: boolean;
    passiveLiquidity: boolean;
    aggressionDivergence: boolean;
    confluenceSignals: boolean;
    showInvalidation: boolean;
    showBias: boolean;
  };
  layout: {
    rightSpacePct: number;
    showDebug: boolean;
    showTopMetrics: boolean;
    /** Historical best bid/ask paths over the heatmap. */
    showHistoricalBboPath: boolean;
    /** Live best bid/ask horizontal guide lines near the live edge. */
    showBidAskLines: boolean;
    bidAskLineOpacity: BidAskLineOpacity;
    bboPathOpacity: BidAskLineOpacity;
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
  divergence: {
    enabled: true,
    minSeverity: "medium",
    showPanel: true,
    showChartMarkers: false,
    passiveLiquidity: true,
    aggressionDivergence: true,
    confluenceSignals: true,
    showInvalidation: true,
    showBias: true,
  },
  layout: {
    rightSpacePct: 20,
    showDebug: false,
    showTopMetrics: true,
    showHistoricalBboPath: true,
    showBidAskLines: true,
    bidAskLineOpacity: "normal",
    bboPathOpacity: "normal",
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
    executionRailsEnabled:
      patch.executionRailsEnabled ?? base.executionRailsEnabled ?? true,
    executionRailLength:
      patch.executionRailLength === "short" ||
      patch.executionRailLength === "long"
        ? patch.executionRailLength
        : (base.executionRailLength ?? "normal"),
  };
}

export function mergeBookmapVisualSettings(
  base: BookmapVisualSettings = DEFAULT_BOOKMAP_VISUAL_SETTINGS,
  patch?: (Partial<BookmapVisualSettings> & { layout?: Partial<BookmapVisualSettings["layout"]> }) | null,
): BookmapVisualSettings {
  if (!patch) return structuredClone(base);

  const divergence = {
    ...DEFAULT_BOOKMAP_VISUAL_SETTINGS.divergence,
    ...base.divergence,
    ...patch.divergence,
  };
  if (patch.divergence?.minSeverity === "high") {
    divergence.minSeverity = "high";
  }

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
    divergence,
    layout: {
      ...base.layout,
      ...patch.layout,
      rightSpacePct: clamp(
        patch.layout?.rightSpacePct ?? base.layout.rightSpacePct,
        10,
        35,
      ),
      showHistoricalBboPath:
        patch.layout?.showHistoricalBboPath ??
        base.layout.showHistoricalBboPath ??
        true,
      showBidAskLines:
        patch.layout?.showBidAskLines ?? base.layout.showBidAskLines ?? true,
      bidAskLineOpacity:
        patch.layout?.bidAskLineOpacity === "low" ||
        patch.layout?.bidAskLineOpacity === "high"
          ? patch.layout.bidAskLineOpacity
          : (base.layout.bidAskLineOpacity ?? "normal"),
      bboPathOpacity:
        patch.layout?.bboPathOpacity === "low" || patch.layout?.bboPathOpacity === "high"
          ? patch.layout.bboPathOpacity
          : (base.layout.bboPathOpacity ?? "normal"),
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
