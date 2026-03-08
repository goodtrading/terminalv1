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
    const triggerPrice = extractPriceFromText(squeeze.squeezeTrigger);
    console.debug('[Squeeze Renderer] Extracted trigger price:', triggerPrice, 'from:', squeeze.squeezeTrigger);
    
    if (triggerPrice) {
      pushEntry(triggerPrice, 1, "SQ TRIGGER", "SQT", "rgba(168, 85, 247, 0.7)");
      console.debug('[Squeeze Renderer] Added squeeze trigger line at price:', triggerPrice);
    }
    
    const targetPrice = extractPriceFromText(squeeze.squeezeTarget);
    console.debug('[Squeeze Renderer] Extracted target price:', targetPrice, 'from:', squeeze.squeezeTarget);
    
    if (targetPrice) {
      pushEntry(targetPrice, 2, "SQ TARGET", "SQG", "rgba(168, 85, 247, 0.4)", LineStyle.Dashed);
      console.debug('[Squeeze Renderer] Added squeeze target line at price:', targetPrice);
    }
  } else {
    console.debug('[Squeeze Renderer] No squeeze data available');
  }

  console.debug('[Squeeze Renderer] Final entries count:', entries.length);
  return entries;
};
