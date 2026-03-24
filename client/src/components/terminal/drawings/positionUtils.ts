import type { Drawing } from "./types";

export type PositionKind = "longPosition" | "shortPosition";

export interface PositionMetrics {
  entry: number;
  stop: number;
  target: number;
  riskDistance: number;
  rewardDistance: number;
  riskPercent: number;
  rewardPercent: number;
  rr: number;
}

export function isPositionDrawing(d: Drawing | null | undefined): d is Drawing & { tool: PositionKind } {
  return d?.tool === "longPosition" || d?.tool === "shortPosition";
}

export function getPositionMetrics(d: Drawing): PositionMetrics | null {
  if (!isPositionDrawing(d)) return null;
  const entry = d.entryPrice ?? d.points[0]?.price;
  if (entry == null) return null;
  const stop = d.stopPrice ?? entry;
  const target = d.targetPrice ?? entry;
  const absEntry = Math.max(Math.abs(entry), 1e-9);
  const riskDistance = d.tool === "longPosition" ? entry - stop : stop - entry;
  const rewardDistance = d.tool === "longPosition" ? target - entry : entry - target;
  const risk = Math.max(riskDistance, 0);
  const reward = Math.max(rewardDistance, 0);
  const riskPercent = (risk / absEntry) * 100;
  const rewardPercent = (reward / absEntry) * 100;
  const rr = risk > 0 ? reward / risk : 0;
  return { entry, stop, target, riskDistance: risk, rewardDistance: reward, riskPercent, rewardPercent, rr };
}

export function nextPositionLevels(
  tool: PositionKind,
  entry: number,
  cursorPrice: number
): { targetPrice: number; stopPrice: number } {
  const absEntry = Math.max(Math.abs(entry), 1e-9);
  // Default institutional-safe initial structure: 0.2% from entry.
  const minOffset = absEntry * 0.002;
  const dragDistance = Math.abs(cursorPrice - entry);
  const offset = Math.max(dragDistance, minOffset);

  if (tool === "longPosition") {
    return {
      targetPrice: entry + offset,
      stopPrice: entry - offset,
    };
  }
  return {
    stopPrice: entry + offset,
    targetPrice: entry - offset,
  };
}

