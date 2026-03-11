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
    <div className="flex items-center gap-1 px-2 py-1 bg-terminal-panel border border-terminal-border border-b-0 shrink-0" data-testid={dataTestId ?? "toggle-layer-groups"}>
      {(Object.keys(activeLayers) as LayerGroup[]).map((layer) => (
        <button
          key={layer}
          onClick={() => onLayerToggle(layer)}
          className={cn(
            "px-3 py-1 text-[10px] font-bold font-mono uppercase tracking-wider rounded-sm transition-all",
            activeLayers[layer]
              ? "bg-terminal-accent/20 border border-terminal-accent text-white"
              : "border border-transparent text-white/40 hover:text-white/60 hover:bg-white/[0.03]"
          )}
          data-testid={`button-layer-${layer.toLowerCase()}`}
        >
          {LAYER_GROUP_NAMES[layer]}
        </button>
      ))}
      <div className="flex-1" />
      <div className="flex items-center gap-1">
        <button data-testid="button-fit-levels" onClick={() => onFitLevels?.()} className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-accent/10 border-terminal-accent/30 text-terminal-accent hover:bg-terminal-accent/20">FIT LEVELS</button>
        <button data-testid="button-reset-chart" onClick={() => onResetChart?.()} className="px-1.5 py-0.5 text-[8px] font-bold font-mono border rounded-sm uppercase bg-terminal-accent/20 border-terminal-accent text-white hover:bg-terminal-accent/40">RESET</button>
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
