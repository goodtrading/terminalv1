import { OverlayRenderContext, OverlayRenderer } from "../types";
import {
  extractMajorWallsFromOrderBook,
  type MajorWallLevel,
} from "@/lib/heatmapWallConfig";

export interface HeatmapFrame {
  timestamp: number;
  bids: { price: number; size: number }[];
  asks: { price: number; size: number }[];
}

export interface HeatmapConfig {
  maxFrames: number;
  opacityDecay: number;
  sizeThresholds: {
    small: number;
    medium: number;
    large: number;
  };
}

export const renderHeatmap: OverlayRenderer = () => [];

export function createHeatmapFrame(
  bids: unknown[],
  asks: unknown[],
  timestamp: number = Date.now(),
  spot?: number,
): HeatmapFrame {
  const major = extractMajorWallsFromOrderBook(bids, asks, spot);
  return {
    timestamp,
    bids: major.filter((w) => w.side === "bid").map(toFrameLevel),
    asks: major.filter((w) => w.side === "ask").map(toFrameLevel),
  };
}

function toFrameLevel(w: MajorWallLevel): { price: number; size: number } {
  return { price: w.price, size: w.sizeBtc };
}
