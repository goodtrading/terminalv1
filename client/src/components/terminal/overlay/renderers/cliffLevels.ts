import { LineStyle } from "lightweight-charts";
import { OverlayRenderContext, OverlayEntry, OverlayRenderer } from "../types";

export const renderCliffLevels: OverlayRenderer = (context: OverlayRenderContext) => {
  const { positioning_engines, price, threshold } = context;
  const entries: OverlayEntry[] = [];

  const pushEntry = (p: number, priority: number, label: string, shortLabel: string, color: string, style = LineStyle.Solid, width = 1, isBandFill = false) => {
    if (Math.abs(p - price) > threshold) return;
    entries.push({ price: p, priority, label, shortLabel, color, style, width, axisLabel: !isBandFill, isBandFill });
  };

  // Gamma Cliffs (same as gammaLevels but focused only on cliffs)
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

  return entries;
};
