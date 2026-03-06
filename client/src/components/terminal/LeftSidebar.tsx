import { TerminalPanel, TerminalValue } from "./TerminalPanel";

export function LeftSidebar() {
  return (
    <div className="w-64 h-full flex flex-col gap-2 overflow-y-auto p-2 border-r border-terminal-border bg-terminal-bg shrink-0">
      
      <TerminalPanel title="MARKET STATE">
        <TerminalValue label="Gamma Regime" value="LONG GAMMA" trend="positive" isBadge />
        <TerminalValue label="Total GEX" value="+2.05B" trend="positive" />
        <TerminalValue label="Gamma Flip" value="69,450" />
        <TerminalValue label="Distance to Flip" value="2.04%" />
        <TerminalValue label="Transition Zone" value="69,100 – 69,700" />
        <TerminalValue label="Gamma Accel" value="HIGH" trend="positive" />
      </TerminalPanel>

      <TerminalPanel title="DEALER EXPOSURE">
        <TerminalValue label="Vanna Exposure" value="+212M" trend="positive" />
        <TerminalValue label="Vanna Bias" value="BULLISH" trend="positive" isBadge />
        <TerminalValue label="Charm Exposure" value="-38.1B" trend="negative" />
        <TerminalValue label="Charm Bias" value="BULLISH" trend="positive" isBadge />
        <TerminalValue label="Gamma Pressure" value="HIGH" />
        <TerminalValue label="Gamma Concen." value="72%" />
      </TerminalPanel>

      <TerminalPanel title="OPTIONS POSITIONING">
        <TerminalValue label="Call Wall" value="72,000" trend="negative" />
        <TerminalValue label="Put Wall" value="68,000" trend="positive" />
        <TerminalValue label="OI Concentration" value="70,000" />
        <TerminalValue label="Dealer Pivot" value="70,000" />
      </TerminalPanel>

      <TerminalPanel title="KEY LEVELS">
        <div className="space-y-4">
          <div>
            <div className="text-[9px] uppercase tracking-[0.2em] text-terminal-muted mb-2 font-bold">GAMMA MAGNETS</div>
            <div className="flex space-x-2 font-mono text-xs">
              <span className="bg-terminal-panel border border-terminal-border px-2 py-1 rounded-sm text-white font-bold">70,000</span>
              <span className="bg-terminal-panel border border-terminal-border px-2 py-1 rounded-sm text-white font-bold">72,000</span>
              <span className="bg-terminal-panel border border-terminal-border px-2 py-1 rounded-sm text-white font-bold">73,000</span>
            </div>
          </div>
          
          <div className="p-2 bg-terminal-negative/5 border border-terminal-negative/20 rounded-sm">
            <div className="text-[9px] uppercase tracking-[0.2em] text-terminal-negative/70 mb-1 font-bold">SHORT GAMMA POCKET</div>
            <div className="font-mono text-xs text-terminal-negative font-bold">
              69,100 – 68,400
            </div>
          </div>

          <div className="p-2 bg-white/[0.02] border border-white/5 rounded-sm">
            <div className="text-[9px] uppercase tracking-[0.2em] text-terminal-muted mb-1 font-bold">DEEP RISK POCKET</div>
            <div className="font-mono text-xs text-white/80 font-bold">
              62,900 – 63,200
            </div>
          </div>
        </div>
      </TerminalPanel>

    </div>
  );
}