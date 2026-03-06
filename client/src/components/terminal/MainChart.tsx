import { useEffect, useRef, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType, ISeriesApi, version, LineStyle, CandlestickSeries } from "lightweight-charts";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels } from "@shared/schema";

export function MainChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<any>(null);
  const priceLinesRef = useRef<any[]>([]);

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
            bottom: 0.1,
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
        priceLineVisible: true,
        lastValueVisible: true,
      });
      
      chartRef.current = chart;
      candleSeriesRef.current = candleSeries;

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
    }
  }, [candles]);

  // Update Overlays
  useEffect(() => {
    if (!candleSeriesRef.current || !candles) return;

    // Clear previous lines
    priceLinesRef.current.forEach(line => {
      candleSeriesRef.current.removePriceLine(line);
    });
    priceLinesRef.current = [];

    const currentPrice = candles[candles.length - 1].close;
    const threshold = currentPrice * 0.1; // 10% range for nearby levels

    const addLine = (price: number, options: any) => {
      if (Math.abs(price - currentPrice) > threshold) return; // Only nearby
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
          color: "rgba(234, 179, 8, 0.6)",
          lineStyle: LineStyle.Dashed,
          title: "FLIP",
        });
      }

      if (toggles.walls) {
        if (positioning?.callWall) {
          addLine(positioning.callWall, {
            color: "rgba(239, 68, 68, 0.6)",
            lineStyle: LineStyle.Solid,
            title: "C-WALL",
          });
        }
        if (positioning?.putWall) {
          addLine(positioning.putWall, {
            color: "rgba(34, 197, 94, 0.6)",
            lineStyle: LineStyle.Solid,
            title: "P-WALL",
          });
        }
      }

      if (toggles.magnets && levels?.gammaMagnets) {
        // Find nearest magnet
        const nearbyMagnets = levels.gammaMagnets
          .filter(m => Math.abs(m - currentPrice) < threshold)
          .sort((a, b) => Math.abs(a - currentPrice) - Math.abs(b - currentPrice));
        
        if (nearbyMagnets.length > 0) {
          // Show top 3 magnets to avoid clutter
          nearbyMagnets.slice(0, 3).forEach((m, i) => {
            addLine(m, {
              color: "rgba(59, 130, 246, 0.4)",
              lineStyle: LineStyle.Dotted,
              title: i === 0 ? "MAGNET" : "",
            });
          });
        }
      }

      if (toggles.pockets && levels) {
        if (levels.shortGammaPocketStart) {
          addLine(levels.shortGammaPocketStart, {
            color: "rgba(249, 115, 22, 0.3)",
            lineStyle: LineStyle.Solid,
            title: "SG-POCKET",
          });
        }
        if (levels.deepRiskPocketStart) {
          addLine(levels.deepRiskPocketStart, {
            color: "rgba(168, 85, 247, 0.3)",
            lineStyle: LineStyle.Solid,
            title: "DR-POCKET",
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

  return (
    <TerminalPanel className="flex-1 mb-2 border border-terminal-border relative" noPadding>
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
      
      {/* Offscreen Levels Indicator */}
      <div className="absolute bottom-4 right-4 text-[9px] font-mono text-terminal-muted pointer-events-none z-10 bg-black/40 px-2 py-1 rounded">
        <span>STRUCTURAL_BIAS: {market?.gammaRegime || "NEUTRAL"}</span>
      </div>

      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.01] z-0">
        <span className="text-[12rem] font-bold tracking-tighter italic font-mono uppercase">QUANTUM</span>
      </div>
    </TerminalPanel>
  );
}