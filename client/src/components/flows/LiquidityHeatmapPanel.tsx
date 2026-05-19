import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { useBookmapState } from "@/hooks/useBookmapState";
import { useBookmapPriceScale } from "@/hooks/useBookmapPriceScale";
import { useBookmapTimeScale } from "@/hooks/useBookmapTimeScale";
import { useLiquidityHeatmapFeed } from "@/hooks/useLiquidityHeatmapFeed";
import {
  BOOKMAP_ENGINE_PRICE_RANGE_PCT,
  ENABLE_BOOKMAP_DELTA_VOLUME,
  ENABLE_BOOKMAP_TRADE_DOTS,
  TRADE_DOT_COLOR_MODE,
  USE_BOOKMAP_ENGINE,
} from "@/lib/bookmapEngineConfig";
import { useBookmapTrades } from "@/hooks/useBookmapTrades";
import { formatBookmapRangeShort } from "@/lib/bookmapPriceScaleUtils";
import { prepareEngineTradeDots } from "./bookmapEngineTradeDots";
import { paintBookmapEngineHeatmapFrame } from "./bookmapEngineRenderer";
import {
  bookLevelsToDomSnapshot,
  applyEngineViewportBandNormalization,
  prepareEngineRenderData,
} from "./bookmapEnginePrepare";
import type { BookmapState } from "@/types/bookmapState";
import { paintBookmapHeatmapFrame } from "./bookmapHeatmapRenderer";
import { BookmapDomPanel } from "./BookmapDomPanel";
import { bookLevelsToDomWallEntries } from "./domLadderUtils";
import { BookmapPriceLadder } from "./BookmapPriceLadder";
import { BookmapCvdGauge } from "./BookmapCvdGauge";
import { DeltaVolumeMatrixPanel } from "./DeltaVolumeMatrixPanel";
import { formatBtcCompact } from "./bookmapTradeAggregation";
import {
  LOCAL_RANGE_USD_OPTIONS,
  RIGHT_SPACE_PCT_OPTIONS,
  type LocalRangeUsd,
  type RightSpacePct,
} from "./bookmapViewMode";
import {
  computeFarDepthMarkers,
  depthPresetLabel,
  depthPresetToLegacyViewMode,
  DEPTH_RANGE_PRESETS,
  type DepthRangePreset,
} from "@/lib/bookmapDepthRange";
import { BOOKMAP_PLOT_PAD } from "./bookmapViewportUtils";
import {
  clampDomWidth,
  getMinBookmapBodyWidth,
  PRICE_LADDER_WIDTH_PX,
} from "./bookmapLayoutConstants";
import {
  auditLowerDomDepth,
  computeBookmapPipelineStats,
} from "./domLadderUtils";
import { useBookmapPanelPrefs } from "./useBookmapPanelPrefs";
import {
  formatHeatmapPrice,
  getBookMidFromSnapshot,
  HEATMAP_MAJOR_WALL_BTC,
  HEATMAP_MIN_SIZE_OPTIONS,
  MAX_LIQUIDITY_SNAPSHOTS,
  SNAPSHOT_INTERVAL_MS,
} from "./liquidityHeatmapUtils";
import {
  detectImportantLiquidityLevels,
  type ImportantLiquidityLevel,
} from "./importantLiquidityLevels";
import { PersistentWallsTracker } from "./persistentWallsTracker";
import {
  formatTradeRxPerSec,
  prepareTradeBubblesForRender,
} from "./tradeBubbleUtils";
import { BookmapControlPanel } from "@/components/terminal/bookmap/BookmapControlPanel";
import { IndicatorsPanel } from "@/components/terminal/bookmap/IndicatorsPanel";
import { useBookmapVisualSettings } from "@/components/terminal/bookmap/useBookmapVisualSettings";
import { mergeBookmapVisualSettings } from "@/components/terminal/bookmap/bookmapSettings";
import type { TradeDotVisualContext } from "./bookmapEngineTradeDots";

export type LiquidityHeatmapPanelProps = {
  symbol?: string;
  spot?: number;
};

const MIN_SIZE_OPTIONS = HEATMAP_MIN_SIZE_OPTIONS;
const VOLUME_RESIZE_HANDLE_PX = 4;

function isPosFinitePrice(n: number | null | undefined): n is number {
  return n != null && Number.isFinite(n) && n > 0;
}

