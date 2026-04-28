import { LineStyle } from "lightweight-charts";
import { OverlayRenderContext, OverlayEntry, OverlayRenderer } from "../types";

export const renderCascadeLevels: OverlayRenderer = (context: OverlayRenderContext) => {
  console.debug('[Cascade Renderer] Called with context:', {
    hasPositioningEngines: !!context.positioning_engines,
    cascadeEngine: context.positioning_engines?.liquidityCascadeEngine,
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

  const extractRangeFromText = (text: string): { start: number; end: number } | null => {
    if (!text || text === "--") return null;
    const kMatches = Array.from(text.matchAll(/(\d+\.?\d*)k/gi));
    if (kMatches.length >= 2) {
      return { start: parseFloat(kMatches[0][1]) * 1000, end: parseFloat(kMatches[1][1]) * 1000 };
    }
    const numMatches = Array.from(text.matchAll(/(\d{4,6}(?:\.\d+)?)/g));
    if (numMatches.length >= 2) {
      return { start: parseFloat(numMatches[0][1]), end: parseFloat(numMatches[1][1]) };
    }
    return null;
  };

  const cascade = positioning_engines?.liquidityCascadeEngine;
  console.debug('[Cascade Renderer] Cascade data:', cascade);
  
  if (cascade) {
    // Handle confirmed trigger
    const triggerPrice = extractPriceFromText(cascade.cascadeTrigger);
    console.debug('[Cascade Renderer] Extracted trigger price:', triggerPrice, 'from:', cascade.cascadeTrigger);
    
    if (triggerPrice && cascade.cascadeState === "CONFIRMED") {
      pushEntry(triggerPrice, 1, "CASCADE", "CSC", "rgba(239, 68, 68, 0.7)");
      console.debug('[Cascade Renderer] Added confirmed cascade trigger line at price:', triggerPrice);
    }
    
    // Handle liquidation pocket
    const pocketPrices = extractRangeFromText(cascade.liquidationPocket);
    console.debug('[Cascade Renderer] Extracted pocket prices:', pocketPrices, 'from:', cascade.liquidationPocket);
    
    if (pocketPrices) {
      pushEntry(pocketPrices.start, 3, "LIQ LO", "LL", "rgba(239, 68, 68, 0.3)", LineStyle.Dashed);
      pushEntry(pocketPrices.end, 3, "LIQ HI", "LH", "rgba(239, 68, 68, 0.3)", LineStyle.Dashed);
      console.debug('[Cascade Renderer] Added liquidation pocket lines:', pocketPrices);
    }
    
    // Handle intermediate states
    if (cascade.cascadeState && cascade.cascadeState !== "INACTIVE" && cascade.cascadeState !== "CONFIRMED") {
      const stateColor = cascade.cascadeState === "WATCH" ? "rgba(59, 130, 246, 0.4)" :
                        cascade.cascadeState === "BUILDING" ? "rgba(251, 191, 36, 0.5)" :
                        cascade.cascadeState === "POTENTIAL" ? "rgba(251, 146, 60, 0.6)" :
                        cascade.cascadeState === "LOW_QUALITY_SETUP" ? "rgba(107, 114, 128, 0.3)" : "rgba(107, 114, 128, 0.3)";
      
      const stateLabel = cascade.cascadeState === "WATCH" ? "CASCADE WATCH" :
                        cascade.cascadeState === "BUILDING" ? "CASCADE BUILDING" :
                        cascade.cascadeState === "POTENTIAL" ? "CASCADE POTENTIAL" :
                        cascade.cascadeState === "LOW_QUALITY_SETUP" ? "CASCADE WEAK" : "CASCADE";
      
      const shortLabel = cascade.cascadeState === "WATCH" ? "CW" :
                        cascade.cascadeState === "BUILDING" ? "CB" :
                        cascade.cascadeState === "POTENTIAL" ? "CP" :
                        cascade.cascadeState === "LOW_QUALITY_SETUP" ? "C?" : "C";
      
      // Show watch level if available
      if (cascade.cascadeWatchLevel) {
        pushEntry(cascade.cascadeWatchLevel, 2, stateLabel, shortLabel, stateColor, LineStyle.Dotted, 2);
        console.debug('[Cascade Renderer] Added cascade watch level at price:', cascade.cascadeWatchLevel, 'state:', cascade.cascadeState);
      }
      
      // Show bias indicator
      if (cascade.cascadeBias && cascade.cascadeBias !== "NEUTRAL") {
        const biasLabel = `${stateLabel} ${cascade.cascadeBias}`;
        const biasShort = `${shortLabel}${cascade.cascadeBias === "UP" ? "U" : "D"}`;
        const biasColor = cascade.cascadeBias === "UP" ? "rgba(239, 68, 68, 0.4)" : "rgba(34, 197, 94, 0.4)";
        
        if (cascade.cascadeWatchLevel) {
          pushEntry(cascade.cascadeWatchLevel, 2, biasLabel, biasShort, biasColor, LineStyle.Dotted, 1);
        }
      }
    }
  } else {
    console.debug('[Cascade Renderer] No cascade data available');
  }

  console.debug('[Cascade Renderer] Final entries count:', entries.length);
  return entries;
};
