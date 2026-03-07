import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType, LineStyle, CandlestickSeries, HistogramSeries, IChartApi, ISeriesApi } from "lightweight-charts";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels, DealerExposure, TradingScenario } from "@shared/schema";
import { cn } from "@/lib/utils";

export function MainChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<IChartApi | null>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);
  const volumeSeriesRef = useRef<ISeriesApi<"Histogram"> | null>(null);
  const priceLinesRef = useRef<any[]>([]);
  const livePriceLineRef = useRef<any>(null);
  const wsRef = useRef<WebSocket | null>(null);

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const [wsStatus, setWsStatus] = useState<"CONNECTING" | "OPEN" | "CLOSED" | "ERROR">("CONNECTING");
  const [lastCandle, setLastCandle] = useState<any>(null);

  const [toggles, setToggles] = useState({
    price: true,
    flip: true,
    walls: true,
    magnets: true,
    pockets: true,
    dealer: true,
    hedgeMap: false,
  });

  const [manualPriceRange, setManualPriceRange] = useState<{from: number, to: number} | null>(null);
  const [selectedScenario, setSelectedScenario] = useState<TradingScenario | null>(null);
  const scenarioLevelsRef = useRef<any[]>([]);

  // Fetch History
  const { data: history, error: historyError, isLoading: historyLoading } = useQuery({
    queryKey: ["btc-history"],
    queryFn: async () => {
      const res = await fetch("/api/chart/history?symbol=BTCUSDT&interval=15m&limit=500");
      if (!res.ok) throw new Error("History fetch failed");
      return res.json();
    },
    retry: 3,
    refetchOnWindowFocus: false
  });

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

  // WebSocket Connection
  useEffect(() => {
    if (historyLoading || !history) return;

    const connectWS = () => {
      // Re-initialize websocket
      const ws = new WebSocket("wss://stream.binance.com:9443/ws/btcusdt@kline_15m");
      wsRef.current = ws;

      ws.onopen = () => setWsStatus("OPEN");
      ws.onmessage = (event) => {
        const data = JSON.parse(event.data);
        if (data.e === "kline") {
          const k = data.k;
          setLastCandle({
            time: Math.floor(k.t / 1000),
            open: parseFloat(k.o),
            high: parseFloat(k.h),
            low: parseFloat(k.l),
            close: parseFloat(k.c),
            volume: parseFloat(k.v)
          });
        }
      };
      ws.onerror = () => setWsStatus("ERROR");
      ws.onclose = () => {
        setWsStatus("CLOSED");
        setTimeout(connectWS, 5000);
      };
    };

    connectWS();
    return () => wsRef.current?.close();
  }, [history, historyLoading]);

  // Handle Scenario Selection
  useEffect(() => {
    if (!candleSeriesRef.current) return;
    scenarioLevelsRef.current.forEach(line => candleSeriesRef.current?.removePriceLine(line));
    scenarioLevelsRef.current = [];
    if (!selectedScenario) return;
    const color = selectedScenario.type === "BASE" ? "#3b82f6" : selectedScenario.type === "ALT" ? "#22c55e" : "#f97316";
    selectedScenario.levels.forEach((levelStr) => {
      const parseLevel = (val: string): number => {
        const clean = val.toLowerCase().replace(/,/g, '').trim();
        return clean.endsWith('k') ? parseFloat(clean.slice(0, -1)) * 1000 : parseFloat(clean);
      };
      const price = parseLevel(levelStr);
      if (isNaN(price)) return;
      const line = candleSeriesRef.current?.createPriceLine({ price, color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: `${selectedScenario.type} ${levelStr}` });
      if (line) scenarioLevelsRef.current.push(line);
    });
    const prices = selectedScenario.levels.map(l => {
      const clean = l.toLowerCase().replace(/,/g, '').trim();
      return clean.endsWith('k') ? parseFloat(clean.slice(0, -1)) * 1000 : parseFloat(clean);
    }).filter(p => !isNaN(p));
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

  const { data: positioning } = useQuery<OptionsPositioning>({ queryKey: ["/api/options-positioning"], refetchInterval: 5000 });
  const { data: market } = useQuery<MarketState>({ queryKey: ["/api/market-state"], refetchInterval: 5000 });
  const { data: levels } = useQuery<KeyLevels>({ queryKey: ["/api/key-levels"], refetchInterval: 5000 });
  const { data: exposure } = useQuery<DealerExposure>({ queryKey: ["/api/dealer-exposure"], refetchInterval: 5000 });

  // Initialize Chart
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

  // Set Historical Data
  useEffect(() => {
    if (candleSeriesRef.current && history && history.length > 0) {
      candleSeriesRef.current.setData(history);
      if (isInitialLoad) {
        chartRef.current?.timeScale().fitContent();
        setIsInitialLoad(false);
      }
      // Set last candle from history as initial point if ws hasn't updated yet
      if (!lastCandle) {
        setLastCandle(history[history.length - 1]);
      }
    }
  }, [history]);

  // Update with Live Data
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

  // Handle Manual Range
  useEffect(() => {
    if (chartRef.current && manualPriceRange) {
      chartRef.current.priceScale("right").applyOptions({ autoScale: false });
      chartRef.current.priceScale("right").setVisibleRange(manualPriceRange);
    }
  }, [manualPriceRange]);

  // Render Overlays
  useEffect(() => {
    const series = candleSeriesRef.current;
    if (!series || !lastCandle) return;
    priceLinesRef.current.forEach(line => series.removePriceLine(line));
    priceLinesRef.current = [];
    const price = lastCandle.close;
    const threshold = price * 0.15;

    const addLevel = (p: number, color: string, title: string, style = LineStyle.Solid) => {
      if (Math.abs(p - price) > threshold) return;
      const line = series.createPriceLine({ price: p, color, lineWidth: 1, lineStyle: style, axisLabelVisible: true, title });
      if (line) priceLinesRef.current.push(line);
    };

    if (toggles.flip && market?.gammaFlip) addLevel(market.gammaFlip, "rgba(234, 179, 8, 0.6)", "FLIP");
    if (toggles.walls) {
      if (positioning?.callWall) addLevel(positioning.callWall, "rgba(239, 68, 68, 0.6)", "CALL WALL");
      if (positioning?.putWall) addLevel(positioning.putWall, "rgba(34, 197, 94, 0.6)", "PUT WALL");
    }
    if (toggles.magnets && levels?.gammaMagnets) {
      levels.gammaMagnets.forEach(m => addLevel(m, "rgba(59, 130, 246, 0.2)", "MAGNET"));
    }
    if (toggles.dealer && positioning?.dealerPivot) addLevel(positioning.dealerPivot, "rgba(255, 255, 255, 0.3)", "DEALER PIVOT");
  }, [market, positioning, levels, lastCandle, toggles]);

  if (historyError) {
    return (
      <TerminalPanel className="flex-1 w-full h-full border border-terminal-border flex items-center justify-center">
        <div className="text-terminal-negative font-mono text-center">
          <p className="text-lg font-bold">MARKET DATA OFFLINE</p>
          <p className="text-xs opacity-70 mt-2">History Fetch Error</p>
          <button onClick={() => window.location.reload()} className="mt-4 px-4 py-2 border border-terminal-negative/30 text-[10px] uppercase">Reconnect</button>
        </div>
      </TerminalPanel>
    );
  }

  return (
    <TerminalPanel className="flex-1 w-full h-full border border-terminal-border relative" noPadding style={{ backgroundColor: market?.gammaRegime === 'LONG GAMMA' ? 'rgba(30, 58, 138, 0.03)' : 'rgba(127, 29, 29, 0.03)' }}>
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start">
          <div className="flex flex-col">
            <div className="flex items-baseline space-x-3">
              <h2 className="text-xl font-bold font-mono text-white/90 tracking-tight">BTC/USDT</h2>
              <span className={`text-2xl font-mono font-bold ${wsStatus === 'OPEN' ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{(lastCandle?.close || 0).toLocaleString(undefined, { minimumFractionDigits: 2 })}</span>
              <span className="text-[10px] font-mono font-bold opacity-80 text-terminal-muted ml-2">{wsStatus}</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Regime</span><span className={`text-[11px] font-bold font-mono ${market?.gammaRegime === 'LONG GAMMA' ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{market?.gammaRegime || "NEUTRAL"}</span></div>
              <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Flip Dist</span><span className="text-[11px] font-bold font-mono text-white">{market?.distanceToFlip?.toFixed(2) || "0.00"}%</span></div>
            </div>
          </div>
          <div className="flex flex-col items-end space-y-2 pointer-events-auto mr-32">
            <div className="flex space-x-1">
              <button onClick={() => { setSelectedScenario(null); fitLevels(); }} className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-accent/10 border-terminal-accent/30 text-terminal-accent hover:bg-terminal-accent/20">FIT LEVELS</button>
              <button onClick={() => { setSelectedScenario(null); resetScale(); }} className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-accent/20 border-terminal-accent text-white hover:bg-terminal-accent/40">RESET</button>
            </div>
            <div className="flex space-x-1">
              {Object.entries(toggles).map(([key, val]) => (
                <button key={key} onClick={() => setToggles(prev => ({ ...prev, [key]: !val }))} className={cn("px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase transition-all", val ? "bg-terminal-accent/20 border-terminal-accent text-white" : "bg-terminal-panel border-terminal-border text-terminal-muted")}>{key}</button>
              ))}
            </div>
          </div>
        </div>
      </div>
      <div ref={chartContainerRef} className="absolute inset-0 pr-[100px]" style={{ pointerEvents: 'auto' }} />
    </TerminalPanel>
  );
}
