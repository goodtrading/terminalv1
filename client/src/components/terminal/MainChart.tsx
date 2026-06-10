import { apiUrl } from "../../lib/apiBase";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChartContextMenu, type ChartContextMenuAction } from "./chart/ChartContextMenu";
import { ChartSettingsModal } from "./chart/ChartSettingsModal";
import { ChartTimeframeSelector } from "./chart/ChartTimeframeSelector";
import { useChartContextMenu } from "./chart/useChartContextMenu";
import type { ChartTimeframeId } from "@/lib/chartTimeframes";
import { getChartTimeframeMeta } from "@/lib/chartTimeframes";
import { getCandleLimitForTimeframe } from "@shared/candleLimits";
import { fetchMarketCandles } from "@/lib/btcMarketBaseFetch";
import {
  applyMarketTicker,
  applyNativeChartCandles,
  fetchAndShapeBtcBasePack,
  getCandlesSliceForTimeframe,
  getChartTimeframe,
  getLastCandleForTimeframe,
  hydrateMarketEngine,
  subscribeMarketData,
  useChartTimeframe,
} from "@/stores/marketEngineStore";
import { getChartSettings, setChartSettings, useChartSettings } from "./chart/chartSettingsStore";
import type { ChartMenuContext, ChartMenuOverlayKind } from "./chart/chartContextTypes";
import type { DrawingsLayerHandle } from "./drawings/DrawingsLayer";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType, LineStyle, CandlestickSeries, HistogramSeries, LineSeries, IChartApi, ISeriesApi } from "lightweight-charts";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels, DealerExposure, TradingScenario } from "@shared/schema";
import { useTerminalState } from "@/hooks/useTerminalState";
import { SessionLiquidityManager } from "./overlay/SessionLiquidityManager";
import { cn } from "@/lib/utils";
import { useLearnMode } from "@/hooks/useLearnMode";
import { TooltipWrapper } from "./Tooltip";
import { BookmapOrderBookTracker } from "./overlay/scanners/bookmapOrderBookTracker";
import { TrackerOutput, OrderBookLevel } from "./overlay/scanners/bookmapOrderBookTypes";
import { ScenarioOverlay } from "./overlay/ScenarioOverlay";
import { HeatmapCanvas } from "./overlay/HeatmapCanvas";
import { LayerGroupControls } from "./overlay/LayerGroupControls";
import { DrawingsLayer } from "./drawings/DrawingsLayer";
import { FootprintOverlay } from "./footprint/FootprintOverlay";
import { drawDebug, setChartViewportVersion } from "./drawings/debug";
import type { LayerGroup } from "./overlay/layerGroups";
import { BTC_TICKER_REFETCH_MS, LIVE_CANDLE_CHART_DISABLED } from "@/lib/liveChartConfig";
import {
  extractMajorWallsFromOrderBook,
  logHeatmapMajorWallsOnly,
} from "@/lib/heatmapWallConfig";
import {
  buildLevelTimingContextFromState,
  horizonShort,
  timingTitleSuffix,
  urgencyShort,
} from "@/lib/levelTiming";
import type { OperationalLevelKind, OperationalLevelSource } from "@/lib/levelTimingTypes";
import { computeLevelTiming } from "@/lib/computeLevelTiming";
import { resolveGammaOverlaySelection } from "@/lib/gammaOverlaySelection";
import { renderCascadeLevels } from "./overlay/renderers/cascadeLevels";
import { renderSqueezeLevels } from "./overlay/renderers/squeezeLevels";
import { buildChartCoordinateHelpers } from "./chart/buildChartCoordinateHelpers";
import { MeasurementOverlay } from "./measurement/MeasurementOverlay";
import { useChartMeasurement } from "./measurement/useChartMeasurement";
import { BingXReadOnlyChartOverlay } from "./bingxChart/BingXReadOnlyChartOverlay";
import { PaperChartLimitOrders } from "./paperChart/PaperChartLimitOrders";
import { PaperTradeOverlay } from "./paperChart/PaperTradeOverlay";
import { TerminalErrorBoundary } from "./TerminalErrorBoundary";
import {
  BROKER_SESSION_STORAGE_KEY,
  loadBrokerSession,
} from "./execution/brokerSessionState";
import { isBingXVisualSession } from "./execution/bingxSession";

/** Lightweight Charts candlestick time: integer seconds since Unix epoch */
type UTCTimestamp = number;

type MapMode = "LEVELS" | "GAMMA" | "CASCADE" | "SQUEEZE" | "HEATMAP" | "FOOTPRINT";