export function LiquidityHeatmapPanel({
  symbol = "BTCUSDT",
  spot: spotProp,
}: LiquidityHeatmapPanelProps) {
  const { prefs, updatePrefs } = useBookmapPanelPrefs();
  const {
    settings: visualSettings,
    setSettings: setVisualSettings,
    resetSettings: resetVisualSettings,
  } = useBookmapVisualSettings();
  const [configOpen, setConfigOpen] = useState(false);
  const [indicatorsOpen, setIndicatorsOpen] = useState(false);
  const {
    domWidth,
    volumeHeight,
    minVisibleBtc,
    ladderAutoCenter,
    majorWallsOnly,
    showTrades,
    showPersistentWalls,
    showImportantFarLevels,
    depthRangePreset,
    localRangeUsd,
    rightSpacePct,
  } = prefs;

  const viewMode = depthPresetToLegacyViewMode(depthRangePreset);

  const [crosshair, setCrosshair] = useState<{ x: number; y: number; price: number } | null>(
    null,
  );
  const [isPanning, setIsPanning] = useState(false);
  const [heatmapPlotHeight, setHeatmapPlotHeight] = useState(0);
  const [heatmapPlotWidth, setHeatmapPlotWidth] = useState(0);

  const bookmapBodyRef = useRef<HTMLDivElement>(null);
  const heatmapContainerRef = useRef<HTMLDivElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [bookmapBodyWidth, setBookmapBodyWidth] = useState(0);
  const panRef = useRef<{
    startY: number;
    startX?: number;
    mode: "price" | "time";
  } | null>(null);
  const domResizeRef = useRef<{ startX: number; startW: number } | null>(null);
  const volResizeRef = useRef<{ startY: number; startH: number } | null>(null);
  const wallsTrackerRef = useRef(new PersistentWallsTracker());
  const [wallRevision, setWallRevision] = useState(0);
  const tradeRxSampleRef = useRef({ atMs: Date.now(), received: 0 });
  const [tradeRxPerSec, setTradeRxPerSec] = useState<number | null>(null);

  const {
    getSnapshots,
    snapshotCount,
    spot: spotFeed,
    feedStatus,
    exchange: feedExchange,
    getRecentTrades,
    pipelineStats,
    tradeTick,
    tradeBufferCount,
    receivedTradeCount,
    tradesStreamConnected,
  } = useLiquidityHeatmapFeed(symbol, true);

  const [engineFetchBounds, setEngineFetchBounds] = useState<{
    priceMin?: number;
    priceMax?: number;
    priceRangePct: number;
  }>({ priceRangePct: BOOKMAP_ENGINE_PRICE_RANGE_PCT });

  const lastGoodBookmapStateRef = useRef<BookmapState | null>(null);
  const engineEverLoadedRef = useRef(false);

  const {
    data: bookmapEngineState,
    isLoading: bookmapEngineLoading,
    isFetching: bookmapEngineFetching,
    error: bookmapEngineError,
    ageMs: bookmapAgeMs,
    dataUpdatedAt: bookmapDataUpdatedAt,
  } = useBookmapState({
    symbol,
    exchange: "binance",
    enabled: USE_BOOKMAP_ENGINE,
    includeStale: true,
    priceRangePct: engineFetchBounds.priceRangePct,
    priceMin: engineFetchBounds.priceMin,
    priceMax: engineFetchBounds.priceMax,
  });

  const effectiveBookmapState = useMemo(() => {
    if (bookmapEngineState && bookmapEngineState.heatmapCells.length > 0) {
      lastGoodBookmapStateRef.current = bookmapEngineState;
      engineEverLoadedRef.current = true;
      return bookmapEngineState;
    }
    return lastGoodBookmapStateRef.current;
  }, [bookmapEngineState]);

  const useEngineRenderer = Boolean(
    USE_BOOKMAP_ENGINE &&
      effectiveBookmapState != null &&
      effectiveBookmapState.heatmapCells.length > 0,
  );

  const usingCachedBookmapState = Boolean(
    useEngineRenderer &&
      effectiveBookmapState &&
      bookmapEngineState !== effectiveBookmapState,
  );

  const exchange = useEngineRenderer
    ? effectiveBookmapState!.exchange
    : feedExchange;

  useEffect(() => {
    if (!import.meta.env.DEV || !bookmapEngineState) return;
    const bids = bookmapEngineState.bids;
    const asks = bookmapEngineState.asks;
    console.debug("[BOOKMAP_STATE_LEVELS]", {
      bids: bids.length,
      asks: asks.length,
      staleBids: bids.filter((x) => x.stale).length,
      staleAsks: asks.filter((x) => x.stale).length,
      maxSeenBids: bids.filter((x) => x.maxSeenSize > 0).length,
      maxSeenAsks: asks.filter((x) => x.maxSeenSize > 0).length,
      importantWalls: bookmapEngineState.importantWalls.length,
      structuralWalls: bookmapEngineState.structuralWalls.length,
      majorWalls: bookmapEngineState.majorWalls.length,
      heatmapCells: bookmapEngineState.heatmapCells.length,
    });
  }, [bookmapEngineState]);

  const tickerSpot = spotProp ?? spotFeed ?? null;
  /** Ticker last; UI/debug may use `priceReference` when ticker is late. */
  const spot = tickerSpot;

  const snapshots = getSnapshots();
  const latestLegacy = snapshots[snapshots.length - 1];

  const latest = useMemo(() => {
    if (!useEngineRenderer || !effectiveBookmapState) return latestLegacy;
    return bookLevelsToDomSnapshot(
      effectiveBookmapState.bids,
      effectiveBookmapState.asks,
      effectiveBookmapState.timestamp,
    );
  }, [useEngineRenderer, effectiveBookmapState, latestLegacy]);

  const trades = getRecentTrades();

  const tradeDotsEnabled =
    useEngineRenderer &&
    showTrades &&
    visualSettings.trades.enabled &&
    ENABLE_BOOKMAP_TRADE_DOTS;

  const deltaPanelEnabled = showTrades && ENABLE_BOOKMAP_DELTA_VOLUME;
  const tradeAggEnabled = tradeDotsEnabled || deltaPanelEnabled;

  const bookmapTradeAgg = useBookmapTrades(trades, tradeTick, {
    enabled: tradeAggEnabled,
    scope: "session",
  });

  const cvdSamples = useMemo(
    () => bookmapTradeAgg.buckets.map((b) => b.cvd),
    [bookmapTradeAgg.buckets],
  );

  const bookMid = useMemo(() => getBookMidFromSnapshot(latest), [latest]);

  /** Never use a hardcoded 70k fallback — anchor ladder to ticker or book mid. */
  const priceReference = useMemo(() => {
    if (isPosFinitePrice(tickerSpot)) return tickerSpot;
    if (isPosFinitePrice(bookMid)) return bookMid;
    return null;
  }, [tickerSpot, bookMid]);

  const engineWalls = useMemo(() => {
    if (!effectiveBookmapState) return [];
    return [
      ...effectiveBookmapState.importantWalls,
      ...effectiveBookmapState.structuralWalls,
      ...effectiveBookmapState.majorWalls,
    ];
  }, [effectiveBookmapState]);

  const engineBookLevels = useMemo(() => {
    if (!effectiveBookmapState) return [];
    return [...effectiveBookmapState.bids, ...effectiveBookmapState.asks];
  }, [effectiveBookmapState]);

  const priceScale = useBookmapPriceScale({
    spot: priceReference,
    plotHeight: heatmapPlotHeight > 20 ? heatmapPlotHeight : 400,
    localRangeUsd,
    depthRangePreset,
    walls: engineWalls,
    bookLevels: engineBookLevels,
    followSpot: ladderAutoCenter,
  });

  const applyDepthPreset = useCallback(
    (preset: DepthRangePreset) => {
      updatePrefs({
        depthRangePreset: preset,
        bookmapViewMode: depthPresetToLegacyViewMode(preset),
      });
      priceScale.applyDepthRange(preset);
    },
    [updatePrefs, priceScale],
  );

  useEffect(() => {
    if (!USE_BOOKMAP_ENGINE) return;
    const mid = priceReference;
    if (!mid || mid <= 0) return;
    const min = priceScale.visibleMinPrice;
    const max = priceScale.visibleMaxPrice;
    const half = (max - min) / 2;
    const pct = Math.min(
      50,
      Math.max(BOOKMAP_ENGINE_PRICE_RANGE_PCT, (half / mid) * 100 * 1.15),
    );

    const timer = window.setTimeout(() => {
      setEngineFetchBounds((prev) => {
        const unchanged =
          prev.priceMin === min &&
          prev.priceMax === max &&
          Math.abs(prev.priceRangePct - pct) < 0.3;
        if (unchanged) return prev;
        return { priceMin: min, priceMax: max, priceRangePct: pct };
      });
    }, 300);

    return () => window.clearTimeout(timer);
  }, [
    priceScale.visibleMinPrice,
    priceScale.visibleMaxPrice,
    priceReference,
  ]);

  const domWallEntries = useMemo(
    () =>
      useEngineRenderer
        ? bookLevelsToDomWallEntries(engineWalls, priceScale.domBucketSize)
        : [],
    [useEngineRenderer, engineWalls, priceScale.domBucketSize],
  );

  const engineBookForDom = useMemo(() => {
    if (!useEngineRenderer || !effectiveBookmapState) return undefined;
    return {
      bids: effectiveBookmapState.bids,
      asks: effectiveBookmapState.asks,
      importantWalls: effectiveBookmapState.importantWalls,
      structuralWalls: effectiveBookmapState.structuralWalls,
      majorWalls: effectiveBookmapState.majorWalls,
      heatmapCells: effectiveBookmapState.heatmapCells,
    };
  }, [useEngineRenderer, effectiveBookmapState]);

  useEffect(() => {
    if (!import.meta.env.DEV || !engineBookForDom) return;
    auditLowerDomDepth({
      visibleMinPrice: priceScale.visibleMinPrice,
      visibleMaxPrice: priceScale.visibleMaxPrice,
      domBucketSize: priceScale.domBucketSize,
      spot: priceReference ?? tickerSpot,
      requestedIncludeStale: true,
      engineBook: engineBookForDom,
    });
  }, [
    engineBookForDom,
    priceScale.visibleMinPrice,
    priceScale.visibleMaxPrice,
    priceScale.domBucketSize,
    priceReference,
    tickerSpot,
  ]);

  const priceRange = priceScale.priceRange;

  const tradeDotVisual: TradeDotVisualContext = useMemo(
    () => ({
      settings: visualSettings,
      spot: priceReference ?? tickerSpot,
      visibleLow: priceRange.minPrice,
      visibleHigh: priceRange.maxPrice,
    }),
    [
      visualSettings,
      priceReference,
      tickerSpot,
      priceRange.minPrice,
      priceRange.maxPrice,
    ],
  );

  useEffect(() => {
    const pct = visualSettings.layout.rightSpacePct;
    const snapped = RIGHT_SPACE_PCT_OPTIONS.reduce((best, o) =>
      Math.abs(o - pct) < Math.abs(best - pct) ? o : best,
    );
    updatePrefs({
      showTrades: visualSettings.trades.enabled,
      showPersistentWalls: visualSettings.liquidity.persistenceEnabled,
      showImportantFarLevels: visualSettings.liquidity.showAllImportantWalls,
      majorWallsOnly: !visualSettings.liquidity.showMajorWalls,
      minVisibleBtc: visualSettings.liquidity.minWallSizeBtc,
      rightSpacePct: snapped,
    });
  }, [visualSettings, updatePrefs]);

  const engineRenderBase = useMemo(() => {
    if (!useEngineRenderer || !effectiveBookmapState) return null;
    return prepareEngineRenderData(
      effectiveBookmapState,
      priceRange.minPrice,
      priceRange.maxPrice,
      priceScale.heatmapBucketSize,
      priceScale.domBucketSize,
      undefined,
      priceScale.labelStep,
      priceScale.domBucketSize,
      priceReference ?? tickerSpot,
      priceScale.verticalMode,
    );
  }, [
    useEngineRenderer,
    effectiveBookmapState,
    priceRange.minPrice,
    priceRange.maxPrice,
    priceScale.heatmapBucketSize,
    priceScale.domBucketSize,
    priceScale.labelStep,
    priceScale.verticalMode,
    priceReference,
    tickerSpot,
  ]);

  const effectiveRightSpacePct = visualSettings.layout.rightSpacePct;

  const timeScale = useBookmapTimeScale({
    dataStartTime: engineRenderBase?.timeMin ?? Date.now() - 900_000,
    dataEndTime: engineRenderBase?.timeMax ?? Date.now(),
    rightSpacePct: effectiveRightSpacePct,
    plotWidth: heatmapPlotWidth,
    enabled: Boolean(useEngineRenderer && engineRenderBase),
  });

  const engineRenderData = useMemo(() => {
    if (!engineRenderBase) return null;
    const microContext =
      priceScale.verticalMode === "micro" ||
      priceRange.maxPrice - priceRange.minPrice <= 1_500 ||
      priceScale.labelStep <= 50 ||
      priceScale.heatmapBucketSize <= 25;
    if (!microContext) return engineRenderBase;
    return applyEngineViewportBandNormalization(engineRenderBase, {
      minPrice: priceRange.minPrice,
      maxPrice: priceRange.maxPrice,
      visibleStartTime: timeScale.viewport.visibleStartTime,
      visibleEndTime: timeScale.viewport.visibleEndTime,
      verticalCompressionMode: priceScale.verticalMode,
      spotPrice: priceReference ?? tickerSpot,
    });
  }, [
    engineRenderBase,
    priceRange.minPrice,
    priceRange.maxPrice,
    priceScale.verticalMode,
    priceScale.labelStep,
    priceScale.heatmapBucketSize,
    timeScale.viewport.visibleStartTime,
    timeScale.viewport.visibleEndTime,
    priceReference,
    tickerSpot,
  ]);

  const engineTradeDots = useMemo(() => {
    if (!tradeDotsEnabled) {
      return {
        dots: [],
        stats: {
          tradeCount: 0,
          visibleTrades: 0,
          dotCount: 0,
          groupedCount: 0,
          buyDots: 0,
          sellDots: 0,
          dotRadiusMin: 0,
          dotRadiusMax: 0,
          clusterMs: 0,
        },
      };
    }
    return prepareEngineTradeDots({
      trades: bookmapTradeAgg.trades,
      minPrice: priceRange.minPrice,
      maxPrice: priceRange.maxPrice,
      visibleStartTime: timeScale.viewport.visibleStartTime,
      visibleEndTime: timeScale.viewport.visibleEndTime,
      verticalMode: priceScale.verticalMode,
      heatmapBucketSize: priceScale.heatmapBucketSize,
      domBucketSize: priceScale.domBucketSize,
      visual: tradeDotVisual,
    });
  }, [
    tradeDotsEnabled,
    bookmapTradeAgg.trades,
    tradeTick,
    priceRange.minPrice,
    priceRange.maxPrice,
    timeScale.viewport.visibleStartTime,
    timeScale.viewport.visibleEndTime,
    priceScale.verticalMode,
    priceScale.heatmapBucketSize,
    priceScale.domBucketSize,
    tradeDotVisual,
  ]);

  const importantLevels: ImportantLiquidityLevel[] = useMemo(() => {
    if (!latest) return [];
    const ref = priceReference ?? tickerSpot;
    return detectImportantLiquidityLevels({
      bids: latest.bids,
      asks: latest.asks,
      spot: ref,
      priceStep: priceScale.domBucketSize,
    });
  }, [latest, priceReference, tickerSpot, priceScale.domBucketSize]);

  const farWallMarkers = useMemo(() => {
    if (!showImportantFarLevels) return undefined;

    if (useEngineRenderer && effectiveBookmapState) {
      const markerSource = majorWallsOnly
        ? effectiveBookmapState.majorWalls
        : [
            ...effectiveBookmapState.majorWalls,
            ...effectiveBookmapState.structuralWalls,
            ...effectiveBookmapState.importantWalls,
          ];
      const above = markerSource
        .filter((l) => l.side === "ask" && l.price > priceRange.maxPrice)
        .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
        .slice(0, 4);
      const below = markerSource
        .filter((l) => l.side === "bid" && l.price < priceRange.minPrice)
        .sort((a, b) => b.maxSeenSize - a.maxSeenSize)
        .slice(0, 4);
      if (!above.length && !below.length) return undefined;
      return [
        ...above.map((l) => ({ side: l.side, price: l.price, sizeBtc: l.maxSeenSize })),
        ...below.map((l) => ({ side: l.side, price: l.price, sizeBtc: l.maxSeenSize })),
      ];
    }

    if (!latest || importantLevels.length === 0) {
      return undefined;
    }
    const markerSource = majorWallsOnly
      ? importantLevels.filter((l) => l.sizeBtc >= HEATMAP_MAJOR_WALL_BTC)
      : importantLevels;
    const above = markerSource
      .filter((l) => l.side === "ask" && l.price > priceRange.maxPrice)
      .sort((a, b) => b.sizeBtc - a.sizeBtc)
      .slice(0, 4);
    const below = markerSource
      .filter((l) => l.side === "bid" && l.price < priceRange.minPrice)
      .sort((a, b) => b.sizeBtc - a.sizeBtc)
      .slice(0, 4);
    if (!above.length && !below.length) return undefined;
    const map = (l: ImportantLiquidityLevel) => ({
      side: l.side,
      price: l.price,
      sizeBtc: l.sizeBtc,
    });
    return [...above.map(map), ...below.map(map)];
  }, [
    showImportantFarLevels,
    latest,
    importantLevels,
    priceRange,
    majorWallsOnly,
    useEngineRenderer,
    effectiveBookmapState,
  ]);

  const farDepthMarkers = useMemo(() => {
    if (!useEngineRenderer || !showImportantFarLevels) {
      return { above: [], below: [] };
    }
    const wallSource = engineRenderData?.walls ?? [];
    return computeFarDepthMarkers(
      priceReference ?? tickerSpot,
      wallSource,
      priceRange.minPrice,
      priceRange.maxPrice,
    );
  }, [
    useEngineRenderer,
    showImportantFarLevels,
    engineRenderData?.walls,
    priceReference,
    tickerSpot,
    priceRange.minPrice,
    priceRange.maxPrice,
  ]);

  const showDomImportantStrip =
    showImportantFarLevels && viewMode === "fullDepth";

  const safeDomWidth = useMemo(() => clampDomWidth(domWidth), [domWidth]);

  const viewportTooNarrow = useMemo(() => {
    if (bookmapBodyWidth <= 0) return false;
    return bookmapBodyWidth < getMinBookmapBodyWidth();
  }, [bookmapBodyWidth]);

  useEffect(() => {
    const last = getSnapshots().at(-1);
    if (last) {
      wallsTrackerRef.current.ingestSnapshot(last, priceScale.domBucketSize);
      setWallRevision((v) => v + 1);
    }
  }, [snapshotCount, priceScale.domBucketSize, getSnapshots]);

  const persistentWalls = useMemo(() => {
    if (!showPersistentWalls) return [];
    return wallsTrackerRef.current.getRenderableWalls();
  }, [showPersistentWalls, wallRevision]);

  const wallStats = useMemo(() => {
    return wallsTrackerRef.current.getStats();
  }, [wallRevision]);

  const tradeLayerDebug = useMemo(() => {
    const series = getSnapshots().slice(-MAX_LIQUIDITY_SNAPSHOTS);
    const buffered = getRecentTrades();
    const { visible, grouped } = prepareTradeBubblesForRender(
      buffered,
      series,
      priceRange.minPrice,
      priceRange.maxPrice,
      priceScale.domBucketSize,
    );
    const maxTradeSize =
      grouped.length > 0 ? Math.max(...grouped.map((t) => t.sizeBtc)) : 0;
    return {
      trades: tradeBufferCount,
      visibleTrades: visible.length,
      groupedTrades: grouped.length,
      receivedTrades: Number.isFinite(receivedTradeCount) ? receivedTradeCount : 0,
      firstVisibleTrade: visible[0] ?? null,
      lastVisibleTrade: visible[visible.length - 1] ?? null,
      maxTradeSize,
    };
  }, [
    tradeBufferCount,
    receivedTradeCount,
    tradeTick,
    snapshotCount,
    priceRange,
    priceScale.domBucketSize,
    getSnapshots,
    getRecentTrades,
  ]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const now = Date.now();
      const dtSec = (now - tradeRxSampleRef.current.atMs) / 1000;
      const received = Number.isFinite(receivedTradeCount) ? receivedTradeCount : 0;
      if (dtSec > 0.05) {
        const delta = received - tradeRxSampleRef.current.received;
        const rate = delta / dtSec;
        setTradeRxPerSec(Number.isFinite(rate) ? rate : null);
        tradeRxSampleRef.current = { atMs: now, received };
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [receivedTradeCount]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[BOOKMAP_TRADES_RENDER]", {
      bufferedTrades: tradeLayerDebug.trades,
      visibleTrades: tradeLayerDebug.visibleTrades,
      groupedTrades: tradeLayerDebug.groupedTrades,
      firstVisibleTrade: tradeLayerDebug.firstVisibleTrade,
      lastVisibleTrade: tradeLayerDebug.lastVisibleTrade,
      maxTradeSize: tradeLayerDebug.maxTradeSize,
      rxPerSec: tradeRxPerSec,
      streamConnected: tradesStreamConnected,
      showTrades,
    });
  }, [tradeLayerDebug, tradeRxPerSec, tradesStreamConnected, showTrades]);

  const importantDebug = useMemo(() => {
    const globalWalls = importantLevels.filter(
      (l) => l.kind === "MAJOR_WALL" || l.kind === "TOP_LIQUIDITY",
    ).length;
    const farWalls = importantLevels.filter((l) => l.kind === "FAR_WALL").length;
    const topBidWalls = importantLevels.filter(
      (l) => l.side === "bid" && l.kind === "TOP_LIQUIDITY",
    ).length;
    const topAskWalls = importantLevels.filter(
      (l) => l.side === "ask" && l.kind === "TOP_LIQUIDITY",
    ).length;
    return { globalWalls, farWalls, topBidWalls, topAskWalls };
  }, [importantLevels]);

  const stats = useMemo(
    () =>
      computeBookmapPipelineStats(
        latest,
        priceRange.minPrice,
        priceRange.maxPrice,
        minVisibleBtc,
        majorWallsOnly,
        priceScale.domBucketSize,
        pipelineStats.rawBids,
        pipelineStats.rawAsks,
      ),
    [
      latest,
      priceRange,
      minVisibleBtc,
      majorWallsOnly,
      priceScale.domBucketSize,
      pipelineStats.rawBids,
      pipelineStats.rawAsks,
    ],
  );

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[BOOKMAP_PIPELINE]", {
      rawBids: stats.rawBids,
      rawAsks: stats.rawAsks,
      normalizedBids: stats.normalizedBids,
      normalizedAsks: stats.normalizedAsks,
      visibleBids: stats.visibleBids,
      visibleAsks: stats.visibleAsks,
      domBuckets: stats.domBuckets,
      nonZeroBidBuckets: stats.nonZeroBidBuckets,
      nonZeroAskBuckets: stats.nonZeroAskBuckets,
      renderedHeatmap: stats.renderedHeatmap,
      aboveMinHeatmap: stats.aboveMinHeatmap,
      majorWallsHeatmap: stats.majorWallsHeatmap,
      globalWalls: importantDebug.globalWalls,
      farWalls: importantDebug.farWalls,
      topBidWalls: importantDebug.topBidWalls,
      topAskWalls: importantDebug.topAskWalls,
      minSize: minVisibleBtc,
      majorWallsOnly,
      priceRange,
      priceScale: priceScale.labelStep,
      bucket: priceScale.heatmapBucketSize,
    });
  }, [stats, minVisibleBtc, majorWallsOnly, priceRange, priceScale, importantDebug]);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    const norm = stats.normalizedBids + stats.normalizedAsks;
    const vis = stats.visibleBids + stats.visibleAsks;
    if (norm <= 0 || vis > 0) return;
    console.warn("[BOOKMAP_VISIBLE_EMPTY]", {
      tickerSpot,
      bookMid,
      priceReference,
      priceRange,
    });
  }, [
    stats.normalizedBids,
    stats.normalizedAsks,
    stats.visibleBids,
    stats.visibleAsks,
    tickerSpot,
    bookMid,
    priceReference,
    priceRange,
  ]);

  const resetView = useCallback(() => {
    updatePrefs({ ladderAutoCenter: true });
    priceScale.resetToSpot();
    if (useEngineRenderer) timeScale.resetTimeView();
  }, [updatePrefs, priceScale, useEngineRenderer, timeScale]);

  const drawHeatmap = useCallback(() => {
    const canvas = canvasRef.current;
    const container = heatmapContainerRef.current;
    if (!canvas || !container) return;

    const w = container.clientWidth;
    const h = container.clientHeight;
    if (w < 10 || h < 10) return;

    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(w * dpr);
    canvas.height = Math.floor(h * dpr);
    canvas.style.width = `${w}px`;
    canvas.style.height = `${h}px`;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

    if (useEngineRenderer && engineRenderData) {
      paintBookmapEngineHeatmapFrame(ctx, {
        width: w,
        height: h,
        minPrice: priceRange.minPrice,
        maxPrice: priceRange.maxPrice,
        spot: priceReference ?? tickerSpot,
        priceToY: priceScale.priceToY,
        heatmapBucketSize: priceScale.heatmapBucketSize,
        crosshair,
        engine: engineRenderData,
        timeViewport: timeScale.viewport,
        showFarWallMarkers: showImportantFarLevels,
        tradeDots: tradeDotsEnabled ? engineTradeDots.dots : undefined,
        tradeDotVerticalMode: priceScale.verticalMode,
        tradeDotVisual,
        visualSettings,
      });
      return;
    }

    paintBookmapHeatmapFrame(ctx, {
      width: w,
      height: h,
      minPrice: priceRange.minPrice,
      maxPrice: priceRange.maxPrice,
      spot: priceReference ?? tickerSpot,
      series: getSnapshots().slice(-MAX_LIQUIDITY_SNAPSHOTS),
      priceStep: priceScale.heatmapBucketSize,
      minVisibleBtc,
      majorWallsOnly,
      showTrades: useEngineRenderer ? false : showTrades,
      trades: getRecentTrades(),
      showPersistentWalls: useEngineRenderer ? false : showPersistentWalls,
      persistentWalls,
      crosshair,
      farWallMarkers,
      ladderRowHeightPx: Math.max(4, priceScale.heatmapBucketSize > 0 ? 8 : 4),
    });
  }, [
    useEngineRenderer,
    engineRenderData,
    timeScale.viewport,
    getSnapshots,
    priceRange,
    priceScale,
    minVisibleBtc,
    majorWallsOnly,
    priceReference,
    tickerSpot,
    showTrades,
    showPersistentWalls,
    persistentWalls,
    getRecentTrades,
    tradeTick,
    crosshair,
    farWallMarkers,
    showImportantFarLevels,
    tradeDotsEnabled,
    engineTradeDots,
    tradeDotVisual,
    visualSettings,
  ]);

  useEffect(() => {
    drawHeatmap();
  }, [
    drawHeatmap,
    snapshotCount,
    bookmapDataUpdatedAt,
    useEngineRenderer,
    priceScale.visibleRange,
    timeScale.viewport,
    timeScale.followLive,
  ]);

  useEffect(() => {
    const el = heatmapContainerRef.current;
    if (!el) return;

    const syncPlotHeight = () => {
      setHeatmapPlotHeight(el.clientHeight);
      setHeatmapPlotWidth(el.clientWidth);
      drawHeatmap();
    };

    const ro = new ResizeObserver(syncPlotHeight);
    ro.observe(el);
    syncPlotHeight();
    return () => ro.disconnect();
  }, [drawHeatmap]);

  useEffect(() => {
    const el = bookmapBodyRef.current;
    if (!el) return;

    const syncWidth = () => setBookmapBodyWidth(el.clientWidth);
    const ro = new ResizeObserver(syncWidth);
    ro.observe(el);
    syncWidth();
    return () => ro.disconnect();
  }, []);

  const handleCanvasMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      const timePan = useEngineRenderer && (e.shiftKey || e.button === 1);
      panRef.current = timePan
        ? { startX: e.clientX, startY: e.clientY, mode: "time" }
        : { startY: e.clientY, mode: "price" };
      setIsPanning(true);
      if (!timePan && ladderAutoCenter) {
        updatePrefs({ ladderAutoCenter: false });
      }
      if (timePan && timeScale.followLive) {
        timeScale.setFollowLiveEnabled(false);
      }
    },
    [ladderAutoCenter, updatePrefs, useEngineRenderer, timeScale],
  );

  useEffect(() => {
    if (!isPanning) return;

    const onMove = (e: MouseEvent) => {
      const pan = panRef.current;
      if (!pan) return;
      if (pan.mode === "time" && pan.startX != null) {
        const deltaX = e.clientX - pan.startX;
        panRef.current = { ...pan, startX: e.clientX };
        timeScale.panByPixels(deltaX);
        return;
      }
      const deltaY = e.clientY - pan.startY;
      panRef.current = { startY: e.clientY, mode: "price" };
      priceScale.panByPixels(deltaY);
    };

    const onUp = () => {
      panRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [isPanning, priceScale, timeScale]);

  const handleCanvasMouseMove = useCallback(
    (e: React.MouseEvent) => {
      const container = heatmapContainerRef.current;
      if (!container) return;
      const rect = container.getBoundingClientRect();
      const x = e.clientX - rect.left;
      const y = e.clientY - rect.top;
      const price = priceScale.yToPrice(y);
      setCrosshair({ x, y, price });
    },
    [priceScale],
  );

  const handleCanvasMouseLeave = useCallback(() => {
    setCrosshair(null);
  }, []);

  const startDomResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      domResizeRef.current = { startX: e.clientX, startW: domWidth };
    },
    [domWidth],
  );

  const startVolumeResize = useCallback(
    (e: React.MouseEvent) => {
      e.preventDefault();
      volResizeRef.current = { startY: e.clientY, startH: volumeHeight };
    },
    [volumeHeight],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (domResizeRef.current) {
        const delta = domResizeRef.current.startX - e.clientX;
        updatePrefs({ domWidth: domResizeRef.current.startW + delta });
      }
      if (volResizeRef.current) {
        const delta = volResizeRef.current.startY - e.clientY;
        updatePrefs({ volumeHeight: volResizeRef.current.startH + delta });
      }
    };
    const onUp = () => {
      domResizeRef.current = null;
      volResizeRef.current = null;
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [updatePrefs]);

  const statusLabel =
    feedStatus === "live"
      ? "Live"
      : feedStatus === "loading"
        ? "Connecting…"
        : feedStatus === "offline"
          ? "Offline"
          : feedStatus === "error"
            ? "Error"
            : "No data";

  const showHeatmapOverlay =
    !useEngineRenderer &&
    snapshotCount === 0 &&
    (feedStatus === "empty" || feedStatus === "offline" || feedStatus === "error");

  const engineEverLoaded = Boolean(
    engineEverLoadedRef.current ||
      (effectiveBookmapState != null && effectiveBookmapState.heatmapCells.length > 0),
  );

  const engineDebugLine = useMemo(() => {
    if (!USE_BOOKMAP_ENGINE) return null;
    if (!engineEverLoaded && bookmapEngineLoading && !effectiveBookmapState) {
      return "engine BOOKMAP · loading…";
    }
    if (!useEngineRenderer) {
      if (bookmapEngineError && !engineEverLoaded) {
        return `engine LEGACY (bookmap error) · ${bookmapEngineError instanceof Error ? bookmapEngineError.message : "failed"}`;
      }
      return "engine LEGACY · no bookmap data";
    }
    const statusTag = bookmapEngineFetching
      ? usingCachedBookmapState
        ? "refetching cached"
        : "refetching"
      : usingCachedBookmapState
        ? "cached state"
        : "live";
    const age =
      bookmapAgeMs != null ? `${Math.round(bookmapAgeMs)}ms` : "—";
    const st = engineRenderData?.stats;
    const book = effectiveBookmapState!;
    const i = book.importantWalls.length;
    const s = book.structuralWalls.length;
    const m = book.majorWalls.length;
    const visMode = st?.visualMode ?? "—";
    const pLo = st?.pLow != null ? st.pLow.toFixed(2) : "—";
    const pHi = st?.pHigh != null ? st.pHigh.toFixed(2) : "—";
    const minI =
      st?.minRenderIntensity != null ? st.minRenderIntensity.toFixed(2) : "—";
    const td = engineTradeDots.stats;
    const tradeDbgParts: string[] = [];
    if (tradeDotsEnabled || deltaPanelEnabled) {
      tradeDbgParts.push(`trades ${td.tradeCount || bookmapTradeAgg.summary.tradeCount}`);
      if (tradeDotsEnabled) {
        tradeDbgParts.push(
          `visibleTrades ${td.visibleTrades}`,
          `dots ${td.dotCount}`,
          `grouped ${td.groupedCount}`,
          `buyDots ${td.buyDots}`,
          `sellDots ${td.sellDots}`,
          `r ${td.dotRadiusMin.toFixed(1)}–${td.dotRadiusMax.toFixed(1)}`,
          `clusterMs ${td.clusterMs}`,
        );
      }
    }
    if (deltaPanelEnabled) {
      tradeDbgParts.push(
        `vol ${formatBtcCompact(bookmapTradeAgg.summary.volume)} BTC`,
        `delta ${formatBtcCompact(bookmapTradeAgg.summary.delta)} BTC`,
        `cvd ${formatBtcCompact(bookmapTradeAgg.summary.cvd)} BTC`,
      );
    }
    const tradeDbg = tradeDbgParts.length ? ` · ${tradeDbgParts.join(" · ")}` : "";
    const offsetSec = Math.round(timeScale.horizontalOffsetMs / 1000);
    const wv = priceScale.visibleWallCounts;
    return (
      `BOOKMAP · ${statusTag} · visualMode ${visMode} · verticalMode ${priceScale.verticalMode} · pLow ${pLo} · pHigh ${pHi} · minI ${minI} · dotMode ${TRADE_DOT_COLOR_MODE} · depth ${depthPresetLabel(depthRangePreset, localRangeUsd)} · range ${formatBookmapRangeShort(priceScale.visibleMinPrice)}–${formatBookmapRangeShort(priceScale.visibleMaxPrice)} · rightSpace ${rightSpacePct}% · followLive ${timeScale.followLive ? "ON" : "OFF"} · timeOffset ${offsetSec}s · bucket ${priceScale.heatmapBucketSize} · visibleWalls ${wv.important}/${wv.structural}/${wv.major} · bands ${st?.visibleBandCount ?? 0} · rendered ${st?.renderedBandCount ?? 0} · age ${age}ms${tradeDbg}`
    );
  }, [
    engineEverLoaded,
    bookmapEngineLoading,
    bookmapEngineFetching,
    effectiveBookmapState,
    bookmapEngineError,
    useEngineRenderer,
    usingCachedBookmapState,
    bookmapAgeMs,
    priceScale,
    engineRenderData,
    rightSpacePct,
    depthRangePreset,
    localRangeUsd,
    timeScale.followLive,
    timeScale.horizontalOffsetMs,
    tradeDotsEnabled,
    engineTradeDots.stats,
    deltaPanelEnabled,
    bookmapTradeAgg.summary,
  ]);

  const btnClass =
    "px-2 py-0.5 text-[10px] font-mono border rounded border-terminal-border text-terminal-muted hover:text-white transition-colors";

  const panelBtnClass = cn(
    btnClass,
    "border-cyan-500/30 text-cyan-200/90 hover:border-cyan-400/50",
  );

  const spotDisplay = priceReference ?? tickerSpot;

  return (
    <div className="w-full h-full min-w-0 min-h-0 flex flex-1 flex-col overflow-hidden bg-[#0a0e14]">
      <header className="shrink-0 flex flex-wrap items-center gap-x-2 gap-y-1 px-3 py-1.5 border-b border-terminal-border/70 bg-[#0c111c]">
        <span className="text-[10px] font-bold tracking-widest text-terminal-accent uppercase shrink-0">
          Bookmap
        </span>
        {visualSettings.layout.showTopMetrics && (
          <>
            <span className="text-[10px] font-mono text-slate-300 shrink-0">{symbol}</span>
            <span className="text-[10px] font-mono text-terminal-muted shrink-0">{exchange}</span>
            <span className="text-[10px] font-mono text-cyan-400/80 shrink-0">
              {useEngineRenderer ? "Live Bookmap" : statusLabel}
            </span>
            <span className="text-[10px] font-mono text-emerald-400/90 shrink-0">
              {spotDisplay != null ? formatHeatmapPrice(spotDisplay) : "—"}
            </span>
            <span className="text-[10px] font-mono text-slate-500 shrink-0 hidden sm:inline">
              {formatBookmapRangeShort(priceRange.minPrice)}–
              {formatBookmapRangeShort(priceRange.maxPrice)}
            </span>
            <span
              className={cn(
                "text-[10px] font-mono shrink-0",
                showTrades && visualSettings.trades.enabled
                  ? "text-emerald-400/80"
                  : "text-slate-600",
              )}
            >
              Trades {showTrades && visualSettings.trades.enabled ? "ON" : "OFF"}
            </span>
            <span
              className={cn(
                "text-[10px] font-mono shrink-0",
                showPersistentWalls ? "text-violet-300/80" : "text-slate-600",
              )}
            >
              Persistent {showPersistentWalls ? "ON" : "OFF"}
            </span>
          </>
        )}

        {visualSettings.layout.showDebug && engineDebugLine && (
          <span
            className={cn(
              "w-full basis-full text-[9px] font-mono px-0.5 leading-relaxed",
              useEngineRenderer ? "text-cyan-400/75" : "text-amber-400/70",
            )}
          >
            {engineDebugLine}
          </span>
        )}

        {visualSettings.layout.showDebug && (
          <details className="w-full basis-full text-[9px] font-mono text-slate-500">
            <summary className="cursor-pointer text-slate-600 hover:text-slate-400 select-none">
              Debug metrics
            </summary>
            <span className="block text-slate-500 mt-1 leading-relaxed">
              label {priceScale.labelStep} · bucket {priceScale.heatmapBucketSize} · trades{" "}
              {tradeLayerDebug.trades} · rightSpace {effectiveRightSpacePct}%
            </span>
          </details>
        )}

        <div className="flex flex-wrap items-center gap-1 ml-auto">
          <button
            type="button"
            onClick={() => {
              setIndicatorsOpen(false);
              setConfigOpen((o) => !o);
            }}
            className={cn(panelBtnClass, configOpen && "border-cyan-400/60 bg-cyan-950/40")}
          >
            Config
          </button>
          <button
            type="button"
            onClick={() => {
              setConfigOpen(false);
              setIndicatorsOpen((o) => !o);
            }}
            className={cn(panelBtnClass, indicatorsOpen && "border-cyan-400/60 bg-cyan-950/40")}
          >
            Indicators
          </button>
          <label className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted">
            Depth
            <select
              value={depthRangePreset}
              onChange={(e) =>
                applyDepthPreset(e.target.value as DepthRangePreset)
              }
              className="bg-terminal-bg border border-terminal-border rounded px-1 py-0.5 text-white text-[10px] max-w-[108px]"
            >
              {DEPTH_RANGE_PRESETS.map((p) => (
                <option key={p} value={p}>
                  {depthPresetLabel(p, p === "local" ? localRangeUsd : undefined)}
                </option>
              ))}
            </select>
          </label>
          {depthRangePreset === "local" && (
            <label className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted">
              Local ±
              <select
                value={localRangeUsd}
                onChange={(e) => {
                  const v = Number(e.target.value) as LocalRangeUsd;
                  updatePrefs({ localRangeUsd: v });
                  if (priceScale.mode === "auto") {
                    priceScale.applyDepthRange("local");
                  }
                }}
                className="bg-terminal-bg border border-terminal-border rounded px-1 py-0.5 text-white text-[10px]"
              >
                {LOCAL_RANGE_USD_OPTIONS.map((v) => (
                  <option key={v} value={v}>
                    {v}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            type="button"
            onClick={() => {
              updatePrefs({ ladderAutoCenter: false });
              applyDepthPreset("majorWalls");
              priceScale.fitToMajorWalls();
            }}
            className={cn(
              btnClass,
              depthRangePreset === "majorWalls" &&
                "border-amber-500/40 text-amber-300",
            )}
          >
            Major Walls
          </button>
          <label className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted">
            Min
            <select
              value={minVisibleBtc}
              onChange={(e) => updatePrefs({ minVisibleBtc: Number(e.target.value) })}
              disabled={majorWallsOnly}
              className="bg-terminal-bg border border-terminal-border rounded px-1 py-0.5 text-white text-[10px]"
            >
              {MIN_SIZE_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v}
                </option>
              ))}
            </select>
          </label>
          <button
            type="button"
            onClick={() => updatePrefs({ majorWallsOnly: !majorWallsOnly })}
            className={cn(
              btnClass,
              majorWallsOnly && "border-terminal-accent bg-terminal-accent/15 text-terminal-accent",
            )}
          >
            Major only
          </button>
          <button
            type="button"
            onClick={() =>
              updatePrefs({ showImportantFarLevels: !showImportantFarLevels })
            }
            className={cn(
              btnClass,
              showImportantFarLevels &&
                "border-cyan-500/40 text-cyan-300",
            )}
          >
            Important {showImportantFarLevels ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => updatePrefs({ ladderAutoCenter: !ladderAutoCenter })}
            className={cn(
              btnClass,
              ladderAutoCenter &&
                "border-terminal-accent bg-terminal-accent/15 text-terminal-accent",
            )}
          >
            Auto center {ladderAutoCenter ? "ON" : "OFF"}
          </button>
          <button type="button" onClick={priceScale.zoomIn} className={btnClass}>
            Zoom In
          </button>
          <button type="button" onClick={priceScale.zoomOut} className={btnClass}>
            Zoom Out
          </button>
          <button type="button" onClick={resetView} className={btnClass}>
            Reset Spot
          </button>
          <button
            type="button"
            onClick={() => {
              updatePrefs({ ladderAutoCenter: false });
              priceScale.fitToWalls();
            }}
            className={btnClass}
          >
            Fit Walls
          </button>
          <button
            type="button"
            onClick={() => timeScale.setFollowLiveEnabled(!timeScale.followLive)}
            className={cn(
              btnClass,
              timeScale.followLive &&
                "border-cyan-500/40 text-cyan-300",
            )}
            disabled={!useEngineRenderer}
          >
            Follow Live {timeScale.followLive ? "ON" : "OFF"}
          </button>
          <label className="flex items-center gap-1 text-[10px] font-mono text-terminal-muted">
            Right space
            <select
              value={effectiveRightSpacePct}
              onChange={(e) => {
                const v = Number(e.target.value);
                const snapped = RIGHT_SPACE_PCT_OPTIONS.includes(v as RightSpacePct)
                  ? (v as RightSpacePct)
                  : RIGHT_SPACE_PCT_OPTIONS.reduce((best, o) =>
                      Math.abs(o - v) < Math.abs(best - v) ? o : best,
                    );
                updatePrefs({ rightSpacePct: snapped });
                setVisualSettings(
                  mergeBookmapVisualSettings(visualSettings, {
                    layout: { rightSpacePct: v },
                  }),
                );
              }}
              className="bg-terminal-bg border border-terminal-border rounded px-1 py-0.5 text-white text-[10px]"
              disabled={!useEngineRenderer}
            >
              {RIGHT_SPACE_PCT_OPTIONS.map((v) => (
                <option key={v} value={v}>
                  {v === 0 ? "OFF" : `${v}%`}
                </option>
              ))}
            </select>
          </label>
          {useEngineRenderer && (
            <span className="text-[9px] font-mono text-slate-600" title="Pan time horizontally">
              Shift+drag · MMB time pan
            </span>
          )}
          <button
            type="button"
            onClick={() => {
              const next = !showTrades;
              updatePrefs({ showTrades: next });
              setVisualSettings(
                mergeBookmapVisualSettings(visualSettings, {
                  trades: { enabled: next },
                }),
              );
            }}
            className={cn(
              btnClass,
              showTrades && visualSettings.trades.enabled && "border-emerald-500/40 text-emerald-400",
            )}
          >
            Trades {showTrades && visualSettings.trades.enabled ? "ON" : "OFF"}
          </button>
          <button
            type="button"
            onClick={() => {
              const next = !showPersistentWalls;
              updatePrefs({ showPersistentWalls: next });
              setVisualSettings(
                mergeBookmapVisualSettings(visualSettings, {
                  liquidity: { persistenceEnabled: next },
                }),
              );
            }}
            className={cn(
              btnClass,
              showPersistentWalls && "border-violet-500/40 text-violet-300",
            )}
          >
            Persistent {showPersistentWalls ? "ON" : "OFF"}
          </button>
          <span className="text-[9px] font-mono text-slate-600 px-1">
            DOM {safeDomWidth}px · ${Math.round(priceScale.dollarsPerPixel)}/px
          </span>
        </div>
      </header>

      <div
        ref={bookmapBodyRef}
        className="flex flex-1 min-h-0 min-w-0 overflow-hidden"
      >
        <div className="flex min-h-0 min-w-[240px] flex-1 flex-col overflow-hidden">
          <div
            ref={heatmapContainerRef}
            className={cn(
              "relative flex-1 min-w-0 min-h-0 overflow-hidden bg-[#0b1220]",
              isPanning ? "cursor-grabbing" : "cursor-crosshair",
            )}
            title={
              useEngineRenderer
                ? "Drag: price pan · Shift+drag or middle-click: time pan"
                : undefined
            }
            onMouseDown={handleCanvasMouseDown}
            onMouseMove={handleCanvasMouseMove}
            onMouseLeave={handleCanvasMouseLeave}
          >
            {viewportTooNarrow && (
              <div className="absolute inset-0 z-[25] flex items-center justify-center bg-[#0b1220]/85 px-3 pointer-events-none">
                <p className="text-[11px] font-mono text-amber-200/90 text-center">
                  Viewport too narrow — widen panel or shrink DOM
                </p>
              </div>
            )}
            {import.meta.env.DEV && heatmapPlotHeight > 0 && (
              <>
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none border-t border-cyan-400/70"
                  style={{ top: BOOKMAP_PLOT_PAD.top }}
                />
                <div
                  className="absolute left-0 right-0 z-20 pointer-events-none border-b border-cyan-400/70"
                  style={{ top: heatmapPlotHeight - BOOKMAP_PLOT_PAD.bottom }}
                />
              </>
            )}
            {showHeatmapOverlay && (
              <div className="absolute inset-0 z-10 flex items-center justify-center text-sm font-mono text-terminal-muted pointer-events-none">
                No orderbook heatmap data available
              </div>
            )}
            <canvas ref={canvasRef} className="absolute inset-0 w-full h-full pointer-events-none" />
            {configOpen && (
              <BookmapControlPanel
                settings={visualSettings}
                onChange={(next) =>
                  setVisualSettings(mergeBookmapVisualSettings(next, {}))
                }
                onClose={() => setConfigOpen(false)}
                onReset={() => {
                  resetVisualSettings();
                  setConfigOpen(false);
                }}
              />
            )}
            {indicatorsOpen && (
              <IndicatorsPanel onClose={() => setIndicatorsOpen(false)} />
            )}
            {useEngineRenderer &&
              (farDepthMarkers.above.length > 0 || farDepthMarkers.below.length > 0) && (
                <div className="absolute inset-0 z-[15] pointer-events-none">
                  {farDepthMarkers.above.map((m, i) => (
                    <button
                      key={`ask-${m.price}`}
                      type="button"
                      className="pointer-events-auto absolute left-1 max-w-[calc(100%-8px)] truncate rounded px-1 py-0 text-left text-[9px] font-mono text-rose-200/95 hover:bg-slate-900/80"
                      style={{ top: BOOKMAP_PLOT_PAD.top + 2 + i * 13 }}
                      onClick={() => {
                        updatePrefs({ ladderAutoCenter: false });
                        priceScale.setCenterPrice(m.price);
                      }}
                    >
                      ↑ ASK WALL {formatHeatmapPrice(m.price)} · {Math.round(m.sizeBtc)} BTC ·{" "}
                      {m.pctFromSpot >= 0 ? "+" : ""}
                      {m.pctFromSpot.toFixed(1)}%
                    </button>
                  ))}
                  {farDepthMarkers.below.map((m, i) => (
                    <button
                      key={`bid-${m.price}`}
                      type="button"
                      className="pointer-events-auto absolute left-1 max-w-[calc(100%-8px)] truncate rounded px-1 py-0 text-left text-[9px] font-mono text-emerald-200/95 hover:bg-slate-900/80"
                      style={{ bottom: BOOKMAP_PLOT_PAD.bottom + 2 + i * 13 }}
                      onClick={() => {
                        updatePrefs({ ladderAutoCenter: false });
                        priceScale.setCenterPrice(m.price);
                      }}
                    >
                      ↓ BID WALL {formatHeatmapPrice(m.price)} · {Math.round(m.sizeBtc)} BTC ·{" "}
                      {m.pctFromSpot.toFixed(1)}%
                    </button>
                  ))}
                </div>
              )}
          </div>

          <div className="shrink-0 flex flex-col">
            <div
              role="separator"
              aria-orientation="horizontal"
              className="shrink-0 h-1 cursor-row-resize bg-terminal-border/30 hover:bg-terminal-accent/40 transition-colors"
              onMouseDown={startVolumeResize}
            />
            <DeltaVolumeMatrixPanel
              enabled={deltaPanelEnabled}
              buckets={bookmapTradeAgg.buckets}
              bucketMs={bookmapTradeAgg.bucketMs}
              height={volumeHeight}
              cvd={bookmapTradeAgg.summary.cvd}
            />
          </div>
        </div>

        <div
          className={cn(
            "flex min-h-0 shrink-0 flex-col overflow-hidden border-l border-r border-terminal-border/70",
            "bg-[#0c121a]",
            import.meta.env.DEV && "ring-1 ring-inset ring-cyan-500/35",
          )}
          style={{ width: PRICE_LADDER_WIDTH_PX, minWidth: PRICE_LADDER_WIDTH_PX }}
        >
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <BookmapPriceLadder
              scale={priceScale}
              spot={priceReference ?? tickerSpot}
            />
          </div>
          <div
            className="shrink-0 border-t border-terminal-border/70 bg-terminal-bg/50"
            style={{ height: volumeHeight + VOLUME_RESIZE_HANDLE_PX }}
            aria-hidden
          />
        </div>

        {visualSettings.dom.enabled && (
        <aside
          className={cn(
            "relative flex min-h-0 shrink-0 flex-col overflow-hidden",
            "bg-[#0a0f18]",
            visualSettings.dom.compactMode && "opacity-95",
            import.meta.env.DEV && "ring-1 ring-inset ring-rose-500/30",
          )}
          style={{ width: safeDomWidth, minWidth: safeDomWidth }}
        >
          <div
            role="separator"
            aria-orientation="vertical"
            aria-label="Resize DOM width"
            className="absolute left-0 top-0 z-30 w-1 -translate-x-1/2 cursor-col-resize hover:bg-terminal-accent/35"
            style={{ bottom: volumeHeight + VOLUME_RESIZE_HANDLE_PX }}
            onMouseDown={startDomResize}
          />
          <div className="relative flex min-h-0 flex-1 flex-col overflow-hidden">
            <BookmapDomPanel
              engineMode={useEngineRenderer}
              engineBook={engineBookForDom}
              snapshot={useEngineRenderer ? undefined : latest}
              spot={spot}
              scale={priceScale}
              panelWidth={safeDomWidth}
              viewMode={viewMode}
              importantLevels={importantLevels}
              wallEntries={domWallEntries}
              showImportantStrip={showDomImportantStrip}
            />
          </div>
          <div
            className="flex shrink-0 items-center justify-center border-t border-terminal-border/70 bg-[#0a0f18] px-1"
            style={{ height: volumeHeight + VOLUME_RESIZE_HANDLE_PX }}
          >
            {deltaPanelEnabled ? (
              <BookmapCvdGauge
                value={bookmapTradeAgg.summary.cvd}
                width={Math.min(170, Math.max(120, safeDomWidth - 24))}
                height={Math.min(130, Math.max(90, volumeHeight + VOLUME_RESIZE_HANDLE_PX - 8))}
                cvdSamples={cvdSamples}
              />
            ) : (
              <div className="text-[9px] font-mono text-slate-600">CVD —</div>
            )}
          </div>
        </aside>
        )}
      </div>
    </div>
  );
}
