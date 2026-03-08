import { LineStyle } from "lightweight-charts";
import { OverlayRenderContext, OverlayEntry, OverlayRenderer } from "../types";

export const renderVacuumZones: OverlayRenderer = (context: OverlayRenderContext) => {
  const { positioning_engines, price, threshold } = context;
  const entries: OverlayEntry[] = [];

  const pushEntry = (p: number, priority: number, label: string, shortLabel: string, color: string, style = LineStyle.Solid, width = 1, isBandFill = false) => {
    if (Math.abs(p - price) > threshold) return;
    entries.push({ price: p, priority, label, shortLabel, color, style, width, axisLabel: !isBandFill, isBandFill });
  };

  const vacuumState = positioning_engines?.liquidityHeatmap?.liquidityVacuum;

  // Thin Liquidity Zone
  if (vacuumState?.nearestThinLiquidityZone && (vacuumState.predictiveRisk === "HIGH" || vacuumState.predictiveRisk === "IMMINENT")) {
    const thinPrice = vacuumState.nearestThinLiquidityZone;
    if (Math.abs(thinPrice - price) <= threshold) {
      const thinDir = vacuumState.nearestThinLiquidityDirection === "UP" ? "↑" : "↓";
      const thinOpacity = vacuumState.predictiveRisk === "IMMINENT" ? 0.3 : 0.2;
      const bandHalf = price * 0.002;
      pushEntry(thinPrice - bandHalf, 5, "", "", `rgba(59, 130, 246, ${thinOpacity * 0.4})`, LineStyle.Dashed, 1, true);
      pushEntry(thinPrice, 5, `THIN LIQ ${thinDir}`, "THIN", `rgba(59, 130, 246, ${thinOpacity})`, LineStyle.Dashed, 1);
      pushEntry(thinPrice + bandHalf, 5, "", "", `rgba(59, 130, 246, ${thinOpacity * 0.4})`, LineStyle.Dashed, 1, true);
    }
  }

  // Active Vacuum Zones
  if (vacuumState?.activeZones?.length > 0) {
    const maxZones = 3;
    const sortedZones = [...vacuumState.activeZones]
      .sort((a: any, b: any) => b.strength - a.strength)
      .slice(0, maxZones);
    
    sortedZones.forEach((zone: any) => {
      if (Math.abs(zone.priceStart - price) > threshold && Math.abs(zone.priceEnd - price) > threshold) return;
      const bandLines = 5;
      const bandStep = (zone.priceEnd - zone.priceStart) / bandLines;
      for (let i = 0; i <= bandLines; i++) {
        const p = zone.priceStart + bandStep * i;
        const isBorder = i === 0 || i === bandLines;
        const opacity = isBorder ? 0.3 : 0.15;
        pushEntry(p, 3, "", "", `rgba(59, 130, 246, ${opacity})`, LineStyle.Solid, 1, true);
      }
      const dirArrow = zone.direction === "UP" ? "↑" : "↓";
      const labelOpacity = Math.min(0.65, 0.35 + zone.strength * 0.3);
      pushEntry(zone.direction === "UP" ? zone.priceEnd : zone.priceStart, 3, `VACUUM ${dirArrow}`, "VAC", `rgba(59, 130, 246, ${labelOpacity.toFixed(2)})`, LineStyle.Solid, 1);
    });
  }

  return entries;
};