export function MainChart({
  activeScenario,
  onActiveScenarioChange,
  viewMode = "PRO",
}: {
  activeScenario: "BASE" | "ALT" | "VOL";
  onActiveScenarioChange: (scenario: "BASE" | "ALT" | "VOL") => void;
  /** SIMPLE: menos cromo tÃ©cnico en el lienzo; PRO: comportamiento actual. */
  viewMode?: "SIMPLE" | "PRO";
}) {
  const isSimpleView = viewMode === "SIMPLE";
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const drawingsLayerRef = useRef<DrawingsLayerHandle | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ghostSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ghostBarsCountRef = useRef(0);
  const priceLinesRef = useRef<any[]>([]);
  const livePriceLineRef = useRef<any>(null);

  const shouldFitContentRef = useRef(true);
  const chartFullResyncRef = useRef(true);
  const lastChartPushRef = useRef<{ tf: ChartTimeframeId; len: number; lastTime: number } | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const [brokerSession, setBrokerSession] = useState(loadBrokerSession);
    const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);
  const [drawingsViewportVersion, setDrawingsViewportVersion] = useState(0);
  const [chartCandleTimes, setChartCandleTimes] = useState<{ time: number }[]>([]);
  const drawingsInteractionActiveRef = useRef(false);
  const drawingsInteractionRafRef = useRef<number | null>(null);
  const drawingsWheelStopTimeoutRef = useRef<number | null>(null);
  const chartTimeframe = useChartTimeframe();

  const drawingsTimeProjectionRef = useRef<{
    lastTimeSec: number | null;
    barSec: number;
  }>({ lastTimeSec: null, barSec: getChartTimeframeMeta(chartTimeframe).barSec });
  const FUTURE_GHOST_BASE = 400;
  const FUTURE_GHOST_EXTEND_STEP = 150;
  const FUTURE_GHOST_EXTEND_BUFFER = 40;
  const [lastCandle, setLastCandle] = useState<any>(null);
  const [activePanels, setActivePanels] = useState<Set<MapMode>>(() => {
  // Load from localStorage on initialization
  const savedPanels = localStorage.getItem('terminal-activePanels');
  if (savedPanels) {
    try {
      const parsed = JSON.parse(savedPanels);
      return new Set(parsed.filter((p: string) => ["LEVELS", "GAMMA", "CASCADE", "SQUEEZE", "HEATMAP", "FOOTPRINT"].includes(p)));
    } catch {
      // Fallback to default if localStorage is corrupted
      return new Set(["LEVELS" as MapMode]);
    }
  }
  return new Set(["LEVELS" as MapMode]);
});

  // Toggle panel activation
  const togglePanel = (panel: MapMode) => {
    setActivePanels(prev => {
      const newSet = new Set(prev);
      if (newSet.has(panel)) {
        newSet.delete(panel);
      } else {
        newSet.add(panel);
      }
      // Save to localStorage whenever panels change
      localStorage.setItem('terminal-activePanels', JSON.stringify(Array.from(newSet)));
      return newSet;
    });
  };

  // Save active panels to localStorage whenever they change
  useEffect(() => {
    localStorage.setItem('terminal-activePanels', JSON.stringify(Array.from(activePanels)));
  }, [activePanels]);

  useEffect(() => {
    const sync = () => setBrokerSession(loadBrokerSession());
    sync();
    const onStorage = (e: StorageEvent) => {
      if (e.key === BROKER_SESSION_STORAGE_KEY) sync();
    };
    const onCustom = () => sync();
    window.addEventListener("storage", onStorage);
    window.addEventListener("goodtrading-broker-session-changed", onCustom);
    return () => {
      window.removeEventListener("storage", onStorage);
      window.removeEventListener("goodtrading-broker-session-changed", onCustom);
    };
  }, []);

  const showPaperChartOverlay =
    brokerSession.exchange === "paper" &&
    brokerSession.connectionMode === "paper" &&
    brokerSession.connected;

  const showBingXReadOnlyChartOverlay = isBingXVisualSession(brokerSession);

  useEffect(() => {
    if (!import.meta.env.DEV) return;
    console.debug("[bingx-chart] overlay gate", {
      exchange: brokerSession.exchange,
      connectionMode: brokerSession.connectionMode,
      connected: brokerSession.connected,
      connectionId: Boolean(brokerSession.connectionId),
      showBingXReadOnlyChartOverlay,
      showPaperChartOverlay,
    });
  }, [
    brokerSession.exchange,
    brokerSession.connectionMode,
    brokerSession.connected,
    brokerSession.connectionId,
    showBingXReadOnlyChartOverlay,
    showPaperChartOverlay,
  ]);

  const [showAccelZones, setShowAccelZones] = useState(true);
  const [showAbsorbZones, setShowAbsorbZones] = useState(true);
  const [showGravityZones, setShowGravityZones] = useState(false);

  const [toggles, setToggles] = useState({
    price: true,
    gamma: false,
    bookmap: false,
  });

  const [manualPriceRange, setManualPriceRange] = useState<{from: number, to: number} | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<TradingScenario | null>(null);
  const scenarioLevelsRef = useRef<any[]>([]);

  const rebuildGhostBars = useCallback((barsCount: number) => {
    const chart = chartRef.current;
    const ghostSeries = ghostSeriesRef.current;
    const anchor = drawingsTimeProjectionRef.current;
    if (!chart || !ghostSeries || anchor.lastTimeSec == null || !Number.isFinite(anchor.barSec) || anchor.barSec <= 0) return;
    const clampedCount = Math.max(FUTURE_GHOST_BASE, Math.floor(barsCount));
    const ghostData = Array.from({ length: clampedCount }, (_, i) => ({
      time: (anchor.lastTimeSec! + (i + 1) * anchor.barSec) as UTCTimestamp,
    }));
    ghostSeries.setData(ghostData as any);
    ghostBarsCountRef.current = clampedCount;
  }, []);

  const sessionLiquidityManagerRef = useRef<SessionLiquidityManager>(new SessionLiquidityManager());
  const sessionLiquidityLinesRef = useRef<any[]>([]);
  const boundaryBadgesRef = useRef<HTMLDivElement[]>([]);
  const lastGammaOverlayLogKeyRef = useRef("");
  
  // Bookmap-style order book tracker for faithful order book visualization
  const bookmapTrackerRef = useRef<BookmapOrderBookTracker>(
    new BookmapOrderBookTracker({
      depth: 1000,              // Fetch 1000 levels per side
      aggregation: {
        enabled: false,          // Start with no aggregation for fidelity
        priceStep: 0.1           // 0.1 BTC steps if enabled
      },
      persistence: {
        threshold: 30000,        // 30 seconds persistence
        minScore: 0.5           // 50% persistence threshold
      },
      filtering: {
        minSize: 0.01,           // Track levels as small as 0.01 BTC
        maxLevels: 1000          // Match Binance full depth; majors kept via selectOrderBookLevelsForHeatmap
      }
    })
  );
  const lastTrackerOutputRef = useRef<TrackerOutput | null>(null);
  const DEBUG_ENABLED = process.env.NODE_ENV === 'development';

  // Global wall hold tracking
  const globalWallHoldTimers = useRef<Map<string, number>>(new Map());
  const GLOBAL_WALL_HOLD_DURATION = 15000; // 15 seconds hold time

  // Active global walls cache for persistent display
  const activeGlobalWalls = useRef<Map<string, {
    side: 'BID' | 'ASK';
    price: number;
    size: number;
    label: string;
    lastSeen: number;
    expiresAt: number;
  }>>(new Map());

  // Main global walls cache for persistent fixed levels
  const mainGlobalWalls = useRef<Map<string, {
    side: 'BID' | 'ASK';
    price: number;
    size: number;
    label: string;
    detectedAt: number;
    lastSeen: number;
    strikes: number; // Track consecutive weak detections
  }>>(new Map());

  const { data: terminalState } = useTerminalState();
  const positioning_engines = terminalState?.positioning as any;
  const { learnMode } = useLearnMode();

  const chartSettings = useChartSettings();
  const [chartSettingsOpen, setChartSettingsOpen] = useState(false);
  const chartContextMenu = useChartContextMenu({ closeDeps: [] });

  const chartTfMeta = getChartTimeframeMeta(chartTimeframe);
  const chartApiInterval = chartTfMeta.apiInterval;
  const chartCandleLimit = getCandleLimitForTimeframe(chartApiInterval);
  const usesNativeChartHistory =
    chartTimeframe === "1m" || chartTimeframe === "5m";

  const {
    data: basePack,
    error: baseError,
    isLoading: baseLoading,
  } = useQuery({
    queryKey: ["btc-market-engine-base"],
    queryFn: fetchAndShapeBtcBasePack,
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  const { data: nativeChartCandles } = useQuery({
    queryKey: ["market-candles", "BTCUSDT", chartApiInterval, chartCandleLimit],
    queryFn: () => fetchMarketCandles("BTCUSDT", chartApiInterval, chartCandleLimit),
    enabled: usesNativeChartHistory,
    refetchInterval: 60_000,
    staleTime: 45_000,
  });

  useEffect(() => {
    if (!basePack?.base?.length) return;
    chartFullResyncRef.current = true;
    hydrateMarketEngine(basePack);
  }, [basePack]);

  useEffect(() => {
    if (!usesNativeChartHistory || !nativeChartCandles?.length) return;
    chartFullResyncRef.current = true;
    applyNativeChartCandles(chartTimeframe, nativeChartCandles);
  }, [nativeChartCandles, chartTimeframe, usesNativeChartHistory]);

  const { data: ticker, error: tickerError } = useQuery({
    queryKey: ["btc-ticker"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/market/ticker?symbol=BTCUSDT"));
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || "Ticker fetch failed");
      }
      return res.json();
    },
    refetchInterval: BTC_TICKER_REFETCH_MS,
    staleTime: 0,
  });

  useEffect(() => {
    if (ticker == null || !ticker.price) return;
    if (basePack?.base?.length) {
      applyMarketTicker(ticker.price, ticker.timestamp);
    }
  }, [ticker?.price, ticker?.timestamp, basePack?.base?.length]);

  useEffect(() => {
    const tsPrice = terminalState?.ticker?.price;
    if (tsPrice == null || tsPrice <= 0 || !basePack?.base?.length) return;
    applyMarketTicker(tsPrice, terminalState.ticker?.timestamp ?? Date.now());
  }, [
    terminalState?.ticker?.price,
    terminalState?.ticker?.timestamp,
    basePack?.base?.length,
  ]);

  useEffect(() => {
    const barSec = getChartTimeframeMeta(chartTimeframe).barSec;
    drawingsTimeProjectionRef.current.barSec = barSec;
  }, [chartTimeframe]);

  const prevTimeframeRef = useRef(chartTimeframe);
  useEffect(() => {
    if (prevTimeframeRef.current !== chartTimeframe) {
      prevTimeframeRef.current = chartTimeframe;
      shouldFitContentRef.current = true;
      chartFullResyncRef.current = true;
    }
  }, [chartTimeframe]);

  const { data: positioning } = useQuery<OptionsPositioning>({ queryKey: ["/api/options-positioning"], refetchInterval: 30_000, staleTime: 15_000 });
  const { data: market } = useQuery<MarketState>({ queryKey: ["/api/market-state"], refetchInterval: 15_000, staleTime: 10_000 });
  const { data: levels } = useQuery<KeyLevels>({ queryKey: ["/api/key-levels"], refetchInterval: 30_000, staleTime: 15_000 });

  const gammaOverlaySel = useMemo(
    () => resolveGammaOverlaySelection(market, terminalState?.options),
    [market, terminalState?.options],
  );

  // Raw order book data for Bookmap tracker
  const { data: rawOrderBook } = useQuery({
    queryKey: ["orderbook-raw"],
    queryFn: async () => {
      const res = await fetch(apiUrl("/api/orderbook/raw"));
      if (!res.ok) {
        throw new Error("Failed to fetch raw order book");
      }
      return res.json() as Promise<{
        bids: [string, string][];
        asks: [string, string][];
        timestamp: number;
      }>;
    },
    refetchInterval: 1_500,
    staleTime: 750,
    enabled: activePanels.has("HEATMAP") // Only fetch when heatmap is active
  });

  // Live price marker component for safe mode
  const LivePriceMarker = () => {
    const { data: ticker } = useQuery({
      queryKey: ["btc-ticker"],
      queryFn: async () => {
        const res = await fetch(apiUrl("/api/market/ticker?symbol=BTCUSDT"));
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.details || "Ticker fetch failed");
        }
        return res.json();
      },
      refetchInterval: BTC_TICKER_REFETCH_MS,
      staleTime: 0,
    });

    if (!ticker) return null;

    return (
      <div className="absolute top-4 right-4 z-10 pointer-events-none">
        <div className="bg-black/80 border border-white/10 rounded px-2 py-1 backdrop-blur-sm">
          <div className="text-xs font-mono text-white/60">
            LIVE: {ticker.price?.toFixed(2)}
          </div>
        </div>
      </div>
    );
  };

  const resetScale = () => {
    if (!chartRef.current) return;
    setManualPriceRange(null);
    chartRef.current.priceScale("right").applyOptions({ autoScale: true });
    chartRef.current.timeScale().fitContent();
    chartRef.current.timeScale().applyOptions({ rightOffset: 36, rightBarStaysOnScroll: true });
  };

  // Helper function to get order book data from positioning engines
  const getOrderBookFromPositioning = (positioning_engines: any) => {
    if (!positioning_engines?.liquidityHeatmap) {
      return null;
    }

    // For now, extract from existing heatmap zones (to be replaced with direct order book)
    const heatmap = positioning_engines.liquidityHeatmap;
    const rawBids: [string, string][] = [];
    const rawAsks: [string, string][] = [];

    // Convert heatmap zones to raw order book format (temporary bridge)
    if (heatmap.liquidityHeatZones) {
      heatmap.liquidityHeatZones.forEach((zone: any) => {
        const midPrice = (zone.priceStart + zone.priceEnd) / 2;
        const size = zone.totalSize || zone.intensity * 10; // Temporary conversion
        
        if (zone.side === 'BID') {
          rawBids.push([midPrice.toString(), size.toString()]);
        } else if (zone.side === 'ASK') {
          rawAsks.push([midPrice.toString(), size.toString()]);
        }
      });
    }

    return { rawBids, rawAsks };
  };

  const fitLevels = () => {
    const price = lastCandle?.close;
    if (!chartRef.current || !price) return;
    const threshold = price * 0.15;
    const points: number[] = [price];

    const gFit = resolveGammaOverlaySelection(market, terminalState?.options);
    if (gFit.selectedFlipForChart) points.push(gFit.selectedFlipForChart);
    if (gFit.selectedFlipType === "local" && gFit.localZoneStart && gFit.localZoneEnd) {
      points.push(gFit.localZoneStart, gFit.localZoneEnd);
    } else if (gFit.selectedFlipType === "broad" && gFit.broadZoneStart && gFit.broadZoneEnd) {
      points.push(gFit.broadZoneStart, gFit.broadZoneEnd);
    }
    if (gFit.globalFlip != null) {
      const op = gFit.selectedFlipForChart;
      if (
        op == null ||
        Math.abs(gFit.globalFlip - op) / Math.max(gFit.globalFlip, op, 1) >= 1e-5
      ) {
        points.push(gFit.globalFlip);
      }
    }
    const pos = positioning as { callWall?: number; putWall?: number; activeCallWall?: number; activePutWall?: number } | undefined;
    const cw = (pos?.activeCallWall && pos.activeCallWall > 0) ? pos.activeCallWall : pos?.callWall;
    const pw = (pos?.activePutWall && pos.activePutWall > 0) ? pos.activePutWall : pos?.putWall;
    if (cw) points.push(cw);
    if (pw) points.push(pw);
    if (positioning?.dealerPivot) points.push(positioning.dealerPivot);
    if (levels?.gammaMagnets) points.push(...levels.gammaMagnets);
    if (levels?.shortGammaPocketStart) points.push(levels.shortGammaPocketStart);
    if (levels?.shortGammaPocketEnd) points.push(levels.shortGammaPocketEnd);
    if (levels?.deepRiskPocketStart) points.push(levels.deepRiskPocketStart);
    if (levels?.deepRiskPocketEnd) points.push(levels.deepRiskPocketEnd);
    const gm = terminalState?.gravityMap;
    if (gm?.primaryMagnet?.price) points.push(gm.primaryMagnet.price);
    if (gm?.secondaryMagnet?.price) points.push(gm.secondaryMagnet.price);

    const filteredPoints = points.filter(p => Math.abs(p - price) <= threshold);
    if (filteredPoints.length > 0) {
      const min = Math.min(...filteredPoints);
      const max = Math.max(...filteredPoints);
      const margin = (max - min) * 0.3 || price * 0.02;
      const newRange = { from: min - margin, to: max + margin };
      setManualPriceRange(newRange);
      chartRef.current.priceScale("right").applyOptions({ autoScale: false });
    }
  };

  useEffect(() => {
    if (!candleSeriesRef.current) return;
    scenarioLevelsRef.current.forEach(line => candleSeriesRef.current?.removePriceLine(line));
    scenarioLevelsRef.current = [];
    if (!selectedScenario) return;
    const color = selectedScenario.type === "BASE" ? "#3b82f6" : selectedScenario.type === "ALT" ? "#22c55e" : "#f97316";
    selectedScenario.levels.forEach((levelStr) => {
      const price = parseLevelStr(levelStr);
      if (isNaN(price)) return;
      const line = candleSeriesRef.current?.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `${selectedScenario.type} ${levelStr}` });
      if (line) scenarioLevelsRef.current.push(line);
    });
    const prices = selectedScenario.levels.map(parseLevelStr).filter(p => !isNaN(p));
    if (prices.length > 0) {
      const min = Math.min(...prices);
      const max = Math.max(...prices);
      const margin = (max - min) * 0.4 || prices[0] * 0.03;
      setManualPriceRange({ from: min - margin, to: max + margin });
    }
  }, [selectedScenario]);

  useEffect(() => {
    const handleScenarioSelect = (e: any) => setSelectedScenario(e.detail);
    window.addEventListener('scenario-select', handleScenarioSelect);
    return () => window.removeEventListener('scenario-select', handleScenarioSelect);
  }, []);

  useEffect(() => {
    if (!chartContainerRef.current) return;
    const FUTURE_RIGHT_OFFSET = 36;
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#000000" }, textColor: "#ffffff", fontSize: 12, fontFamily: "JetBrains Mono, monospace" },
      grid: { vertLines: { color: "#0a0a0a" }, horzLines: { color: "#0a0a0a" } },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        borderColor: "#1a1a1a",
        timeVisible: true,
        barSpacing: 12,
        rightOffset: FUTURE_RIGHT_OFFSET,
        rightBarStaysOnScroll: true,
      },
      rightPriceScale: { borderColor: "#1a1a1a", scaleMargins: { top: 0.2, bottom: 0.25 }, minimumWidth: 100 },
      crosshair: { mode: 0 },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444", priceLineVisible: false });
    const volumeSeries = chart.addSeries(HistogramSeries, { color: 'rgba(38, 166, 154, 0.2)', priceFormat: { type: 'volume' }, priceScaleId: '' });
    const ghostSeries = chart.addSeries(LineSeries, {
      color: "rgba(0,0,0,0)",
      lineWidth: 1,
      crosshairMarkerVisible: false,
      lastValueVisible: false,
      priceLineVisible: false,
    });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });
    
    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;
    volumeSeriesRef.current = volumeSeries;
    ghostSeriesRef.current = ghostSeries;
    setChartReady(true);

    const bumpDrawingsViewport = () =>
      setDrawingsViewportVersion((v) => {
        const next = v + 1;
        setChartViewportVersion(next);
        drawDebug("CHART_VIEWPORT", { viewportVersion: next, source: "MainChart.onViewportChange" });
        return next;
      });
    const onViewportChange = () => {
      bumpDrawingsViewport();
      const lastTimeSec = drawingsTimeProjectionRef.current.lastTimeSec;
      const barSec = drawingsTimeProjectionRef.current.barSec;
      if (lastTimeSec == null || !Number.isFinite(barSec) || barSec <= 0) return;
      const timeToLogical = (ts as any).timeToLogical as ((t: UTCTimestamp) => number | null) | undefined;
      const visible = ts.getVisibleLogicalRange();
      if (!timeToLogical || !visible) return;
      const lastLogical = timeToLogical(lastTimeSec as UTCTimestamp);
      if (typeof lastLogical !== "number") return;
      const ghostHorizonLogical = lastLogical + Math.max(FUTURE_GHOST_BASE, ghostBarsCountRef.current || FUTURE_GHOST_BASE);
      if (visible.to >= ghostHorizonLogical - FUTURE_GHOST_EXTEND_BUFFER) {
        rebuildGhostBars((ghostBarsCountRef.current || FUTURE_GHOST_BASE) + FUTURE_GHOST_EXTEND_STEP);
      }
    };
    const ts = chart.timeScale();
    const ensureFutureSpace = () => {
      ts.applyOptions({
        rightOffset: FUTURE_RIGHT_OFFSET,
        rightBarStaysOnScroll: true,
      });
    };
    ensureFutureSpace();
    ts.subscribeVisibleTimeRangeChange(onViewportChange);
    ts.subscribeVisibleLogicalRangeChange(onViewportChange);
    const interactionTarget = chartContainerRef.current;

    const stopInteractionRaf = () => {
      drawingsInteractionActiveRef.current = false;
      if (drawingsInteractionRafRef.current != null) {
        window.cancelAnimationFrame(drawingsInteractionRafRef.current);
        drawingsInteractionRafRef.current = null;
      }
      if (drawingsWheelStopTimeoutRef.current != null) {
        window.clearTimeout(drawingsWheelStopTimeoutRef.current);
        drawingsWheelStopTimeoutRef.current = null;
      }
    };

    const startInteractionRaf = () => {
      if (drawingsInteractionActiveRef.current) return;
      drawingsInteractionActiveRef.current = true;
      const tick = () => {
        if (!drawingsInteractionActiveRef.current) return;
        bumpDrawingsViewport();
        drawingsInteractionRafRef.current = window.requestAnimationFrame(tick);
      };
      drawingsInteractionRafRef.current = window.requestAnimationFrame(tick);
    };

    const onWheel = () => {
      startInteractionRaf();
      if (drawingsWheelStopTimeoutRef.current != null) window.clearTimeout(drawingsWheelStopTimeoutRef.current);
      drawingsWheelStopTimeoutRef.current = window.setTimeout(() => stopInteractionRaf(), 120);
    };
    const onPointerDown = () => startInteractionRaf();
    const onPointerUp = () => stopInteractionRaf();
    interactionTarget?.addEventListener("wheel", onWheel, { passive: true });
    interactionTarget?.addEventListener("pointerdown", onPointerDown);
    window.addEventListener("pointerup", onPointerUp);

    const lastAppliedSize = { w: 0, h: 0 };
    const updateSize = () => {
      const el = chartContainerRef.current;
      if (el && chartRef.current) {
        const w = el.clientWidth;
        const h = el.clientHeight;
        // Ignore transient zero/near-zero sizes during layout transitions.
        if (w < 50 || h < 50) return;
        if (lastAppliedSize.w === w && lastAppliedSize.h === h) return;
        lastAppliedSize.w = w;
        lastAppliedSize.h = h;

        chartRef.current.applyOptions({ width: w, height: h });
        setChartSize((prev) => {
          if (prev && prev.w === w && prev.h === h) return prev;
          return { w, h };
        });

        // Do NOT call fitContent() here: it recomputes the full visible range on every px of drag,
        // freezes the UI, and resets the user's zoom. applyOptions(width/height) is enough for LW reflow.
        ensureFutureSpace();
      }
    };

    /** One layout pass per animation frame (ResizeObserver + window.resize often fire together). */
    let resizeRaf = 0;
    const scheduleUpdateSize = () => {
      if (resizeRaf) return;
      resizeRaf = window.requestAnimationFrame(() => {
        resizeRaf = 0;
        updateSize();
      });
    };

    updateSize();

    // TradingView needs a proper reflow when container height changes (e.g., bottom dock resize).
    // ResizeObserver provides that deterministically without relying on window resize.
    const ro = new ResizeObserver(() => {
      scheduleUpdateSize();
    });
    if (chartContainerRef.current) ro.observe(chartContainerRef.current);

    window.addEventListener("resize", scheduleUpdateSize);
    return () => {
      ts.unsubscribeVisibleTimeRangeChange(onViewportChange);
      ts.unsubscribeVisibleLogicalRangeChange(onViewportChange);
      interactionTarget?.removeEventListener("wheel", onWheel as EventListener);
      interactionTarget?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      stopInteractionRaf();
      window.removeEventListener("resize", scheduleUpdateSize);
      if (resizeRaf) window.cancelAnimationFrame(resizeRaf);
      ro.disconnect();
      chart.remove();
      ghostSeriesRef.current = null;
      setChartReady(false);
      setChartSize(null);
    };
  }, [rebuildGhostBars]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    const ghostSeries = ghostSeriesRef.current;
    if (!chartReady || !series) return;

    const toUTCTimestamp = (t: number): UTCTimestamp => {
      const n = Number(t);
      if (!Number.isFinite(n)) return 0 as UTCTimestamp;
      return (n > 1e10 ? Math.floor(n / 1000) : Math.floor(n)) as UTCTimestamp;
    };

    const applyEngineToChart = () => {
      const tf = getChartTimeframe();
      const raw = getCandlesSliceForTimeframe(tf);
      if (raw.length === 0) return;

      const candlesForChart = raw.map((c) => ({
        time: toUTCTimestamp(c.time),
        open: Number(c.open),
        high: Number(c.high),
        low: Number(c.low),
        close: Number(c.close),
      }));

      const lastBar = candlesForChart[candlesForChart.length - 1]!;
      const expectedBarSec = getChartTimeframeMeta(tf).barSec;
      drawingsTimeProjectionRef.current = {
        lastTimeSec: Number(lastBar.time),
        barSec: expectedBarSec,
      };

      const lastLc = getLastCandleForTimeframe(tf);
      if (lastLc) setLastCandle(lastLc);

      setChartCandleTimes(candlesForChart.map((c) => ({ time: Number(c.time) })));

      if (LIVE_CANDLE_CHART_DISABLED) {
        if (chartFullResyncRef.current) {
          series.setData(candlesForChart);
          if (ghostSeries) rebuildGhostBars(FUTURE_GHOST_BASE);
          chartFullResyncRef.current = false;
          lastChartPushRef.current = {
            tf,
            len: candlesForChart.length,
            lastTime: Number(lastBar.time),
          };
          if (shouldFitContentRef.current && chartRef.current) {
            chartRef.current.timeScale().fitContent();
            chartRef.current.timeScale().applyOptions({ rightOffset: 36, rightBarStaysOnScroll: true });
            shouldFitContentRef.current = false;
          }
        }
        return;
      }

      const p = lastChartPushRef.current;
      if (!p || p.tf !== tf) {
        series.setData(candlesForChart);
        lastChartPushRef.current = {
          tf,
          len: candlesForChart.length,
          lastTime: Number(lastBar.time),
        };
      } else if (
        candlesForChart.length === p.len &&
        Number(lastBar.time) === p.lastTime
      ) {
        series.update(lastBar);
      } else if (
        candlesForChart.length === p.len + 1 &&
        Number(lastBar.time) > p.lastTime
      ) {
        series.update(lastBar);
        lastChartPushRef.current = {
          tf,
          len: candlesForChart.length,
          lastTime: Number(lastBar.time),
        };
      } else {
        series.setData(candlesForChart);
        lastChartPushRef.current = {
          tf,
          len: candlesForChart.length,
          lastTime: Number(lastBar.time),
        };
      }

      if (ghostSeries) rebuildGhostBars(FUTURE_GHOST_BASE);
      if (shouldFitContentRef.current && chartRef.current) {
        chartRef.current.timeScale().fitContent();
        chartRef.current.timeScale().applyOptions({ rightOffset: 36, rightBarStaysOnScroll: true });
        shouldFitContentRef.current = false;
      }
    };

    applyEngineToChart();
    return subscribeMarketData(applyEngineToChart);
  }, [chartReady, rebuildGhostBars]);

  useEffect(() => {
    if (LIVE_CANDLE_CHART_DISABLED) {
      return;
    }

    if (candleSeriesRef.current && lastCandle && lastCandle.time) {
      if (!Number.isFinite(lastCandle.time) ||
          !Number.isFinite(lastCandle.open) ||
          !Number.isFinite(lastCandle.high) ||
          !Number.isFinite(lastCandle.low) ||
          !Number.isFinite(lastCandle.close)) {
        console.error("[INVALID CANDLE FOR UPDATE]", lastCandle);
        return;
      }

      // OHLC is driven by marketEngineStore subscriber; only refresh the live price line here.
      const isUp = lastCandle.close >= lastCandle.open;
      if (livePriceLineRef.current) candleSeriesRef.current.removePriceLine(livePriceLineRef.current);
      if (toggles.price) {
        livePriceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: lastCandle.close,
          color: isUp ? "#22c55e" : "#ef4444",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: false, // Hide label to remove "Last High" / "Last Low"
        });
      } else {
        livePriceLineRef.current = null;
      }
    }
  }, [lastCandle, toggles.price]);

  useEffect(() => {
    if (chartRef.current && manualPriceRange) {
      chartRef.current.priceScale("right").applyOptions({ autoScale: false });
      chartRef.current.priceScale("right").setVisibleRange(manualPriceRange);
    }
  }, [manualPriceRange]);

  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series || !lastCandle) return;
    priceLinesRef.current.forEach(line => series.removePriceLine(line));
    priceLinesRef.current = [];
    const price = lastCandle.close;
    const threshold = price * 0.15;
    const fmtK = (p: number) => p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k" : String(p);
    const formatNotional = (v: number | null | undefined) => {
      if (v == null || !Number.isFinite(v)) return null;
      const abs = Math.abs(v);
      if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
      if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
      if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
      return `$${Math.round(v)}`;
    };
    const optionsData = terminalState?.options as { callWallUsd?: number | null; putWallUsd?: number | null } | undefined;
    const callWallUsd = optionsData?.callWallUsd;
    const putWallUsd = optionsData?.putWallUsd;

    if (import.meta.env.DEV) {
      const co = terminalState?.options as {
        gammaFlip?: number | null;
        gammaFlipGlobal?: number | null;
        gammaFlipBroad?: number | null;
        gammaFlipLocal?: number | null;
        gammaFlipOperationalLegacy?: number | null;
        localFlipReason?: string | null;
      } | undefined;
      const logKey = [
        gammaOverlaySel.selectedFlipForChart,
        gammaOverlaySel.selectedFlipType,
        gammaOverlaySel.globalFlip,
        co?.gammaFlipLocal,
      ].join("|");
      if (logKey !== lastGammaOverlayLogKeyRef.current) {
        lastGammaOverlayLogKeyRef.current = logKey;
        console.debug("[GammaOverlaySelection]", {
          marketGammaFlip: market?.gammaFlip ?? null,
          optionsGammaFlip: co?.gammaFlip ?? null,
          gammaFlipGlobal: co?.gammaFlipGlobal ?? null,
          gammaFlipBroad: co?.gammaFlipBroad ?? null,
          gammaFlipLocal: co?.gammaFlipLocal ?? null,
          globalFlipResolved: gammaOverlaySel.globalFlip,
          selectedFlipForChart: gammaOverlaySel.selectedFlipForChart,
          selectedFlipType: gammaOverlaySel.selectedFlipType,
          localTransitionZoneStart: gammaOverlaySel.localZoneStart,
          localTransitionZoneEnd: gammaOverlaySel.localZoneEnd,
          legacyFlipIgnored: co?.gammaFlipOperationalLegacy ?? null,
        });
      }
    }

    const sweepDetector = positioning_engines?.liquiditySweepDetector;
    const sweepActive = sweepDetector && (sweepDetector.sweepRisk === "HIGH" || sweepDetector.sweepRisk === "EXTREME") && sweepDetector.sweepDirection !== "NONE";
    const sweepDirColor = sweepDetector?.sweepDirection === "UP" ? "34, 197, 94" : sweepDetector?.sweepDirection === "DOWN" ? "239, 68, 68" : "168, 85, 247";
    const dim = (base: number, factor: number) => sweepActive ? +(base * factor).toFixed(2) : base;

    type LevelEntry = {
      price: number;
      priority: number;
      label: string;
      shortLabel: string;
      color: string;
      style: number;
      width: number;
      axisLabel: boolean;
      isBandFill?: boolean;
      timing?: ReturnType<typeof computeLevelTiming>;
      kind?: OperationalLevelKind;
      source?: OperationalLevelSource;
    };
    const entries: LevelEntry[] = [];
    const timingCtx = buildLevelTimingContextFromState(
      price,
      { market, positioning, levels, positioning_engines, options: terminalState?.options },
      getChartTimeframeMeta(chartTimeframe).barSec,
    );

    const pushEntry = (
      p: number,
      priority: number,
      label: string,
      shortLabel: string,
      color: string,
      style = LineStyle.Solid,
      width = 1,
      isBandFill = false,
      allowOutsideThreshold = false,
      kind: OperationalLevelKind = "unknown",
      source: OperationalLevelSource = "chart-overlay",
      strength?: number,
      structural = false,
    ) => {
      const distanceFromPrice = Math.abs(p - price);
      const isWithinThreshold = allowOutsideThreshold || distanceFromPrice <= threshold;
      
      if (!isWithinThreshold) {
        console.log(`[DEBUG PUSH] DESCARTADO "${label}" @ $${p}: distance=${distanceFromPrice.toFixed(2)} > threshold=${threshold.toFixed(2)}`);
        return;
      }
      
      const timing = isBandFill
        ? undefined
        : computeLevelTiming(
            { kind, price: p, label, source, strength, structural },
            timingCtx,
          );
      const horizonTag = timing ? horizonShort(timing.horizon) : null;
      const urgencyTag = timing ? urgencyShort(timing.urgency) : null;
      const stateScale =
        timing?.state === "active" ? 1.12 : timing?.state === "invalidated" ? 0.72 : 1;
      const lineWidthScaled = Math.max(1, Math.min(5, width * stateScale));
      const axisLabel =
        !isBandFill &&
        timing?.state !== "invalidated";
      // Suppress timing suffix for Short Gamma Pocket labels to keep them clean
      const isShortGammaPocket = label.startsWith("SHORT GAMMA POCKET");
      const labelWithTiming =
        !isBandFill && timing && !isShortGammaPocket
          ? `${label} ${horizonTag} ${urgencyTag}${timingTitleSuffix(timing)}`
          : label;
      const shortWithTiming =
        !isBandFill && timing && !isShortGammaPocket ? `${shortLabel} ${horizonTag}` : shortLabel;
      const finalEntry = {
        price: p,
        priority,
        label: labelWithTiming,
        shortLabel: shortWithTiming,
        color,
        style,
        width: lineWidthScaled,
        axisLabel,
        isBandFill,
        timing,
        kind,
        source,
        strength,
        structural,
      };
      
      console.log(`[DEBUG PUSH] AGREGANDO "${label}" @ $${p}: color=${color}, width=${lineWidthScaled}, style=${style}`);
      entries.push(finalEntry);
    };

    // LOG FINAL TOTALS Y DETECCIÃ“N DE COLISIONES
    console.log(`[DEBUG FINAL] TOTAL entries procesadas: ${entries.length}`);
    
    // Detectar colisiones por precio exacto
    const priceGroups = new Map<number, any[]>();
    entries.forEach(entry => {
      if (!priceGroups.has(entry.price)) {
        priceGroups.set(entry.price, []);
      }
      priceGroups.get(entry.price)!.push(entry);
    });
    
    // Loguear colisiones detectadas
    priceGroups.forEach((entriesAtPrice, price) => {
      if (entriesAtPrice.length > 1) {
        console.log(`[DEBUG COLLISION] DETECTADA en precio $${price}:`, entriesAtPrice.map(e => `${e.label}(${e.priority})`));
      }
    });
    
    console.log(`[DEBUG FINAL] Entries por tipo:`, {
      CASCADE: entries.filter(e => e.label.includes('CASCADE') || e.label.includes('LIQ')).length,
      SQUEEZE: entries.filter(e => e.label.includes('SQ') || e.label.includes('SQUEEZE')).length,
      LEVELS: entries.filter(e => e.label.includes('BID') || e.label.includes('ASK') || e.label.includes('CALL') || e.label.includes('PUT')).length,
      GAMMA: entries.filter(e => e.label.includes('GAMMA') || e.label.includes('FLIP')).length,
      HEATMAP: entries.filter(e => e.label.includes('THIN') || e.label.includes('VACUUM')).length
    });
    
    // Loguear entradas por prioridad para ver si hay pisadas
    const priorityGroups = entries.reduce((acc, entry) => {
      if (!acc[entry.priority]) acc[entry.priority] = [];
      acc[entry.priority].push(entry);
      return acc;
    }, {} as Record<number, any[]>);
    
    console.log(`[DEBUG PRIORITY] Entries por prioridad:`, Object.keys(priorityGroups).map(p => `Priority ${p}: ${priorityGroups[p].length} entries`));

    if (activePanels.has("LEVELS")) {
      const pos = positioning as { callWall?: number; putWall?: number; activeCallWall?: number; activePutWall?: number } | undefined;
      const cw = (pos?.activeCallWall && pos.activeCallWall > 0) ? pos.activeCallWall : pos?.callWall;
      const pw = (pos?.activePutWall && pos.activePutWall > 0) ? pos.activePutWall : pos?.putWall;
      const callWallLabel = callWallUsd != null && Number.isFinite(callWallUsd)
        ? `CALL WALL (${formatNotional(callWallUsd)}) ${fmtK(cw!)}`
        : "CALL WALL";
      const putWallLabel = putWallUsd != null && Number.isFinite(putWallUsd)
        ? `PUT WALL (${formatNotional(putWallUsd)}) ${fmtK(pw!)}`
        : "PUT WALL";
      if (cw) pushEntry(cw, 1, callWallLabel, pos?.activeCallWall ? "CW (active)" : "CW", `rgba(239, 68, 68, ${dim(0.6, 0.7)})`, LineStyle.Solid, 2, false, false, "call_wall", "options", 0.88, true);
      if (pw) pushEntry(pw, 1, putWallLabel, pos?.activePutWall ? "PW (active)" : "PW", `rgba(34, 197, 94, ${dim(0.6, 0.7)})`, LineStyle.Solid, 2, false, false, "put_wall", "options", 0.88, true);
      if (levels?.gammaMagnets) {
        levels.gammaMagnets.forEach((m, i) => pushEntry(m, 3, `MAG ${fmtK(m)}`, "M", `rgba(59, 130, 246, ${dim(0.4, 0.5)})`, LineStyle.Dashed, 1, false, false, "gamma_magnet", "gamma", 0.64, true));
      }
      if (positioning?.dealerPivot) pushEntry(positioning.dealerPivot, 2, "PIVOT", "PV", `rgba(255, 255, 255, ${dim(0.3, 0.7)})`, LineStyle.Dashed, 1, false, false, "dealer_pivot", "options", 0.58, false);
    }

    if (activePanels.has("GAMMA")) {
      if (gammaOverlaySel.selectedFlipType === "local" && gammaOverlaySel.localFlip != null) {
        pushEntry(
          gammaOverlaySel.localFlip,
          1,
          "LOCAL FLIP",
          "LFL",
          `rgba(168, 250, 220, ${dim(0.88, 0.7)})`,
          LineStyle.Solid,
          2,
          false,
          false,
          "gamma_flip",
          "gamma",
          0.92,
          true,
        );
        if (gammaOverlaySel.localZoneStart && gammaOverlaySel.localZoneEnd) {
          pushEntry(
            gammaOverlaySel.localZoneStart,
            4,
            "LOCAL GAMMA ZONE (lo)",
            "LZL",
            `rgba(34, 197, 94, ${dim(0.35, 0.6)})`,
            LineStyle.Dashed,
          );
          pushEntry(
            gammaOverlaySel.localZoneEnd,
            4,
            "LOCAL GAMMA ZONE (hi)",
            "LZH",
            `rgba(34, 197, 94, ${dim(0.35, 0.6)})`,
            LineStyle.Dashed,
          );
        }
      } else if (gammaOverlaySel.selectedFlipType === "broad" && gammaOverlaySel.broadFlip != null) {
        pushEntry(
          gammaOverlaySel.broadFlip,
          1,
          "BROAD FLIP",
          "BFL",
          `rgba(250, 240, 180, ${dim(0.85, 0.7)})`,
          LineStyle.Solid,
          2,
          false,
          false,
          "gamma_flip",
          "gamma",
          0.92,
          true,
        );
        if (gammaOverlaySel.broadZoneStart && gammaOverlaySel.broadZoneEnd) {
          pushEntry(gammaOverlaySel.broadZoneStart, 4, "TR LO", "TL", `rgba(234, 179, 8, ${dim(0.25, 0.6)})`, LineStyle.Dashed);
          pushEntry(gammaOverlaySel.broadZoneEnd, 4, "TR HI", "TH", `rgba(234, 179, 8, ${dim(0.25, 0.6)})`, LineStyle.Dashed);
        }
      }
      {
        const gGlob = gammaOverlaySel.globalFlip;
        if (gGlob != null) {
          const op = gammaOverlaySel.selectedFlipForChart;
          const dup =
            op != null &&
            typeof op === "number" &&
            Math.abs(gGlob - op) / Math.max(gGlob, op, 1) < 1e-5;
          if (!dup) {
            pushEntry(
              gGlob,
              2,
              "GLOBAL FLIP",
              "GFG",
              `rgba(196, 181, 253, ${dim(0.82, 0.7)})`,
              LineStyle.Solid,
              2,
              false,
              false,
              "gamma_flip",
              "gamma",
              0.75,
              true,
            );
          }
        }
      }
      const gammaCliffs = positioning_engines?.gammaCurveEngine?.gammaCliffs;
      if (gammaCliffs && Array.isArray(gammaCliffs)) {
        const above = gammaCliffs.filter((c: any) => c.strike > price).sort((a: any, b: any) => Math.abs(b.strength) - Math.abs(a.strength)).slice(0, 3);
        const below = gammaCliffs.filter((c: any) => c.strike < price).sort((a: any, b: any) => Math.abs(b.strength) - Math.abs(a.strength)).slice(0, 3);
        const maxAbove = Math.max(...above.map((c: any) => Math.abs(c.strength)), 1);
        const maxBelow = Math.max(...below.map((c: any) => Math.abs(c.strength)), 1);
        above.forEach((cliff: { strike: number; strength: number }, i: number) => {
          const isStrongest = i === 0;
          const ratio = Math.abs(cliff.strength) / maxAbove;
          const opacity = dim(isStrongest ? 0.7 : ratio > 0.5 ? 0.45 : 0.25, 0.6);
          pushEntry(cliff.strike, isStrongest ? 3 : 4, `↑${fmtK(cliff.strike)}`, "↑", `rgba(249, 115, 22, ${opacity})`, LineStyle.Dotted, isStrongest ? 2 : 1);
        });
        below.forEach((cliff: { strike: number; strength: number }, i: number) => {
          const isStrongest = i === 0;
          const ratio = Math.abs(cliff.strength) / maxBelow;
          const opacity = dim(isStrongest ? 0.7 : ratio > 0.5 ? 0.45 : 0.25, 0.6);
          pushEntry(cliff.strike, isStrongest ? 3 : 4, `↓${fmtK(cliff.strike)}`, "↓", `rgba(56, 189, 248, ${opacity})`, LineStyle.Dotted, isStrongest ? 2 : 1);
        });
      }

      // Short Gamma Pockets
      const shortGammaPockets = terminalState?.options?.shortGammaPockets;
      if (import.meta.env.DEV) {
        console.debug("[chart-gamma-pocket-labels]", {
          status: shortGammaPockets?.status,
          count: shortGammaPockets?.pockets?.length ?? 0,
        });
      }
      if (shortGammaPockets && Array.isArray(shortGammaPockets.pockets) && shortGammaPockets.pockets.length > 0) {
        const { pockets, nearest, status: signalStatus } = shortGammaPockets;
        const resolvePocketRange = (pocket: any): { rangeLow: number; rangeHigh: number } | null => {
          const zone = pocket?.zone && typeof pocket.zone === "object" ? pocket.zone : null;
          const lowRaw =
            pocket?.rangeLow ??
            pocket?.lower ??
            pocket?.low ??
            pocket?.start ??
            zone?.lower ??
            zone?.low ??
            zone?.start;
          const highRaw =
            pocket?.rangeHigh ??
            pocket?.upper ??
            pocket?.high ??
            pocket?.end ??
            zone?.upper ??
            zone?.high ??
            zone?.end;
          const low = Number(lowRaw);
          const high = Number(highRaw);
          if (Number.isFinite(low) && Number.isFinite(high) && low > 0 && high > 0 && low !== high) {
            return { rangeLow: Math.min(low, high), rangeHigh: Math.max(low, high) };
          }
          const center = Number(pocket?.price ?? pocket?.level ?? pocket?.strike ?? pocket?.center);
          if (!Number.isFinite(center) || center <= 0) return null;
          const width = Math.max(center * 0.0015, 150);
          return { rangeLow: center - width, rangeHigh: center + width };
        };
        const strongStatuses = new Set(["ACTIVE", "NEAR", "TRIGGERED", "WARNING", "HIGH_RISK", "EXPANDING"]);
        const softStatuses = new Set(["WATCH", "IDLE", "NONE"]);
        
        // Deduplicate pockets: if overlap >60% or centers <300 USD apart, keep higher priority
        const statusPriority: Record<string, number> = {
          TRIGGERED: 7,
          HIGH_RISK: 6,
          ACTIVE: 5,
          WARNING: 4,
          NEAR: 4,
          EXPANDING: 3,
          WATCH: 2,
          IDLE: 1,
          NONE: 0,
        };
        const deduplicatedPockets: any[] = [];
        const sortedByPriority = [...pockets].sort((a: any, b: any) => {
          const aStatus = String(a?.status ?? signalStatus ?? "NONE").toUpperCase();
          const bStatus = String(b?.status ?? signalStatus ?? "NONE").toUpperCase();
          const priorityDiff = (statusPriority[bStatus] || 0) - (statusPriority[aStatus] || 0);
          if (priorityDiff !== 0) return priorityDiff;
          const scoreDiff =
            Number(b?.score ?? b?.intensity ?? b?.confidence ?? 0) -
            Number(a?.score ?? a?.intensity ?? a?.confidence ?? 0);
          if (scoreDiff !== 0) return scoreDiff;
          const aRange = resolvePocketRange(a);
          const bRange = resolvePocketRange(b);
          const aCenter = aRange ? (aRange.rangeLow + aRange.rangeHigh) / 2 : Number.POSITIVE_INFINITY;
          const bCenter = bRange ? (bRange.rangeLow + bRange.rangeHigh) / 2 : Number.POSITIVE_INFINITY;
          return Math.abs(aCenter - price) - Math.abs(bCenter - price);
        });
        
        for (const pocket of sortedByPriority) {
          if (pocket.status === "FAILED") continue;
          const range = resolvePocketRange(pocket);
          if (!range) continue;
          const center = (range.rangeLow + range.rangeHigh) / 2;
          const isDuplicate = deduplicatedPockets.some((existing: any) => {
            const existingRange = resolvePocketRange(existing);
            if (!existingRange) return false;
            const existingCenter = (existingRange.rangeLow + existingRange.rangeHigh) / 2;
            const centerDistance = Math.abs(center - existingCenter);
            const overlap = Math.min(range.rangeHigh, existingRange.rangeHigh) - Math.max(range.rangeLow, existingRange.rangeLow);
            const pocketSpan = range.rangeHigh - range.rangeLow;
            const existingSpan = existingRange.rangeHigh - existingRange.rangeLow;
            const overlapRatio = overlap / Math.max(pocketSpan, existingSpan, 1);
            return centerDistance < 300 || overlapRatio > 0.6;
          });
          if (!isDuplicate) {
            deduplicatedPockets.push(pocket);
          }
        }
        
        // Show max 2 pockets: nearest upper + nearest lower
        const pocketsToRender: any[] = [];
        const spot = price;
        
        // Separate pockets by direction relative to spot
        const upperPockets = deduplicatedPockets.filter((p: any) => {
          const range = resolvePocketRange(p);
          if (!range) return false;
          const center = (range.rangeLow + range.rangeHigh) / 2;
          return center > spot;
        }).sort((a: any, b: any) => {
          const rangeA = resolvePocketRange(a)!;
          const rangeB = resolvePocketRange(b)!;
          const centerA = (rangeA.rangeLow + rangeA.rangeHigh) / 2;
          const centerB = (rangeB.rangeLow + rangeB.rangeHigh) / 2;
          return (centerA - spot) - (centerB - spot); // Sort by distance to spot (ascending)
        });
        
        const lowerPockets = deduplicatedPockets.filter((p: any) => {
          const range = resolvePocketRange(p);
          if (!range) return false;
          const center = (range.rangeLow + range.rangeHigh) / 2;
          return center < spot;
        }).sort((a: any, b: any) => {
          const rangeA = resolvePocketRange(a)!;
          const rangeB = resolvePocketRange(b)!;
          const centerA = (rangeA.rangeLow + rangeA.rangeHigh) / 2;
          const centerB = (rangeB.rangeLow + rangeB.rangeHigh) / 2;
          return (spot - centerA) - (spot - centerB); // Sort by distance to spot (ascending)
        });
        
        // Add nearest upper pocket if exists
        if (upperPockets.length > 0) {
          pocketsToRender.push(upperPockets[0]);
        }
        
        // Add nearest lower pocket if exists
        if (lowerPockets.length > 0) {
          pocketsToRender.push(lowerPockets[0]);
        }
        
        // If we have less than 2 pockets, add nearest as fallback
        if (pocketsToRender.length === 0 && nearest) {
          pocketsToRender.push(nearest);
        } else if (pocketsToRender.length === 1 && nearest && !pocketsToRender.includes(nearest)) {
          pocketsToRender.push(nearest);
        }
        
        let renderedPocketCount = 0;
        pocketsToRender.slice(0, 4).forEach((pocket: any, index: number) => {
          const range = resolvePocketRange(pocket);
          if (!range) return;
          const { risk } = pocket;
          const { rangeLow, rangeHigh } = range;
          const status = String(pocket?.status ?? signalStatus ?? "NONE").toUpperCase();
          if (rangeLow && rangeHigh && Math.abs(rangeHigh - rangeLow) > 0) {
            const center = (rangeLow + rangeHigh) / 2;
            
            const isStrong = strongStatuses.has(status) || risk === "HIGH";
            const isSoft = softStatuses.has(status) || !isStrong;
            const displayStatus = isStrong ? status : "WATCH";
            
            const label = isStrong
              ? `SHORT GAMMA POCKET · ${displayStatus} · ${fmtK(rangeLow)}-${fmtK(rangeHigh)}`
              : `SGP WATCH · ${fmtK(rangeLow)}-${fmtK(rangeHigh)}`;
            
            // Visual hierarchy: nearest pocket more visible
            const isNearest = index === 0;
            const opacity = isStrong
              ? (isNearest ? 0.85 : 0.58)
              : (isNearest ? 0.34 : 0.22);
            const color = risk === "HIGH"
              ? `rgba(255, 100, 100, ${opacity})`
              : risk === "MEDIUM"
                ? `rgba(255, 165, 0, ${opacity})`
                : isSoft
                  ? `rgba(255, 255, 255, ${opacity})`
                  : `rgba(255, 255, 255, ${opacity})`;
            const lineWidth = isStrong && isNearest ? 2 : 1;
            const labelPriority = isStrong ? 3 : 4;
            
            pushEntry(center, labelPriority, label, "SGP", color, LineStyle.Solid, lineWidth, false, false, "short_gamma_pocket" as any, "gamma", opacity, true);
            pushEntry(rangeLow, 4, "", "", color, LineStyle.Dashed, 1, false, true, "short_gamma_pocket_band" as any, "gamma", opacity * 0.55, false);
            pushEntry(rangeHigh, 4, "", "", color, LineStyle.Dashed, 1, false, true, "short_gamma_pocket_band" as any, "gamma", opacity * 0.55, false);
            renderedPocketCount += 1;
          }
        });
        if (import.meta.env.DEV && pockets.length > 0 && renderedPocketCount === 0) {
          console.debug("[sgp-overlay] pockets received but none rendered", {
            status: signalStatus,
            count: pockets.length,
            sample: pockets[0],
          });
        }
      }
    }

    if (activePanels.has("CASCADE")) {
      console.log('[DEBUG CASCADE] Tab activo, procesando...');
      console.log('[DEBUG CASCADE] positioning_engines:', positioning_engines);
      console.log('[DEBUG CASCADE] liquidityCascadeEngine:', positioning_engines?.liquidityCascadeEngine);
      
      const cascadeEntries = renderCascadeLevels({
        price,
        threshold,
        positioning,
        market,
        levels,
        positioning_engines,
        sweepDetector,
        vacuumState: undefined
      });
      
      console.log('[DEBUG CASCADE] Entries devueltas:', cascadeEntries.length);
      cascadeEntries.forEach((entry, i) => {
        console.log(`[DEBUG CASCADE] Entry ${i}:`, {
          price: entry.price,
          label: entry.label,
          shortLabel: entry.shortLabel,
          color: entry.color,
          style: entry.style,
          width: entry.width,
          isBandFill: entry.isBandFill
        });
      });
      
      cascadeEntries.forEach(entry => {
        const distanceFromPrice = Math.abs(entry.price - price);
        const isWithinThreshold = distanceFromPrice <= threshold;
        console.log(`[DEBUG CASCADE] Entry "${entry.label}" @ $${entry.price}: distance=${distanceFromPrice.toFixed(2)}, threshold=${threshold.toFixed(2)}, within=${isWithinThreshold}`);
        
        if (!isWithinThreshold) {
          console.log(`[DEBUG CASCADE] DESCARTADO: "${entry.label}" fuera de threshold (${distanceFromPrice.toFixed(2)} > ${threshold.toFixed(2)})`);
          return;
        }
        
        // FORZAR VISIBILIDAD MÃXIMA PARA DEBUG
        pushEntry(
          entry.price,
          999, // PRIORIDAD MÃXIMA
          entry.label,
          entry.shortLabel,
          entry.color.replace(/[\d.]+\)/, '1)'), // OPACIDAD 1 (sÃ³lido)
          0, // STYLE SÃ“LIDO (LineStyle.Solid)
          3, // WIDTH MÃXIMO
          entry.isBandFill,
          true,
          "unknown",
          "chart-overlay",
          undefined,
          false
        );
      });
    }

    if (activePanels.has("SQUEEZE")) {
      console.log('[DEBUG SQUEEZE] Tab activo, procesando...');
      console.log('[DEBUG SQUEEZE] positioning_engines:', positioning_engines);
      console.log('[DEBUG SQUEEZE] squeezeProbabilityEngine:', positioning_engines?.squeezeProbabilityEngine);
      
      const squeezeEntries = renderSqueezeLevels({
        price,
        threshold,
        positioning,
        market,
        levels,
        positioning_engines,
        sweepDetector,
        vacuumState: undefined
      });
      
      console.log('[DEBUG SQUEEZE] Entries devueltas:', squeezeEntries.length);
      squeezeEntries.forEach((entry, i) => {
        console.log(`[DEBUG SQUEEZE] Entry ${i}:`, {
          price: entry.price,
          label: entry.label,
          shortLabel: entry.shortLabel,
          color: entry.color,
          style: entry.style,
          width: entry.width,
          isBandFill: entry.isBandFill
        });
      });
      
      squeezeEntries.forEach(entry => {
        const distanceFromPrice = Math.abs(entry.price - price);
        const isWithinThreshold = distanceFromPrice <= threshold;
        console.log(`[DEBUG SQUEEZE] Entry "${entry.label}" @ $${entry.price}: distance=${distanceFromPrice.toFixed(2)}, threshold=${threshold.toFixed(2)}, within=${isWithinThreshold}`);
        
        if (!isWithinThreshold) {
          console.log(`[DEBUG SQUEEZE] DESCARTADO: "${entry.label}" fuera de threshold (${distanceFromPrice.toFixed(2)} > ${threshold.toFixed(2)})`);
          return;
        }
        
        // FORZAR VISIBILIDAD MÃXIMA PARA DEBUG
        pushEntry(
          entry.price,
          999, // PRIORIDAD MÃXIMA
          entry.label,
          entry.shortLabel,
          entry.color.replace(/[\d.]+\)/, '1)'), // OPACIDAD 1 (sÃ³lido)
          0, // STYLE SÃ“LIDO (LineStyle.Solid)
          3, // WIDTH MÃXIMO
          entry.isBandFill,
          true,
          "unknown",
          "chart-overlay",
          undefined,
          false
        );
      });
    }

    const sweepZoneRange = sweepActive ? extractRangeFromText(sweepDetector.sweepTargetZone ?? sweepDetector.target) : null;
    const sweptZoneRange = sweepActive && sweepDetector?.sweptZone && sweepDetector.sweptZone !== "--" ? extractRangeFromText(sweepDetector.sweptZone) : null;
    const sweepDirArrow = sweepDetector?.sweepDirection === "UP" ? "↑" : sweepDetector?.sweepDirection === "DOWN" ? "↓" : "↔";
    const sweepType = sweepDetector?.type;
    const typeShortLabel = sweepType === "CONTINUATION" ? "CONT" : sweepType === "FAILED" ? "FAIL" : sweepType === "ABSORPTION" ? "ABS" : sweepType === "EXHAUSTION" ? "EXH" : sweepType === "SETUP_TWO_SIDED" ? "2S" : "";

    if (sweepActive && activePanels.has("SQUEEZE") && sweepZoneRange && !activePanels.has("HEATMAP")) {
      const bandStep = (sweepZoneRange.end - sweepZoneRange.start) / 6;
      for (let i = 0; i <= 6; i++) {
        const p = sweepZoneRange.start + bandStep * i;
        const isBorder = i === 0 || i === 6;
        const opacity = isBorder ? 0.3 : 0.08;
        pushEntry(p, 2, "", "", `rgba(${sweepDirColor}, ${opacity})`, LineStyle.Solid, 1, true);
      }
      const zoneLabel = typeShortLabel ? `SW ${sweepDirArrow} ${typeShortLabel}` : `SWEEP ${sweepDirArrow}`;
      pushEntry(sweepZoneRange.end, 2, zoneLabel, typeShortLabel || "SW", `rgba(${sweepDirColor}, 0.4)`, LineStyle.Solid, 1);
    }

    if (sweepActive && activePanels.has("SQUEEZE") && sweptZoneRange && !activePanels.has("HEATMAP")) {
      const bandStep = (sweptZoneRange.end - sweptZoneRange.start) / 4;
      for (let i = 0; i <= 4; i++) {
        const p = sweptZoneRange.start + bandStep * i;
        const isBorder = i === 0 || i === 4;
        pushEntry(p, 2, "", "", `rgba(251, 191, 36, ${isBorder ? 0.25 : 0.06})`, LineStyle.Dotted, 1, true);
      }
      pushEntry(sweptZoneRange.end, 2, "SWEPT", "SWEPT", "rgba(251, 191, 36, 0.5)", LineStyle.Solid, 1);
    }

    if (sweepActive && activePanels.has("SQUEEZE")) {
      const invalidationPrice = sweepDetector?.invalidation && sweepDetector.invalidation !== "--" ? extractPriceFromText(sweepDetector.invalidation) : null;
      if (invalidationPrice != null && Math.abs(invalidationPrice - price) <= threshold) {
        pushEntry(invalidationPrice, 2, "INV", "INV", `rgba(${sweepDirColor}, 0.35)`, LineStyle.Dotted, 1);
      }
    }

    if (sweepActive && activePanels.has("SQUEEZE")) {
      const knownLevels: number[] = [];
      if (positioning?.dealerPivot) knownLevels.push(positioning.dealerPivot);
      const pos = positioning as { callWall?: number; putWall?: number; activeCallWall?: number; activePutWall?: number } | undefined;
      const pw = (pos?.activePutWall && pos.activePutWall > 0) ? pos.activePutWall : pos?.putWall;
      const cw = (pos?.activeCallWall && pos.activeCallWall > 0) ? pos.activeCallWall : pos?.callWall;
      if (pw) knownLevels.push(pw);
      if (cw) knownLevels.push(cw);
      if (levels?.gammaMagnets) knownLevels.push(...levels.gammaMagnets);
      const heatmapZones = positioning_engines?.liquidityHeatmap?.liquidityHeatZones || [];
      heatmapZones.filter((z: any) => z.intensity >= 0.5).forEach((z: any) => knownLevels.push((z.priceStart + z.priceEnd) / 2));
      const triggerText = (sweepDetector.sweepTrigger ?? sweepDetector?.trigger) || "";
      const triggerPrice = extractPriceFromText(triggerText);
      let bestTrigger: number | null = null;
      if (triggerPrice) {
        let bestDist = Infinity;
        for (const lv of knownLevels) {
          const d = Math.abs(lv - triggerPrice);
          if (d < bestDist) { bestDist = d; bestTrigger = lv; }
        }
        if (bestTrigger && bestDist > price * 0.05) bestTrigger = null;
        if (!bestTrigger && Math.abs(triggerPrice - price) <= threshold) bestTrigger = triggerPrice;
      }
      if (bestTrigger) {
        pushEntry(bestTrigger, 2, "SW TRIG", "SWT", `rgba(${sweepDirColor}, 0.5)`, LineStyle.Dashed, 2);
      }
    }

    if (activePanels.has("HEATMAP") && lastCandle && rawOrderBook) {
      const receivedLevels =
        (rawOrderBook.bids?.length ?? 0) + (rawOrderBook.asks?.length ?? 0);
      const majorWalls = extractMajorWallsFromOrderBook(
        rawOrderBook.bids,
        rawOrderBook.asks,
        price,
      );
      logHeatmapMajorWallsOnly(receivedLevels, majorWalls);

      for (const wall of majorWalls) {
        const isBid = wall.side === "bid";
        const label = `${isBid ? "BID" : "ASK"} WALL ${Math.round(wall.sizeBtc)} BTC`;
        pushEntry(
          wall.price,
          0,
          label,
          isBid ? "BID" : "ASK",
          isBid ? "rgba(34, 197, 94, 0.85)" : "rgba(239, 68, 68, 0.85)",
          LineStyle.Solid,
          2,
          false,
          true,
          "oi_wall",
          "liquidity",
          wall.sizeBtc,
          true,
        );
      }
    }


    const vacuumState = positioning_engines?.liquidityHeatmap?.liquidityVacuum;

    if (vacuumState?.nearestThinLiquidityZone && (vacuumState.predictiveRisk === "HIGH" || vacuumState.predictiveRisk === "IMMINENT")) {
      const thinPrice = vacuumState.nearestThinLiquidityZone;
      if (Math.abs(thinPrice - price) <= threshold) {
        const thinDir = vacuumState.nearestThinLiquidityDirection === "UP" ? "↑" : "↓";
        const thinOpacity = vacuumState.predictiveRisk === "IMMINENT" ? 0.3 : 0.2;
        const bandHalf = price * 0.002;
        pushEntry(thinPrice - bandHalf, 5, "", "", `rgba(59, 130, 246, ${thinOpacity * 0.4})`, LineStyle.Dashed, 1, true);
        pushEntry(thinPrice, 5, `THIN LIQ ${thinDir}`, "THIN", `rgba(59, 130, 246, ${thinOpacity})`, LineStyle.Dashed, 1);
        pushEntry(thinPrice + bandHalf, 5, "", "", `rgba(59, 130, 246, ${thinOpacity * 0.4})`, LineStyle.Dashed, 1, true);
      }
    }

    if (vacuumState?.activeZones?.length > 0) {
      const maxZones = 3;
      const sortedZones = [...vacuumState.activeZones]
        .sort((a: any, b: any) => b.strength - a.strength)
        .slice(0, maxZones);
      sortedZones.forEach((zone: any) => {
        if (Math.abs(zone.priceStart - price) > threshold && Math.abs(zone.priceEnd - price) > threshold) return;
        const bandLines = 5;
        const bandStep = (zone.priceEnd - zone.priceStart) / bandLines;
        for (let i = 0; i <= bandLines; i++) {
          const p = zone.priceStart + bandStep * i;
          const isBorder = i === 0 || i === bandLines;
          const opacity = isBorder ? 0.3 : 0.15;
          pushEntry(p, 3, "", "", `rgba(59, 130, 246, ${opacity})`, LineStyle.Solid, 1, true);
        }
        const dirArrow = zone.direction === "UP" ? "↑" : "↓";
        const labelOpacity = Math.min(0.65, 0.35 + zone.strength * 0.3);
        pushEntry(zone.direction === "UP" ? zone.priceEnd : zone.priceStart, 3, `VACUUM ${dirArrow}`, "VAC", `rgba(59, 130, 246, ${labelOpacity.toFixed(2)})`, LineStyle.Solid, 1);
      });
    }

    const gammaAccelZones = positioning_engines?.liquidityHeatmap?.gammaAccelerationZones as Array<{ start: number; end: number; direction: "UP" | "DOWN"; score: number }> | undefined;
    console.log("[GammaAccel] zones payload", { count: gammaAccelZones?.length ?? 0, zones: gammaAccelZones ?? [] });
    if (showAccelZones && gammaAccelZones?.length > 0) {
      const maxAccel = 20;
      gammaAccelZones.slice(0, maxAccel).forEach((zone: { start: number; end: number; direction: "UP" | "DOWN"; score: number }) => {
        const bandLines = 5;
        const bandStep = (zone.end - zone.start) / bandLines;
        const isUp = zone.direction === "UP";
        const r = isUp ? 34 : 239;
        const g = isUp ? 197 : 68;
        const b = isUp ? 94 : 68;
        const bandOpacity = 0.28;
        const borderOpacity = 0.8;
        for (let i = 0; i <= bandLines; i++) {
          const p = zone.start + bandStep * i;
          const opacity = i === 0 || i === bandLines ? borderOpacity : bandOpacity;
          pushEntry(p, 3, "", "", `rgba(${r}, ${g}, ${b}, ${opacity})`, LineStyle.Solid, 1, true, true);
        }
        const labelOpacity = 0.9;
        pushEntry(zone.end, 3, isUp ? "ACCEL UP" : "ACCEL DOWN", isUp ? "ACC↑" : "ACC↓", `rgba(${r}, ${g}, ${b}, ${labelOpacity})`, LineStyle.Solid, 1, false, true);
      });
    }

    const absorption = (terminalState?.positioning?.absorption ?? null) as {
      status: string;
      side: string;
      zoneLow: number | null;
      zoneHigh: number | null;
      confidence?: number;
      candidateSide?: string;
      candidateZoneLow?: number | null;
      candidateZoneHigh?: number | null;
      distanceToCandidatePct?: number | null;
      testReadiness?: number;
      preAbsorptionState?: "NONE" | "CANDIDATE" | "APPROACHING" | "UNDER_TEST";
    } | null;
    if (absorption != null) {
      console.log("[ABSORPTION MainChart] terminalState.positioning.absorption", absorption.status, absorption.side);
    } else {
      console.log("[ABSORPTION MainChart] terminalState.positioning?.absorption", absorption, "terminalState=" + !!terminalState, "positioning=" + !!terminalState?.positioning);
    }
    // Active / confirmed absorption overlay
    if (
      showAbsorbZones &&
      absorption &&
      (absorption.status === "ACTIVE" || absorption.status === "CONFIRMED") &&
      absorption.zoneLow != null &&
      absorption.zoneHigh != null
    ) {
      const isSellAbsorb = absorption.side === "SELL_ABSORPTION";
      const r = isSellAbsorb ? 249 : 34;
      const g = isSellAbsorb ? 115 : 211;
      const b = isSellAbsorb ? 22 : 238;
      const bandOpacity = 0.22;
      const borderOpacity = 0.55;
      const steps = 4;
      const step = (absorption.zoneHigh - absorption.zoneLow) / steps;
      for (let i = 0; i <= steps; i++) {
        const p = absorption.zoneLow + step * i;
        const opacity = i === 0 || i === steps ? borderOpacity : bandOpacity;
        pushEntry(p, 3, "", "", `rgba(${r}, ${g}, ${b}, ${opacity})`, LineStyle.Dashed, 1, true, true);
      }
      const confStr = absorption.confidence != null ? ` ${absorption.confidence}%` : "";
      pushEntry(absorption.zoneHigh, 3, isSellAbsorb ? `SELL ABSORB${confStr}` : `BUY ABSORB${confStr}`, isSellAbsorb ? "S-ABS" : "B-ABS", `rgba(${r}, ${g}, ${b}, 0.85)`, LineStyle.Dashed, 1, false, true);
    }

    // Candidate / pre-absorption overlay (subtle)
    if (showAbsorbZones && absorption) {
      const cSide = absorption.candidateSide;
      const cLow = absorption.candidateZoneLow;
      const cHigh = absorption.candidateZoneHigh;
      const readiness = typeof absorption.testReadiness === "number" ? absorption.testReadiness : 0;
      const preState = absorption.preAbsorptionState;
      const shouldDrawCandidate =
        cSide &&
        cSide !== "NONE" &&
        cLow != null &&
        cHigh != null &&
        readiness >= 40 &&
        (preState === "APPROACHING" || preState === "UNDER_TEST");

      if (shouldDrawCandidate) {
        const isSellCand = cSide === "SELL_ABSORPTION";
        const r = isSellCand ? 249 : 34;
        const g = isSellCand ? 115 : 211;
        const b = isSellCand ? 22 : 238;
        const bandOpacity = 0.08;
        const borderOpacity = 0.35;
        const steps = 3;
        const step = (cHigh - cLow) / steps;
        for (let i = 0; i <= steps; i++) {
          const p = cLow + step * i;
          const opacity = i === 0 || i === steps ? borderOpacity : bandOpacity;
          pushEntry(p, 2, "", "", `rgba(${r}, ${g}, ${b}, ${opacity})`, LineStyle.Dashed, 1, true, true);
        }
        const label = `ABSORB CAND ${Math.round(readiness)}%`;
        pushEntry(
          cHigh,
          2,
          label,
          "A-C",
          `rgba(${r}, ${g}, ${b}, 0.55)`,
          LineStyle.Dashed,
          1,
          false,
          true
        );
      }
    }

    // Gravity Map overlay
    const gravityMap = terminalState?.gravityMap;
    if (showGravityZones && gravityMap?.status === "ACTIVE") {
      if (gravityMap.primaryMagnet) {
        pushEntry(gravityMap.primaryMagnet.price, 2, `MAG1 ${fmtK(gravityMap.primaryMagnet.price)}`, "M1", "rgba(139, 92, 246, 0.75)", LineStyle.Solid, 2, false, true);
      }
      if (gravityMap.secondaryMagnet) {
        pushEntry(gravityMap.secondaryMagnet.price, 3, `MAG2 ${fmtK(gravityMap.secondaryMagnet.price)}`, "M2", "rgba(139, 92, 246, 0.5)", LineStyle.Dashed, 1, false, true);
      }
      for (const z of gravityMap.repulsionZones?.slice(0, 3) ?? []) {
        pushEntry(z.price, 3, `REP ${fmtK(z.price)}`, "R", "rgba(239, 68, 68, 0.5)", LineStyle.Dotted, 1, false, true);
      }
      for (const z of gravityMap.accelerationZones?.slice(0, 2) ?? []) {
        const mid = (z.zoneLow + z.zoneHigh) / 2;
        pushEntry(mid, 4, `ACC ${z.directionBias}`, "A", z.directionBias === "UP" ? "rgba(34, 197, 94, 0.4)" : "rgba(239, 68, 68, 0.4)", LineStyle.Dotted, 1, false, true);
      }
    }

    // OI labels (top-N strikes with USD notional)
    const optionsCtx = terminalState?.options;
    const topOiCount = 5;
    if (showGravityZones && optionsCtx?.strikes?.length && price > 0) {
      const fmtNotional = (v: number) => {
        if (!Number.isFinite(v)) return "";
        const abs = Math.abs(v);
        if (abs >= 1e9) return `$${(v / 1e9).toFixed(1)}B`;
        if (abs >= 1e6) return `$${(v / 1e6).toFixed(1)}M`;
        if (abs >= 1e3) return `$${(v / 1e3).toFixed(1)}K`;
        return `$${Math.round(v)}`;
      };
      const withUsd = optionsCtx.strikes
        .filter((s: any) => Math.abs((s.strike ?? 0) - price) <= threshold && (s.oiUsd ?? (s.totalOiContracts ?? 0) * price) > 0)
        .map((s: any) => ({ strike: s.strike, oiUsd: s.oiUsd ?? (s.totalOiContracts ?? 0) * price }))
        .sort((a: any, b: any) => (b.oiUsd ?? 0) - (a.oiUsd ?? 0))
        .slice(0, topOiCount);
      for (const s of withUsd) {
        pushEntry(s.strike, 4, `${fmtK(s.strike)} Â· ${fmtNotional(s.oiUsd)}`, fmtNotional(s.oiUsd), "rgba(148, 163, 184, 0.5)", LineStyle.Dotted, 1, false, true);
      }
    }

    const labeledEntries = entries.filter(e => !e.isBandFill && e.label);
    labeledEntries.sort((a, b) => a.price - b.price);
    const minGap = price * 0.004;
    const usedSlots: { price: number; priority: number }[] = [];

    for (const entry of labeledEntries) {
      const collision = usedSlots.find(s => Math.abs(s.price - entry.price) < minGap);
      if (collision) {
        if (entry.priority > collision.priority) {
          entry.axisLabel = false;
          entry.label = entry.shortLabel;
        } else if (entry.priority < collision.priority) {
          const orig = labeledEntries.find(e => e.price === collision.price && e.axisLabel);
          if (orig) { orig.axisLabel = false; orig.label = orig.shortLabel; }
          collision.priority = entry.priority;
          collision.price = entry.price;
        }
      } else {
        usedSlots.push({ price: entry.price, priority: entry.priority });
      }
    }

    for (const entry of entries) {
      const line = series.createPriceLine({
        price: entry.price,
        color: entry.color,
        lineWidth: entry.width as any,
        lineStyle: entry.style,
        axisLabelVisible: entry.axisLabel,
        title: entry.label
      });
      if (line) priceLinesRef.current.push(line);
    }
  }, [market, positioning, levels, lastCandle, activePanels, positioning_engines, rawOrderBook, showAccelZones, showAbsorbZones, showGravityZones, terminalState?.gravityMap, terminalState?.options, chartTimeframe, gammaOverlaySel]);

  const probeInstitutionalOverlay = useCallback(
    (ctx: ChartMenuContext): ChartMenuContext => {
      if (ctx.kind !== "empty" || ctx.price == null) return ctx;
      const price = ctx.price;
      const flip = gammaOverlaySel.selectedFlipForChart;
      if (activePanels.has("GAMMA") && typeof flip === "number" && price > 0) {
        const rel = Math.abs(price - flip) / price;
        if (rel < 0.004) return { kind: "overlay", overlayKind: "gamma" };
      }
      return ctx;
    },
    [gammaOverlaySel.selectedFlipForChart, activePanels]
  );

  const resolveFallbackMenuContext = useCallback((clientX: number, clientY: number): ChartMenuContext => {
    const el = chartContainerRef.current;
    if (!el) return { kind: "empty", price: null, time: null };
    const rect = el.getBoundingClientRect();
    const x = clientX - rect.left;
    const y = clientY - rect.top;
    const series = candleSeriesRef.current;
    const chart = chartRef.current;
    let price: number | null = null;
    let time: number | null = null;
    try {
      const py = series?.coordinateToPrice(y);
      price = typeof py === "number" ? py : null;
    } catch {
      price = null;
    }
    try {
      const t = chart?.timeScale().coordinateToTime(x);
      time = typeof t === "number" ? t : null;
    } catch {
      time = null;
    }
    return { kind: "empty", price, time };
  }, []);

  const handleChartContextMenu = useCallback(
    (e: React.MouseEvent) => {
      const s = getChartSettings();
      if (!s.interaction.rightClickEnabled) return;
      e.preventDefault();
      e.stopPropagation();
      let ctx: ChartMenuContext = drawingsLayerRef.current
        ? drawingsLayerRef.current.resolveContextMenu(e.clientX, e.clientY)
        : resolveFallbackMenuContext(e.clientX, e.clientY);
      if (ctx.kind === "empty" && ctx.price == null && ctx.time == null) {
        ctx = resolveFallbackMenuContext(e.clientX, e.clientY);
      }
      ctx = probeInstitutionalOverlay(ctx);
      chartContextMenu.openMenu(e.clientX, e.clientY, ctx);
    },
    [chartContextMenu, probeInstitutionalOverlay, resolveFallbackMenuContext]
  );

  useEffect(() => {
    const container = chartContainerRef.current;
    if (!container || !chartReady) return;

    const syncChartPointerTargets = () => {
      container.querySelectorAll("canvas, .tv-lightweight-charts, table").forEach((node) => {
        if (node instanceof HTMLElement) node.style.pointerEvents = "auto";
      });
    };

    syncChartPointerTargets();
    const observer = new MutationObserver(syncChartPointerTargets);
    observer.observe(container, { childList: true, subtree: true });

    const onNativeContextMenu = (e: MouseEvent) => {
      if (!container.contains(e.target as Node)) return;
      handleChartContextMenu({
        preventDefault: () => e.preventDefault(),
        stopPropagation: () => e.stopPropagation(),
        clientX: e.clientX,
        clientY: e.clientY,
      } as React.MouseEvent);
    };

    container.addEventListener("contextmenu", onNativeContextMenu, true);

    return () => {
      observer.disconnect();
      container.removeEventListener("contextmenu", onNativeContextMenu, true);
    };
  }, [chartReady, handleChartContextMenu]);

  const hideOverlayKind = useCallback(
    (kind: ChartMenuOverlayKind) => {
      const o = getChartSettings().overlays;
      switch (kind) {
        case "gamma":
          setChartSettings({ overlays: { ...o, showGamma: false } });
          break;
        case "heatmap":
          setChartSettings({ overlays: { ...o, showHeatmap: false } });
          break;
        case "liquidity":
          setChartSettings({ overlays: { ...o, showLiquidity: false } });
          break;
        case "sweep":
          setChartSettings({ overlays: { ...o, showSweeps: false } });
          break;
        case "absorption":
          setChartSettings({ overlays: { ...o, showAbsorptions: false } });
          break;
        case "magnet":
          setChartSettings({ overlays: { ...o, showMagnets: false } });
          break;
        default:
          break;
      }
    },
    []
  );

  const handleChartMenuAction = useCallback(
    (action: ChartContextMenuAction) => {
      const layer = drawingsLayerRef.current;
      switch (action.type) {
        case "reset_view":
          resetScale();
          break;
        case "copy_price":
          void navigator.clipboard?.writeText(String(action.price));
          break;
        case "add_alert":
          console.info("[Chart] AÃ±adir alerta (stub)", action);
          break;
        case "add_drawing":
          window.dispatchEvent(new CustomEvent("gt-set-drawing-tool", { detail: { tool: "horizontalLine" } }));
          break;
        case "lock_vertical_time": {
          const cs = getChartSettings();
          setChartSettings({
            interaction: { ...cs.interaction, lockCrosshairByTime: !cs.interaction.lockCrosshairByTime },
          });
          break;
        }
        case "toggle_overlays": {
          const anyOn =
            chartSettings.overlays.showLiquidity ||
            chartSettings.overlays.showGamma ||
            chartSettings.overlays.showHeatmap ||
            chartSettings.overlays.showSweeps ||
            chartSettings.overlays.showAbsorptions ||
            chartSettings.overlays.showMagnets;
          setChartSettings({
            overlays: {
              ...chartSettings.overlays,
              showLiquidity: !anyOn,
              showGamma: false,
              showHeatmap: false,
              showSweeps: false,
              showAbsorptions: !anyOn,
              showMagnets: false,
            },
          });
          break;
        }
        case "open_settings":
          setChartSettingsOpen(true);
          break;
        case "drawing_edit_style":
          layer?.openPositionEditor(action.drawingId);
          break;
        case "drawing_duplicate":
          layer?.duplicateDrawing(action.drawingId);
          break;
        case "drawing_lock":
          layer?.updateDrawing(action.drawingId, { locked: action.locked });
          break;
        case "drawing_delete":
          layer?.removeDrawing(action.drawingId);
          break;
        case "overlay_details":
          console.info("[Chart] Detalle capa", action.overlayKind);
          break;
        case "overlay_highlight":
          console.info("[Chart] Resaltar capa", action.overlayKind);
          break;
        case "overlay_hide_layer":
          hideOverlayKind(action.overlayKind);
          break;
        default:
          break;
      }
    },
    [chartSettings.overlays, hideOverlayKind, resetScale]
  );

  useEffect(() => {
    const o = chartSettings.overlays;
    setActivePanels((prev) => {
      const next = new Set<MapMode>();
      if (o.showLiquidity) next.add("LEVELS");
      if (o.showGamma) next.add("GAMMA");
      if (o.showHeatmap) next.add("HEATMAP");
      if (o.showSweeps) next.add("SQUEEZE");
      if (o.showCascade) next.add("CASCADE");
      return next;
    });
    setShowAbsorbZones(o.showAbsorptions);
    setShowGravityZones(o.showMagnets);
  }, [chartSettings.overlays]);

  useEffect(() => {
    if (!chartReady || !chartRef.current || !candleSeriesRef.current) return;
    const a = chartSettings.appearance;
    const s = chartSettings.scales;
    const i = chartSettings.interaction;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const gridColor = `rgba(255,255,255,${Math.min(0.28, a.gridOpacity * 0.9)})`;
    chart.applyOptions({
      layout: {
        background: { type: ColorType.Solid, color: a.background },
        textColor: a.textColor,
      },
      grid: {
        vertLines: { visible: a.showGrid, color: gridColor },
        horzLines: { visible: a.showGrid, color: gridColor },
      },
      crosshair: {
        vertLine: { visible: i.showCrosshairVertical },
        horzLine: { visible: i.showCrosshairHorizontal },
      },
      rightPriceScale: { borderColor: "#1a1a1a", visible: s.showPriceScale },
      timeScale: { borderColor: "#1a1a1a", visible: s.showTimeScale },
    });
    chart.priceScale("right").applyOptions({ autoScale: s.autoScale });
    series.applyOptions({
      upColor: a.candleUpColor,
      downColor: a.candleDownColor,
      wickUpColor: a.candleUpColor,
      wickDownColor: a.candleDownColor,
      priceFormat: { type: "price", precision: s.pricePrecision, minMove: 10 ** -s.pricePrecision },
    });
  }, [chartSettings, chartReady]);

  const chartCoordinates = useMemo(
    () =>
      buildChartCoordinateHelpers(
        chartRef,
        candleSeriesRef,
        drawingsTimeProjectionRef,
        chartSize,
        drawingsViewportVersion
      ),
    [chartSize, drawingsViewportVersion]
  );

  const { measurement, metrics, isDragging: measurementDragging } = useChartMeasurement(
    chartContainerRef,
    chartCoordinates,
    chartCandleTimes,
    {
      viewportVersion: drawingsViewportVersion,
      timeframeKey: chartTimeframe,
      enabled: chartReady,
    }
  );

  if (baseError) {
    return (
      <TerminalPanel className="flex-1 w-full h-full border border-terminal-border flex items-center justify-center">
        <div className="text-terminal-negative font-mono text-center">
          <p className="text-lg font-bold uppercase tracking-widest">Market Data Offline</p>
          <div className="mt-4 p-4 border border-terminal-negative/20 bg-terminal-negative/5 inline-block">
            <p className="text-[10px] opacity-70 uppercase mb-4">Internal Gateway Error: {baseError.message}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 border border-terminal-negative/40 hover:bg-terminal-negative/10 text-[10px] uppercase font-bold transition-all" data-testid="button-reconnect">Reconnect Terminal</button>
          </div>
        </div>
      </TerminalPanel>
    );
  }

  const isLive =
    (!!ticker && !tickerError && (ticker.price ?? 0) > 0) ||
    (terminalState?.tickerStatus === "fresh" &&
      (terminalState?.ticker?.price ?? 0) > 0);
  const headerPrice =
    lastCandle?.close ??
    ticker?.price ??
    terminalState?.ticker?.price ??
    null;
  const headerPriceLabel =
    headerPrice != null && headerPrice > 0
      ? headerPrice.toLocaleString(undefined, { minimumFractionDigits: 2 })
      : baseLoading
        ? "—"
        : "—";
  const liveSourceLabel =
    ticker?.source ?? terminalState?.ticker?.source ?? "feed";
  const layerToMode: Record<Exclude<LayerGroup, "accel" | "absorb" | "gravity">, MapMode> = { levels: "LEVELS", gamma: "GAMMA", cascade: "CASCADE", squeeze: "SQUEEZE", heatmap: "HEATMAP", footprint: "FOOTPRINT" };
  const activeLayers = {
    levels: activePanels.has("LEVELS"),
    gamma: activePanels.has("GAMMA"),
    cascade: activePanels.has("CASCADE"),
    squeeze: activePanels.has("SQUEEZE"),
    heatmap: activePanels.has("HEATMAP"),
    footprint: activePanels.has("FOOTPRINT"),
    accel: showAccelZones,
    absorb: showAbsorbZones,
    gravity: showGravityZones,
  };

  const handleLayerToggle = (layer: LayerGroup) => {
    const o = getChartSettings().overlays;
    if (layer === "accel") {
      setShowAccelZones((prev) => !prev);
      return;
    }
    if (layer === "absorb") {
      setChartSettings({ overlays: { ...o, showAbsorptions: !o.showAbsorptions } });
      return;
    }
    if (layer === "gravity") {
      setChartSettings({ overlays: { ...o, showMagnets: !o.showMagnets } });
      return;
    }
    if (layer === "levels") {
      setChartSettings({ overlays: { ...o, showLiquidity: !o.showLiquidity } });
      return;
    }
    if (layer === "gamma") {
      setChartSettings({ overlays: { ...o, showGamma: !o.showGamma } });
      return;
    }
    if (layer === "heatmap") {
      setChartSettings({ overlays: { ...o, showHeatmap: !o.showHeatmap } });
      return;
    }
    if (layer === "squeeze") {
      setChartSettings({ overlays: { ...o, showSweeps: !o.showSweeps } });
      return;
    }
    if (layer === "cascade") {
      setChartSettings({ overlays: { ...o, showCascade: !o.showCascade } });
      return;
    }
    const mode = layerToMode[layer];
    if (mode) togglePanel(mode);
  };

  const chartOptsRegime = terminalState?.options as { gammaRegimeLocal?: string | null } | undefined;
  const chartRegimeDisplay =
    gammaOverlaySel.selectedFlipType === "local" && chartOptsRegime?.gammaRegimeLocal
      ? `${chartOptsRegime.gammaRegimeLocal} LOCAL`
      : market?.gammaRegime || "NEUTRAL";
  const chartRegimeIsLong = chartRegimeDisplay.includes("LONG GAMMA");
  const chartFlipDistPct =
    gammaOverlaySel.selectedFlipForChart != null && (lastCandle?.close ?? 0) > 0
      ? (Math.abs(lastCandle.close - gammaOverlaySel.selectedFlipForChart) / lastCandle.close) * 100
      : null;

  return (
    <div className="flex-1 w-full h-full min-w-0 min-h-0 flex flex-col relative overflow-hidden">
      {!isSimpleView && (
        <LayerGroupControls
          activeLayers={activeLayers}
          onLayerToggle={handleLayerToggle}
          onFitLevels={() => { setSelectedScenario(null); fitLevels(); }}
          onResetChart={() => { setSelectedScenario(null); resetScale(); }}
          dataTestId="toggle-map-mode"
        />
      )}
      <TerminalPanel className="flex-1 w-full min-w-0 min-h-0 border border-terminal-border relative z-0 overflow-hidden" noPadding style={{ backgroundColor: market?.gammaRegime === 'LONG GAMMA' ? 'rgba(30, 58, 138, 0.03)' : 'rgba(127, 29, 29, 0.03)' }}>
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start">
            <div className="flex flex-col pointer-events-none">
              <div className="flex items-baseline flex-wrap gap-x-3 gap-y-2">
                <h2 className="text-xl font-bold font-mono text-white/90 tracking-tight">BTC/USDT</h2>
                <div className="pointer-events-auto">
                  <ChartTimeframeSelector />
                </div>
                <span className={`text-2xl font-mono font-bold ${isLive ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{headerPriceLabel}</span>
                <div className="flex items-center ml-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse", isLive ? "bg-terminal-positive" : "bg-terminal-negative")} />
                  <span className={cn("text-[9px] font-mono font-bold tracking-widest uppercase", isLive ? "text-terminal-positive" : "text-terminal-negative")}>{isLive ? `Live (${liveSourceLabel})` : baseLoading ? 'Connecting…' : 'Live Feed Offline'}</span>
                </div>
              </div>
              {!isSimpleView && (
                <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                  <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Regime</span><span className={`text-[11px] font-bold font-mono ${chartRegimeIsLong ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{chartRegimeDisplay}</span></div>
                  <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Flip Dist</span><span className="text-[11px] font-bold font-mono text-white">{chartFlipDistPct != null ? `${chartFlipDistPct.toFixed(2)}%` : "--"}</span></div>
                </div>
              )}
              {!isSimpleView && activePanels.has("GAMMA") && (
                <div className="mt-2 text-[9px] text-white/25 font-mono tracking-wide">Local / broad gamma flip and zones when available; gamma cliffs unchanged</div>
              )}
              {!isSimpleView && activePanels.has("HEATMAP") && (
                <div className="mt-2 text-[9px] text-white/25 font-mono tracking-wide">Order book liquidity zones with gamma confluence</div>
              )}
              {!isSimpleView && showAccelZones && learnMode && (
                <div className="mt-2 p-2 rounded border border-white/[0.06] bg-black/40 max-w-[280px]">
                  <div className="text-[9px] font-bold font-mono uppercase tracking-wider text-white/50 mb-1">ACCEL ZONES</div>
                  <p className="text-[9px] text-white/40 font-mono leading-snug">Areas where thin liquidity and gamma structure can amplify price movement. Breaks through these zones may lead to fast expansion.</p>
                </div>
              )}
              {!isSimpleView && showAbsorbZones && learnMode && (
                <div className="mt-2 p-2 rounded border border-white/[0.06] bg-black/40 max-w-[280px]">
                  <div className="text-[9px] font-bold font-mono uppercase tracking-wider text-white/50 mb-1">ABSORPTION</div>
                  <p className="text-[9px] text-white/40 font-mono leading-snug">Aggressive flow into resting liquidity that fails to break through. Sell absorption = buys absorbed at asks; buy absorption = sells absorbed at bids. Invalidation = clean break beyond the zone.</p>
                </div>
              )}
              {!isSimpleView && showGravityZones && learnMode && (
                <div className="mt-2 p-2 rounded border border-white/[0.06] bg-black/40 max-w-[280px]">
                  <div className="text-[9px] font-bold font-mono uppercase tracking-wider text-white/50 mb-1">GRAVITY MAP</div>
                  <p className="text-[9px] text-white/40 font-mono leading-snug">Combines open interest, gamma positioning, and nearby liquidity to estimate where price is more likely to be pulled, stalled, or rejected. OI labels show USD notional per strike.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        {!isSimpleView && activePanels.has("GAMMA") && (
          <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
            <div className="flex flex-wrap items-center gap-3 bg-black/50 border border-white/[0.06] rounded px-2.5 py-1.5 backdrop-blur-sm max-w-[min(100%,420px)]">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(168, 250, 220, 0.88)" }} />
                <span className="text-[9px] font-mono text-white/50">Local flip</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(196, 181, 253, 0.82)" }} />
                <span className="text-[9px] font-mono text-white/50">Global</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(250, 240, 180, 0.85)" }} />
                <span className="text-[9px] font-mono text-white/50">Broad flip</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(34, 197, 94, 0.45)" }} />
                <span className="text-[9px] font-mono text-white/50">Local zone</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(234, 179, 8, 0.5)" }} />
                <span className="text-[9px] font-mono text-white/50">Broad zone</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(249, 115, 22, 0.7)" }} />
                <span className="text-[9px] font-mono text-white/50">Cliff ↑</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(56, 189, 248, 0.7)" }} />
                <span className="text-[9px] font-mono text-white/50">Cliff ↓</span>
              </div>
            </div>
          </div>
        )}
        {!isSimpleView && activePanels.has("HEATMAP") && (
          <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
            <div className="flex items-center gap-3 bg-black/50 border border-white/[0.06] rounded px-2.5 py-1.5 backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(34, 197, 94, 0.6)" }} />
                <span className="text-[9px] font-mono text-white/50">Bid</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(239, 68, 68, 0.6)" }} />
                <span className="text-[9px] font-mono text-white/50">Ask</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(168, 85, 247, 0.55)" }} />
                <span className="text-[9px] font-mono text-white/50">Confluence</span>
              </div>
            </div>
          </div>
        )}
        {(() => {
          const sd = positioning_engines?.liquiditySweepDetector;
          const isActive = sd && (sd.sweepRisk === "HIGH" || sd.sweepRisk === "EXTREME") && sd.sweepDirection !== "NONE";
          if (!isActive || !activePanels.has("SQUEEZE")) return null;
          const arrowColor = sd.sweepDirection === "UP" ? "text-green-400/20" : sd.sweepDirection === "DOWN" ? "text-red-400/20" : "text-purple-400/20";
          const showUp = sd.sweepDirection === "UP" || sd.sweepDirection === "TWO_SIDED";
          const showDown = sd.sweepDirection === "DOWN" || sd.sweepDirection === "TWO_SIDED";
          return (
            <>
              {showUp && (
                <div className="absolute left-1/2 -translate-x-1/2 z-[5] pointer-events-none flex flex-col items-center gap-0.5" style={{ top: "40%" }}>
                  {[0, 1].map(i => (
                    <span key={`up-${i}`} className={cn("text-[9px] font-mono leading-none select-none", arrowColor)} style={{ opacity: 0.12 + i * 0.06 }}>â–²</span>
                  ))}
                </div>
              )}
              {showDown && (
                <div className="absolute left-1/2 -translate-x-1/2 z-[5] pointer-events-none flex flex-col items-center gap-0.5" style={{ bottom: "30%" }}>
                  {[0, 1].map(i => (
                    <span key={`dn-${i}`} className={cn("text-[9px] font-mono leading-none select-none", arrowColor)} style={{ opacity: 0.12 + i * 0.06 }}>â–¼</span>
                  ))}
                </div>
              )}
            </>
          );
        })()}
        <div className="absolute inset-0 pr-[100px] z-[5] pointer-events-none">
        <div
          ref={chartContainerRef}
          data-chart-container
          className="absolute inset-0 pointer-events-none"
          style={{ cursor: measurementDragging ? "crosshair" : undefined }}
        />
        {LIVE_CANDLE_CHART_DISABLED && <LivePriceMarker />}
        <ScenarioOverlay chart={chartRef.current} candleSeries={candleSeriesRef.current} activeScenario={activeScenario} />
        {chartReady && chartSize ? (
          <FootprintOverlay
            chartRef={chartRef}
            candleSeriesRef={candleSeriesRef}
            active={activeLayers.footprint}
            timeframe={chartTimeframe}
            symbol="BTCUSDT"
            width={chartSize.w}
            height={chartSize.h}
          />
        ) : null}
                {chartReady && chartContainerRef.current && chartSize && (() => {
          const tsWidth = chartRef.current?.timeScale().width();
          const timeScaleWidth = (tsWidth != null && tsWidth > 0) ? tsWidth : chartSize.w;
          return (
            <>
              <MeasurementOverlay
                measurement={measurement}
                metrics={metrics}
                chartWidth={timeScaleWidth}
                chartHeight={chartSize.h}
                isDragging={measurementDragging}
              />
              {candleSeriesRef.current ? (
                <>
                  {showPaperChartOverlay ? (
                    <>
                      <PaperChartLimitOrders
                        chartWidth={timeScaleWidth}
                        chartHeight={chartSize.h}
                        viewportVersion={drawingsViewportVersion}
                        coordinates={chartCoordinates}
                        candleSeries={candleSeriesRef.current}
                      />
                      <TerminalErrorBoundary
                        name="paper-chart-overlay"
                        fallbackMessage="Paper module crashed. Reload or switch broker."
                      >
                        <PaperTradeOverlay
                          chartWidth={timeScaleWidth}
                          chartHeight={chartSize.h}
                          viewportVersion={drawingsViewportVersion}
                          coordinates={chartCoordinates}
                          candleSeries={candleSeriesRef.current}
                        />
                      </TerminalErrorBoundary>
                    </>
                  ) : null}
                  {showBingXReadOnlyChartOverlay ? (
                    <TerminalErrorBoundary
                      name="bingx-chart-overlay"
                      fallbackMessage="BingX overlay crashed. Reload or switch broker."
                    >
                      <BingXReadOnlyChartOverlay
                        brokerSession={brokerSession}
                        chartWidth={timeScaleWidth}
                        chartHeight={chartSize.h}
                        viewportVersion={drawingsViewportVersion}
                        coordinates={chartCoordinates}
                        chartSymbol="BTCUSDT"
                        visible
                        candleSeries={candleSeriesRef.current}
                      />
                    </TerminalErrorBoundary>
                  ) : null}
                </>
              ) : null}
              <DrawingsLayer
                ref={drawingsLayerRef}
                chartWidth={timeScaleWidth}
                chartHeight={chartSize.h}
                symbol="BTCUSDT"
                timeframe={chartTimeframe}
                viewportVersion={drawingsViewportVersion}
                coordinates={chartCoordinates}
              />
            </>
          );
        })()}
        </div>
        {activePanels.has("HEATMAP") && (
          <HeatmapCanvas isActive />
        )}
        <ChartContextMenu
          open={chartContextMenu.open}
          x={chartContextMenu.position.x}
          y={chartContextMenu.position.y}
          context={chartContextMenu.context}
          menuRef={chartContextMenu.menuRef}
          onClose={chartContextMenu.closeMenu}
          onAction={handleChartMenuAction}
        />
        <ChartSettingsModal
          open={chartSettingsOpen}
          onClose={() => setChartSettingsOpen(false)}
        />
      </TerminalPanel>
    </div>
  );
}

function parseLevelStr(val: string): number {
  const clean = val.toLowerCase().replace(/,/g, '').trim();
  return clean.endsWith('k') ? parseFloat(clean.slice(0, -1)) * 1000 : parseFloat(clean);
}

function extractPriceFromText(text: string): number | null {
  if (!text || text === "--") return null;
  const kMatch = text.match(/(\d+\.?\d*)k/i);
  if (kMatch) return parseFloat(kMatch[1]) * 1000;
  const numMatch = text.match(/(\d{4,6}(?:\.\d+)?)/);
  if (numMatch) return parseFloat(numMatch[1]);
  return null;
}

function extractRangeFromText(text: string): { start: number; end: number } | null {
  if (!text || text === "--") return null;
  const kMatches = [...text.matchAll(/(\d+\.?\d*)k/gi)];
  if (kMatches.length >= 2) {
    return { start: parseFloat(kMatches[0][1]) * 1000, end: parseFloat(kMatches[1][1]) * 1000 };
  }
  const numMatches = [...text.matchAll(/(\d{4,6}(?:\.\d+)?)/g)];
  if (numMatches.length >= 2) {
    return { start: parseFloat(numMatches[0][1]), end: parseFloat(numMatches[1][1]) };
  }
  return null;
}
