import { TerminalPanel, TerminalValue } from "./TerminalPanel";

export function LeftSidebar() {
  return (
    <div className="w-64 h-full flex flex-col gap-2 overflow-y-auto p-2 border-r border-terminal-border bg-terminal-bg shrink-0">
      
      <TerminalPanel title="MARKET STATE">
        <TerminalValue label="Gamma Regime" value="LONG GAMMA" trend="positive" />
        <TerminalValue label="Total GEX" value="+2.05B" trend="positive" />
        <TerminalValue label="Gamma Flip" value="69,450" />
        <TerminalValue label="Distance to Flip" value="2.04%" />
        <TerminalValue label="Transition Zone" value="69,100 – 69,700" />
        <TerminalValue label="Gamma Accel" value="HIGH" trend="positive" />
      </TerminalPanel>

      <TerminalPanel title="DEALER EXPOSURE">
        <TerminalValue label="Vanna Exposure" value="+212M" trend="positive" />
        <TerminalValue label="Vanna Bias" value="BULLISH" trend="positive" />
        <TerminalValue label="Charm Exposure" value="-38.1B" trend="negative" />
        <TerminalValue label="Charm Bias" value="BULLISH" trend="positive" />
        <TerminalValue label="Gamma Pressure" value="HIGH" />
        <TerminalValue label="Gamma Concen." value="72%" />
      </TerminalPanel>

      <TerminalPanel title="OPTIONS POSITIONING">
        <TerminalValue label="Call Wall" value="72,000" />
        <TerminalValue label="Put Wall" value="68,000" />
        <TerminalValue label="OI Concentration" value="70,000" />
        <TerminalValue label="Dealer Pivot" value="70,000" />
      </TerminalPanel>

      <TerminalPanel title="KEY LEVELS">
        <div className="space-y-3">
          <div>
            <div className="text-[10px] text-terminal-muted mb-1 font-semibold tracking-wider">GAMMA MAGNETS</div>
            <div className="flex space-x-2 font-mono text-sm">
              <span className="bg-terminal-bg border border-terminal-border px-2 py-0.5 rounded text-white">70k</span>
              <span className="bg-terminal-bg border border-terminal-border px-2 py-0.5 rounded text-white">72k</span>
              <span className="bg-terminal-bg border border-terminal-border px-2 py-0.5 rounded text-white">73k</span>
            </div>
          </div>
          
          <div>
            <div className="text-[10px] text-terminal-muted mb-1 font-semibold tracking-wider">SHORT GAMMA POCKET</div>
            <div className="font-mono text-sm text-terminal-negative bg-terminal-negative/10 border border-terminal-negative/30 px-2 py-1 rounded inline-block">
              69.1k – 68.4k
            </div>
          </div>

          <div>
            <div className="text-[10px] text-terminal-muted mb-1 font-semibold tracking-wider">DEEP RISK POCKET</div>
            <div className="font-mono text-sm text-terminal-negative bg-terminal-negative/10 border border-terminal-negative/30 px-2 py-1 rounded inline-block">
              62.9k – 63.2k
            </div>
          </div>
        </div>
      </TerminalPanel>

    </div>
  );
}