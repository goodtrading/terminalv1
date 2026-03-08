import { OverlayRenderContext, OverlayRenderer } from "../types";

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

export const renderHeatmap: OverlayRenderer = (context: OverlayRenderContext) => {
  // Heatmap is handled separately by canvas renderer
  // This renderer returns empty array since heatmap uses canvas overlay
  return [];
};

export function calculateLiquidityOpacity(size: number, maxSize: number, thresholds: HeatmapConfig['sizeThresholds']): number {
  if (maxSize <= 0) return 0.05;
  
  const normalizedSize = size / maxSize;
  
  if (normalizedSize < thresholds.small) return 0.05;
  if (normalizedSize < thresholds.medium) return 0.2;
  if (normalizedSize < thresholds.large) return 0.6;
  return 0.8;
}

export function createHeatmapFrame(
  bids: { price: number; size: number }[],
  asks: { price: number; size: number }[],
  timestamp: number = Date.now()
): HeatmapFrame {
  // Filter out very small sizes and limit levels for performance
  const filteredBids = bids
    .filter(level => level.size > 0.01)
    .slice(0, 20); // Top 20 bid levels
    
  const filteredAsks = asks
    .filter(level => level.size > 0.01)
    .slice(0, 20); // Top 20 ask levels
  
  return {
    timestamp,
    bids: filteredBids,
    asks: filteredAsks
  };
}
