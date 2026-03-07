import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType, LineStyle, CandlestickSeries, HistogramSeries, IChartApi, ISeriesApi } from "lightweight-charts";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels, DealerExposure, TradingScenario } from "@shared/schema";
import { cn } from "@/lib/utils";
import { useTerminalState } from "@/hooks/useTerminalState";
import { TooltipWrapper } from "./Tooltip";

type MapMode = "LEVELS" | "GAMMA" | "CASCADE" | "SQUEEZE" | "HEATMAP";

export function MainChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const livePriceLineRef = useRef<any>(null);

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [lastCandle, setLastCandle] = useState<any>(null);
  const [mapMode, setMapMode] = useState<MapMode>("LEVELS");

  const [toggles, setToggles] = useState({
    price: true,
  });

  const [manualPriceRange, setManualPriceRange] = useState<{from: number, to: number} | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<TradingScenario | null>(null);
  const scenarioLevelsRef = useRef<any[]>([]);

  const { data: terminalState } = useTerminalState();
  const positioning_engines = terminalState?.positioning as any;

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
        if (prev && tickerTime === prev.time) {
          return {
            ...prev,
            close: ticker.price,
            high: Math.max(prev.high, ticker.price),
            low: Math.min(prev.low, ticker.price)
          };
        }
        return {
          time: tickerTime,
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

  const resetScale = () => {
    if (!chartRef.current) return;
    setManualPriceRange(null);
    chartRef.current.priceScale("right").applyOptions({ autoScale: true });
    chartRef.current.timeScale().fitContent();
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
    if (candleSeriesRef.current && history && history.length > 0) {
      candleSeriesRef.current.setData(history);
      if (isInitialLoad) {
        chartRef.current?.timeScale().fitContent();
        setIsInitialLoad(false);
      }
      if (!lastCandle) {
        setLastCandle(history[history.length - 1]);
      }
    }
  }, [history]);

  useEffect(() => {
    if (candleSeriesRef.current && lastCandle) {
      candleSeriesRef.current.update(lastCandle);
      const isUp = lastCandle.close >= lastCandle.open;
      if (livePriceLineRef.current) candleSeriesRef.current.removePriceLine(livePriceLineRef.current);
      if (toggles.price) {
        livePriceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: lastCandle.close,
          color: isUp ? "#22c55e" : "#ef4444",
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: ""
        });
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

    const addLevel = (p: number, color: string, title: string, style = LineStyle.Solid, width = 1) => {
      if (Math.abs(p - price) > threshold) return;
      const line = series.createPriceLine({ price: p, color, lineWidth: width as any, lineStyle: style, axisLabelVisible: true, title });
      if (line) priceLinesRef.current.push(line);
    };

    if (mapMode === "LEVELS") {
      if (positioning?.callWall) addLevel(positioning.callWall, "rgba(239, 68, 68, 0.6)", "CALL WALL");
      if (positioning?.putWall) addLevel(positioning.putWall, "rgba(34, 197, 94, 0.6)", "PUT WALL");
      if (levels?.gammaMagnets) {
        levels.gammaMagnets.forEach(m => addLevel(m, "rgba(59, 130, 246, 0.4)", "MAGNET", LineStyle.Dashed));
      }
      if (positioning?.dealerPivot) addLevel(positioning.dealerPivot, "rgba(255, 255, 255, 0.3)", "DEALER PIVOT", LineStyle.Dashed);
    }

    if (mapMode === "GAMMA") {
      if (market?.gammaFlip) addLevel(market.gammaFlip, "rgba(250, 240, 180, 0.85)", "GAMMA FLIP", LineStyle.Solid, 2);
      if (market?.transitionZoneStart && market?.transitionZoneEnd) {
        addLevel(market.transitionZoneStart, "rgba(234, 179, 8, 0.25)", "TRANSITION LOW", LineStyle.Dashed);
        addLevel(market.transitionZoneEnd, "rgba(234, 179, 8, 0.25)", "TRANSITION HIGH", LineStyle.Dashed);
      }
      const gammaCliffs = positioning_engines?.gammaCurveEngine?.gammaCliffs;
      if (gammaCliffs && Array.isArray(gammaCliffs)) {
        const above = gammaCliffs
          .filter((c: any) => c.strike > price)
          .sort((a: any, b: any) => Math.abs(b.strength) - Math.abs(a.strength))
          .slice(0, 3);
        const below = gammaCliffs
          .filter((c: any) => c.strike < price)
          .sort((a: any, b: any) => Math.abs(b.strength) - Math.abs(a.strength))
          .slice(0, 3);
        const maxAbove = Math.max(...above.map((c: any) => Math.abs(c.strength)), 1);
        const maxBelow = Math.max(...below.map((c: any) => Math.abs(c.strength)), 1);
        above.forEach((cliff: { strike: number; strength: number }, i: number) => {
          const label = `CLIFF ↑ ${cliff.strike >= 1000 ? (cliff.strike / 1000).toFixed(cliff.strike % 1000 === 0 ? 0 : 1) + "k" : cliff.strike}`;
          const isStrongest = i === 0;
          const ratio = Math.abs(cliff.strength) / maxAbove;
          const opacity = isStrongest ? 0.7 : ratio > 0.5 ? 0.45 : 0.25;
          addLevel(cliff.strike, `rgba(249, 115, 22, ${opacity})`, label, LineStyle.Dotted, isStrongest ? 2 : 1);
        });
        below.forEach((cliff: { strike: number; strength: number }, i: number) => {
          const label = `CLIFF ↓ ${cliff.strike >= 1000 ? (cliff.strike / 1000).toFixed(cliff.strike % 1000 === 0 ? 0 : 1) + "k" : cliff.strike}`;
          const isStrongest = i === 0;
          const ratio = Math.abs(cliff.strength) / maxBelow;
          const opacity = isStrongest ? 0.7 : ratio > 0.5 ? 0.45 : 0.25;
          addLevel(cliff.strike, `rgba(56, 189, 248, ${opacity})`, label, LineStyle.Dotted, isStrongest ? 2 : 1);
        });
      }
    }

    if (mapMode === "CASCADE") {
      const cascade = positioning_engines?.liquidityCascadeEngine;
      if (cascade) {
        const triggerPrice = extractPriceFromText(cascade.cascadeTrigger);
        if (triggerPrice) addLevel(triggerPrice, "rgba(239, 68, 68, 0.7)", "CASCADE TRIGGER");
        const pocketPrices = extractRangeFromText(cascade.liquidationPocket);
        if (pocketPrices) {
          addLevel(pocketPrices.start, "rgba(239, 68, 68, 0.3)", "LIQ POCKET LOW", LineStyle.Dashed);
          addLevel(pocketPrices.end, "rgba(239, 68, 68, 0.3)", "LIQ POCKET HIGH", LineStyle.Dashed);
        }
      }
    }

    if (mapMode === "SQUEEZE") {
      const squeeze = positioning_engines?.squeezeProbabilityEngine;
      if (squeeze) {
        const triggerPrice = extractPriceFromText(squeeze.squeezeTrigger);
        if (triggerPrice) addLevel(triggerPrice, "rgba(168, 85, 247, 0.7)", "SQUEEZE TRIGGER");
        const targetPrice = extractPriceFromText(squeeze.squeezeTarget);
        if (targetPrice) addLevel(targetPrice, "rgba(168, 85, 247, 0.4)", "SQUEEZE TARGET", LineStyle.Dashed);
      }
    }

    if (mapMode === "HEATMAP") {
      const heatmap = positioning_engines?.liquidityHeatmap;
      if (heatmap) {
        const bidZones = (heatmap.liquidityHeatZones || [])
          .filter((z: any) => z.side === "BID")
          .sort((a: any, b: any) => b.intensity - a.intensity)
          .slice(0, 5);
        const askZones = (heatmap.liquidityHeatZones || [])
          .filter((z: any) => z.side === "ASK")
          .sort((a: any, b: any) => b.intensity - a.intensity)
          .slice(0, 5);

        bidZones.forEach((zone: any, i: number) => {
          const mid = (zone.priceStart + zone.priceEnd) / 2;
          const isStrongest = i === 0;
          const opacity = isStrongest ? 0.6 : zone.intensity > 0.5 ? 0.4 : 0.2;
          const label = `BID ${mid >= 1000 ? (mid / 1000).toFixed(mid % 1000 === 0 ? 0 : 1) + "k" : mid}`;
          addLevel(mid, `rgba(34, 197, 94, ${opacity})`, label, LineStyle.Dotted, isStrongest ? 2 : 1);
        });

        askZones.forEach((zone: any, i: number) => {
          const mid = (zone.priceStart + zone.priceEnd) / 2;
          const isStrongest = i === 0;
          const opacity = isStrongest ? 0.6 : zone.intensity > 0.5 ? 0.4 : 0.2;
          const label = `ASK ${mid >= 1000 ? (mid / 1000).toFixed(mid % 1000 === 0 ? 0 : 1) + "k" : mid}`;
          addLevel(mid, `rgba(239, 68, 68, ${opacity})`, label, LineStyle.Dotted, isStrongest ? 2 : 1);
        });

        const confluenceZones = (heatmap.liquidityConfluenceZones || [])
          .sort((a: any, b: any) => b.confluenceScore - a.confluenceScore)
          .slice(0, 3);
        confluenceZones.forEach((cz: any) => {
          const mid = (cz.priceStart + cz.priceEnd) / 2;
          const label = `CONFLUENCE ${mid >= 1000 ? (mid / 1000).toFixed(mid % 1000 === 0 ? 0 : 1) + "k" : mid}`;
          addLevel(mid, "rgba(168, 85, 247, 0.55)", label, LineStyle.Solid, 2);
        });
      }
    }
  }, [market, positioning, levels, lastCandle, mapMode, positioning_engines]);

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
              onClick={() => setMapMode(mode)}
              className={cn(
                "px-3 py-1 text-[10px] font-bold font-mono uppercase tracking-wider rounded-sm transition-all",
                mapMode === mode
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
              {mapMode === "GAMMA" && (
                <div className="mt-2 text-[9px] text-white/25 font-mono tracking-wide">Showing Flip, Transition Zone, and Key Gamma Cliffs</div>
              )}
              {mapMode === "HEATMAP" && (
                <div className="mt-2 text-[9px] text-white/25 font-mono tracking-wide">Order book liquidity zones with gamma confluence</div>
              )}
            </div>
          </div>
        </div>
        {mapMode === "GAMMA" && (
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
        {mapMode === "HEATMAP" && (
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
