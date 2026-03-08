import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType, LineStyle, CandlestickSeries, HistogramSeries, IChartApi, ISeriesApi } from "lightweight-charts";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels, DealerExposure, TradingScenario } from "@shared/schema";
import { useTerminalState } from "@/hooks/useTerminalState";
import { SessionLiquidityManager } from "./overlay/SessionLiquidityManager";
import { cn } from "@/lib/utils";
import { useLearnMode } from "@/hooks/useLearnMode";
import { TooltipWrapper } from "./Tooltip";
import { BookmapOrderBookTracker } from "./overlay/scanners/bookmapOrderBookTracker";
import { TrackerOutput, OrderBookLevel } from "./overlay/scanners/bookmapOrderBookTypes";

type MapMode = "LEVELS" | "GAMMA" | "CASCADE" | "SQUEEZE" | "HEATMAP";

// Helper function to normalize candle time to number
function normalizeCandleTime(input: any): number {
  if (typeof input === 'number') return input;
  if (typeof input === 'string') return Number(input);

  if (input && typeof input === 'object') {
    if (typeof input.time === 'number') return input.time;
    if (typeof input.timestamp === 'number') return input.timestamp;
    if (typeof input.valueOf === 'function') {
      const v = input.valueOf();
      if (typeof v === 'number') return v;
    }
  }

  return Number(input);
}

// Helper function to normalize full candle for chart
function normalizeChartCandle(candle: any) {
  const time = normalizeCandleTime(candle.time);
  return {
    time,
    open: Number(candle.open),
    high: Number(candle.high),
    low: Number(candle.low),
    close: Number(candle.close),
  };
}

