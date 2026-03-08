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
    const triggerPrice = extractPriceFromText(cascade.cascadeTrigger);
    console.debug('[Cascade Renderer] Extracted trigger price:', triggerPrice, 'from:', cascade.cascadeTrigger);
    
    if (triggerPrice) {
      pushEntry(triggerPrice, 1, "CASCADE", "CSC", "rgba(239, 68, 68, 0.7)");
      console.debug('[Cascade Renderer] Added cascade trigger line at price:', triggerPrice);
    }
    
    const pocketPrices = extractRangeFromText(cascade.liquidationPocket);
    console.debug('[Cascade Renderer] Extracted pocket prices:', pocketPrices, 'from:', cascade.liquidationPocket);
    
    if (pocketPrices) {
      pushEntry(pocketPrices.start, 3, "LIQ LO", "LL", "rgba(239, 68, 68, 0.3)", LineStyle.Dashed);
      pushEntry(pocketPrices.end, 3, "LIQ HI", "LH", "rgba(239, 68, 68, 0.3)", LineStyle.Dashed);
      console.debug('[Cascade Renderer] Added liquidation pocket lines:', pocketPrices);
    }
  } else {
    console.debug('[Cascade Renderer] No cascade data available');
  }

  console.debug('[Cascade Renderer] Final entries count:', entries.length);
  return entries;
};
