import { LineStyle } from "lightweight-charts";
import { resolveGammaOverlaySelection } from "@/lib/gammaOverlaySelection";
import { OverlayRenderContext, OverlayEntry, OverlayRenderer } from "../types";

export const renderGammaLevels: OverlayRenderer = (context: OverlayRenderContext) => {
  const { market, positioning_engines, price, threshold, options } = context;
  const entries: OverlayEntry[] = [];

  const pushEntry = (p: number, priority: number, label: string, shortLabel: string, color: string, style = LineStyle.Solid, width = 1, isBandFill = false) => {
    if (Math.abs(p - price) > threshold) return;
    entries.push({ price: p, priority, label, shortLabel, color, style, width, axisLabel: !isBandFill, isBandFill });
  };

  const sel = resolveGammaOverlaySelection(market, options);
  if (sel.selectedFlipType === "local" && sel.localFlip != null) {
    pushEntry(sel.localFlip, 1, "LOCAL FLIP", "LFL", "rgba(168, 250, 220, 0.88)", LineStyle.Solid, 2);
    if (sel.localZoneStart && sel.localZoneEnd) {
      pushEntry(sel.localZoneStart, 4, "LOCAL GAMMA ZONE (lo)", "LZL", "rgba(34, 197, 94, 0.35)", LineStyle.Dashed);
      pushEntry(sel.localZoneEnd, 4, "LOCAL GAMMA ZONE (hi)", "LZH", "rgba(34, 197, 94, 0.35)", LineStyle.Dashed);
    }
  } else if (sel.selectedFlipType === "broad" && sel.broadFlip != null) {
    pushEntry(sel.broadFlip, 1, "BROAD FLIP", "BFL", "rgba(250, 240, 180, 0.85)", LineStyle.Solid, 2);
    if (sel.broadZoneStart && sel.broadZoneEnd) {
      pushEntry(sel.broadZoneStart, 4, "TR LO", "TL", "rgba(234, 179, 8, 0.25)", LineStyle.Dashed);
      pushEntry(sel.broadZoneEnd, 4, "TR HI", "TH", "rgba(234, 179, 8, 0.25)", LineStyle.Dashed);
    }
  }

  {
    const op = sel.selectedFlipForChart;
    if (sel.globalFlip != null) {
      const dup =
        op != null && Math.abs(sel.globalFlip - op) / Math.max(sel.globalFlip, op, 1) < 1e-5;
      if (!dup) {
        pushEntry(sel.globalFlip, 2, "GLOBAL FLIP", "GFG", "rgba(196, 181, 253, 0.82)", LineStyle.Solid, 2);
      }
    }
  }

  // Gamma Cliffs (lower priority)
  const gammaCliffs = positioning_engines?.gammaCurveEngine?.gammaCliffs;
  if (gammaCliffs && Array.isArray(gammaCliffs)) {
    const fmtK = (p: number) => p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k" : String(p);
    const above = gammaCliffs.filter((c: any) => c.strike > price).sort((a: any, b: any) => Math.abs(b.strength) - Math.abs(a.strength)).slice(0, 3);
    const below = gammaCliffs.filter((c: any) => c.strike < price).sort((a: any, b: any) => Math.abs(b.strength) - Math.abs(a.strength)).slice(0, 3);
    const maxAbove = Math.max(...above.map((c: any) => Math.abs(c.strength)), 1);
    const maxBelow = Math.max(...below.map((c: any) => Math.abs(c.strength)), 1);
    
    above.forEach((cliff: { strike: number; strength: number }, i: number) => {
      const isStrongest = i === 0;
      const ratio = Math.abs(cliff.strength) / maxAbove;
      const opacity = isStrongest ? 0.7 : ratio > 0.5 ? 0.45 : 0.25;
      pushEntry(cliff.strike, isStrongest ? 3 : 4, `↑${fmtK(cliff.strike)}`, "↑", `rgba(249, 115, 22, ${opacity})`, LineStyle.Dotted, isStrongest ? 2 : 1);
    });
    
    below.forEach((cliff: { strike: number; strength: number }, i: number) => {
      const isStrongest = i === 0;
      const ratio = Math.abs(cliff.strength) / maxBelow;
      const opacity = isStrongest ? 0.7 : ratio > 0.5 ? 0.45 : 0.25;
      pushEntry(cliff.strike, isStrongest ? 3 : 4, `↓${fmtK(cliff.strike)}`, "↓", `rgba(56, 189, 248, ${opacity})`, LineStyle.Dotted, isStrongest ? 2 : 1);
    });
  }

  // Deduplicate entries by price
  console.debug('[Gamma Debug] Total entries before dedup:', entries.length);
  
  const deduplicatedEntries: OverlayEntry[] = [];
  const priceMap = new Map<string, OverlayEntry>();
  
  for (const entry of entries) {
    const priceKey = entry.price.toFixed(2);
    const existing = priceMap.get(priceKey);
    
    // Keep the entry with higher priority (lower number = higher priority)
    if (!existing || entry.priority < existing.priority) {
      priceMap.set(priceKey, entry);
    }
  }
  
  // Convert back to array and sort by price (high to low)
  deduplicatedEntries.push(...Array.from(priceMap.values()));
  deduplicatedEntries.sort((a, b) => b.price - a.price);
  
  const removedCount = entries.length - deduplicatedEntries.length;
  console.debug('[Gamma Debug] Total entries after dedup:', deduplicatedEntries.length);
  console.debug('[Gamma Debug] Removed', removedCount, 'duplicate entries');
  
  if (removedCount > 0) {
    const duplicatePrices = Array.from(priceMap.values()).map(e => e.price.toFixed(2));
    console.debug('[Gamma Debug] Final unique prices:', duplicatePrices);
  }

  return deduplicatedEntries;
};
