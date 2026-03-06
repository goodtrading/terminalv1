import { useQuery } from "@tanstack/react-query";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels } from "@shared/schema";
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Line, ReferenceLine, Area } from "recharts";

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

  const { data: btcPrice } = useQuery({
    queryKey: ["btc-price"],
    queryFn: async () => {
      const res = await fetch("https://api.binance.com/api/v3/klines?symbol=BTCUSDT&interval=1m&limit=100");
      const data = await res.json();
      return data.map((d: any) => ({
        time: d[0],
        price: parseFloat(d[4])
      }));
    },
    refetchInterval: 10000
  });

  const currentPrice = btcPrice?.[btcPrice.length - 1]?.price || 0;
  const priceChange = btcPrice && btcPrice.length > 1 
    ? ((currentPrice - btcPrice[0].price) / btcPrice[0].price * 100).toFixed(2)
    : "0.00";

  return (
    <TerminalPanel className="flex-1 mb-2 border border-terminal-border relative" noPadding>
      {/* Chart Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 pointer-events-none">
        <div>
          <div className="flex items-baseline space-x-3">
            <h2 className="text-xl font-bold font-mono text-white/90 tracking-tight">BTC/USD</h2>
            <span className={`text-2xl font-mono font-bold ${parseFloat(priceChange) >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>
              {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`text-xs font-mono font-bold opacity-80 ${parseFloat(priceChange) >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>
              {parseFloat(priceChange) >= 0 ? '+' : ''}{priceChange}%
            </span>
          </div>
          <div className="text-[10px] font-mono text-terminal-muted mt-1 uppercase tracking-widest">SPOT PRICE INDEX • BINANCE LIVE</div>
        </div>
        <div className="flex space-x-1 pointer-events-auto">
          {["1M", "15M", "1H", "4H", "1D"].map(tf => (
            <button key={tf} className="px-2 py-1 text-[10px] font-bold font-mono bg-terminal-panel border border-terminal-border text-terminal-muted hover:text-white hover:border-terminal-accent transition-all rounded-sm">
              {tf}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Area */}
      <div className="w-full h-full bg-[#080808] relative overflow-hidden flex flex-col pt-16">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={btcPrice}>
            <XAxis dataKey="time" hide />
            <YAxis 
              domain={['auto', 'auto']} 
              orientation="right" 
              tick={{ fontSize: 9, fill: '#666', fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              width={60}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111', border: '1px solid #333', fontSize: '10px' }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ display: 'none' }}
            />
            
            {/* Structural Levels */}
            {positioning?.callWall && (
              <ReferenceLine 
                y={positioning.callWall} 
                stroke="#ff3b3b" 
                strokeDasharray="3 3"
                label={{ position: 'right', value: `CALL WALL ${positioning.callWall}`, fill: '#ff3b3b', fontSize: 9, fontWeight: 'bold' }}
              />
            )}
            {market?.gammaFlip && (
              <ReferenceLine 
                y={market.gammaFlip} 
                stroke="#ff3b3b" 
                strokeWidth={2}
                label={{ position: 'right', value: `FLIP ${market.gammaFlip}`, fill: '#ff3b3b', fontSize: 9, fontWeight: 'bold' }}
              />
            )}
            {positioning?.putWall && (
              <ReferenceLine 
                y={positioning.putWall} 
                stroke="#4ade80" 
                strokeDasharray="3 3"
                label={{ position: 'right', value: `PUT WALL ${positioning.putWall}`, fill: '#4ade80', fontSize: 9, fontWeight: 'bold' }}
              />
            )}
            {levels?.gammaMagnets?.map((m, i) => (
              <ReferenceLine 
                key={i}
                y={m} 
                stroke="#fff" 
                strokeOpacity={0.2}
                label={{ position: 'right', value: `MAGNET ${m}`, fill: '#999', fontSize: 8 }}
              />
            ))}
            
            {/* Price Line */}
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke="#fff" 
              strokeWidth={1} 
              dot={false} 
              isAnimationActive={false}
            />

            {/* Short Gamma Pocket Shading */}
            {levels && (
              <ReferenceLine 
                y={levels.shortGammaPocketStart} 
                stroke="transparent" 
                label={{ position: 'left', value: 'SHORT GAMMA POCKET', fill: '#ff3b3b', fontSize: 8, opacity: 0.4 }}
              />
            )}
          </ComposedChart>
        </ResponsiveContainer>

        {/* Center Watermark - Very Subtle */}
        <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-[0.02] z-0">
          <span className="text-[12rem] font-bold tracking-tighter italic font-mono uppercase">QUANTUM</span>
        </div>
      </div>
    </TerminalPanel>
  );
}