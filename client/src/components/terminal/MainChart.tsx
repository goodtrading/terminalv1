import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType, ISeriesApi, version, LineStyle, CandlestickSeries, HistogramSeries } from "lightweight-charts";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels } from "@shared/schema";

export function MainChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const volumeSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);
  const livePriceLineRef = useRef<any>(null);

  const [toggles, setToggles] = useState({
    price: true,
    flip: true,
    walls: true,
    magnets: true,
    pockets: true,
  });

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
          fontSize: 10,
          fontFamily: "JetBrains Mono, monospace",
        },
        grid: {
          vertLines: { color: "#0a0a0a" },
          horzLines: { color: "#0a0a0a" },
        },
        width: chartContainerRef.current.clientWidth,
        height: chartContainerRef.current.clientHeight,
        timeScale: {
          borderColor: "#1a1a1a",
          timeVisible: true,
          secondsVisible: false,
        },
        rightPriceScale: {
          borderColor: "#1a1a1a",
          scaleMargins: {
            top: 0.1,
            bottom: 0.25, // Leave room for pressure histogram
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

      // Dealer Pressure Histogram
      const volumeSeries = chart.addSeries(HistogramSeries, {
        color: '#26a69a',
        priceFormat: {
          type: 'volume',
        },
        priceScaleId: '', // Overlay scale
      });

      volumeSeries.priceScale().applyOptions({
        scaleMargins: {
          top: 0.8, // Position at bottom
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
      candleSeriesRef.current.setData(candles);
      
      // Update Live Price Line
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

      // Update Dealer Pressure Histogram
      if (volumeSeriesRef.current && market?.totalGex) {
        const pressureData = candles.map((c, i) => {
          const prevClose = i > 0 ? candles[i-1].close : c.open;
          const move = c.close - prevClose;
          const pressure = (market.totalGex / 1e9) * move; // Scale for vis
          return {
            time: c.time,
            value: Math.abs(pressure),
            color: pressure >= 0 ? 'rgba(34, 197, 94, 0.5)' : 'rgba(239, 68, 68, 0.5)',
          };
        });
        volumeSeriesRef.current.setData(pressureData);
      }
    }
  }, [candles, toggles.price, market?.totalGex]);

  // Update Overlays
  useEffect(() => {
    if (!candleSeriesRef.current || !candles) return;

    priceLinesRef.current.forEach(line => {
      candleSeriesRef.current.removePriceLine(line);
    });
    priceLinesRef.current = [];

    const currentPrice = candles[candles.length - 1].close;
    const threshold = currentPrice * 0.1;

    const addLine = (price: number, options: any) => {
      if (Math.abs(price - currentPrice) > threshold) return;
      const line = candleSeriesRef.current.createPriceLine({
        price,
        axisLabelVisible: true,
        lineWidth: 1,
        ...options,
      });
      priceLinesRef.current.push(line);
    };

    try {
      if (toggles.flip && market?.gammaFlip) {
        addLine(market.gammaFlip, {
          color: "#eab308",
          lineStyle: LineStyle.Dashed,
          title: "GAMMA FLIP",
          lineWidth: 2,
        });

        const transitionUpper = market.gammaFlip * 1.005;
        const transitionLower = market.gammaFlip * 0.995;
        
        addLine(transitionUpper, {
          color: "rgba(234, 179, 8, 0.15)",
          lineStyle: LineStyle.Solid,
          title: "",
          axisLabelVisible: false,
        });
        addLine(transitionLower, {
          color: "rgba(234, 179, 8, 0.15)",
          lineStyle: LineStyle.Solid,
          title: "",
          axisLabelVisible: false,
        });
      }

      if (toggles.walls) {
        if (positioning?.callWall) {
          addLine(positioning.callWall, {
            color: "rgba(239, 68, 68, 0.6)",
            lineStyle: LineStyle.Solid,
            title: "CALL WALL",
          });
        }
        if (positioning?.putWall) {
          addLine(positioning.putWall, {
            color: "rgba(34, 197, 94, 0.6)",
            lineStyle: LineStyle.Solid,
            title: "PUT WALL",
          });
        }
      }

      if (toggles.magnets && levels?.gammaMagnets) {
        const nearbyMagnets = levels.gammaMagnets
          .filter(m => Math.abs(m - currentPrice) < threshold)
          .sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice));
        
        if (nearbyMagnets.length > 0) {
          nearbyMagnets.slice(0, 3).forEach((m, i) => {
            addLine(m, {
              color: "rgba(59, 130, 246, 0.4)",
              lineStyle: LineStyle.Dotted,
              title: i === 0 ? "MAGNET" : "",
            });
          });
        }
      }
    } catch (err) {
      console.error("[MainChart] Overlay update failed:", err);
    }
  }, [market, positioning, levels, candles, toggles]);

  const currentPrice = candles?.[candles.length - 1]?.close || 0;
  const priceChange = candles && candles.length > 1 
    ? ((currentPrice - candles[0].close) / candles[0].close * 100).toFixed(2)
    : "0.00";

  // Regime Background logic
  const regimeColor = market?.gammaRegime === 'LONG GAMMA' 
    ? 'rgba(30, 58, 138, 0.05)' 
    : market?.gammaRegime === 'SHORT GAMMA' 
      ? 'rgba(127, 29, 29, 0.05)' 
      : 'transparent';

  return (
    <TerminalPanel 
      className="flex-1 mb-2 border border-terminal-border relative" 
      noPadding
      style={{ backgroundColor: regimeColor }}
    >
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 pointer-events-none">
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
          
          <div className="mt-2 flex items-center space-x-4">
            <div className="flex flex-col">
              <span className="text-[10px] text-terminal-muted font-mono uppercase">Gamma Regime</span>
              <span className={`text-xs font-bold font-mono ${market?.gammaRegime === 'LONG GAMMA' ? 'text-terminal-positive' : 'text-terminal-negative'}`}>
                {market?.gammaRegime || "NEUTRAL"}
              </span>
            </div>
            <div className="flex flex-col border-l border-terminal-border pl-4">
              <span className="text-[10px] text-terminal-muted font-mono uppercase">Dist. To Flip</span>
              <span className="text-xs font-bold font-mono text-white">
                {market?.distanceToFlip?.toFixed(2) || "0.00"}%
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
          <div className="flex space-x-1">
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

      <div ref={chartContainerRef} className="w-full h-full" />
      
      {/* Dealer Pressure Label */}
      <div className="absolute bottom-[20%] left-4 text-[8px] font-mono text-terminal-muted pointer-events-none uppercase tracking-tighter opacity-50">
        Dealer Hedging Pressure
      </div>

      <div className="absolute bottom-4 right-4 text-[9px] font-mono text-terminal-muted pointer-events-none z-10 bg-black/40 px-2 py-1 rounded">
        <span>STRUCTURAL_BIAS: {market?.gammaRegime || "NEUTRAL"}</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.01] z-0">
        <span className="text-[12rem] font-bold tracking-tighter italic font-mono uppercase">QUANTUM</span>
      </div>
    </TerminalPanel>
  );
}