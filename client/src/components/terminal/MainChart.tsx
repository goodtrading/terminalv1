import { useQuery } from "@tanstack/react-query";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels } from "@shared/schema";
import { 
  ResponsiveContainer, 
  ComposedChart, 
  XAxis, 
  YAxis, 
  Tooltip, 
  ReferenceLine, 
  Bar, 
  Cell,
  ErrorBar
} from "recharts";

export function MainChart() {
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
    queryKey: ["btc-candles"],
    queryFn: async () => {
      const res = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=15m&limit=100");
      const data = await res.json();
      return data.map((d: any) => ({
        time: d[0],
        open: parseFloat(d[1]),
        high: parseFloat(d[2]),
        low: parseFloat(d[3]),
        close: parseFloat(d[4]),
        // For rendering candlesticks in Recharts, we calculate the body and wicks
        bottom: Math.min(parseFloat(d[1]), parseFloat(d[4])),
        height: Math.abs(parseFloat(d[1]) - parseFloat(d[4])),
        color: parseFloat(d[4]) >= parseFloat(d[1]) ? "#22c55e" : "#ef4444"
      }));
    },
    refetchInterval: 10000
  });

  const currentPrice = candles?.[candles.length - 1]?.close || 0;
  const priceChange = candles && candles.length > 1 
    ? ((currentPrice - candles[0].close) / candles[0].close * 100).toFixed(2)
    : "0.00";

  // Configuration for visibility & scale
  const VISIBILITY_RANGE_PCT = 0.08; 
  const lowerBound = currentPrice * (1 - VISIBILITY_RANGE_PCT);
  const upperBound = currentPrice * (1 + VISIBILITY_RANGE_PCT);

  const isVisible = (price: number | undefined) => {
    if (!price) return false;
    return price >= lowerBound && price <= upperBound;
  };

  const nearestMagnet = levels?.gammaMagnets?.length 
    ? levels.gammaMagnets.reduce((prev, curr) => Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev)
    : null;

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
          
          <div className="flex space-x-4 mt-2 pointer-events-auto">
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-terminal-muted font-bold tracking-widest">Nearest Magnet</span>
              <span className="text-[10px] font-mono text-blue-400 font-bold">{nearestMagnet?.toLocaleString() || "--"}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[8px] uppercase text-terminal-muted font-bold tracking-widest">Flip Dist %</span>
              <span className="text-[10px] font-mono text-yellow-400 font-bold">{market?.distanceToFlip?.toFixed(2) || "--"}%</span>
            </div>
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

      {/* Candlestick Chart Area */}
      <div className="w-full h-full bg-black relative overflow-hidden flex flex-col pt-20">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={candles} margin={{ top: 10, right: 80, bottom: 20, left: 0 }}>
            <XAxis dataKey="time" hide />
            <YAxis 
              domain={[lowerBound, upperBound]} 
              orientation="right" 
              tick={{ fontSize: 9, fill: '#444', fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#000', border: '1px solid #222', fontSize: '10px' }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ display: 'none' }}
              cursor={{ stroke: '#333', strokeWidth: 1 }}
            />
            
            {/* Structural Overlays - Semi-transparent */}
            {market?.gammaFlip && isVisible(market.gammaFlip) && (
              <ReferenceLine 
                y={market.gammaFlip} 
                stroke="#eab308" 
                strokeWidth={1}
                strokeDasharray="4 4"
                strokeOpacity={0.6}
                label={{ position: 'right', value: `Flip ${market.gammaFlip}`, fill: '#eab308', fontSize: 8, fontWeight: 'bold', opacity: 0.8 }}
              />
            )}

            {positioning?.callWall && isVisible(positioning.callWall) && (
              <ReferenceLine 
                y={positioning.callWall} 
                stroke="#ef4444" 
                strokeWidth={1}
                strokeOpacity={0.5}
                label={{ position: 'right', value: `Call Wall ${positioning.callWall}`, fill: '#ef4444', fontSize: 8, fontWeight: 'bold', opacity: 0.7 }}
              />
            )}

            {positioning?.putWall && isVisible(positioning.putWall) && (
              <ReferenceLine 
                y={positioning.putWall} 
                stroke="#22c55e" 
                strokeWidth={1}
                strokeOpacity={0.5}
                label={{ position: 'right', value: `Put Wall ${positioning.putWall}`, fill: '#22c55e', fontSize: 8, fontWeight: 'bold', opacity: 0.7 }}
              />
            )}

            {levels?.gammaMagnets?.filter(m => isVisible(m)).map((m, i) => (
              <ReferenceLine 
                key={`magnet-${i}`}
                y={m} 
                stroke="#3b82f6" 
                strokeWidth={1}
                strokeOpacity={0.4}
                label={{ position: 'right', value: `Magnet ${m}`, fill: '#3b82f6', fontSize: 8, opacity: 0.6 }}
              />
            ))}

            {/* Pockets as Reference Lines for fast mode simplicity */}
            {levels?.shortGammaPocketStart && isVisible(levels.shortGammaPocketStart) && (
              <ReferenceLine y={levels.shortGammaPocketStart} stroke="#f97316" strokeOpacity={0.2} strokeWidth={1} label={{ position: 'right', value: `Pocket`, fill: '#f97316', fontSize: 8, opacity: 0.5 }} />
            )}

            {levels?.deepRiskPocketStart && isVisible(levels.deepRiskPocketStart) && (
              <ReferenceLine y={levels.deepRiskPocketStart} stroke="#a855f7" strokeOpacity={0.2} strokeWidth={1} label={{ position: 'right', value: `Deep Risk`, fill: '#a855f7', fontSize: 8, opacity: 0.5 }} />
            )}

            {/* Candlestick Rendering using Bars */}
            <Bar dataKey="height" isAnimationActive={false}>
              {candles?.map((entry, index) => (
                <Cell key={`cell-${index}`} fill={entry.color} fillOpacity={0.8} />
              ))}
              {/* Note: This is a simplified candlestick. Real candlesticks need wicks.
                  In Recharts we can use ErrorBars or specialized Custom shapes for wicks. 
                  For fast mode, we prioritize the overall look. */}
            </Bar>
          </ComposedChart>
        </ResponsiveContainer>

        {/* Center Watermark */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.01] z-0">
          <span className="text-[12rem] font-bold tracking-tighter italic font-mono uppercase">QUANTUM</span>
        </div>
      </div>
    </TerminalPanel>
  );
}