import { useCallback, useEffect, useRef, useState } from "react";
import { ChartContextMenu, type ChartContextMenuAction } from "./chart/ChartContextMenu";
import { ChartSettingsModal } from "./chart/ChartSettingsModal";
import { useChartContextMenu } from "./chart/useChartContextMenu";
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
import { drawDebug, setChartViewportVersion } from "./drawings/debug";
import type { LayerGroup } from "./overlay/layerGroups";

/** Lightweight Charts candlestick time: integer seconds since Unix epoch */
type UTCTimestamp = number;

type MapMode = "LEVELS" | "GAMMA" | "CASCADE" | "SQUEEZE" | "HEATMAP";

// Strict time extraction - returns number | null, never objects
function extractTime(value: unknown): number | null {
  // Direct number - already in seconds
  if (typeof value === 'number') {
    return Number.isFinite(value) ? value : null;
  }

  // Numeric string - parse to number
  if (typeof value === 'string') {
    const parsed = Number(value);
    return Number.isFinite(parsed) ? parsed : null;
  }

  // Date string - parse to timestamp
  if (typeof value === 'string') {
    const date = new Date(value);
    return Number.isFinite(date.getTime()) ? Math.floor(date.getTime() / 1000) : null;
  }

  // Object with known time keys
  if (value && typeof value === 'object') {
    const obj = value as Record<string, unknown>;
    
    // Try known time keys
    for (const key of ['time', 'timestamp', 'openTime', 't', 'ts']) {
      if (key in obj) {
        const timeValue = obj[key];
        if (typeof timeValue === 'number') {
          const num = Number(timeValue);
          // Convert milliseconds to seconds if needed
          if (num > 1e10) { // If timestamp looks like milliseconds
            return Math.floor(num / 1000);
          }
          return Number.isFinite(num) ? num : null;
        }
        if (typeof timeValue === 'string') {
          const parsed = Number(timeValue);
          return Number.isFinite(parsed) ? parsed : null;
        }
      }
    }
  }

  return null;
}

// Strict candle normalization - returns clean candle or null
function normalizeCandle(input: unknown): { time: number; open: number; high: number; low: number; close: number; volume?: number } | null {
  if (!input || typeof input !== 'object') {
    return null;
  }

  const obj = input as Record<string, unknown>;
  
  // Extract and validate time first
  const time = extractTime(obj.time || obj.timestamp || obj.openTime || obj.t || obj.ts);
  if (time === null) {
    return null;
  }

  // Extract and validate OHLC
  const open = typeof obj.open === 'number' ? obj.open : 
                 typeof obj.open === 'string' ? Number(obj.open) : null;
  const high = typeof obj.high === 'number' ? obj.high : 
                 typeof obj.high === 'string' ? Number(obj.high) : null;
  const low = typeof obj.low === 'number' ? obj.low : 
                typeof obj.low === 'string' ? Number(obj.low) : null;
  const close = typeof obj.close === 'number' ? obj.close : 
                 typeof obj.close === 'string' ? Number(obj.close) : null;
  const volume = obj.volume !== undefined ? (typeof obj.volume === 'number' ? obj.volume : 
                                                     typeof obj.volume === 'string' ? Number(obj.volume) : 0) : 0;

  // Reject if any OHLC is invalid
  if (open === null || high === null || low === null || close === null || !Number.isFinite(open) || 
   !Number.isFinite(high) || !Number.isFinite(low) || !Number.isFinite(close)) {
    return null;
  }

  return {
    time,
    open,
    high,
    low,
    close,
    volume
  };
}

