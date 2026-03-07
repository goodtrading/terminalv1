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

  const [isInitialLoad, setIsInitialLoad] = useState(true);
  const lastSetTimestampRef = useRef<number>(0);

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

  const resetScale = () => {
    if (!chartRef.current) return;
    setManualPriceRange(null);
    chartRef.current.priceScale("right").applyOptions({ autoScale: true });
    chartRef.current.timeScale().fitContent();
  };

  const fitLevels = () => {
    if (!chartRef.current || !candles || candles.length === 0) return;
    const currentPriceVal = candles[candles.length - 1].close;
    const threshold = currentPriceVal * 0.15;
    const points: number[] = [currentPriceVal];

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

    const filteredPoints = points.filter(p => Math.abs(p - currentPriceVal) <= threshold);
    if (filteredPoints.length > 0) {
      const min = Math.min(...filteredPoints);
      const max = Math.max(...filteredPoints);
      const margin = (max - min) * 0.3 || currentPriceVal * 0.02;
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

  const { data: candles, error: candleError } = useQuery({
    queryKey: ["btc-candles-institutional"],
    queryFn: async () => {
      const res = await fetch("/api/chart/candles?symbol=BTCUSDT&interval=15m&limit=500");
      if (!res.ok) {
        const err = await res.json();
        throw new Error(err.details || "Failed to fetch institutional candles");
      }
      return res.json();
    },
    refetchInterval: 15000,
    retry: false
  });

  useEffect(() => {
    if (!chartContainerRef.current) return;
    try {
      const chart = createChart(chartContainerRef.current, {
        layout: { background: { type: ColorType.Solid, color: "#000000" }, textColor: "#ffffff", fontSize: 12, fontFamily: "JetBrains Mono, monospace" },
        grid: { vertLines: { color: "#0a0a0a" }, horzLines: { color: "#0a0a0a" } },
        width: chartContainerRef.current.clientWidth || 800,
        height: chartContainerRef.current.clientHeight || 500,
        timeScale: { borderColor: "#1a1a1a", timeVisible: true, secondsVisible: false, barSpacing: 12, rightOffset: 15 },
        rightPriceScale: { visible: true, autoScale: true, borderColor: "#1a1a1a", scaleMargins: { top: 0.2, bottom: 0.25 }, minimumWidth: 100, borderVisible: true, alignLabels: true },
        crosshair: { mode: 0, vertLine: { color: "#333", width: 1, style: LineStyle.Solid, labelBackgroundColor: "#000" }, horzLine: { color: "#333", width: 1, style: LineStyle.Solid, labelBackgroundColor: "#000" } },
      });
      const candleSeries = chart.addSeries(CandlestickSeries, { upColor: "#22c55e", downColor: "#ef4444", borderVisible: false, wickUpColor: "#22c55e", wickDownColor: "#ef4444", priceLineVisible: false, lastValueVisible: true });
      const volumeSeries = chart.addSeries(HistogramSeries, { color: 'rgba(38, 166, 154, 0.2)', priceFormat: { type: 'volume' }, priceScaleId: '' });
      volumeSeries.priceScale().applyOptions({ scaleMargins: { top: 0.88, bottom: 0 } });
      chartRef.current = chart; candleSeriesRef.current = candleSeries; volumeSeriesRef.current = volumeSeries;
      const handleResize = () => { if (chartContainerRef.current && chartRef.current) chartRef.current.applyOptions({ width: chartContainerRef.current.clientWidth, height: chartContainerRef.current.clientHeight }); };
      window.addEventListener("resize", handleResize);
      return () => { window.removeEventListener("resize", handleResize); if (chartRef.current) { chartRef.current.remove(); chartRef.current = null; } };
    } catch (error) { console.error("Chart initialization failed:", error); }
  }, []);

  useEffect(() => {
    if (candleSeriesRef.current && candles && candles.length > 0) {
      try {
        const lastCandle = candles[candles.length - 1];
        
        if (isInitialLoad) {
          candleSeriesRef.current.setData(candles);
          chartRef.current?.timeScale().fitContent();
          setIsInitialLoad(false);
          lastSetTimestampRef.current = lastCandle.time;
        } else {
          if (lastCandle.time === lastSetTimestampRef.current || lastCandle.time > lastSetTimestampRef.current) {
            candleSeriesRef.current.update(lastCandle);
            lastSetTimestampRef.current = lastCandle.time;
          } else {
            candleSeriesRef.current.setData(candles);
            lastSetTimestampRef.current = lastCandle.time;
          }
        }
        
        const isUp = lastCandle.close >= lastCandle.open;
        const color = isUp ? "#22c55e" : "#ef4444";
        if (livePriceLineRef.current) candleSeriesRef.current.removePriceLine(livePriceLineRef.current);
        if (toggles.price) livePriceLineRef.current = candleSeriesRef.current.createPriceLine({ price: lastCandle.close, color: color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: true, title: "" });

        if (volumeSeriesRef.current && market?.totalGex) {
          const pressureData = candles.map((c: any, i: number) => {
            const prevClose = i > 0 ? candles[i-1].close : c.open;
            const move = c.close - prevClose;
            const pressure = (market.totalGex / 1e9) * move; 
            return { time: c.time, value: Math.abs(pressure), color: pressure >= 0 ? 'rgba(34, 197, 94, 0.2)' : 'rgba(239, 68, 68, 0.2)' };
          });
          volumeSeriesRef.current.setData(pressureData);
        }
      } catch (err) { console.error("setData/update failed:", err); }
    }
  }, [candles, toggles.price, market?.totalGex]);

  useEffect(() => {
    if (chartRef.current && manualPriceRange) {
      try {
        chartRef.current.priceScale("right").applyOptions({ autoScale: false });
        chartRef.current.priceScale("right").setVisibleRange(manualPriceRange);
      } catch (e) { console.error("Failed to set manual range:", e); }
    }
  }, [manualPriceRange]);

  useEffect(() => {
    if (!candleSeriesRef.current || !candles || candles.length === 0) return;
    priceLinesRef.current.forEach(line => candleSeriesRef.current?.removePriceLine(line));
    priceLinesRef.current = [];
    const currentPriceVal = candles[candles.length - 1].close;
    const threshold = currentPriceVal * 0.15;
    const addLevel = (price: number, color: string, title: string, style: LineStyle = LineStyle.Solid, lineWidth: number = 1) => {
      if (Math.abs(price - currentPriceVal) > threshold) return;
      const line = candleSeriesRef.current?.createPriceLine({ price, color, lineWidth, lineStyle: style, axisLabelVisible: true, title });
      if (line) priceLinesRef.current.push(line);
    };
    const addZone = (start: number, end: number, color: string, title: string) => {
      if (Math.abs(start - currentPriceVal) > threshold && Math.abs(end - currentPriceVal) > threshold) return;
      const mid = (start + end) / 2;
      const line = candleSeriesRef.current?.createPriceLine({ price: mid, color: "transparent", lineWidth: 0, axisLabelVisible: true, title });
      if (line) priceLinesRef.current.push(line);
      const upper = candleSeriesRef.current?.createPriceLine({ price: Math.max(start, end), color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
      const lower = candleSeriesRef.current?.createPriceLine({ price: Math.min(start, end), color, lineWidth: 1, lineStyle: LineStyle.Solid, axisLabelVisible: false, title: "" });
      if (upper) priceLinesRef.current.push(upper);
      if (lower) priceLinesRef.current.push(lower);
    };
    try {
      if (toggles.flip && market?.gammaFlip) addLevel(market.gammaFlip, "rgba(234, 179, 8, 0.6)", "FLIP", LineStyle.Solid, 1);
      if (market?.transitionZoneStart && market?.transitionZoneEnd) addZone(market.transitionZoneStart, market.transitionZoneEnd, "rgba(255, 255, 255, 0.03)", "TRANSITION");
      if (toggles.walls) {
        if (positioning?.callWall) addLevel(positioning.callWall, "rgba(239, 68, 68, 0.6)", "CALL WALL", LineStyle.Solid, 1);
        if (positioning?.putWall) addLevel(positioning.putWall, "rgba(34, 197, 94, 0.6)", "PUT WALL", LineStyle.Solid, 1);
      }
      if (toggles.magnets && levels?.gammaMagnets) {
        const sortedMagnets = [...levels.gammaMagnets].sort((a, b) => a - b);
        const grouped: number[][] = [];
        sortedMagnets.forEach(m => { if (grouped.length === 0 || m - grouped[grouped.length-1][grouped[grouped.length-1].length-1] > 500) grouped.push([m]); else grouped[grouped.length-1].push(m); });
        grouped.forEach((group) => { const avg = group.reduce((a, b) => a + b, 0) / group.length; addLevel(avg, "rgba(59, 130, 246, 0.2)", group.length > 1 ? `MAGNETS (${group.length})` : "MAGNET", LineStyle.Solid, 1); });
      }
      if (toggles.pockets && levels) {
        if (levels.shortGammaPocketStart && levels.shortGammaPocketEnd) addZone(levels.shortGammaPocketStart, levels.shortGammaPocketEnd, "rgba(249, 115, 22, 0.05)", "SHORT GAMMA POCKET");
        if (levels.deepRiskPocketStart && levels.deepRiskPocketEnd) addZone(levels.deepRiskPocketStart, levels.deepRiskPocketEnd, "rgba(168, 85, 247, 0.05)", "DEEP RISK POCKET");
      }
      if (toggles.dealer && positioning?.dealerPivot) addLevel(positioning.dealerPivot, "rgba(255, 255, 255, 0.3)", "DEALER PIVOT", LineStyle.Solid, 1);
      if (toggles.hedgeMap && market && positioning) {
        const pivot = positioning.dealerPivot || currentPriceVal;
        if (market.gammaRegime === "LONG GAMMA") { const absorptionWidth = currentPriceVal * 0.015; addZone(pivot - absorptionWidth, pivot + absorptionWidth, "rgba(59, 130, 246, 0.08)", "ABSORPTION"); }
        if (market.gammaFlip) addLevel(market.gammaFlip, "rgba(251, 191, 36, 0.4)", "EXPANSION", LineStyle.Solid, 1);
        if (market.transitionZoneStart && market.transitionZoneEnd) { const shiftPadding = currentPriceVal * 0.002; addZone(market.transitionZoneStart - shiftPadding, market.transitionZoneEnd + shiftPadding, "rgba(255, 255, 255, 0.15)", "HEDGE SHIFT"); }
      }
    } catch (err) { console.error("Overlay update failed:", err); }
  }, [market, positioning, levels, candles, toggles]);

  const currentPriceValFinal = candles && candles.length > 0 ? candles[candles.length - 1].close : 0;
  const priceChange = candles && candles.length > 1 ? ((currentPriceValFinal - candles[0].close) / candles[0].close * 100).toFixed(2) : "0.00";
  const regimeColor = market?.gammaRegime === 'LONG GAMMA' ? 'rgba(30, 58, 138, 0.03)' : market?.gammaRegime === 'SHORT GAMMA' ? 'rgba(127, 29, 29, 0.03)' : 'transparent';

  if (candleError) {
    return (
      <TerminalPanel className="flex-1 w-full h-full border border-terminal-border flex items-center justify-center">
        <div className="text-terminal-negative font-mono text-center">
          <p className="text-lg font-bold">MARKET DATA OFFLINE</p>
          <p className="text-xs opacity-70 mt-2">{candleError.message}</p>
          <button 
            onClick={() => window.location.reload()}
            className="mt-4 px-4 py-2 border border-terminal-negative/30 hover:bg-terminal-negative/10 text-[10px] uppercase"
          >
            Reconnect Terminal
          </button>
        </div>
      </TerminalPanel>
    );
  }

  return (
    <TerminalPanel className="flex-1 w-full h-full border border-terminal-border relative" noPadding style={{ backgroundColor: regimeColor }}>
      <div className="absolute inset-0 pointer-events-none z-10">
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start">
          <div className="flex flex-col">
            <div className="flex items-baseline space-x-3">
              <h2 className="text-xl font-bold font-mono text-white/90 tracking-tight">BTC/USDT</h2>
              <span className={`text-2xl font-mono font-bold ${parseFloat(priceChange) >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{currentPriceValFinal.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
              <span className={`text-xs font-mono font-bold opacity-80 ${parseFloat(priceChange) >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{parseFloat(priceChange) >= 0 ? '+' : ''}{priceChange}%</span>
            </div>
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Regime</span><span className={`text-[11px] font-bold font-mono ${market?.gammaRegime === 'LONG GAMMA' ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{market?.gammaRegime || "NEUTRAL"}</span></div>
              <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Flip Dist</span><span className="text-[11px] font-bold font-mono text-white">{market?.distanceToFlip?.toFixed(2) || "0.00"}%</span></div>
              <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Pressure</span><span className={`text-[11px] font-bold font-mono ${exposure?.gammaPressure?.startsWith('+') ? 'text-terminal-positive' : 'text-terminal-negative'}`}>{exposure?.gammaPressure || "0.00"}</span></div>
              <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Vanna/Charm</span><span className="text-[11px] font-bold font-mono text-white">{exposure?.vannaBias?.charAt(0)}/{exposure?.charmBias?.charAt(0)}</span></div>
            </div>
          </div>
          <div className="flex flex-col items-end space-y-2 pointer-events-auto mr-32">
            <div className="flex space-x-1">
              <button disabled className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-panel/40 border-terminal-border/40 text-terminal-muted/50 cursor-not-allowed">PAN UP</button>
              <button disabled className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-panel/40 border-terminal-border/40 text-terminal-muted/50 cursor-not-allowed">PAN DN</button>
              <button disabled className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-panel/40 border-terminal-border/40 text-terminal-muted/50 cursor-not-allowed">ZOOM +</button>
              <button disabled className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-panel/40 border-terminal-border/40 text-terminal-muted/50 cursor-not-allowed">ZOOM -</button>
              <button onClick={() => { setSelectedScenario(null); fitLevels(); }} className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-accent/10 border-terminal-accent/30 text-terminal-accent hover:bg-terminal-accent/20">FIT LEVELS</button>
              <button onClick={() => { setSelectedScenario(null); resetScale(); }} className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-accent/20 border-terminal-accent text-white hover:bg-terminal-accent/40">RESET</button>
            </div>
            <div className="flex space-x-1">
              {Object.entries(toggles).map(([key, val]) => (
                <button key={key} onClick={() => setToggles(prev => ({ ...prev, [key]: !val }))} className={cn("px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase transition-all", val ? "bg-terminal-accent/20 border-terminal-accent text-white" : "bg-terminal-panel border-terminal-border text-terminal-muted hover:text-white")}>{key === 'hedgeMap' ? 'HEDGE MAP' : key}</button>
              ))}
            </div>
          </div>
        </div>
        <div className="absolute bottom-4 left-4 flex space-x-4">
          <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase">Call Wall</span><span className="text-[12px] font-bold font-mono text-terminal-negative">{positioning?.callWall?.toLocaleString()}</span></div>
          <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase">Put Wall</span><span className="text-[12px] font-bold font-mono text-terminal-positive">{positioning?.putWall?.toLocaleString()}</span></div>
          <div className="flex flex-col"><span className="text-[9px] text-terminal-muted font-mono uppercase">Dealer Pivot</span><span className="text-[12px] font-bold font-mono text-white/70">{positioning?.dealerPivot?.toLocaleString()}</span></div>
        </div>
      </div>
      <div ref={chartContainerRef} className="absolute inset-0 chart-container-root pr-[100px]" style={{ pointerEvents: 'auto' }} />
    </TerminalPanel>
  );
}
