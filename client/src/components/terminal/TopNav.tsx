import { useState } from "react";
import { cn } from "@/lib/utils";

export function TopNav() {
  const [activeTab, setActiveTab] = useState("TERMINAL");

  const tabs = ["TERMINAL", "OPTIONS", "FLOWS", "VOLATILITY", "REPORTS"];

  return (
    <div className="flex h-12 items-center justify-between bg-terminal-bg border-b border-terminal-border px-4 shrink-0 w-full z-10 relative">
      <div className="flex items-center h-full">
        <div className="flex items-center mr-8">
          <span className="text-terminal-accent font-bold text-lg tracking-wider mr-2">█</span>
          <span className="font-bold text-white tracking-widest text-sm">QUANTUM_SYS <span className="text-terminal-muted font-normal text-xs ml-1">v1.0</span></span>
        </div>
        
        <div className="flex space-x-1 h-full pt-1">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                "px-4 text-xs font-medium tracking-wide h-full border-b-2 transition-colors",
                activeTab === tab 
                  ? "border-terminal-accent text-white" 
                  : "border-transparent text-terminal-muted hover:text-white"
              )}
            >
              {tab}
            </button>
          ))}
        </div>
      </div>

      <div className="flex items-center space-x-4 text-xs font-mono">
        <div className="flex items-center space-x-2 border border-terminal-border bg-terminal-panel px-2 py-1 rounded-sm">
          <span className="text-terminal-muted">ASSET:</span>
          <span className="text-white font-bold">BTC</span>
        </div>
        
        <div className="flex items-center space-x-2 border border-terminal-border bg-terminal-panel px-2 py-1 rounded-sm">
          <span className="text-terminal-muted">EXPIRY:</span>
          <span className="text-white">29 MAR 2024</span>
        </div>
        
        <div className="flex items-center space-x-2 border border-terminal-border bg-terminal-panel px-2 py-1 rounded-sm">
          <span className="text-terminal-muted">TF:</span>
          <span className="text-white">15M</span>
        </div>
        
        <div className="flex items-center space-x-2 border border-terminal-border bg-terminal-panel px-2 py-1 rounded-sm">
          <span className="text-terminal-muted">FEED:</span>
          <span className="text-white">DERIBIT</span>
        </div>
        
        <div className="flex items-center space-x-2 ml-4">
          <div className="w-2 h-2 rounded-full bg-terminal-positive animate-pulse"></div>
          <span className="text-terminal-positive font-bold tracking-widest">LIVE</span>
        </div>
      </div>
    </div>
  );
}