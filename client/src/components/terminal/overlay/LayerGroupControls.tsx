import { useState } from "react";
import { cn } from "@/lib/utils";
import { LayerGroupState, LayerGroup, LAYER_GROUP_NAMES } from "./layerGroups";

interface LayerGroupControlsProps {
  activeLayers: LayerGroupState;
  onLayerToggle: (layer: LayerGroup) => void;
  /** Called when FIT LEVELS is clicked; provided by MainChart (fitLevels). */
  onFitLevels?: () => void;
  /** Called when RESET is clicked; provided by MainChart (resetScale). */
  onResetChart?: () => void;
  /** Optional test id for the wrapper (e.g. "toggle-map-mode" for MainChart). */
  dataTestId?: string;
}

export function LayerGroupControls({ activeLayers, onLayerToggle, onFitLevels, onResetChart, dataTestId }: LayerGroupControlsProps) {
  return (
    <div className="relative z-30 flex h-8 items-center gap-0.5 px-1.5 py-0.5 bg-black/28 border border-white/[0.06] border-b-0 shrink-0 pointer-events-auto" data-testid={dataTestId ?? "toggle-layer-groups"}>
      {(Object.keys(activeLayers) as LayerGroup[]).map((layer) => (
        <button
          key={layer}
          onClick={() => onLayerToggle(layer)}
          className={cn(
            "h-6 px-2 py-0 text-[9px] leading-none font-semibold font-mono uppercase tracking-wider rounded-[2px] transition-all",
            activeLayers[layer]
              ? "bg-terminal-accent/16 border border-terminal-accent/70 text-white"
              : "border border-transparent text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
          )}
          data-testid={`button-layer-${layer.toLowerCase()}`}
        >
          {LAYER_GROUP_NAMES[layer]}
        </button>
      ))}
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <button data-testid="button-fit-levels" onClick={() => onFitLevels?.()} className="h-5 px-1.5 py-0 text-[8px] leading-none font-bold font-mono border rounded-[2px] uppercase bg-terminal-accent/8 border-terminal-accent/25 text-terminal-accent hover:bg-terminal-accent/16">FIT</button>
        <button data-testid="button-reset-chart" onClick={() => onResetChart?.()} className="h-5 px-1.5 py-0 text-[8px] leading-none font-bold font-mono border rounded-[2px] uppercase bg-terminal-accent/14 border-terminal-accent/55 text-white hover:bg-terminal-accent/28">RESET</button>
      </div>
    </div>
  );
}

export function useLayerGroupState(initialState: Partial<LayerGroupState> = {}) {
  const defaultState: LayerGroupState = {
    levels: true,
    gamma: false,
    cascade: false,
    squeeze: false,
    heatmap: false,
    accel: true,
    absorb: true,
    gravity: false,
    footprint: false,
    ...initialState
  };

  const [activeLayers, setActiveLayers] = useState<LayerGroupState>(defaultState);

  const toggleLayer = (layer: LayerGroup) => {
    setActiveLayers(prev => ({
      ...prev,
      [layer]: !prev[layer]
    }));
  };

  const setLayer = (layer: LayerGroup, enabled: boolean) => {
    setActiveLayers(prev => ({
      ...prev,
      [layer]: enabled
    }));
  };

  const resetLayers = () => {
    setActiveLayers(defaultState);
  };

  return {
    activeLayers,
    toggleLayer,
    setLayer,
    resetLayers
  };
}