export function MainChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const livePriceLineRef = useRef<any>(null);

  const [isInitialLoad, setIsInitialLoad] = useState(true);
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

  const [toggles, setToggles] = useState({
    price: true,
  });

  const [manualPriceRange, setManualPriceRange] = useState<{from: number, to: number} | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<TradingScenario | null>(null);
  const scenarioLevelsRef = useRef<any[]>([]);

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

  const { data: history, error: historyError, isLoading: historyLoading } = useQuery({
    queryKey: ["btc-history"],
    queryFn: async () => {
      const res = await fetch("/api/market/candles?symbol=BTCUSDT&interval=15m&limit=500");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || "History fetch failed");
      }
      return res.json();
    },
    retry: 1,
    refetchOnWindowFocus: false,
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
      setLastCandle((prev: any) => {
        if (prev && Number(prev.time) === tickerTime) {
          return {
            ...prev,
            close: ticker.price,
            high: Math.max(prev.high, ticker.price),
            low: Math.min(prev.low, ticker.price)
          };
        }
        return {
          time: tickerTime / 1000, // Convert to seconds for Lightweight Charts
          open: ticker.price,
          high: ticker.price,
          low: ticker.price,
          close: ticker.price,
          volume: 0
        };
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

  const resetScale = () => {
    if (!chartRef.current) return;
    setManualPriceRange(null);
    chartRef.current.priceScale("right").applyOptions({ autoScale: true });
    chartRef.current.timeScale().fitContent();
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
    if (positioning?.callWall) points.push(positioning.callWall);
    if (positioning?.putWall) points.push(positioning.putWall);
    if (positioning?.dealerPivot) points.push(positioning.dealerPivot);
    if (levels?.gammaMagnets) points.push(...levels.gammaMagnets);
    if (levels?.shortGammaPocketStart) points.push(levels.shortGammaPocketStart);
    if (levels?.shortGammaPocketEnd) points.push(levels.shortGammaPocketEnd);
    if (levels?.deepRiskPocketStart) points.push(levels.deepRiskPocketStart);
    if (levels?.deepRiskPocketEnd) points.push(levels.deepRiskPocketEnd);

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
    const chart = createChart(chartContainerRef.current, {
      layout: { background: { type: ColorType.Solid, color: "#000000" }, textColor: "#ffffff", fontSize: 12, fontFamily: "JetBrains Mono, monospace" },
      grid: { vertLines: { color: "#0a0a0a" }, horzLines: { color: "#0a0a0a" } },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: { borderColor: "#1a1a1a", timeVisible: true, barSpacing: 12, rightOffset: 15 },
      rightPriceScale: { borderColor: "#1a1a1a", scaleMargins: { top: 0.2, bottom: 0.25 }, minimumWidth: 100 },
      crosshair: { mode: 0 },
    });
    const candleSeries = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444", priceLineVisible: false });
    const volumeSeries = chart.addSeries(HistogramSeries, { color: 'rgba(38, 166, 154, 0.2)', priceFormat: { type: 'volume' }, priceScaleId: '' });
    volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });
    
    chartRef.current = chart; 
    candleSeriesRef.current = candleSeries; 
    volumeSeriesRef.current = volumeSeries;

    const handleResize = () => {
      if (chartContainerRef.current && chartRef.current) {
        chartRef.current.applyOptions({ 
          width: chartContainerRef.current.clientWidth, 
          height: chartContainerRef.current.clientHeight 
        });
      }
    };
    window.addEventListener("resize", handleResize);
    return () => {
      window.removeEventListener("resize", handleResize);
      chart.remove();
    };
  }, []);

  useEffect(() => {
    if (history && history.length > 0) {
      // Normalize entire history array before setData
      const normalizedHistory = history.map(normalizeChartCandle).filter(c => Number.isFinite(c.time));
      
      // Pre-update guard for setData
      const invalidHistoryCandle = normalizedHistory.find(c => typeof c.time === 'object');
      if (invalidHistoryCandle) {
        console.error('Object time detected before setData', invalidHistoryCandle);
        return;
      }
      
      candleSeriesRef.current.setData(normalizedHistory);
      if (isInitialLoad) {
        chartRef.current?.timeScale().fitContent();
        setIsInitialLoad(false);
      }
      // Set lastCandle from history, ensuring time is a number
      const lastHistoryCandle = history[history.length - 1];
      if (lastHistoryCandle && !lastCandle) {
        setLastCandle({
          ...lastHistoryCandle,
          time: Number(lastHistoryCandle.time) // Ensure time is a number
        });
      }
    }
  }, [history]);

  useEffect(() => {
    if (candleSeriesRef.current && lastCandle && lastCandle.time) {
      // Normalize live candle with the same helper as history
      const normalizedCandle = normalizeChartCandle(lastCandle);
      if (!Number.isFinite(normalizedCandle.time)) {
        console.error('Invalid live candle time', lastCandle.time);
        return;
      }
      
      // Pre-update guard for update
      if (typeof normalizedCandle.time === 'object') {
        console.error('Object time detected before update', normalizedCandle);
        return;
      }
      
      candleSeriesRef.current.update(normalizedCandle);
      const isUp = normalizedCandle.close >= normalizedCandle.open;
      if (livePriceLineRef.current) candleSeriesRef.current.removePriceLine(livePriceLineRef.current);
      if (toggles.price) {
        livePriceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: normalizedCandle.close,
          color: isUp ? "#22c55e" : "#ef4444",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: false, // Hide the label to remove "Last High" / "Last Low"
          title: "" // Empty title
        });
      } else if (livePriceLineRef.current) {
        candleSeriesRef.current.removePriceLine(livePriceLineRef.current);
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

    const sweepDetector = positioning_engines?.liquiditySweepDetector;
    const sweepActive = sweepDetector && (sweepDetector.sweepRisk === "HIGH" || sweepDetector.sweepRisk === "EXTREME") && sweepDetector.sweepDirection !== "NONE";
    const sweepDirColor = sweepDetector?.sweepDirection === "UP" ? "34, 197, 94" : sweepDetector?.sweepDirection === "DOWN" ? "239, 68, 68" : "168, 85, 247";
    const dim = (base: number, factor: number) => sweepActive ? +(base * factor).toFixed(2) : base;

    type LevelEntry = { price: number; priority: number; label: string; shortLabel: string; color: string; style: number; width: number; axisLabel: boolean; isBandFill?: boolean };
    const entries: LevelEntry[] = [];

    const pushEntry = (p: number, priority: number, label: string, shortLabel: string, color: string, style = LineStyle.Solid, width = 1, isBandFill = false) => {
      if (Math.abs(p - price) > threshold) return;
      entries.push({ price: p, priority, label, shortLabel, color, style, width, axisLabel: !isBandFill, isBandFill });
    };

    if (activePanels.has("LEVELS")) {
      if (positioning?.callWall) pushEntry(positioning.callWall, 1, "CALL WALL", "CW", `rgba(239, 68, 68, ${dim(0.6, 0.7)})`, LineStyle.Solid, 2);
      if (positioning?.putWall) pushEntry(positioning.putWall, 1, "PUT WALL", "PW", `rgba(34, 197, 94, ${dim(0.6, 0.7)})`, LineStyle.Solid, 2);
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

    const sweepZoneRange = sweepActive ? extractRangeFromText(sweepDetector.sweepTargetZone) : null;
    const sweepDirArrow = sweepDetector?.sweepDirection === "UP" ? "↑" : sweepDetector?.sweepDirection === "DOWN" ? "↓" : "↕";

    if (sweepActive && activePanels.has("SQUEEZE") && sweepZoneRange && !activePanels.has("HEATMAP")) {
      const bandStep = (sweepZoneRange.end - sweepZoneRange.start) / 6;
      for (let i = 0; i <= 6; i++) {
        const p = sweepZoneRange.start + bandStep * i;
        const isBorder = i === 0 || i === 6;
        const opacity = isBorder ? 0.3 : 0.08;
        pushEntry(p, 2, "", "", `rgba(${sweepDirColor}, ${opacity})`, LineStyle.Solid, 1, true);
      }
      pushEntry(sweepZoneRange.end, 2, `SWEEP ${sweepDirArrow}`, "SW", `rgba(${sweepDirColor}, 0.4)`, LineStyle.Solid, 1);
    }

    if (sweepActive && activePanels.has("SQUEEZE")) {
      const knownLevels: number[] = [];
      if (positioning?.dealerPivot) knownLevels.push(positioning.dealerPivot);
      if (positioning?.putWall) knownLevels.push(positioning.putWall);
      if (positioning?.callWall) knownLevels.push(positioning.callWall);
      if (levels?.gammaMagnets) knownLevels.push(...levels.gammaMagnets);
      const heatmapZones = positioning_engines?.liquidityHeatmap?.liquidityHeatZones || [];
      heatmapZones.filter((z: any) => z.intensity >= 0.5).forEach((z: any) => knownLevels.push((z.priceStart + z.priceEnd) / 2));
      const triggerText = sweepDetector.sweepTrigger || "";
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
        
        // Step 2.3: Dual-layer liquidity system - Local + Global Walls
        
        // Clustering configuration
        const clusterWidth = 10; // 10 USD price buckets
        const minClusterLiquidity = 5; // Minimum 5 BTC to show as cluster
        const maxLocalLabelsPerSide = 4; // Local levels max per side
        
        // Global wall configuration
        const globalWallThreshold = 80; // Minimum 80 BTC for global wall entry
        const globalWallExitThreshold = 60; // Exit threshold for hysteresis (60 BTC)
        const maxGlobalLabelsPerSide = 4; // Show more global walls
        const globalClusterWidth = 20; // Wider buckets for global detection
        
        // MAIN GLOBAL WALL configuration
        const mainGlobalWallThreshold = 100; // Minimum 100 BTC for MAIN GLOBAL WALLS
        const mainGlobalWallExitThreshold = 70; // Remove only below 70 BTC for sustained checks
        const maxMainGlobalLabelsPerSide = 2; // MAIN GLOBAL WALLS max per side
        
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
        
        // B. LOCAL MAIN LEVELS (near current price)
        const renderClusteredLevels = (clusters: any[], side: 'BID' | 'ASK') => {
          // Filter clusters within label range
          const labelRange = price * 0.03; // 3% range for labels
          const clustersInRange = clusters.filter(cluster => 
            Math.abs(cluster.price - price) <= labelRange
          );
          
          // Filter out tiny clusters - minimum 3 BTC for local labels (prevent 0.0 BTC labels)
          const meaningfulClusters = clustersInRange.filter(cluster => cluster.size >= 3);
          
          // Take top clusters by size
          const topClusters = meaningfulClusters.slice(0, maxLocalLabelsPerSide);
          
          topClusters.forEach((cluster) => {
            // Label with exact price of largest level and total clustered liquidity
            const label = `${side} ${cluster.price.toFixed(1)} · ${cluster.size.toFixed(1)} BTC`;
            
            // Visual properties based on clustered size and persistence
            const persistenceOpacity = 0.4 + (cluster.persistence * 0.6); // 40%-100% based on persistence
            const lineWidth = cluster.size >= 20 ? 3 : cluster.size >= 10 ? 2.5 : 2; // Thicker lines for larger clusters
            const baseColor = side === 'BID' ? '34, 197, 94' : '239, 68, 68';
            
            pushEntry(
              cluster.price,                    // Exact price of largest level in cluster
              2,                               // Medium priority for local levels
              label,
              side,
              `rgba(${baseColor}, ${persistenceOpacity.toFixed(2)})`,
              LineStyle.Solid,
              lineWidth
            );
            
            if (DEBUG_ENABLED && false) { // Disabled by default
              console.debug(`[Bookmap Local] ${label} - Min: 3 BTC - No 0.0 BTC labels - Levels: ${cluster.originalLevels.length} - Largest: ${cluster.largestLevel.size.toFixed(1)}@${cluster.largestLevel.price.toFixed(1)} - Persistence: ${cluster.persistence.toFixed(2)}`);
            }
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
        
        // D. MAIN GLOBAL WALLS (persistent 100+ BTC walls)
        const renderMainGlobalWalls = (mainGlobalWalls: any[], side: 'BID' | 'ASK') => {
          mainGlobalWalls.forEach((wall) => {
            // Visual properties - make MAIN walls stand out clearly
            const wallOpacity = 1.0; // Full opacity for main walls
            const wallWidth = 5; // Thickest lines for main walls
            const wallColor = side === 'BID' ? '59, 130, 246' : '239, 68, 68'; // Distinct colors for main walls
            
            pushEntry(
              wall.price,                      // Exact price of largest level in wall
              0,                                 // Highest priority for main global walls
              wall.label,                        // Use cached label
              side,
              `rgba(${wallColor}, ${wallOpacity})`,  // Distinct colors from global walls
              LineStyle.Solid,
              wallWidth
            );
            
            if (DEBUG_ENABLED && false) { // Disabled by default
              console.debug(`[Bookmap Main] ${wall.label} - Fixed: ${wall.side} - Size: ${wall.size.toFixed(1)} BTC`);
            }
          });
        };
        
        // Render clustered bid and ask levels
        renderClusteredLevels(clusteredBids, 'BID');
        renderClusteredLevels(clusteredAsks, 'ASK');
        
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
      
      // Legacy background heatmap zones (preserved for non-Bookmap systems)
      const heatmap = positioning_engines?.liquidityHeatmap;
      if (heatmap && lastCandle) {
        
        // Background heatmap zones (preserving existing logic)
        const confluenceSet = new Set<number>();
        const binSize = price > 50000 ? 250 : price > 10000 ? 100 : 50;
        const markConfluence = (lv: number) => { for (let p = lv - binSize; p <= lv + binSize; p += binSize) confluenceSet.add(Math.round(Math.floor(p / binSize) * binSize)); };
        const MAX_HEATMAP_LEVELS = 6;
        let heatmapLevelCount = 0;

        const allHeatZones: any[] = heatmap.liquidityHeatZones || [];
        const bidZones = allHeatZones.filter((z: any) => z.side === "BID" && z.intensity >= 0.1).sort((a: any, b: any) => b.intensity - a.intensity).slice(0, 4);
        const askZones = allHeatZones.filter((z: any) => z.side === "ASK" && z.intensity >= 0.1).sort((a: any, b: any) => b.intensity - a.intensity).slice(0, 4);

        const nearThreshold = price * 0.005;
        const intensityToWidth = (int: number, near: boolean) => Math.min(near ? 2 : (int >= 0.7 ? 2 : 1), heatmapLineWidthCap);
        const intensityToOpacity = (int: number, near: boolean) => {
          const base = Math.min(0.5, 0.08 + int * 0.4);
          const raw = near ? Math.min(0.6, base + 0.1) : base;
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
          const opacity = intensityToOpacity(zone.intensity, near);
          const width = intensityToWidth(zone.intensity, near);
          pushEntry(mid, 8, `BID ${fmtK(mid)}`, "B", `rgba(34, 197, 94, ${opacity.toFixed(2)})`, intensityToStyle(zone.intensity, near), width);
        });

        askZones.forEach((zone: any) => {
          const mid = (zone.priceStart + zone.priceEnd) / 2;
          if (isInConfluence(zone)) return;
          const near = Math.abs(mid - price) <= nearThreshold;
          const opacity = intensityToOpacity(zone.intensity, near);
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
  }, [market, positioning, levels, lastCandle, activePanels, positioning_engines, rawOrderBook]);

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
  const modes: MapMode[] = ["LEVELS", "GAMMA", "CASCADE", "SQUEEZE", "HEATMAP"];

  return (
    <div className="flex-1 w-full h-full flex flex-col relative">
      <div className="flex items-center gap-1 px-2 py-1 bg-terminal-panel border border-terminal-border border-b-0 shrink-0" data-testid="toggle-map-mode">
        {modes.map(mode => (
          <TooltipWrapper key={mode} concept={mode}>
            <button
              onClick={() => togglePanel(mode)}
              className={cn(
                "px-3 py-1 text-[10px] font-bold font-mono uppercase tracking-wider rounded-sm transition-all",
                activePanels.has(mode)
                  ? "bg-terminal-accent/20 border border-terminal-accent text-white"
                  : "border border-transparent text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
              )}
              data-testid={`button-mode-${mode.toLowerCase()}`}
            >
              {mode}
            </button>
          </TooltipWrapper>
        ))}
        <div className="flex-1" />
        <div className="flex items-center gap-1">
          <button data-testid="button-fit-levels" onClick={() => { setSelectedScenario(null); fitLevels(); }} className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-accent/10 border-terminal-accent/30 text-terminal-accent hover:bg-terminal-accent/20">FIT LEVELS</button>
          <button data-testid="button-reset-chart" onClick={() => { setSelectedScenario(null); resetScale(); }} className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-accent/20 border-terminal-accent text-white hover:bg-terminal-accent/40">RESET</button>
        </div>
      </div>
      <TerminalPanel className="flex-1 w-full border border-terminal-border relative" noPadding style={{ backgroundColor: market?.gammaRegime === 'LONG GAMMA' ? 'rgba(30, 58, 138, 0.03)' : 'rgba(127, 29, 29, 0.03)' }}>
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
        <div ref={chartContainerRef} className="absolute inset-0 pr-[100px]" style={{ pointerEvents: 'auto' }} />
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
