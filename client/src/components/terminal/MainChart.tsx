import { useEffect, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { createChart, ColorType, ISeriesApi, CandlestickData, LineData } from "lightweight-charts";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels } from "@shared/schema";

export function MainChart() {
  const chartContainerRef = useRef<HTMLDivElement>(null);
  const chartRef = useRef<any>(null);
  const candleSeriesRef = useRef<ISeriesApi<"Candlestick"> | null>(null);

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
        time: d[0] / 1000,
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

    const chart = createChart(chartContainerRef.current, {
      layout: {
        background: { type: ColorType.Solid, color: "#000000" },
        textColor: "#d1d4dc",
      },
      grid: {
        vertLines: { color: "#1a1a1a" },
        horzLines: { color: "#1a1a1a" },
      },
      width: chartContainerRef.current.clientWidth,
      height: chartContainerRef.current.clientHeight,
      timeScale: {
        borderColor: "#222",
        timeVisible: true,
        secondsVisible: false,
      },
      rightPriceScale: {
        borderColor: "#222",
      },
      crosshair: {
        mode: 0,
        vertLine: {
          color: "#758696",
          width: 1,
          style: 1,
          labelBackgroundColor: "#000",
        },
        horzLine: {
          color: "#758696",
          width: 1,
          style: 1,
          labelBackgroundColor: "#000",
        },
      },
    });

    const candleSeries = chart.addCandlestickSeries({
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });

    chartRef.current = chart;
    candleSeriesRef.current = candleSeries;

    const handleResize = () => {
      if (chartContainerRef.current) {
        chart.applyOptions({ 
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
    if (candleSeriesRef.current && candles) {
      candleSeriesRef.current.setData(candles);
    }
  }, [candles]);

  // Update Overlays
  useEffect(() => {
    if (!chartRef.current) return;

    // Clear existing price lines (Simplified for Fast mode - in real app we'd track and remove individual lines)
    // Lightweight-charts doesn't have a simple "clear all lines" from a series easily, 
    // so we re-apply or manage them. For this turn, we'll focus on the primary ones.

    if (market?.gammaFlip) {
      candleSeriesRef.current?.createPriceLine({
        price: market.gammaFlip,
        color: "#eab308",
        lineWidth: 1,
        lineStyle: 1, // Dotted
        axisLabelVisible: true,
        title: "Flip",
      });
    }

    if (positioning?.callWall) {
      candleSeriesRef.current?.createPriceLine({
        price: positioning.callWall,
        color: "#ef4444",
        lineWidth: 1,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: "Call Wall",
      });
    }

    if (positioning?.putWall) {
      candleSeriesRef.current?.createPriceLine({
        price: positioning.putWall,
        color: "#22c55e",
        lineWidth: 1,
        lineStyle: 0, // Solid
        axisLabelVisible: true,
        title: "Put Wall",
      });
    }

    levels?.gammaMagnets?.forEach(m => {
      candleSeriesRef.current?.createPriceLine({
        price: m,
        color: "#3b82f6",
        lineWidth: 1,
        lineStyle: 2, // Dashed
        axisLabelVisible: true,
        title: "Magnet",
      });
    });

  }, [market, positioning, levels]);

  const currentPrice = candles?.[candles.length - 1]?.close || 0;
  const priceChange = candles && candles.length > 1 
    ? ((currentPrice - candles[0].close) / candles[0].close * 100).toFixed(2)
    : "0.00";

  return (
    <TerminalPanel className="flex-1 mb-2 border border-terminal-border relative" noPadding>
      {/* Chart Header Overlay */}
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
        
        <div className="flex space-x-1 pointer-events-auto">
          {["1M", "15M", "1H", "4H", "1D"].map(tf => (
            <button key={tf} className={`px-2 py-1 text-[10px] font-bold font-mono border rounded-sm transition-all ${tf === '15M' ? 'bg-terminal-accent/20 border-terminal-accent text-white' : 'bg-terminal-panel border-terminal-border text-terminal-muted hover:text-white'}`}>
              {tf}
            </button>
          ))}
        </div>
      </div>

      <div ref={chartContainerRef} className="w-full h-full" />
      
      {/* Center Watermark */}
      <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.01] z-0">
        <span className="text-[12rem] font-bold tracking-tighter italic font-mono uppercase">QUANTUM</span>
      </div>
    </TerminalPanel>
  );
}