export function MainChart({ activeScenario, onActiveScenarioChange }: { 
  activeScenario: "BASE" | "ALT" | "VOL";
  onActiveScenarioChange: (scenario: "BASE" | "ALT" | "VOL") => void;
}) {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const drawingsLayerRef = useRef<DrawingsLayerHandle | null>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const ghostSeriesRef = useRef<ISeriesApi<"Line"> | null>(null);
  const ghostBarsCountRef = useRef(0);
  const priceLinesRef = useRef<any[]>([]);
  const livePriceLineRef = useRef<any>(null);

  const SAFE_CHART_MODE = true;
  console.log("[SAFE CHART MODE ACTIVATED] - Live candle updates disabled, chart stabilized for tomorrow stream");

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [chartReady, setChartReady] = useState(false);
  const [chartSize, setChartSize] = useState<{ w: number; h: number } | null>(null);
  const [drawingsViewportVersion, setDrawingsViewportVersion] = useState(0);
  const drawingsInteractionActiveRef = useRef(false);
  const drawingsInteractionRafRef = useRef<number | null>(null);
  const drawingsWheelStopTimeoutRef = useRef<number | null>(null);
  const drawingsTimeProjectionRef = useRef<{
    lastTimeSec: number | null;
    barSec: number;
  }>({ lastTimeSec: null, barSec: 900 });
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
      return new Set(parsed.filter((p: string) => ["LEVELS", "GAMMA", "CASCADE", "SQUEEZE", "HEATMAP"].includes(p)));
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
        maxLevels: 500           // Store max 500 levels per side
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

  const { data: history, error: historyError, isLoading: historyLoading } = useQuery({
    queryKey: ["btc-history"],
    queryFn: async () => {
      const url = "/api/market/candles?symbol=BTCUSDT&interval=15m&limit=500";
      console.log("[CANDLES FETCH] URL:", url);
      const res = await fetch(url);
      if (!res.ok) throw new Error("Failed to fetch history");
      const rawCandles = await res.json();
      const isArray = Array.isArray(rawCandles);
      console.log("[CANDLES FETCH] Response: isArray=" + isArray + ", rawCount=" + (isArray ? rawCandles.length : "N/A"), isArray && rawCandles[0] ? "firstCandleSample=" + JSON.stringify(rawCandles[0]) : "");

      if (!isArray) {
        console.error("[CANDLES FETCH] Expected array, got:", typeof rawCandles, rawCandles);
        return [];
      }

      // Normalize candles with strict validation
      const normalizedCandles = rawCandles
        .map((candle: unknown) => normalizeCandle(candle))
        .filter((candle): candle is NonNullable<typeof candle> => candle !== null);

      console.log("[CANDLES FETCH] After normalize: normalizedCount=" + normalizedCandles.length + (normalizedCandles[0] ? ", firstNormalized=" + JSON.stringify(normalizedCandles[0]) : ""));

      if (normalizedCandles.length !== rawCandles.length) {
        console.error("[CANDLE NORMALIZATION REJECTIONS]", {
          totalRaw: rawCandles.length,
          validNormalized: normalizedCandles.length,
          rejected: rawCandles.length - normalizedCandles.length
        });
      }

      return normalizedCandles;
    },
    refetchInterval: 60000
  });

  const { data: ticker, error: tickerError } = useQuery({
    queryKey: ["btc-ticker"],
    queryFn: async () => {
      const res = await fetch("/api/market/ticker?symbol=BTCUSDT");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || "Ticker fetch failed");
      }
      return res.json();
    },
    refetchInterval: 2000,
    enabled: !historyLoading && !!history
  });

  useEffect(() => {
    if (ticker && history && history.length > 0) {
      const tickerTime = Math.floor(ticker.timestamp / (15 * 60 * 1000)) * (15 * 60);
      setLastCandle((prev: unknown) => {
        // Normalize previous candle
        const prevNormalized = prev ? normalizeCandle(prev) : null;
        
        if (prevNormalized && prevNormalized.time === tickerTime) {
          // Update existing candle with explicit field mapping
          const updatedCandle = {
            time: prevNormalized.time,
            open: prevNormalized.open,
            close: ticker.price,
            high: Math.max(prevNormalized.high, ticker.price),
            low: Math.min(prevNormalized.low, ticker.price),
            volume: prevNormalized.volume
          };
          
          const normalizedUpdated = normalizeCandle(updatedCandle);
          return normalizedUpdated;
        }
        
        // Create new candle
        const newCandle = {
          time: tickerTime / 1000, // Convert to seconds for Lightweight Charts
          open: ticker.price,
          high: ticker.price,
          low: ticker.price,
          close: ticker.price,
          volume: 0
        };
        
        const normalizedNew = normalizeCandle(newCandle);
        return normalizedNew;
      });
    }
  }, [ticker, history]);

  const { data: positioning } = useQuery<OptionsPositioning>({ queryKey: ["/api/options-positioning"], refetchInterval: 5000 });
  const { data: market } = useQuery<MarketState>({ queryKey: ["/api/market-state"], refetchInterval: 5000 });
  const { data: levels } = useQuery<KeyLevels>({ queryKey: ["/api/key-levels"], refetchInterval: 5000 });

  // Raw order book data for Bookmap tracker
  const { data: rawOrderBook } = useQuery({
    queryKey: ["orderbook-raw"],
    queryFn: async () => {
      const res = await fetch("/api/orderbook/raw");
      if (!res.ok) {
        throw new Error("Failed to fetch raw order book");
      }
      return res.json() as Promise<{
        bids: [string, string][];
        asks: [string, string][];
        timestamp: number;
      }>;
    },
    refetchInterval: 1000, // Update every second for real-time tracking
    enabled: activePanels.has("HEATMAP") // Only fetch when heatmap is active
  });

  // Live price marker component for safe mode
  const LivePriceMarker = () => {
    const { data: ticker } = useQuery({
      queryKey: ["btc-ticker"],
      queryFn: async () => {
        const res = await fetch("/api/market/ticker?symbol=BTCUSDT");
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.details || "Ticker fetch failed");
        }
        return res.json();
      },
      refetchInterval: 2000,
    });

    if (!ticker || SAFE_CHART_MODE) return null;

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

    if (market?.gammaFlip) points.push(market.gammaFlip);
    if (market?.transitionZoneStart) points.push(market.transitionZoneStart);
    if (market?.transitionZoneEnd) points.push(market.transitionZoneEnd);
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

        // Ensure Lightweight Charts recalculates internal layout after size changes.
        chartRef.current.timeScale().fitContent();
        ensureFutureSpace();
      }
    };
    updateSize();

    // TradingView needs a proper reflow when container height changes (e.g., bottom dock resize).
    // ResizeObserver provides that deterministically without relying on window resize.
    const ro = new ResizeObserver(() => {
      // Coalesce rapid events into the next frame.
      requestAnimationFrame(() => updateSize());
    });
    if (chartContainerRef.current) ro.observe(chartContainerRef.current);

    window.addEventListener("resize", updateSize);
    return () => {
      ts.unsubscribeVisibleTimeRangeChange(onViewportChange);
      ts.unsubscribeVisibleLogicalRangeChange(onViewportChange);
      interactionTarget?.removeEventListener("wheel", onWheel as EventListener);
      interactionTarget?.removeEventListener("pointerdown", onPointerDown);
      window.removeEventListener("pointerup", onPointerUp);
      stopInteractionRaf();
      window.removeEventListener("resize", updateSize);
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
    if (!history?.length || !series) return;

    // Strict format for Lightweight Charts: { time: UTCTimestamp, open, high, low, close } — no volume
    const toUTCTimestamp = (t: unknown): UTCTimestamp => {
      const n = Number(t);
      if (!Number.isFinite(n)) return 0 as UTCTimestamp;
      return (n > 1e10 ? Math.floor(n / 1000) : Math.floor(n)) as UTCTimestamp;
    };
    const candlesForChart = history.map((c) => ({
      time: toUTCTimestamp(c.time),
      open: Number(c.open),
      high: Number(c.high),
      low: Number(c.low),
      close: Number(c.close),
    }));
    if (candlesForChart.length >= 2) {
      const t1 = Number(candlesForChart[candlesForChart.length - 1].time);
      const t0 = Number(candlesForChart[candlesForChart.length - 2].time);
      const barSec = Math.max(1, Math.round(t1 - t0));
      drawingsTimeProjectionRef.current = { lastTimeSec: t1, barSec };
    } else if (candlesForChart.length === 1) {
      drawingsTimeProjectionRef.current = {
        lastTimeSec: Number(candlesForChart[0].time),
        barSec: drawingsTimeProjectionRef.current.barSec,
      };
    }
    series.setData(candlesForChart);
    if (ghostSeries && candlesForChart.length >= 1) rebuildGhostBars(FUTURE_GHOST_BASE);
    if (isInitialLoad && chartRef.current) {
      chartRef.current.timeScale().fitContent();
      chartRef.current.timeScale().applyOptions({ rightOffset: 36, rightBarStaysOnScroll: true });
      setIsInitialLoad(false);
    }
    const lastHistoryCandle = history[history.length - 1];
    if (lastHistoryCandle && !lastCandle) setLastCandle(lastHistoryCandle);
  }, [history, chartReady, rebuildGhostBars]);

  useEffect(() => {
    if (SAFE_CHART_MODE) {
      // DISABLED: Live candle updates disabled in safe mode
      console.log("[LIVE CANDLE UPDATES DISABLED] - Safe chart mode active");
      return;
    }

    if (candleSeriesRef.current && lastCandle && lastCandle.time) {
      // Ensure candle is valid before chart update
      if (!Number.isFinite(lastCandle.time) || 
          !Number.isFinite(lastCandle.open) || 
          !Number.isFinite(lastCandle.high) || 
          !Number.isFinite(lastCandle.low) || 
          !Number.isFinite(lastCandle.close)) {
        console.error("[INVALID CANDLE FOR UPDATE]", lastCandle);
        return;
      }
      
      candleSeriesRef.current.update(lastCandle);
      const t = Number(lastCandle.time);
      if (Number.isFinite(t)) {
        const sec = t > 1e10 ? Math.floor(t / 1000) : Math.floor(t);
        drawingsTimeProjectionRef.current.lastTimeSec = sec;
      }
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

    const sweepDetector = positioning_engines?.liquiditySweepDetector;
    const sweepActive = sweepDetector && (sweepDetector.sweepRisk === "HIGH" || sweepDetector.sweepRisk === "EXTREME") && sweepDetector.sweepDirection !== "NONE";
    const sweepDirColor = sweepDetector?.sweepDirection === "UP" ? "34, 197, 94" : sweepDetector?.sweepDirection === "DOWN" ? "239, 68, 68" : "168, 85, 247";
    const dim = (base: number, factor: number) => sweepActive ? +(base * factor).toFixed(2) : base;

    type LevelEntry = { price: number; priority: number; label: string; shortLabel: string; color: string; style: number; width: number; axisLabel: boolean; isBandFill?: boolean };
    const entries: LevelEntry[] = [];

    const pushEntry = (p: number, priority: number, label: string, shortLabel: string, color: string, style = LineStyle.Solid, width = 1, isBandFill = false, allowOutsideThreshold = false) => {
      if (!allowOutsideThreshold && Math.abs(p - price) > threshold) return;
      entries.push({ price: p, priority, label, shortLabel, color, style, width, axisLabel: !isBandFill, isBandFill });
    };

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
      if (cw) pushEntry(cw, 1, callWallLabel, pos?.activeCallWall ? "CW (active)" : "CW", `rgba(239, 68, 68, ${dim(0.6, 0.7)})`, LineStyle.Solid, 2);
      if (pw) pushEntry(pw, 1, putWallLabel, pos?.activePutWall ? "PW (active)" : "PW", `rgba(34, 197, 94, ${dim(0.6, 0.7)})`, LineStyle.Solid, 2);
      if (levels?.gammaMagnets) {
        levels.gammaMagnets.forEach((m, i) => pushEntry(m, 3, `MAG ${fmtK(m)}`, "M", `rgba(59, 130, 246, ${dim(0.4, 0.5)})`, LineStyle.Dashed));
      }
      if (positioning?.dealerPivot) pushEntry(positioning.dealerPivot, 2, "PIVOT", "PV", `rgba(255, 255, 255, ${dim(0.3, 0.7)})`, LineStyle.Dashed);
    }

    if (activePanels.has("GAMMA")) {
      if (market?.gammaFlip) pushEntry(market.gammaFlip, 1, "GAMMA FLIP", "FLIP", `rgba(250, 240, 180, ${dim(0.85, 0.7)})`, LineStyle.Solid, 2);
      if (market?.transitionZoneStart && market?.transitionZoneEnd) {
        pushEntry(market.transitionZoneStart, 4, "TR LO", "TL", `rgba(234, 179, 8, ${dim(0.25, 0.6)})`, LineStyle.Dashed);
        pushEntry(market.transitionZoneEnd, 4, "TR HI", "TH", `rgba(234, 179, 8, ${dim(0.25, 0.6)})`, LineStyle.Dashed);
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
    }

    if (activePanels.has("CASCADE")) {
      const cascade = positioning_engines?.liquidityCascadeEngine;
      if (cascade) {
        const triggerPrice = extractPriceFromText(cascade.cascadeTrigger);
        if (triggerPrice) pushEntry(triggerPrice, 1, "CASCADE", "CSC", "rgba(239, 68, 68, 0.7)");
        const pocketPrices = extractRangeFromText(cascade.liquidationPocket);
        if (pocketPrices) {
          pushEntry(pocketPrices.start, 3, "LIQ LO", "LL", "rgba(239, 68, 68, 0.3)", LineStyle.Dashed);
          pushEntry(pocketPrices.end, 3, "LIQ HI", "LH", "rgba(239, 68, 68, 0.3)", LineStyle.Dashed);
        }
      }
    }

    if (activePanels.has("SQUEEZE")) {
      const squeeze = positioning_engines?.squeezeProbabilityEngine;
      if (squeeze) {
        const triggerPrice = extractPriceFromText(squeeze.squeezeTrigger);
        if (triggerPrice) pushEntry(triggerPrice, 1, "SQ TRIGGER", "SQT", "rgba(168, 85, 247, 0.7)");
        const targetPrice = extractPriceFromText(squeeze.squeezeTarget);
        if (targetPrice) pushEntry(targetPrice, 2, "SQ TARGET", "SQG", "rgba(168, 85, 247, 0.4)", LineStyle.Dashed);
      }
    }

    const sweepZoneRange = sweepActive ? extractRangeFromText(sweepDetector.sweepTargetZone ?? sweepDetector.target) : null;
    const sweptZoneRange = sweepActive && sweepDetector?.sweptZone && sweepDetector.sweptZone !== "--" ? extractRangeFromText(sweepDetector.sweptZone) : null;
    const sweepDirArrow = sweepDetector?.sweepDirection === "UP" ? "↑" : sweepDetector?.sweepDirection === "DOWN" ? "↓" : "↕";
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

    const heatmapLineWidthCap = sweepActive ? 2 : 4;

    if (activePanels.has("HEATMAP")) {
      // Bookmap-style heatmap rendering with faithful order book levels
      if (lastCandle && rawOrderBook) {
        const tracker = bookmapTrackerRef.current;
        
        // Feed tracker with exact Binance order book data (no bridge)
        tracker.updateSnapshot(
          rawOrderBook.bids,
          rawOrderBook.asks,
          rawOrderBook.timestamp
        );
        
        // Get tracker output for rendering
        const trackerOutput = tracker.getTrackerOutput();
        lastTrackerOutputRef.current = trackerOutput;
        
        if (DEBUG_ENABLED && false) { // Explicitly disabled Bookmap analysis debug logs
          console.debug('[Bookmap Heatmap] Direct Binance order book analysis:', {
            rawBidLevels: trackerOutput.rawLevels.bids.length,
            rawAskLevels: trackerOutput.rawLevels.asks.length,
            persistentBidLevels: trackerOutput.persistentLevels.bids.length,
            persistentAskLevels: trackerOutput.persistentLevels.asks.length,
            totalBidSize: trackerOutput.stats.totalBidSize.toFixed(1),
            totalAskSize: trackerOutput.stats.totalAskSize.toFixed(1),
            sampleBid: trackerOutput.rawLevels.bids[0] ? `${trackerOutput.rawLevels.bids[0].price}@${trackerOutput.rawLevels.bids[0].size}` : 'none',
            sampleAsk: trackerOutput.rawLevels.asks[0] ? `${trackerOutput.rawLevels.asks[0].price}@${trackerOutput.rawLevels.asks[0].size}` : 'none'
          });
        }
        
        // Step 2.3: Dual-layer liquidity system - Local + Structural + Global Walls
        // Priority: 1) Really large walls (main global 100+), 2) Global 80+, 3) Local near spot (5%), 4) Structural intermediate (5–12%, 15+ BTC), 5) Small clusters filtered out.
        // Structural tier ensures BID walls 5–12% below spot (e.g. 67k–66k when spot 70k) get labels instead of only “near spot” + “main far”.

        // Clustering configuration
        const clusterWidth = 10; // 10 USD price buckets
        const minClusterLiquidity = 5; // Minimum 5 BTC to show as cluster
        const maxLocalLabelsPerSide = 6; // Local levels max per side (was 4; more bids/asks near spot)
        const localLabelRangePct = 0.05; // 5% from spot for "local" (was 3%; include more structural near price)
        const structuralRangeMinPct = 0.05; // Structural tier: 5%–12% from spot (intermediate walls)
        const structuralRangeMaxPct = 0.12;
        const structuralMinSizeBtc = 15; // Min 15 BTC for structural label (below global 80)
        const maxStructuralLabelsPerSide = 3; // Structural intermediate walls per side

        // Global wall configuration
        const globalWallThreshold = 80; // Minimum 80 BTC for global wall entry
        const globalWallExitThreshold = 60; // Exit threshold for hysteresis (60 BTC)
        const maxGlobalLabelsPerSide = 5; // Show more global walls (was 4)
        const globalClusterWidth = 20; // Wider buckets for global detection

        // MAIN GLOBAL WALL configuration
        const mainGlobalWallThreshold = 100; // Minimum 100 BTC for MAIN GLOBAL WALLS
        const mainGlobalWallExitThreshold = 70; // Remove only below 70 BTC for sustained checks
        const maxMainGlobalLabelsPerSide = 3; // MAIN GLOBAL WALLS max per side (was 2; show 3rd big wall)
        
        // Wall visual hierarchy configuration
        const majorWallThreshold = 150; // TIER 1: Major walls (>= 150 BTC)
        const secondaryWallThreshold = 80; // TIER 2: Secondary walls (>= 80 BTC)
        const minWallThreshold = 30; // TIER 3: Minor walls (>= 30 BTC)
        
        // Helper function to cluster liquidity levels
        const clusterLiquidityLevels = (levels: OrderBookLevel[], width: number) => {
          if (levels.length === 0) return [];
          
          // Group levels into price buckets
          const clusters = new Map<number, {
            totalSize: number;
            largestLevel: OrderBookLevel; // Track largest level for label price
            levels: OrderBookLevel[];
            persistence: number;
            bucketAnchor: number; // Add bucket anchor for stable cache identity
          }>();
          
          levels.forEach(level => {
            // Skip zero-size levels (removed liquidity)
            if (level.size === 0) return;
            
            // Calculate cluster bucket based on price
            const bucketKey = Math.floor(level.price / width) * width;
            
            if (!clusters.has(bucketKey)) {
              clusters.set(bucketKey, {
                totalSize: 0,
                largestLevel: level,
                levels: [],
                persistence: 0,
                bucketAnchor: bucketKey // Store bucket anchor for stable identity
              });
            }
            
            const cluster = clusters.get(bucketKey)!;
            cluster.totalSize += level.size;
            cluster.levels.push(level);
            cluster.persistence = Math.max(cluster.persistence, level.persistence);
            
            // Track the largest level for label price selection
            if (level.size > cluster.largestLevel.size) {
              cluster.largestLevel = level;
            }
          });
          
          // Convert clusters to array
          const clusteredLevels = Array.from(clusters.values())
            .map(cluster => ({
              price: cluster.largestLevel.price, // Use exact price of largest level
              size: cluster.totalSize, // Total clustered liquidity
              side: cluster.largestLevel.side,
              persistence: cluster.persistence,
              originalLevels: cluster.levels,
              largestLevel: cluster.largestLevel,
              bucketAnchor: cluster.bucketAnchor // Include bucket anchor for stable cache identity
            }));
          
          // Sort by size (largest first) for label selection
          return clusteredLevels.sort((a, b) => b.size - a.size);
        };

        // Helper function to detect MAIN GLOBAL WALLS (persistent 100+ BTC walls)
        const detectMainGlobalWalls = (levels: OrderBookLevel[], side: 'BID' | 'ASK') => {
          const currentTime = Date.now();
          
          // Use separate thresholds for BID vs ASK
          const askEntryThreshold = side === 'ASK' ? 80 : 100;
          const askExitThreshold = side === 'ASK' ? 60 : 70;
          
          // Cluster full book with wider buckets for main global detection
          const globalClusters = clusterLiquidityLevels(levels, globalClusterWidth);
          
          // Filter by MAIN threshold (separate for BID/ASK) and take top walls
          const detectedMainWalls = globalClusters
            .filter(cluster => cluster.size >= askEntryThreshold)
            .slice(0, maxMainGlobalLabelsPerSide);
          
          // Update main global walls cache with stable keys
          detectedMainWalls.forEach(wall => {
            const stableKey = `${wall.side}_${wall.bucketAnchor}`;
            
            if (!mainGlobalWalls.current.has(stableKey)) {
              // New main global wall - add to persistent cache
              mainGlobalWalls.current.set(stableKey, {
                side: wall.side,
                price: wall.price,
                size: wall.size,
                label: `MAIN ${wall.side} ${wall.price.toFixed(0)} · ${wall.size.toFixed(1)} BTC`,
                detectedAt: currentTime,
                lastSeen: currentTime,
                strikes: 0 // Reset strikes for new walls
              });
            } else {
              // Existing main global wall - update tracking
              const cached = mainGlobalWalls.current.get(stableKey)!;
              cached.lastSeen = currentTime;
              
              // Strike logic: reset strikes if strong, increment if weak
              if (wall.size >= askExitThreshold) {
                cached.strikes = 0; // Reset strikes on strong detection
              } else {
                cached.strikes = (cached.strikes || 0) + 1; // Add strike on weak detection
              }
              
              // Not seen cycle tracking
              const wallAge = currentTime - wall.lastSeen;
              if (wallAge > 5000) {
                cached.strikes = (cached.strikes || 0) + 1; // Add strike if not seen for >5s
              }
            }
          });
          
          // Build final render array for main global walls
          const finalMainGlobalWallsToRender = new Map<string, any>();
          
          // Insert all CURRENT main global walls
          detectedMainWalls.forEach(wall => {
            const stableKey = `${wall.side}_${wall.bucketAnchor}`;
            finalMainGlobalWallsToRender.set(stableKey, wall);
          });
          
          // Insert CACHED main global walls only if not already present
          mainGlobalWalls.current.forEach((cachedWall, stableKey) => {
            if (cachedWall.side !== side) return;
            if (!finalMainGlobalWallsToRender.has(stableKey)) {
              finalMainGlobalWallsToRender.set(stableKey, cachedWall);
            }
          });
          
          // Return only final merged main global walls
          return Array.from(finalMainGlobalWallsToRender.values());
        };
        const detectGlobalWalls = (levels: OrderBookLevel[], side: 'BID' | 'ASK') => {
          const currentTime = Date.now();
          
          // Cluster full book with wider buckets for global detection
          const globalClusters = clusterLiquidityLevels(levels, globalClusterWidth);
          
          // Filter by strong threshold and take top walls
          const detectedWalls = globalClusters
            .filter(cluster => cluster.size >= globalWallThreshold)
            .slice(0, maxGlobalLabelsPerSide);
          
          // Update active global walls cache with stable keys
          detectedWalls.forEach(wall => {
            const stableKey = `${wall.side}_${wall.bucketAnchor}`;
            
            if (!activeGlobalWalls.current.has(stableKey)) {
              // New wall - add to cache with full TTL
              activeGlobalWalls.current.set(stableKey, {
                side: wall.side,
                price: wall.price,
                size: wall.size,
                label: `GLOBAL ${wall.side} ${wall.price.toFixed(0)} · ${wall.size.toFixed(1)} BTC`,
                lastSeen: currentTime,
                expiresAt: currentTime + GLOBAL_WALL_HOLD_DURATION
              });
            } else {
              // Existing wall - refresh TTL
              const cached = activeGlobalWalls.current.get(stableKey)!;
              cached.lastSeen = currentTime;
              cached.expiresAt = currentTime + GLOBAL_WALL_HOLD_DURATION;
            }
          });
          
          // Build FINAL render array: current detected walls + cached walls (only if not in current)
          const finalGlobalWallsToRender = new Map<string, any>();
          
          // First, insert all CURRENT detected global walls
          detectedWalls.forEach(wall => {
            const stableKey = `${wall.side}_${wall.bucketAnchor}`;
            finalGlobalWallsToRender.set(stableKey, wall);
          });
          
          // Then, insert CACHED global walls only if stableKey is NOT already present AND side matches
          activeGlobalWalls.current.forEach((cachedWall, stableKey) => {
            if (cachedWall.side !== side) return;
            if (!finalGlobalWallsToRender.has(stableKey)) {
              finalGlobalWallsToRender.set(stableKey, cachedWall);
            }
          });
          
          // Return ONLY the final merged array
          return Array.from(finalGlobalWallsToRender.values());
        };
        
        // Cluster bid and ask levels separately
        const clusteredBids = clusterLiquidityLevels(trackerOutput.persistentLevels.bids, clusterWidth);
        const clusteredAsks = clusterLiquidityLevels(trackerOutput.persistentLevels.asks, clusterWidth);
        
        // Detect global walls from full order book
        const globalBidWalls = detectGlobalWalls(trackerOutput.rawLevels.bids, 'BID');
        const globalAskWalls = detectGlobalWalls(trackerOutput.rawLevels.asks, 'ASK');
        
        // Detect MAIN GLOBAL WALLS (persistent 100+ BTC walls)
        const mainBidWalls = detectMainGlobalWalls(trackerOutput.rawLevels.bids, 'BID');
        const mainAskWalls = detectMainGlobalWalls(trackerOutput.rawLevels.asks, 'ASK');
        
        // A. Background liquidity bands from rawLevels (enhanced visibility)
        const maxBandOpacity = 0.7; // Increased max opacity for better visibility
        const minBandOpacity = 0.1; // Increased min opacity for better visibility
        
        // Render bid background bands
        trackerOutput.rawLevels.bids.forEach((level) => {
          if (Math.abs(level.price - price) > threshold) return;
          
          // Intensity based on real BTC size (logarithmic scale for better visibility)
          const sizeIntensity = Math.log10(Math.max(level.size, 0.01)) / Math.log10(100); // Normalize 0.01-100 BTC range
          const opacity = minBandOpacity + (sizeIntensity * (maxBandOpacity - minBandOpacity));
          
          pushEntry(
            level.price,
            8, // Low priority for background bands
            '', // No label for background bands
            '', 
            `rgba(34, 197, 94, ${Math.min(opacity, maxBandOpacity).toFixed(3)})`, // Green for bids
            LineStyle.Solid,
            1,
            true // isBandFill for background rendering
          );
        });
        
        // Render ask background bands  
        trackerOutput.rawLevels.asks.forEach((level) => {
          if (Math.abs(level.price - price) > threshold) return;
          
          // Intensity based on real BTC size (logarithmic scale)
          const sizeIntensity = Math.log10(Math.max(level.size, 0.01)) / Math.log10(100);
          const opacity = minBandOpacity + (sizeIntensity * (maxBandOpacity - minBandOpacity));
          
          pushEntry(
            level.price,
            8, // Low priority for background bands
            '', // No label for background bands
            '',
            `rgba(239, 68, 68, ${Math.min(opacity, maxBandOpacity).toFixed(3)})`, // Red for asks
            LineStyle.Solid,
            1,
            true // isBandFill for background rendering
          );
        });
        
        // B. LOCAL MAIN LEVELS (near current price, within 5%)
        const renderClusteredLevels = (clusters: any[], side: 'BID' | 'ASK') => {
          const labelRange = price * localLabelRangePct;
          const clustersInRange = clusters.filter(cluster =>
            Math.abs(cluster.price - price) <= labelRange
          );
          const meaningfulClusters = clustersInRange.filter(cluster => cluster.size >= 3);
          const topClusters = meaningfulClusters.slice(0, maxLocalLabelsPerSide);

          topClusters.forEach((cluster) => {
            const label = `${side} ${cluster.price.toFixed(1)} · ${cluster.size.toFixed(1)} BTC`;
            const persistenceOpacity = 0.4 + (cluster.persistence * 0.6);
            const lineWidth = cluster.size >= 20 ? 3 : cluster.size >= 10 ? 2.5 : 2;
            const baseColor = side === 'BID' ? '34, 197, 94' : '239, 68, 68';
            pushEntry(
              cluster.price,
              2,
              label,
              side,
              `rgba(${baseColor}, ${persistenceOpacity.toFixed(2)})`,
              LineStyle.Solid,
              lineWidth
            );
          });
        };

        // B2. STRUCTURAL LEVELS (5%–12% from spot, 15+ BTC; intermediate walls so bids below don’t disappear)
        const renderStructuralLevels = (clusters: any[], side: 'BID' | 'ASK') => {
          const minDist = price * structuralRangeMinPct;
          const maxDist = price * structuralRangeMaxPct;
          const inStructuralBand = clusters.filter(cluster => {
            const dist = Math.abs(cluster.price - price);
            return dist > minDist && dist <= maxDist && cluster.size >= structuralMinSizeBtc && cluster.size < globalWallThreshold;
          });
          const topStructural = inStructuralBand.slice(0, maxStructuralLabelsPerSide);

          topStructural.forEach((cluster) => {
            const label = `${side} ${cluster.price.toFixed(0)} · ${cluster.size.toFixed(1)} BTC`;
            const opacity = 0.5 + (cluster.persistence * 0.35);
            const lineWidth = cluster.size >= 30 ? 2.5 : 2;
            const baseColor = side === 'BID' ? '34, 197, 94' : '239, 68, 68';
            pushEntry(
              cluster.price,
              2,
              label,
              side,
              `rgba(${baseColor}, ${opacity.toFixed(2)})`,
              LineStyle.Solid,
              lineWidth
            );
          });
        };
        
        // C. GLOBAL MAIN WALLS (exceptional liquidity anywhere in book)
        const renderGlobalWalls = (globalWalls: any[], side: 'BID' | 'ASK') => {
          const currentTime = Date.now();
          
          globalWalls.forEach((wall) => {
            // Check if wall should still be displayed (within hold duration)
            const shouldDisplay = (currentTime - wall.lastSeen) <= GLOBAL_WALL_HOLD_DURATION;
            
            if (shouldDisplay) {
              // Visual properties - make walls stand out clearly
              const wallOpacity = 0.9; // High opacity for visibility
              const wallWidth = 4; // Thicker lines for global walls
              const wallColor = side === 'BID' ? '16, 185, 129' : '220, 38, 127'; // Distinct colors for global walls
              
              pushEntry(
                wall.price,                      // Exact price of largest level in wall
                1,                                 // High priority for global walls
                wall.label,                        // Use cached label
                side,
                `rgba(${wallColor}, ${wallOpacity})`,  // Distinct colors from local levels
                LineStyle.Solid,
                wallWidth
              );
              
              if (DEBUG_ENABLED && false) { // Disabled by default
                const holdRemaining = Math.max(0, (GLOBAL_WALL_HOLD_DURATION - (currentTime - wall.lastSeen)) / 1000);
                console.debug(`[Bookmap Global] ${wall.label} - Hold: ${holdRemaining.toFixed(1)}s - Expires: ${((wall.expiresAt - currentTime) / 1000).toFixed(1)}s`);
              }
            }
          });
        };
        
        // D. MAIN GLOBAL WALLS (persistent 100+ BTC walls) with visual hierarchy
        const renderMainGlobalWalls = (mainGlobalWalls: any[], side: 'BID' | 'ASK') => {
          mainGlobalWalls.forEach((wall) => {
            // Determine visual tier based on wall size
            let lineWidth: number;
            let opacity: number;
            let showLabel: boolean;
            
            if (wall.size >= majorWallThreshold) {
              // TIER 1: MAJOR WALLS - keep current opacity (unchanged)
              lineWidth = 3;
              opacity = 1.0;
              showLabel = true;
            } else if (wall.size >= secondaryWallThreshold) {
              // TIER 2: SECONDARY WALLS - reduced opacity
              lineWidth = 2;
              opacity = 0.7 * 0.65; // Current opacity * 0.65
              showLabel = Math.abs(wall.price - price) <= price * 0.03; // Show label if near price (<3%)
            } else if (wall.size >= minWallThreshold) {
              // TIER 3: MINOR WALLS - heavily reduced opacity
              lineWidth = 1;
              opacity = 0.35 * 0.35; // Current opacity * 0.35
              showLabel = false;
            } else {
              return; // Skip walls below minimum threshold
            }
            
            // Apply distance fade for walls farther than 6% from current price
            const distanceFromPrice = Math.abs(wall.price - price) / price;
            if (distanceFromPrice > 0.06) {
              opacity *= 0.6; // Fade distant walls
            }
            
            // EXCEPTION RULE: Always show very large walls (>=250 BTC) with labels
            if (wall.size >= 250) {
              showLabel = true; // Force label visibility for very large walls
              opacity = Math.max(opacity, 0.8); // Ensure minimum visibility
            }
            
            // Additional fade when GAMMA + HEATMAP are both active
            const gammaAndHeatmapActive = toggles.gamma && toggles.bookmap;
            if (gammaAndHeatmapActive && wall.size < majorWallThreshold) {
              if (wall.size >= secondaryWallThreshold) {
                opacity *= 0.85; // Secondary walls extra fade
              } else {
                opacity *= 0.7; // Minor walls extra fade
              }
            }
            
            const wallColor = side === 'BID' ? '59, 130, 246' : '239, 68, 68';
            
            pushEntry(
              wall.price,
              0, // Highest priority for main global walls
              showLabel ? wall.label : '', // Only show label for allowed tiers
              side,
              `rgba(${wallColor}, ${opacity})`,
              LineStyle.Solid,
              lineWidth
            );
          });
        };
        
        // Render clustered bid and ask levels (local near spot)
        renderClusteredLevels(clusteredBids, 'BID');
        renderClusteredLevels(clusteredAsks, 'ASK');
        // Render structural intermediate levels (5%–12% from spot, 15+ BTC)
        renderStructuralLevels(clusteredBids, 'BID');
        renderStructuralLevels(clusteredAsks, 'ASK');

        // Render MAIN GLOBAL WALLS (persistent 100+ BTC walls)
        renderMainGlobalWalls(mainBidWalls, 'BID');
        renderMainGlobalWalls(mainAskWalls, 'ASK');
        
        // Cleanup expired global walls
        const currentTime = Date.now();
        const expiredWalls: string[] = [];
        activeGlobalWalls.current.forEach((wall, key) => {
          if (currentTime > wall.expiresAt) {
            expiredWalls.push(key);
            activeGlobalWalls.current.delete(key);
          }
        });
        
        // Cleanup expired main global walls (strike-based removal)
        const expiredMainWalls: string[] = [];
        mainGlobalWalls.current.forEach((wall, key) => {
          const wallAge = currentTime - wall.lastSeen;
          const notSeenCycle = wallAge > 5000; // Consider not seen if > 5s
          
          // Strike-based removal logic
          const shouldRemove = (
            (wall.strikes >= 5) || // Remove after 5 consecutive weak detections
            (notSeenCycle && wall.size < mainGlobalWallExitThreshold) // Remove if not seen and weak
          );
          
          if (shouldRemove) {
            expiredMainWalls.push(key);
            mainGlobalWalls.current.delete(key);
          }
        });
        
        if (DEBUG_ENABLED && false) { // Disabled by default
          if (expiredMainWalls.length > 0) {
            console.debug(`[Bookmap Main] Cleanup: Removed ${expiredMainWalls.length} main walls (5+ strikes or not seen + weak)`);
          }
        }
      }
      
      // Feed order book data to HeatmapCanvas
      if (rawOrderBook && (window as any).heatmapCanvas && activePanels.has("HEATMAP")) {
        const heatmapCanvas = (window as any).heatmapCanvas;
        heatmapCanvas.addFrame(
          rawOrderBook.timestamp,
          rawOrderBook.bids,
          rawOrderBook.asks
        );
      }
      
      // Legacy background heatmap zones (preserved for non-Bookmap systems)
      const heatmap = positioning_engines?.liquidityHeatmap;
      if (heatmap && lastCandle) {
        console.log("[GammaAccel] liquidityHeatmap payload", {
          hasLiquidityHeatZones: !!heatmap.liquidityHeatZones,
          heatZonesCount: heatmap.liquidityHeatZones?.length ?? 0,
          hasGammaAccelerationZones: !!heatmap.gammaAccelerationZones,
          gammaAccelZonesCount: heatmap.gammaAccelerationZones?.length ?? 0,
        });
        const sampleWithGamma = (heatmap.liquidityHeatZones || []).filter((z: any) => z.gammaWeightedLiquidity != null).slice(0, 3);
        if (sampleWithGamma.length) {
          console.log("[GammaHeat] sample liquidityHeatZones with gammaWeightedLiquidity", sampleWithGamma.map((z: any) => ({ priceStart: z.priceStart, priceEnd: z.priceEnd, side: z.side, totalQuantity: z.totalQuantity, gammaWeightedLiquidity: z.gammaWeightedLiquidity })));
        }

        // Background heatmap zones (preserving existing logic)
        const confluenceSet = new Set<number>();
        const binSize = price > 50000 ? 250 : price > 10000 ? 100 : 50;
        const markConfluence = (lv: number) => { for (let p = lv - binSize; p <= lv + binSize; p += binSize) confluenceSet.add(Math.round(Math.floor(p / binSize) * binSize)); };
        const MAX_HEATMAP_LEVELS = 6;
        let heatmapLevelCount = 0;

        const allHeatZones: any[] = heatmap.liquidityHeatZones || [];
        const bidZones = allHeatZones.filter((z: any) => z.side === "BID" && z.intensity >= 0.1).sort((a: any, b: any) => b.intensity - a.intensity).slice(0, 4);
        const askZones = allHeatZones.filter((z: any) => z.side === "ASK" && z.intensity >= 0.1).sort((a: any, b: any) => b.intensity - a.intensity).slice(0, 4);

        const maxGammaWeighted = allHeatZones.reduce((m: number, z: any) => {
          const g = z.gammaWeightedLiquidity;
          return g != null && g > m ? g : m;
        }, 0);

        const nearThreshold = price * 0.005;
        const intensityToWidth = (int: number, near: boolean) => Math.min(near ? 2 : (int >= 0.7 ? 2 : 1), heatmapLineWidthCap);
        const intensityToOpacity = (int: number, near: boolean, zone?: any) => {
          const base = Math.min(0.5, 0.08 + int * 0.4);
          let raw = near ? Math.min(0.6, base + 0.1) : base;
          if (maxGammaWeighted > 0 && zone?.gammaWeightedLiquidity != null) {
            const gammaBoost = 0.5 + 0.5 * (zone.gammaWeightedLiquidity / maxGammaWeighted);
            raw = Math.min(0.85, raw * gammaBoost);
          }
          return (sweepActive && activePanels.has("SQUEEZE")) ? raw * 0.6 : raw;
        };
        const intensityToStyle = (int: number, near: boolean) => (int >= 0.5 || near) ? LineStyle.Solid : LineStyle.Dotted;

        const isInConfluence = (zone: any) => {
          const bs = price > 50000 ? 250 : price > 10000 ? 100 : 50;
          const start = Math.round(Math.floor(zone.priceStart / bs) * bs);
          const mid = Math.round(Math.floor(((zone.priceStart + zone.priceEnd) / 2) / bs) * bs);
          return confluenceSet.has(start) || confluenceSet.has(mid);
        };

        bidZones.forEach((zone: any) => {
          const mid = (zone.priceStart + zone.priceEnd) / 2;
          if (isInConfluence(zone)) return;
          const near = Math.abs(mid - price) <= nearThreshold;
          const opacity = intensityToOpacity(zone.intensity, near, zone);
          const width = intensityToWidth(zone.intensity, near);
          pushEntry(mid, 8, `BID ${fmtK(mid)}`, "B", `rgba(34, 197, 94, ${opacity.toFixed(2)})`, intensityToStyle(zone.intensity, near), width);
        });

        askZones.forEach((zone: any) => {
          const mid = (zone.priceStart + zone.priceEnd) / 2;
          if (isInConfluence(zone)) return;
          const near = Math.abs(mid - price) <= nearThreshold;
          const opacity = intensityToOpacity(zone.intensity, near, zone);
          const width = intensityToWidth(zone.intensity, near);
          pushEntry(mid, 8, `ASK ${fmtK(mid)}`, "A", `rgba(239, 68, 68, ${opacity.toFixed(2)})`, intensityToStyle(zone.intensity, near), width);
        });
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
        pushEntry(s.strike, 4, `${fmtK(s.strike)} · ${fmtNotional(s.oiUsd)}`, fmtNotional(s.oiUsd), "rgba(148, 163, 184, 0.5)", LineStyle.Dotted, 1, false, true);
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
  }, [market, positioning, levels, lastCandle, activePanels, positioning_engines, rawOrderBook, showAccelZones, showAbsorbZones, showGravityZones, terminalState?.gravityMap, terminalState?.options]);

  const probeInstitutionalOverlay = useCallback(
    (ctx: ChartMenuContext): ChartMenuContext => {
      if (ctx.kind !== "empty" || ctx.price == null) return ctx;
      const price = ctx.price;
      const flip = market?.gammaFlip;
      if (activePanels.has("GAMMA") && typeof flip === "number" && price > 0) {
        const rel = Math.abs(price - flip) / price;
        if (rel < 0.004) return { kind: "overlay", overlayKind: "gamma" };
      }
      return ctx;
    },
    [market?.gammaFlip, activePanels]
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
          console.info("[Chart] Añadir alerta (stub)", action);
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
      if (prev.has("CASCADE")) next.add("CASCADE");
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

  if (historyError) {
    return (
      <TerminalPanel className="flex-1 w-full h-full border border-terminal-border flex items-center justify-center">
        <div className="text-terminal-negative font-mono text-center">
          <p className="text-lg font-bold uppercase tracking-widest">Market Data Offline</p>
          <div className="mt-4 p-4 border border-terminal-negative/20 bg-terminal-negative/5 inline-block">
            <p className="text-[10px] opacity-70 uppercase mb-4">Internal Gateway Error: {historyError.message}</p>
            <button onClick={() => window.location.reload()} className="px-4 py-2 border border-terminal-negative/40 hover:bg-terminal-negative/10 text-[10px] uppercase font-bold transition-all" data-testid="button-reconnect">Reconnect Terminal</button>
          </div>
        </div>
      </TerminalPanel>
    );
  }

  const isLive = !!ticker && !tickerError;
  const layerToMode: Record<Exclude<LayerGroup, "accel" | "absorb" | "gravity">, MapMode> = { levels: "LEVELS", gamma: "GAMMA", cascade: "CASCADE", squeeze: "SQUEEZE", heatmap: "HEATMAP" };
  const activeLayers = {
    levels: activePanels.has("LEVELS"),
    gamma: activePanels.has("GAMMA"),
    cascade: activePanels.has("CASCADE"),
    squeeze: activePanels.has("SQUEEZE"),
    heatmap: activePanels.has("HEATMAP"),
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
    const mode = layerToMode[layer];
    if (mode) togglePanel(mode);
  };

  return (
    <div className="flex-1 w-full h-full min-w-0 min-h-0 flex flex-col relative overflow-hidden">
      <LayerGroupControls
        activeLayers={activeLayers}
        onLayerToggle={handleLayerToggle}
        onFitLevels={() => { setSelectedScenario(null); fitLevels(); }}
        onResetChart={() => { setSelectedScenario(null); resetScale(); }}
        dataTestId="toggle-map-mode"
      />
      <TerminalPanel className="flex-1 w-full min-w-0 min-h-0 border border-terminal-border relative overflow-hidden" noPadding style={{ backgroundColor: market?.gammaRegime === 'LONG GAMMA' ? 'rgba(30, 58, 138, 0.03)' : 'rgba(127, 29, 29, 0.03)' }}>
        <div className="absolute inset-0 pointer-events-none z-10">
          <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start">
            <div className="flex flex-col">
              <div className="flex items-baseline space-x-3">
                <h2 className="text-xl font-bold font-mono text-white/90 tracking-tight">BTC/USDT</h2>
                <span className={`text-2xl font-mono font-bold ${isLive ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{(lastCandle?.close || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
                <div className="flex items-center ml-2">
                  <div className={cn("w-1.5 h-1.5 rounded-full mr-1.5 animate-pulse", isLive ? "bg-terminal-positive" : "bg-terminal-negative")} />
                  <span className={cn("text-[9px] font-mono font-bold tracking-widest uppercase", isLive ? "text-terminal-positive" : "text-terminal-negative")}>{isLive ? `Live (${ticker?.source})` : 'Live Feed Offline'}</span>
                </div>
              </div>
              <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
                <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Regime</span><span className={`text-[11px] font-bold font-mono ${market?.gammaRegime === 'LONG GAMMA' ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{market?.gammaRegime || "NEUTRAL"}</span></div>
                <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Flip Dist</span><span className="text-[11px] font-bold font-mono text-white">{market?.distanceToFlip?.toFixed(2) || "0.00"}%</span></div>
              </div>
              {activePanels.has("GAMMA") && (
                <div className="mt-2 text-[9px] text-white/25 font-mono tracking-wide">Showing Flip, Transition Zone, and Key Gamma Cliffs</div>
              )}
              {activePanels.has("HEATMAP") && (
                <div className="mt-2 text-[9px] text-white/25 font-mono tracking-wide">Order book liquidity zones with gamma confluence</div>
              )}
              {showAccelZones && learnMode && (
                <div className="mt-2 p-2 rounded border border-white/[0.06] bg-black/40 max-w-[280px]">
                  <div className="text-[9px] font-bold font-mono uppercase tracking-wider text-white/50 mb-1">ACCEL ZONES</div>
                  <p className="text-[9px] text-white/40 font-mono leading-snug">Areas where thin liquidity and gamma structure can amplify price movement. Breaks through these zones may lead to fast expansion.</p>
                </div>
              )}
              {showAbsorbZones && learnMode && (
                <div className="mt-2 p-2 rounded border border-white/[0.06] bg-black/40 max-w-[280px]">
                  <div className="text-[9px] font-bold font-mono uppercase tracking-wider text-white/50 mb-1">ABSORPTION</div>
                  <p className="text-[9px] text-white/40 font-mono leading-snug">Aggressive flow into resting liquidity that fails to break through. Sell absorption = buys absorbed at asks; buy absorption = sells absorbed at bids. Invalidation = clean break beyond the zone.</p>
                </div>
              )}
              {showGravityZones && learnMode && (
                <div className="mt-2 p-2 rounded border border-white/[0.06] bg-black/40 max-w-[280px]">
                  <div className="text-[9px] font-bold font-mono uppercase tracking-wider text-white/50 mb-1">GRAVITY MAP</div>
                  <p className="text-[9px] text-white/40 font-mono leading-snug">Combines open interest, gamma positioning, and nearby liquidity to estimate where price is more likely to be pulled, stalled, or rejected. OI labels show USD notional per strike.</p>
                </div>
              )}
            </div>
          </div>
        </div>
        {activePanels.has("GAMMA") && (
          <div className="absolute bottom-3 left-3 z-10 pointer-events-none">
            <div className="flex items-center gap-3 bg-black/50 border border-white/[0.06] rounded px-2.5 py-1.5 backdrop-blur-sm">
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(250, 240, 180, 0.85)" }} />
                <span className="text-[9px] font-mono text-white/50">Flip</span>
              </div>
              <div className="flex items-center gap-1.5">
                <span className="w-3 h-[2px] rounded-full" style={{ backgroundColor: "rgba(234, 179, 8, 0.5)" }} />
                <span className="text-[9px] font-mono text-white/50">Transition</span>
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
        {activePanels.has("HEATMAP") && (
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
                    <span key={`up-${i}`} className={cn("text-[9px] font-mono leading-none select-none", arrowColor)} style={{ opacity: 0.12 + i * 0.06 }}>▲</span>
                  ))}
                </div>
              )}
              {showDown && (
                <div className="absolute left-1/2 -translate-x-1/2 z-[5] pointer-events-none flex flex-col items-center gap-0.5" style={{ bottom: "30%" }}>
                  {[0, 1].map(i => (
                    <span key={`dn-${i}`} className={cn("text-[9px] font-mono leading-none select-none", arrowColor)} style={{ opacity: 0.12 + i * 0.06 }}>▼</span>
                  ))}
                </div>
              )}
            </>
          );
        })()}
        <div
          className="absolute inset-0 pr-[100px] z-[5]"
          style={{ pointerEvents: "auto" }}
          onContextMenu={handleChartContextMenu}
        >
        <div ref={chartContainerRef} className="absolute inset-0" />
        {SAFE_CHART_MODE && <LivePriceMarker />}
        <ScenarioOverlay chart={chartRef.current} candleSeries={candleSeriesRef.current} activeScenario={activeScenario} />
        {chartReady && chartContainerRef.current && chartSize && (() => {
          const tsWidth = chartRef.current?.timeScale().width();
          const timeScaleWidth = (tsWidth != null && tsWidth > 0) ? tsWidth : chartSize.w;
          return (
          <DrawingsLayer
            ref={drawingsLayerRef}
            chartWidth={timeScaleWidth}
            chartHeight={chartSize.h}
            symbol="BTCUSDT"
            timeframe="15m"
            viewportVersion={drawingsViewportVersion}
            coordinates={{
              priceToCoordinate: (price: number) => {
                const series = candleSeriesRef.current;
                if (!series) return null;
                try {
                  const y = series.priceToCoordinate(price);
                  return typeof y === "number" ? y : null;
                } catch {
                  return null;
                }
              },
              timeToCoordinate: (time: number) => {
                const chart = chartRef.current;
                if (!chart) return null;
                try {
                  const scale = chart.timeScale();
                  const x = scale.timeToCoordinate(time as UTCTimestamp);
                  if (typeof x === "number") return x;

                  // Future-space support: map future time to logical index then to x.
                  const toLogical = (scale as any).timeToLogical as ((t: UTCTimestamp) => number | null) | undefined;
                  const logicalToCoord = (scale as any).logicalToCoordinate as ((l: number) => number | null) | undefined;
                  const anchor = drawingsTimeProjectionRef.current;
                  if (!toLogical || !logicalToCoord || anchor.lastTimeSec == null || !Number.isFinite(time)) {
                    drawDebug("PROJECT_TIME_TO_X", {
                      source: "MainChart.timeToCoordinate:null",
                      viewportVersion: drawingsViewportVersion,
                      time,
                    });
                    return null;
                  }
                  const lastLogical = toLogical(anchor.lastTimeSec as UTCTimestamp);
                  if (typeof lastLogical !== "number") return null;
                  const dtSec = time - anchor.lastTimeSec;
                  const logical = lastLogical + dtSec / anchor.barSec;
                  const projected = logicalToCoord(logical);
                  if (typeof projected !== "number") return null;
                  drawDebug("PROJECT_TIME_TO_X", {
                    source: "MainChart.timeToCoordinate:futureLogical",
                    viewportVersion: drawingsViewportVersion,
                    time,
                    projected,
                    barSec: anchor.barSec,
                  });
                  return projected;
                } catch {
                  drawDebug("PROJECT_TIME_TO_X", {
                    source: "MainChart.timeToCoordinate:error",
                    viewportVersion: drawingsViewportVersion,
                    time,
                  });
                  return null;
                }
              },
              coordinateToPrice: (y: number) => {
                const series = candleSeriesRef.current;
                if (!series) return null;
                try {
                  const price = series.coordinateToPrice(y);
                  return typeof price === "number" ? price : null;
                } catch {
                  return null;
                }
              },
              coordinateToTime: (x: number) => {
                const chart = chartRef.current;
                if (!chart) return null;
                try {
                  const scale = chart.timeScale();
                  const t = scale.coordinateToTime(x);
                  if (typeof t === "number") return t;

                  // Future-space support: if no candle at x, recover logical coordinate and project to time.
                  const toLogical = (scale as any).coordinateToLogical as ((c: number) => number | null) | undefined;
                  const timeToLogical = (scale as any).timeToLogical as ((tt: UTCTimestamp) => number | null) | undefined;
                  const anchor = drawingsTimeProjectionRef.current;
                  const visible = scale.getVisibleLogicalRange();
                  const lastLogicalFromData = anchor.lastTimeSec != null && timeToLogical
                    ? timeToLogical(anchor.lastTimeSec as UTCTimestamp)
                    : null;
                  if (!toLogical || !timeToLogical || anchor.lastTimeSec == null) {
                    drawDebug("PROJECT_X_TO_TIME", {
                      source: "MainChart.coordinateToTime:reject_missing_helpers",
                      viewportVersion: drawingsViewportVersion,
                      x,
                      coordinateToTime: t,
                      coordinateToLogical: toLogical ? toLogical(x) : null,
                      visibleLogicalTo: visible?.to ?? null,
                      lastLogicalFromData,
                      reason: !toLogical ? "coordinateToLogical missing" : !timeToLogical ? "timeToLogical missing" : "lastTimeSec missing",
                    });
                    return null;
                  }
                  let logical = toLogical(x);
                  const lastLogical = timeToLogical(anchor.lastTimeSec as UTCTimestamp);
                  if (typeof logical !== "number" && visible && chartSize?.w) {
                    // Fallback only for future input when helper returns null at right edge.
                    logical = visible.from + (x / chartSize.w) * (visible.to - visible.from);
                  }
                  if (typeof logical !== "number" || typeof lastLogical !== "number") {
                    drawDebug("PROJECT_X_TO_TIME", {
                      source: "MainChart.coordinateToTime:reject_invalid_logical",
                      viewportVersion: drawingsViewportVersion,
                      x,
                      coordinateToTime: t,
                      coordinateToLogical: toLogical(x),
                      visibleLogicalTo: visible?.to ?? null,
                      lastLogicalFromData,
                      reason: "logical or lastLogical is null",
                    });
                    return null;
                  }
                  const dtSec = (logical - lastLogical) * anchor.barSec;
                  const projected = Math.round(anchor.lastTimeSec + dtSec);
                  drawDebug("PROJECT_X_TO_TIME", {
                    source: "MainChart.coordinateToTime:futureLogical",
                    viewportVersion: drawingsViewportVersion,
                    x,
                    coordinateToTime: t,
                    coordinateToLogical: logical,
                    visibleLogicalTo: visible?.to ?? null,
                    lastLogicalFromData,
                    projected,
                    barSec: anchor.barSec,
                    accepted: true,
                  });
                  return projected;
                } catch {
                  drawDebug("PROJECT_X_TO_TIME", {
                    source: "MainChart.coordinateToTime:error",
                    viewportVersion: drawingsViewportVersion,
                    x,
                  });
                  return null;
                }
              },
              coordinateToLogical: (x: number) => {
                const chart = chartRef.current;
                if (!chart) return null;
                try {
                  const logical = (chart.timeScale() as any).coordinateToLogical?.(x);
                  return typeof logical === "number" ? logical : null;
                } catch {
                  return null;
                }
              },
              getVisibleLogicalRange: () => {
                const chart = chartRef.current;
                if (!chart) return null;
                try {
                  const r = chart.timeScale().getVisibleLogicalRange();
                  if (!r) return null;
                  return { from: r.from, to: r.to };
                } catch {
                  return null;
                }
              },
              getLastDataLogical: () => {
                const chart = chartRef.current;
                const anchor = drawingsTimeProjectionRef.current;
                if (!chart || anchor.lastTimeSec == null) return null;
                try {
                  const logical = (chart.timeScale() as any).timeToLogical?.(anchor.lastTimeSec as UTCTimestamp);
                  return typeof logical === "number" ? logical : null;
                } catch {
                  return null;
                }
              },
              getLastTimeSec: () => drawingsTimeProjectionRef.current.lastTimeSec,
              getBarSec: () => drawingsTimeProjectionRef.current.barSec,
            }}
          />
          );
        })()}
        </div>
        {activePanels.has("HEATMAP") && chartContainerRef.current && (
          <HeatmapCanvas
            isActive={activePanels.has("HEATMAP")}
            chartWidth={chartContainerRef.current.clientWidth}
            chartHeight={chartContainerRef.current.clientHeight}
            currentPrice={lastCandle?.close || 0}
            gammaContext={market != null || levels?.gammaMagnets?.length ? { gammaFlip: market?.gammaFlip ?? null, gammaMagnets: levels?.gammaMagnets ?? [] } : null}
            priceToCoordinate={(price: number) => {
              if (!chartRef.current || !chartContainerRef.current) return null;
              try {
                const chart = chartRef.current;
                const container = chartContainerRef.current;
                const priceScale = chart.priceScale("right");
                if (!priceScale) return null;
                
                // Get the visible price range
                const visibleRange = priceScale.getVisibleRange();
                if (!visibleRange) return null;
                
                const { from, to } = visibleRange;
                const priceRange = to - from;
                const containerHeight = container.clientHeight;
                
                // Calculate y coordinate (inverted because canvas y=0 is top)
                const priceRatio = (price - from) / priceRange;
                const y = containerHeight - (priceRatio * containerHeight);
                
                return y;
              } catch (error) {
                console.warn('Price to coordinate conversion failed:', error);
                return null;
              }
            }}
          />
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
