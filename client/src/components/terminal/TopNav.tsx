import { useEffect, useState } from "react";
import { Link } from "wouter";
import { cn } from "@/lib/utils";
import { useLearnMode } from "@/hooks/useLearnMode";
import { useTerminalState } from "@/hooks/useTerminalState";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { getDesktopStoragePaths, isDesktopBuild } from "@/lib/desktopStorage";
import { useDesktopFeedDiagnostics } from "@/lib/desktopDiagnostics";

interface TopNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  const { learnMode, toggleLearnMode } = useLearnMode();
  const { data: terminalState } = useTerminalState();
  const { saasDisabled, user, access, authenticated, logout } = useTerminalAuth();
  const desktopFeed = useDesktopFeedDiagnostics();
  const [desktopStorageOk, setDesktopStorageOk] = useState(false);

  const tabs = ["TERMINAL", "OPTIONS", "FLOWS", "VOLATILITY", "REPORTS"];

  const dominantExpiry = (terminalState?.positioning as any)?.dominantExpiry || null;
  const expiryLabel = dominantExpiry || "N/A";
  const planLabel = access?.subscription?.planName ?? (authenticated ? "ACTIVE" : "SIGNED OUT");

  useEffect(() => {
    if (!isDesktopBuild) return;
    let cancelled = false;
    getDesktopStoragePaths()
      .then((paths) => {
        if (!cancelled) setDesktopStorageOk(paths.mode === "tauri");
      })
      .catch(() => {
        if (!cancelled) setDesktopStorageOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, []);

  return (
    <div className="flex h-12 items-center justify-between bg-terminal-bg border-b border-terminal-border px-4 shrink-0 w-full z-10 relative">
      <div className="flex items-center h-full">
        <div className="flex items-center mr-8">
          <img
            src="/logo.png"
            alt="GoodTrading logo"
            className="h-6 w-auto object-contain mr-2 opacity-95 hover:opacity-100 transition-opacity"
          />
          <span className="font-bold text-white tracking-widest text-sm">GOODTRADING <span className="text-terminal-muted font-normal text-xs ml-1">v0.1.0</span></span>
        </div>
        
        <div className="flex space-x-1 h-full pt-1">
          {tabs.map(tab => (
            <button
              key={tab}
              onClick={() => onTabChange(tab)}
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
        <button
          onClick={toggleLearnMode}
          className={cn(
            "flex items-center space-x-2 border px-2 py-1 rounded-sm transition-all",
            learnMode
              ? "border-terminal-accent bg-terminal-accent/15 text-terminal-accent"
              : "border-terminal-border bg-terminal-panel text-terminal-muted hover:text-white"
          )}
          data-testid="button-learn-mode"
        >
          <span className="text-[10px] font-bold tracking-wider">LEARN</span>
          <span className={cn(
            "text-[9px] font-bold px-1 rounded-sm",
            learnMode ? "bg-terminal-accent/30 text-white" : "bg-terminal-border text-white/40"
          )}>
            {learnMode ? "ON" : "OFF"}
          </span>
        </button>

        <div className="flex items-center space-x-2 border border-terminal-border bg-terminal-panel px-2 py-1 rounded-sm">
          <span className="text-terminal-muted">ASSET:</span>
          <span className="text-white font-bold">BTC</span>
        </div>
        
        <div className="flex items-center space-x-2 border border-terminal-border bg-terminal-panel px-2 py-1 rounded-sm">
          <span className="text-terminal-muted">EXPIRY:</span>
          <span className="text-white" data-testid="text-dominant-expiry">{expiryLabel}</span>
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

        {isDesktopBuild && (
          <div className="hidden xl:flex items-center gap-2 border border-terminal-border bg-terminal-panel px-2 py-1 rounded-sm">
            <span className="text-terminal-muted">DESKTOP:</span>
            <span className={desktopStorageOk ? "text-terminal-positive" : "text-amber-400"}>
              {desktopStorageOk ? "STORAGE OK" : "STORAGE CHECK"}
            </span>
            <span className={desktopFeed.connected ? "text-terminal-positive" : "text-amber-400"}>
              {desktopFeed.connected ? "FEED LIVE" : "FEED WAIT"}
            </span>
            <span className="text-slate-400 max-w-[90px] truncate" title={planLabel}>
              {planLabel}
            </span>
          </div>
        )}

        {!saasDisabled && user && (
          <div className="flex items-center gap-3 ml-2 pl-3 border-l border-terminal-border">
            <span className="text-terminal-muted max-w-[140px] truncate" title={user.email}>
              {user.email}
            </span>
            {user.role === "admin" && (
              <Link
                href="/admin"
                className="text-[10px] font-mono text-terminal-accent hover:underline"
              >
                ADMIN
              </Link>
            )}
            <button
              type="button"
              onClick={() => logout()}
              className="text-[10px] font-mono border border-terminal-border px-2 py-0.5 rounded-sm text-terminal-muted hover:text-white"
            >
              LOG OUT
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
