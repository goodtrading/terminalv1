import { LineStyle } from "lightweight-charts";
import { OverlayRenderContext, OverlayEntry, OverlayRenderer } from "../types";

export const renderLiquidityLevels: OverlayRenderer = (context: OverlayRenderContext) => {
  const { positioning, levels, price, threshold } = context;
  const entries: OverlayEntry[] = [];

  const pushEntry = (p: number, priority: number, label: string, shortLabel: string, color: string, style = LineStyle.Solid, width = 1, isBandFill = false) => {
    if (Math.abs(p - price) > threshold) return;
    entries.push({ price: p, priority, label, shortLabel, color, style, width, axisLabel: !isBandFill, isBandFill });
  };

  // Call Wall and Put Wall
  if (positioning?.callWall) {
    pushEntry(positioning.callWall, 1, "CALL WALL", "CW", "rgba(239, 68, 68, 0.6)", LineStyle.Solid, 2);
  }
  if (positioning?.putWall) {
    pushEntry(positioning.putWall, 1, "PUT WALL", "PW", "rgba(34, 197, 94, 0.6)", LineStyle.Solid, 2);
  }

  // Gamma Magnets
  if (levels?.gammaMagnets) {
    const fmtK = (p: number) => p >= 1000 ? (p / 1000).toFixed(p % 1000 === 0 ? 0 : 1) + "k" : String(p);
    levels.gammaMagnets.forEach((m: number, i: number) => {
      pushEntry(m, 3, `MAG ${fmtK(m)}`, "M", "rgba(59, 130, 246, 0.4)", LineStyle.Dashed);
    });
  }

  // Dealer Pivot
  if (positioning?.dealerPivot) {
    pushEntry(positioning.dealerPivot, 2, "PIVOT", "PV", "rgba(255, 255, 255, 0.3)", LineStyle.Dashed);
  }

  return entries;
};
