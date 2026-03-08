import { useState } from "react";
import { cn } from "@/lib/utils";
import { OverlayConfig, TabOverlayConfig } from "./types";

interface OverlayToggleProps {
  tabConfig: TabOverlayConfig;
  onOverlayToggle: (overlayId: string, enabled: boolean) => void;
}

export function OverlayToggle({ tabConfig, onOverlayToggle }: OverlayToggleProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-terminal-panel border border-terminal-border border-b-0 shrink-0">
      <span className="text-[8px] font-mono text-white/50 uppercase tracking-wider mr-2">Overlays:</span>
      {tabConfig.overlays.map((overlay) => (
        <button
          key={overlay.id}
          onClick={() => onOverlayToggle(overlay.id, !overlay.enabled)}
          className={cn(
            "px-2 py-0.5 text-[8px] font-bold font-mono uppercase tracking-wider rounded-sm transition-all border",
            overlay.enabled
              ? "bg-terminal-accent/20 border-terminal-accent text-white"
              : "border border-terminal-border/30 text-white/30 hover:text-white/50 hover:bg-white/[0.02]"
          )}
          title={overlay.name}
        >
          {overlay.shortLabel}
        </button>
      ))}
    </div>
  );
}

export function useOverlayState(initialTabs: TabOverlayConfig[]) {
  const [tabs, setTabs] = useState<TabOverlayConfig[]>(initialTabs);
  const [activeTab, setActiveTab] = useState<string>(initialTabs[0]?.tabId || '');

  const toggleOverlay = (overlayId: string, enabled: boolean) => {
    setTabs(prevTabs =>
      prevTabs.map(tab =>
        tab.tabId === activeTab
          ? {
              ...tab,
              overlays: tab.overlays.map(overlay =>
                overlay.id === overlayId ? { ...overlay, enabled } : overlay
              )
            }
          : tab
      )
    );
  };

  const setTab = (tabId: string) => {
    setActiveTab(tabId);
  };

  const getCurrentTabConfig = () => {
    return tabs.find(tab => tab.tabId === activeTab);
  };

  const getEnabledOverlays = () => {
    const currentTab = getCurrentTabConfig();
    return currentTab?.overlays.filter(overlay => overlay.enabled) || [];
  };

  return {
    tabs,
    activeTab,
    toggleOverlay,
    setTab,
    getCurrentTabConfig,
    getEnabledOverlays
  };
}
