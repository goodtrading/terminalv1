import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType, version, LineStyle, CandlestickSeries, HistogramSeries } from "lightweight-charts";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels, DealerExposure } from "@shared/schema";

export function MainChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const livePriceLineRef = useRef<any>(null);

  const [isInitialLoad, setIsInitialLoad] = useState(true);

  const [toggles, setToggles] = useState({
    price: true,
    flip: true,
    walls: true,
    magnets: true,
    pockets: true,
    dealer: true,
  });

  const resetScale = () => {
    if (!chartRef.current) return;
    chartRef.current.priceScale("right").applyOptions({ autoScale: true });
    setIsInitialLoad(true);
  };


  const { data: positioning } = useQuery<OptionsPositioning>({ 
    queryKey: ["/api/options-positioning"],
    refetchInterval: 5000
  });

  const { data: market } = useQuery<MarketState>({ 
    queryKey: ["/api/market-state"],
    refetchInterval: 5000
  });

  const { data: levels } = useQuery<KeyLevels>({ 
    queryKey: ["/api/key-levels"],
    refetchInterval: 5000
  });

  const { data: exposure } = useQuery<DealerExposure>({ 
    queryKey: ["/api/dealer-exposure"],
    refetchInterval: 5000
  });

  const { data: candles } = useQuery({
    queryKey: ["btc-candles-lightweight"],
    queryFn: async () => {
      const res = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=300");
      const data = await res.json();
      return data.map((d: any) => ({
        time: (d[0] / 1000) as any,
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
      }));
    },
    refetchInterval: 10000
  });

  useEffect(() => {
    if (!chartContainerRef.current) return;

    try {
      const chart = createChart(chartContainerRef.current, {
        layout: {
          background: { type: ColorType.Solid, color: "#000000" },
          textColor: "#d1d4dc",
          fontSize: 11,
          fontFamily: "JetBrains Mono, monospace",
        },
        grid: {
          vertLines: { color: "#111111" },
          horzLines: { color: "#111111" },
        },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
        timeScale: {
          borderColor: "#1a1a1a",
          timeVisible: true,
          secondsVisible: false,
          barSpacing: 8,
          rightOffset: 12,
        },
        rightPriceScale: {
          borderColor: "#1a1a1a",
          autoScale: true,
          scaleMargins: {
            top: 0.1,
            bottom: 0.2,
          },
        },
        crosshair: {
          mode: 0,
          vertLine: {
            color: "#444",
            width: 1,
            style: LineStyle.LargeDashed,
            labelBackgroundColor: "#000",
          },
          horzLine: {
            color: "#444",
            width: 1,
            style: LineStyle.LargeDashed,
            labelBackgroundColor: "#000",
          },
        },
        handleScroll: {
          mouseWheel: true,
          pressedMouseMove: true,
          horzTouchDrag: true,
          vertTouchDrag: true,
        },
        handleScale: {
          mouseWheel: true,
          pinch: true,
          axisPressedMouseMove: {
            price: true,
            time: true,
          },
        },
      });

      const candleSeries = chart.addSeries(CandlestickSeries, {
        upColor: "#22c55e",
        downColor: "#ef4444",
        borderVisible: false,
        wickUpColor: "#22c55e",
        wickDownColor: "#ef4444",
        priceLineVisible: false,
        lastValueVisible: true,
      });

      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: 'rgba(38, 166, 154, 0.3)',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '', 
      });

      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.85,
          bottom: 0,
        },
      });
      
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
        if (chartRef.current) {
          chartRef.current.remove();
          chartRef.current = null;
          candleSeriesRef.current = null;
        }
      };
    } catch (error) {
      console.error("[MainChart] Chart initialization failed:", error);
    }
  }, []);

  useEffect(() => {
    if (candleSeriesRef.current && candles) {
      // Only set data, do not force range or fitContent
      candleSeriesRef.current.setData(candles);
      
      if (isInitialLoad && candles.length > 0) {
        chartRef.current.priceScale("right").applyOptions({ autoScale: true });
        chartRef.current.timeScale().fitContent();
        setIsInitialLoad(false);
        // After fitting, disable autoscale to allow free movement
        setTimeout(() => {
          if (chartRef.current) {
            chartRef.current.priceScale("right").applyOptions({ autoScale: false });
          }
        }, 100);
      }
      
      const lastCandle = candles[candles.length - 1];
      const isUp = lastCandle.close >= lastCandle.open;
      const color = isUp ? "#22c55e" : "#ef4444";

      if (livePriceLineRef.current) {
        candleSeriesRef.current.removePriceLine(livePriceLineRef.current);
      }

      if (toggles.price) {
        livePriceLineRef.current = candleSeriesRef.current.createPriceLine({
          price: lastCandle.close,
          color: color,
          lineWidth: 2,
          lineStyle: LineStyle.Solid,
          axisLabelVisible: true,
          title: "",
        });
      }

      if (volumeSeriesRef.current && market?.totalGex) {
        const pressureData = candles.map((c, i) => {
          const prevClose = i > 0 ? candles[i-1].close : c.open;
          const move = c.close - prevClose;
          const pressure = (market.totalGex / 1e9) * move; 
          return {
            time: c.time,
            value: Math.abs(pressure),
            color: pressure >= 0 ? 'rgba(34, 197, 94, 0.3)' : 'rgba(239, 68, 68, 0.3)',
          };
        });
        volumeSeriesRef.current.setData(pressureData);
      }
    }
  }, [candles, toggles.price, market?.totalGex]);

  useEffect(() => {
    if (!candleSeriesRef.current || !candles) return;

    priceLinesRef.current.forEach(line => {
      candleSeriesRef.current.removePriceLine(line);
    });
    priceLinesRef.current = [];

    const currentPrice = candles[candles.length - 1].close;
    const threshold = currentPrice * 0.15; // Increased threshold for institutional view

    const addLevel = (price: number, color: string, title: string, style: LineStyle = LineStyle.Solid, lineWidth: number = 1) => {
      if (Math.abs(price - currentPrice) > threshold) return;
      
      const line = candleSeriesRef.current.createPriceLine({
        price,
        color,
        lineWidth,
        lineStyle: style,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.push(line);
    };

    const addZone = (start: number, end: number, color: string, title: string) => {
      if (Math.abs(start - currentPrice) > threshold && Math.abs(end - currentPrice) > threshold) return;
      
      const mid = (start + end) / 2;
      const line = candleSeriesRef.current.createPriceLine({
        price: mid,
        color: "transparent",
        lineWidth: 0,
        axisLabelVisible: true,
        title,
      });
      priceLinesRef.current.push(line);

      // Shading via boundaries
      const upper = candleSeriesRef.current.createPriceLine({
        price: Math.max(start, end),
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: false,
        title: "",
      });
      const lower = candleSeriesRef.current.createPriceLine({
        price: Math.min(start, end),
        color,
        lineWidth: 1,
        lineStyle: LineStyle.Solid,
        axisLabelVisible: false,
        title: "",
      });
      priceLinesRef.current.push(upper, lower);
    };

    try {
      const activeLevels: number[] = [];
      const candlesMin = Math.min(...candles.map(c => c.low));
      const candlesMax = Math.max(...candles.map(c => c.high));

      if (toggles.flip && market?.gammaFlip) {
        addLevel(market.gammaFlip, "#eab308", "FLIP", LineStyle.LargeDashed, 2);
      }

      if (market?.transitionZoneStart && market?.transitionZoneEnd) {
        addZone(market.transitionZoneStart, market.transitionZoneEnd, "rgba(255, 255, 255, 0.05)", "TRANSITION");
      }

      if (toggles.walls) {
        if (positioning?.callWall) {
          addLevel(positioning.callWall, "#ef4444", "CALL WALL", LineStyle.Solid, 2);
        }
        if (positioning?.putWall) {
          addLevel(positioning.putWall, "#22c55e", "PUT WALL", LineStyle.Solid, 2);
        }
      }

      if (toggles.magnets && levels?.gammaMagnets) {
        const sortedMagnets = [...levels.gammaMagnets].sort((a, b) => a - b);
        const grouped: number[][] = [];
        sortedMagnets.forEach(m => {
          if (grouped.length === 0 || m - grouped[grouped.length-1][grouped[grouped.length-1].length-1] > 500) {
            grouped.push([m]);
          } else {
            grouped[grouped.length-1].push(m);
          }
        });

        grouped.forEach((group, i) => {
          const avg = group.reduce((a, b) => a + b, 0) / group.length;
          addLevel(avg, "rgba(59, 130, 246, 0.3)", group.length > 1 ? `MAGNETS (${group.length})` : "MAGNET", LineStyle.Solid, 1);
        });
      }

      if (toggles.pockets && levels) {
        if (levels.shortGammaPocketStart && levels.shortGammaPocketEnd) {
          addZone(levels.shortGammaPocketStart, levels.shortGammaPocketEnd, "rgba(249, 115, 22, 0.08)", "SHORT GAMMA POCKET");
        }
        if (levels.deepRiskPocketStart && levels.deepRiskPocketEnd) {
          addZone(levels.deepRiskPocketStart, levels.deepRiskPocketEnd, "rgba(168, 85, 247, 0.08)", "DEEP RISK POCKET");
        }
      }

      if (toggles.dealer && positioning?.dealerPivot) {
        addLevel(positioning.dealerPivot, "rgba(255, 255, 255, 0.5)", "DEALER PIVOT", LineStyle.Dotted, 2);
      }
    } catch (err) {
      console.error("[MainChart] Overlay update failed:", err);
    }
  }, [market, positioning, levels, candles, toggles]);

  const currentPrice = candles?.[candles.length - 1]?.close || 0;
  const priceChange = candles && candles.length > 1 
    ? ((currentPrice - candles[0].close) / candles[0].close * 100).toFixed(2)
    : "0.00";

  const regimeColor = market?.gammaRegime === 'LONG GAMMA' 
    ? 'rgba(30, 58, 138, 0.05)' 
    : market?.gammaRegime === 'SHORT GAMMA' 
      ? 'rgba(127, 29, 29, 0.05)' 
      : 'transparent';

  return (
    <TerminalPanel 
      className="flex-1 mb-2 border border-terminal-border relative overflow-hidden" 
      noPadding
      style={{ backgroundColor: regimeColor }}
    >
      <div className="absolute top-0 left-0 right-0 bottom-0 pointer-events-none z-10">
        <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start">
          <div className="flex flex-col">
            <div className="flex items-baseline space-x-3">
              <h2 className="text-xl font-bold font-mono text-white/90 tracking-tight">BTC/USDT</h2>
              <span className={`text-2xl font-mono font-bold ${parseFloat(priceChange) >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>
                {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </span>
              <span className={`text-xs font-mono font-bold opacity-80 ${parseFloat(priceChange) >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>
                {parseFloat(priceChange) >= 0 ? '+' : ''}{priceChange}%
              </span>
            </div>
            
            <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1">
              <div className="flex flex-col">
                <span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Regime</span>
                <span className={`text-[11px] font-bold font-mono ${market?.gammaRegime === 'LONG GAMMA' ? 'text-terminal-positive' : 'text-terminal-negative'}`}>
                  {market?.gammaRegime || "NEUTRAL"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Flip Dist</span>
                <span className="text-[11px] font-bold font-mono text-white">
                  {market?.distanceToFlip?.toFixed(2) || "0.00"}%
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Pressure</span>
                <span className="text-[11px] font-bold font-mono text-terminal-accent">
                  {exposure?.gammaPressure || "LOW"}
                </span>
              </div>
              <div className="flex flex-col">
                <span className="text-[9px] text-terminal-muted font-mono uppercase tracking-tighter">Vanna/Charm</span>
                <span className="text-[11px] font-bold font-mono text-white">
                  {exposure?.vannaBias?.charAt(0)}/{exposure?.charmBias?.charAt(0)}
                </span>
              </div>
            </div>
          </div>
          
          <div className="flex flex-col items-end space-y-2 pointer-events-auto">
            <div className="flex space-x-1">
              {["1M", "15M", "1H", "4H", "1D"].map(tf => (
                <button key={tf} className={`px-2 py-0.5 text-[9px] font-bold font-mono border rounded-sm transition-all ${tf === '15M' ? 'bg-terminal-accent/20 border-terminal-accent text-white' : 'bg-terminal-panel border-terminal-border text-terminal-muted hover:text-white'}`}>
                  {tf}
                </button>
              ))}
            </div>
            <div className="flex flex-wrap justify-end gap-1 max-w-[200px]">
              <button 
                onClick={resetScale}
                className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-accent/20 border-terminal-accent text-white hover:bg-terminal-accent/40"
              >
                Reset Scale
              </button>
              {Object.entries(toggles).map(([key, val]) => (
                <button 
                  key={key} 
                  onClick={() => setToggles(prev => ({ ...prev, [key]: !val }))}
                  className={`px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase transition-all ${val ? 'bg-white/10 border-white/20 text-white' : 'bg-transparent border-terminal-border text-terminal-muted'}`}
                >
                  {key}
                </button>
              ))}
            </div>
          </div>
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full h-full relative z-0" style={{ pointerEvents: 'auto' }} />
      
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.01] z-0">
        <span className="text-[12rem] font-bold tracking-tighter italic font-mono uppercase">QUANTUM</span>
      </div>
    </TerminalPanel>
  );
}