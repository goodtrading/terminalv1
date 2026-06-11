import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useTerminalState } from "@/hooks/useTerminalState";
import { getDesktopStoragePaths, isDesktopBuild } from "@/lib/desktopStorage";
import { useDesktopFeedDiagnostics } from "@/lib/desktopDiagnostics";
import { useDesktopUpdateCheck } from "@/hooks/useDesktopUpdateCheck";
import { isDesktopApp } from "@/lib/desktopRuntime";
import { CompactStatusPill } from "./CompactStatusPill";
import { TopNavUserMenu } from "./TopNavUserMenu";
import type { HealthTone } from "./health/healthUi";

interface TopNavProps {
  activeTab: string;
  onTabChange: (tab: string) => void;
}

function ContextChip({ label, value, testId }: { label: string; value: string; testId?: string }) {
  return (
    <div className="inline-flex items-center gap-1.5 rounded-sm border border-terminal-border/70 bg-terminal-panel/50 px-2 py-0.5 text-[10px] font-mono">
      <span className="text-terminal-muted uppercase tracking-wide">{label}</span>
      <span className="text-white font-semibold" data-testid={testId}>
        {value}
      </span>
    </div>
  );
}

export function TopNav({ activeTab, onTabChange }: TopNavProps) {
  const { data: terminalState } = useTerminalState();
  const desktopFeed = useDesktopFeedDiagnostics();
  const desktopUpdate = useDesktopUpdateCheck();
  const [desktopStorageOk, setDesktopStorageOk] = useState<boolean | null>(null);

  const tabs = ["TERMINAL", "OPTIONS", "FLOWS", "VOLATILITY", "REPORTS"];
  const dominantExpiry = (terminalState?.positioning as any)?.dominantExpiry || null;
  const expiryLabel = dominantExpiry || "N/A";

  const updateAvailable =
    desktopUpdate.update.updateStatus === "optional_update" ||
    desktopUpdate.update.updateStatus === "required_update";

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

  const desktopTone: HealthTone =
    desktopStorageOk == null ? "warn" : desktopStorageOk ? "ok" : "error";
  const storageTone: HealthTone =
    desktopStorageOk == null ? "warn" : desktopStorageOk ? "ok" : "error";
  const feedTone: HealthTone = desktopFeed.connected ? "ok" : "warn";

  return (
    <header className="shrink-0 w-full z-10 relative bg-terminal-bg border-b border-terminal-border">
      <div className="flex h-10 items-center justify-between px-4">
        <div className="flex items-center min-w-0">
          <div className="flex items-center mr-6 shrink-0">
            <img
              src="/logo.png"
              alt="GoodTrading logo"
              className="h-5 w-auto object-contain mr-2 opacity-95"
            />
            <span className="font-bold text-white tracking-widest text-sm">GOODTRADING</span>
          </div>

          <nav className="flex items-center gap-0.5 min-w-0 overflow-x-auto">
            {tabs.map((tab) => (
              <button
                key={tab}
                onClick={() => onTabChange(tab)}
                className={cn(
                  "px-3 py-2 text-[11px] font-medium tracking-wide border-b-2 transition-colors whitespace-nowrap",
                  activeTab === tab
                    ? "border-terminal-accent text-white"
                    : "border-transparent text-terminal-muted hover:text-white",
                )}
              >
                {tab}
              </button>
            ))}
          </nav>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          {isDesktopApp() && updateAvailable && (
            <button
              type="button"
              onClick={() => desktopUpdate.showOptionalModal()}
              className="inline-flex items-center gap-1.5 rounded-full border border-amber-500/40 bg-amber-500/10 px-2 py-0.5 text-[10px] font-mono uppercase tracking-wide text-amber-300 hover:bg-amber-500/20 transition-colors"
              title={
                desktopUpdate.update.latestVersion
                  ? `Update v${desktopUpdate.update.latestVersion} available`
                  : "Update available"
              }
            >
              <span className="h-1.5 w-1.5 rounded-full bg-amber-400 animate-pulse" />
              Update
            </button>
          )}
          <TopNavUserMenu />
        </div>
      </div>

      <div className="flex h-8 items-center justify-between px-4 border-t border-terminal-border/60 bg-terminal-panel/20 text-xs font-mono">
        <div className="flex items-center gap-2 min-w-0 overflow-x-auto">
          <ContextChip label="Asset" value="BTC" />
          <ContextChip label="Expiry" value={expiryLabel} testId="text-dominant-expiry" />
          <ContextChip label="TF" value="15M" />
          <ContextChip label="Feed" value="DERIBIT" />
        </div>

        <div className="flex items-center gap-2 shrink-0 ml-3">
          <div className="inline-flex items-center gap-1.5 text-[10px] uppercase tracking-widest text-terminal-positive">
            <span className="h-1.5 w-1.5 rounded-full bg-terminal-positive animate-pulse" />
            Live
          </div>

          {isDesktopBuild && (
            <div className="hidden sm:flex items-center gap-1.5 pl-2 border-l border-terminal-border/60">
              <CompactStatusPill
                label="Desktop"
                tone={desktopTone}
                title={
                  desktopStorageOk == null
                    ? "Checking desktop runtime"
                    : desktopStorageOk
                      ? "Desktop runtime ready"
                      : "Desktop runtime issue"
                }
              />
              <CompactStatusPill
                label="Storage"
                tone={storageTone}
                title={
                  desktopStorageOk == null
                    ? "Checking storage paths"
                    : desktopStorageOk
                      ? "Tauri storage OK"
                      : "Storage check failed"
                }
              />
              <CompactStatusPill
                label="Feed"
                tone={feedTone}
                title={desktopFeed.connected ? "Feed connected" : "Waiting for feed"}
              />
            </div>
          )}
        </div>
      </div>
    </header>
  );
}
