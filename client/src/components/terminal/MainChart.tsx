import { useQuery } from "@tanstack/react-query";
import { TerminalPanel } from "./TerminalPanel";
import { OptionsPositioning, MarketState, KeyLevels } from "@shared/schema";
import { ResponsiveContainer, ComposedChart, XAxis, YAxis, Tooltip, Line, ReferenceLine } from "recharts";

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

  // Configuration for visibility
  const VISIBILITY_RANGE_PCT = 0.10; // 10% range for levels
  const lowerBound = currentPrice * (1 - VISIBILITY_RANGE_PCT);
  const upperBound = currentPrice * (1 + VISIBILITY_RANGE_PCT);

  const isVisible = (price: number | undefined) => {
    if (!price) return false;
    return price >= lowerBound && price <= upperBound;
  };

  // Filter levels for the "Offscreen" panel
  const offscreenLevels: { name: string; price: number; color: string }[] = [];
  
  if (market?.gammaFlip && !isVisible(market.gammaFlip)) {
    offscreenLevels.push({ name: "Flip", price: market.gammaFlip, color: "text-yellow-500" });
  }
  if (positioning?.callWall && !isVisible(positioning.callWall)) {
    offscreenLevels.push({ name: "Call Wall", price: positioning.callWall, color: "text-red-500" });
  }
  if (positioning?.putWall && !isVisible(positioning.putWall)) {
    offscreenLevels.push({ name: "Put Wall", price: positioning.putWall, color: "text-green-500" });
  }
  levels?.gammaMagnets?.forEach(m => {
    if (!isVisible(m)) offscreenLevels.push({ name: "Magnet", price: m, color: "text-blue-500" });
  });

  // Calculate nearest metrics for the status label
  const nearestMagnet = levels?.gammaMagnets?.length 
    ? levels.gammaMagnets.reduce((prev, curr) => Math.abs(curr - currentPrice) < Math.abs(prev - currentPrice) ? curr : prev)
    : null;

  return (
    <TerminalPanel className="flex-1 mb-2 border border-terminal-border relative" noPadding>
      {/* Chart Header Overlay */}
      <div className="absolute top-0 left-0 right-0 p-4 flex justify-between items-start z-10 pointer-events-none">
        <div className="flex flex-col">
          <div className="flex items-baseline space-x-3">
            <h2 className="text-xl font-bold font-mono text-white/90 tracking-tight">BTC/USD</h2>
            <span className={`text-2xl font-mono font-bold ${parseFloat(priceChange) >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>
              {currentPrice.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
            </span>
            <span className={`text-xs font-mono font-bold opacity-80 ${parseFloat(priceChange) >= 0 ? 'text-terminal-positive' : 'text-terminal-negative'}`}>
              {parseFloat(priceChange) >= 0 ? '+' : ''}{priceChange}%
            </span>
          </div>
          
          {/* Status Indicators */}
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
        
        <div className="flex flex-col items-end space-y-2 pointer-events-auto">
          <div className="flex space-x-1">
            {["1M", "15M", "1H", "4H", "1D"].map(tf => (
              <button key={tf} className="px-2 py-1 text-[10px] font-bold font-mono bg-terminal-panel border border-terminal-border text-terminal-muted hover:text-white hover:border-terminal-accent transition-all rounded-sm">
                {tf}
              </button>
            ))}
          </div>
          
          {/* Offscreen Levels Panel */}
          {offscreenLevels.length > 0 && (
            <div className="bg-terminal-panel/80 border border-terminal-border p-1.5 rounded-sm flex flex-col items-end min-w-[100px]">
              <span className="text-[7px] uppercase text-terminal-muted font-black tracking-tighter mb-1">OFFSCREEN LEVELS</span>
              {offscreenLevels.slice(0, 4).map((lvl, i) => (
                <div key={i} className="flex justify-between w-full space-x-2">
                  <span className={`text-[8px] font-bold uppercase ${lvl.color}`}>{lvl.name}</span>
                  <span className="text-[8px] font-mono text-white/60">{lvl.price.toLocaleString()}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>

      {/* Chart Area */}
      <div className="w-full h-full bg-[#080808] relative overflow-hidden flex flex-col pt-20">
        <ResponsiveContainer width="100%" height="100%">
          <ComposedChart data={btcPrice}>
            <XAxis dataKey="time" hide />
            <YAxis 
              domain={[lowerBound, upperBound]} 
              orientation="right" 
              tick={{ fontSize: 9, fill: '#666', fontFamily: 'JetBrains Mono' }}
              axisLine={false}
              tickLine={false}
              width={80}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111', border: '1px solid #333', fontSize: '10px' }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ display: 'none' }}
            />
            
            {/* 1. Gamma Flip (Always Show if within range or reasonably close) */}
            {market?.gammaFlip && isVisible(market.gammaFlip) && (
              <ReferenceLine 
                y={market.gammaFlip} 
                stroke="#eab308" 
                strokeWidth={1.5}
                strokeDasharray="5 5"
                label={{ position: 'right', value: `Flip ${market.gammaFlip}`, fill: '#eab308', fontSize: 9, fontWeight: 'bold' }}
              />
            )}

            {/* 2. Call Wall */}
            {positioning?.callWall && isVisible(positioning.callWall) && (
              <ReferenceLine 
                y={positioning.callWall} 
                stroke="#ef4444" 
                strokeWidth={2}
                label={{ position: 'right', value: `Call Wall ${positioning.callWall}`, fill: '#ef4444', fontSize: 9, fontWeight: 'bold' }}
              />
            )}

            {/* 3. Put Wall */}
            {positioning?.putWall && isVisible(positioning.putWall) && (
              <ReferenceLine 
                y={positioning.putWall} 
                stroke="#22c55e" 
                strokeWidth={2}
                label={{ position: 'right', value: `Put Wall ${positioning.putWall}`, fill: '#22c55e', fontSize: 9, fontWeight: 'bold' }}
              />
            )}

            {/* 4. All Gamma Magnets (Filtered) */}
            {levels?.gammaMagnets?.filter(m => isVisible(m)).map((m, i) => (
              <ReferenceLine 
                key={`magnet-${i}`}
                y={m} 
                stroke="#3b82f6" 
                strokeWidth={1}
                label={{ position: 'right', value: `Magnet ${m}`, fill: '#3b82f6', fontSize: 8 }}
              />
            ))}

            {/* 5. Short Gamma Pocket (Filtered) */}
            {levels?.shortGammaPocketStart && isVisible(levels.shortGammaPocketStart) && (
              <ReferenceLine y={levels.shortGammaPocketStart} stroke="#f97316" strokeOpacity={0.2} strokeWidth={1} />
            )}
            {levels?.shortGammaPocketEnd && isVisible(levels.shortGammaPocketEnd) && (
              <ReferenceLine 
                y={levels.shortGammaPocketEnd} 
                stroke="#f97316" 
                strokeOpacity={0.2} 
                strokeWidth={1}
                label={{ position: 'right', value: `Short Pocket`, fill: '#f97316', fontSize: 8, opacity: 0.8 }}
              />
            )}

            {/* 6. Deep Risk Pocket (Filtered) */}
            {levels?.deepRiskPocketStart && isVisible(levels.deepRiskPocketStart) && (
              <ReferenceLine y={levels.deepRiskPocketStart} stroke="#a855f7" strokeOpacity={0.2} strokeWidth={1} />
            )}
            {levels?.deepRiskPocketEnd && isVisible(levels.deepRiskPocketEnd) && (
              <ReferenceLine 
                y={levels.deepRiskPocketEnd} 
                stroke="#a855f7" 
                strokeOpacity={0.2} 
                strokeWidth={1}
                label={{ position: 'right', value: `Deep Risk`, fill: '#a855f7', fontSize: 8, opacity: 0.8 }}
              />
            )}
            
            {/* Price Line */}
            <Line 
              type="monotone" 
              dataKey="price" 
              stroke="#fff" 
              strokeWidth={1.5} 
              dot={false} 
              isAnimationActive={false}
            />
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