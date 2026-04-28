import { LineStyle } from "lightweight-charts";
import { OverlayRenderContext, OverlayEntry, OverlayRenderer } from "../types";

export const renderSqueezeLevels: OverlayRenderer = (context: OverlayRenderContext) => {
  console.debug('[Squeeze Renderer] Called with context:', {
    hasPositioningEngines: !!context.positioning_engines,
    squeezeEngine: context.positioning_engines?.squeezeProbabilityEngine,
    price: context.price,
    threshold: context.threshold
  });

  const { positioning_engines, price, threshold } = context;
  const entries: OverlayEntry[] = [];

  const pushEntry = (p: number, priority: number, label: string, shortLabel: string, color: string, style = LineStyle.Solid, width = 1, isBandFill = false) => {
    if (Math.abs(p - price) > threshold) return;
    entries.push({ price: p, priority, label, shortLabel, color, style, width, axisLabel: !isBandFill, isBandFill });
  };

  const extractPriceFromText = (text: string): number | null => {
    if (!text || text === "--") return null;
    const kMatch = text.match(/(\d+\.?\d*)k/i);
    if (kMatch) return parseFloat(kMatch[1]) * 1000;
    const numMatch = text.match(/(\d{4,6}(?:\.\d+)?)/);
    if (numMatch) return parseFloat(numMatch[1]);
    return null;
  };

  const squeeze = positioning_engines?.squeezeProbabilityEngine;
  console.debug('[Squeeze Renderer] Squeeze data:', squeeze);
  
  if (squeeze) {
    // Handle confirmed trigger
    const triggerPrice = extractPriceFromText(squeeze.squeezeTrigger);
    console.debug('[Squeeze Renderer] Extracted trigger price:', triggerPrice, 'from:', squeeze.squeezeTrigger);
    
    if (triggerPrice && squeeze.squeezeState === "CONFIRMED") {
      pushEntry(triggerPrice, 1, "SQ TRIGGER", "SQT", "rgba(168, 85, 247, 0.7)");
      console.debug('[Squeeze Renderer] Added confirmed squeeze trigger line at price:', triggerPrice);
    }
    
    // Handle target for confirmed or potential states
    const targetPrice = extractPriceFromText(squeeze.squeezeTarget);
    console.debug('[Squeeze Renderer] Extracted target price:', targetPrice, 'from:', squeeze.squeezeTarget);
    
    if (targetPrice && (squeeze.squeezeState === "CONFIRMED" || squeeze.squeezeState === "POTENTIAL")) {
      pushEntry(targetPrice, 2, "SQ TARGET", "SQG", "rgba(168, 85, 247, 0.4)", LineStyle.Dashed);
      console.debug('[Squeeze Renderer] Added squeeze target line at price:', targetPrice);
    }
    
    // Handle intermediate states
    if (squeeze.squeezeState && squeeze.squeezeState !== "INACTIVE" && squeeze.squeezeState !== "CONFIRMED") {
      const stateColor = squeeze.squeezeState === "WATCH" ? "rgba(59, 130, 246, 0.4)" :
                        squeeze.squeezeState === "BUILDING" ? "rgba(251, 191, 36, 0.5)" :
                        squeeze.squeezeState === "POTENTIAL" ? "rgba(251, 146, 60, 0.6)" :
                        squeeze.squeezeState === "LOW_QUALITY_SETUP" ? "rgba(107, 114, 128, 0.3)" : "rgba(107, 114, 128, 0.3)";
      
      const stateLabel = squeeze.squeezeState === "WATCH" ? "SQUEEZE WATCH" :
                        squeeze.squeezeState === "BUILDING" ? "SQUEEZE BUILDING" :
                        squeeze.squeezeState === "POTENTIAL" ? "SQUEEZE POTENTIAL" :
                        squeeze.squeezeState === "LOW_QUALITY_SETUP" ? "SQUEEZE WEAK" : "SQUEEZE";
      
      const shortLabel = squeeze.squeezeState === "WATCH" ? "SW" :
                        squeeze.squeezeState === "BUILDING" ? "SB" :
                        squeeze.squeezeState === "POTENTIAL" ? "SP" :
                        squeeze.squeezeState === "LOW_QUALITY_SETUP" ? "S?" : "S";
      
      // Show watch level if available
      if (squeeze.squeezeWatchLevel) {
        pushEntry(squeeze.squeezeWatchLevel, 2, stateLabel, shortLabel, stateColor, LineStyle.Dotted, 2);
        console.debug('[Squeeze Renderer] Added squeeze watch level at price:', squeeze.squeezeWatchLevel, 'state:', squeeze.squeezeState);
      }
      
      // Show bias indicator
      if (squeeze.squeezeBias && squeeze.squeezeBias !== "NEUTRAL") {
        const biasLabel = `${stateLabel} ${squeeze.squeezeBias}`;
        const biasShort = `${shortLabel}${squeeze.squeezeBias === "UP" ? "U" : "D"}`;
        const biasColor = squeeze.squeezeBias === "UP" ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.4)";
        
        if (squeeze.squeezeWatchLevel) {
          pushEntry(squeeze.squeezeWatchLevel, 2, biasLabel, biasShort, biasColor, LineStyle.Dotted, 1);
        }
      }
      
      // Show probability indicator for building/potential states
      if (squeeze.squeezeProbability && (squeeze.squeezeState === "BUILDING" || squeeze.squeezeState === "POTENTIAL")) {
        const probLabel = `${stateLabel} ${squeeze.squeezeProbability}%`;
        const probShort = `${shortLabel}${squeeze.squeezeProbability}`;
        
        if (squeeze.squeezeWatchLevel) {
          pushEntry(squeeze.squeezeWatchLevel, 2, probLabel, probShort, stateColor, LineStyle.Dotted, 1);
        }
      }
    }
  } else {
    console.debug('[Squeeze Renderer] No squeeze data available');
  }

  console.debug('[Squeeze Renderer] Final entries count:', entries.length);
  return entries;
};
