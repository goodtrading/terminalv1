import { useState } from "react";
import { cn } from "@/lib/utils";
import { OverlayState, OverlayType, OVERLAY_NAMES, OVERLAY_SHORT_LABELS } from "./overlayState";

interface OverlayControlsProps {
  activeOverlays: OverlayState;
  onOverlayToggle: (overlay: OverlayType) => void;
}

export function OverlayControls({ activeOverlays, onOverlayToggle }: OverlayControlsProps) {
  return (
    <div className="flex items-center gap-1 px-2 py-1 bg-terminal-panel border border-terminal-border border-b-0 shrink-0">
      <span className="text-[8px] font-mono text-white/50 uppercase tracking-wider mr-2">Overlays:</span>
      {(Object.keys(activeOverlays) as OverlayType[]).map((overlay) => (
        <button
          key={overlay}
          onClick={() => onOverlayToggle(overlay)}
          className={cn(
            "px-2 py-0.5 text-[8px] font-bold font-mono uppercase tracking-wider rounded-sm transition-all border",
            activeOverlays[overlay]
              ? "bg-terminal-accent/20 border-terminal-accent text-white"
              : "border border-terminal-border/30 text-white/30 hover:text-white/50 hover:bg-white/[0.02]"
          )}
          title={OVERLAY_NAMES[overlay]}
        >
          {OVERLAY_SHORT_LABELS[overlay]}
        </button>
      ))}
    </div>
  );
}

export function useOverlayState(initialState: Partial<OverlayState> = {}) {
  const defaultState: OverlayState = {
    gammaLevels: true,
    liquidityLevels: true,
    sweepLevels: false,
    cliffLevels: false,
    heatmap: false,
    ...initialState
  };

  const [activeOverlays, setActiveOverlays] = useState<OverlayState>(defaultState);

  const toggleOverlay = (overlay: OverlayType) => {
    setActiveOverlays(prev => ({
      ...prev,
      [overlay]: !prev[overlay]
    }));
  };

  const setOverlay = (overlay: OverlayType, enabled: boolean) => {
    setActiveOverlays(prev => ({
      ...prev,
      [overlay]: enabled
    }));
  };

  const resetOverlays = () => {
    setActiveOverlays(defaultState);
  };

  return {
    activeOverlays,
    toggleOverlay,
    setOverlay,
    resetOverlays
  };
}
