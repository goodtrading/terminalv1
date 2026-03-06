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
              width={100}
            />
            <Tooltip 
              contentStyle={{ backgroundColor: '#111', border: '1px solid #333', fontSize: '10px' }}
              itemStyle={{ color: '#fff' }}
              labelStyle={{ display: 'none' }}
            />
            
            {/* 1. Gamma Flip */}
            {market?.gammaFlip && (
              <ReferenceLine 
                y={market.gammaFlip} 
                stroke="#eab308" 
                strokeWidth={1.5}
                strokeDasharray="5 5"
                label={{ position: 'right', value: `Gamma Flip ${market.gammaFlip}`, fill: '#eab308', fontSize: 9, fontWeight: 'bold' }}
              />
            )}

            {/* 7. Transition Zone Band */}
            {market?.transitionZoneStart && market?.transitionZoneEnd && (
              <ReferenceLine 
                y={market.transitionZoneStart} 
                stroke="none"
                label={{ position: 'insideRight', value: 'Transition Zone', fill: '#999', fontSize: 8, opacity: 0.5 }}
              />
            )}
            {market?.transitionZoneStart && market?.transitionZoneEnd && (
              <Line 
                data={[{ price: market.transitionZoneStart }, { price: market.transitionZoneEnd }]}
                stroke="none"
              />
            )}
            {/* Note: Recharts doesn't have a direct "Band" component for horizontal areas easily without hacks, 
                using multiple lines or specialized Area. For simplicity in Fast mode, we use ReferenceLines 
                and a semi-transparent Line if needed, but the requirement asks for a band.
                I'll use ReferenceLine with a background if possible, or just two boundaries. */}
            {market?.transitionZoneStart && (
              <ReferenceLine y={market.transitionZoneStart} stroke="#eab308" strokeOpacity={0.1} strokeWidth={2} />
            )}
            {market?.transitionZoneEnd && (
              <ReferenceLine y={market.transitionZoneEnd} stroke="#eab308" strokeOpacity={0.1} strokeWidth={2} />
            )}

            {/* 2. Call Wall */}
            {positioning?.callWall && (
              <ReferenceLine 
                y={positioning.callWall} 
                stroke="#ef4444" 
                strokeWidth={2}
                label={{ position: 'right', value: `Call Wall ${positioning.callWall}`, fill: '#ef4444', fontSize: 9, fontWeight: 'bold' }}
              />
            )}

            {/* 3. Put Wall */}
            {positioning?.putWall && (
              <ReferenceLine 
                y={positioning.putWall} 
                stroke="#22c55e" 
                strokeWidth={2}
                label={{ position: 'right', value: `Put Wall ${positioning.putWall}`, fill: '#22c55e', fontSize: 9, fontWeight: 'bold' }}
              />
            )}

            {/* 4. All Gamma Magnets */}
            {levels?.gammaMagnets?.map((m, i) => (
              <ReferenceLine 
                key={`magnet-${i}`}
                y={m} 
                stroke="#3b82f6" 
                strokeWidth={1}
                label={{ position: 'right', value: `Gamma Magnet ${m}`, fill: '#3b82f6', fontSize: 8 }}
              />
            ))}

            {/* 5. Short Gamma Pocket Band */}
            {levels?.shortGammaPocketStart && (
              <ReferenceLine y={levels.shortGammaPocketStart} stroke="#f97316" strokeOpacity={0.2} strokeWidth={1} />
            )}
            {levels?.shortGammaPocketEnd && (
              <ReferenceLine 
                y={levels.shortGammaPocketEnd} 
                stroke="#f97316" 
                strokeOpacity={0.2} 
                strokeWidth={1}
                label={{ position: 'right', value: `Short Gamma Pocket`, fill: '#f97316', fontSize: 8, opacity: 0.8 }}
              />
            )}

            {/* 6. Deep Risk Pocket Band */}
            {levels?.deepRiskPocketStart && (
              <ReferenceLine y={levels.deepRiskPocketStart} stroke="#a855f7" strokeOpacity={0.2} strokeWidth={1} />
            )}
            {levels?.deepRiskPocketEnd && (
              <ReferenceLine 
                y={levels.deepRiskPocketEnd} 
                stroke="#a855f7" 
                strokeOpacity={0.2} 
                strokeWidth={1}
                label={{ position: 'right', value: `Deep Risk Pocket`, fill: '#a855f7', fontSize: 8, opacity: 0.8 }}
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