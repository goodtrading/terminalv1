import { LineStyle } from "lightweight-charts";
import { OverlayRenderContext, OverlayEntry, OverlayRenderer } from "../types";

export const renderSweepZones: OverlayRenderer = (context: OverlayRenderContext) => {
  const { positioning, positioning_engines, levels, price, threshold } = context;
  const entries: OverlayEntry[] = [];

  const pushEntry = (p: number, priority: number, label: string, shortLabel: string, color: string, style = LineStyle.Solid, width = 1, isBandFill = false) => {
    if (Math.abs(p - price) > threshold) return;
    entries.push({ price: p, priority, label, shortLabel, color, style, width, axisLabel: !isBandFill, isBandFill });
  };

  const sweepDetector = positioning_engines?.liquiditySweepDetector;
  const sweepActive = sweepDetector && (sweepDetector.sweepRisk === "HIGH" || sweepDetector.sweepRisk === "EXTREME") && sweepDetector.sweepDirection !== "NONE";

  if (!sweepActive) return entries;

  const sweepDirColor = sweepDetector?.sweepDirection === "UP" ? "34, 197, 94" : sweepDetector?.sweepDirection === "DOWN" ? "239, 68, 68" : "168, 85, 247";
  const sweepDirArrow = sweepDetector?.sweepDirection === "UP" ? "↑" : sweepDetector?.sweepDirection === "DOWN" ? "↓" : "↕";
  const sweepType = sweepDetector?.type;
  const typeShort = sweepType === "CONTINUATION" ? "CONT" : sweepType === "FAILED" ? "FAIL" : sweepType === "ABSORPTION" ? "ABS" : sweepType === "EXHAUSTION" ? "EXH" : sweepType === "SETUP_TWO_SIDED" ? "2S" : "";

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

  const extractPriceFromText = (text: string): number | null => {
    if (!text || text === "--") return null;
    const kMatch = text.match(/(\d+\.?\d*)k/i);
    if (kMatch) return parseFloat(kMatch[1]) * 1000;
    const numMatch = text.match(/(\d{4,6}(?:\.\d+)?)/);
    if (numMatch) return parseFloat(numMatch[1]);
    return null;
  };

  const sweepZoneRange = extractRangeFromText(sweepDetector.sweepTargetZone ?? sweepDetector.target);
  if (sweepZoneRange) {
    const bandStep = (sweepZoneRange.end - sweepZoneRange.start) / 6;
    for (let i = 0; i <= 6; i++) {
      const p = sweepZoneRange.start + bandStep * i;
      const isBorder = i === 0 || i === 6;
      const opacity = isBorder ? 0.3 : 0.08;
      pushEntry(p, 2, "", "", `rgba(${sweepDirColor}, ${opacity})`, LineStyle.Solid, 1, true);
    }
    const zoneLabel = typeShort ? `SW ${sweepDirArrow} ${typeShort}` : `SWEEP ${sweepDirArrow}`;
    pushEntry(sweepZoneRange.end, 2, zoneLabel, typeShort || "SW", `rgba(${sweepDirColor}, 0.4)`, LineStyle.Solid, 1);
  }

  const sweptZoneRange = sweepDetector?.sweptZone && sweepDetector.sweptZone !== "--" ? extractRangeFromText(sweepDetector.sweptZone) : null;
  if (sweptZoneRange) {
    const bandStep = (sweptZoneRange.end - sweptZoneRange.start) / 4;
    for (let i = 0; i <= 4; i++) {
      const p = sweptZoneRange.start + bandStep * i;
      const isBorder = i === 0 || i === 4;
      pushEntry(p, 2, "", "", `rgba(251, 191, 36, ${isBorder ? 0.25 : 0.06})`, LineStyle.Dotted, 1, true);
    }
    pushEntry(sweptZoneRange.end, 2, "SWEPT", "SWEPT", "rgba(251, 191, 36, 0.5)", LineStyle.Solid, 1);
  }

  const invalidationPrice = sweepDetector?.invalidation && sweepDetector.invalidation !== "--" ? extractPriceFromText(sweepDetector.invalidation) : null;
  if (invalidationPrice != null && Math.abs(invalidationPrice - price) <= threshold) {
    pushEntry(invalidationPrice, 2, "INV", "INV", `rgba(${sweepDirColor}, 0.35)`, LineStyle.Dotted, 1);
  }

  const knownLevels: number[] = [];
  if (positioning?.dealerPivot) knownLevels.push(positioning.dealerPivot);
  if (positioning?.putWall) knownLevels.push(positioning.putWall);
  if (positioning?.callWall) knownLevels.push(positioning.callWall);
  if (levels?.gammaMagnets) knownLevels.push(...levels.gammaMagnets);
  const heatmapZones = positioning_engines?.liquidityHeatmap?.liquidityHeatZones || [];
  heatmapZones.filter((z: any) => z.intensity >= 0.5).forEach((z: any) => knownLevels.push((z.priceStart + z.priceEnd) / 2));
  const triggerText = (sweepDetector.sweepTrigger ?? sweepDetector?.trigger) || "";
  const triggerPrice = extractPriceFromText(triggerText);
  let bestTrigger: number | null = null;
  if (triggerPrice) {
    let bestDist = Infinity;
    for (const lv of knownLevels) {
      const d = Math.abs(lv - triggerPrice);
      if (d < bestDist) { bestDist = d; bestTrigger = lv; }
    }
    if (bestTrigger && bestDist > price * 0.05) bestTrigger = null;
    if (!bestTrigger && Math.abs(triggerPrice - price) <= threshold) bestTrigger = triggerPrice;
  }
  if (bestTrigger) {
    pushEntry(bestTrigger, 2, "SW TRIG", "SWT", `rgba(${sweepDirColor}, 0.5)`, LineStyle.Dashed, 2);
  }

  return entries;
};
