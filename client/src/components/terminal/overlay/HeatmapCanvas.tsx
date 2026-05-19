import { useEffect } from "react";
import { createHeatmapFrame } from "./renderers/heatmap";

interface HeatmapCanvasProps {
  isActive: boolean;
  chartWidth?: number;
  chartHeight?: number;
  priceToCoordinate?: (price: number) => number | null;
  currentPrice?: number;
}

/**
 * Major walls (>= 100 BTC) render as chart price lines from MainChart.
 * Canvas overlay disabled — no historical Bookmap bands / frame accumulation.
 */
export function HeatmapCanvas({
  isActive,
}: HeatmapCanvasProps) {
  useEffect(() => {
    (window as unknown as { heatmapCanvas?: { addFrame: (...args: unknown[]) => void; clearHistory: () => void } }).heatmapCanvas = {
      addFrame: (
        timestamp: number,
        bids: unknown[],
        asks: unknown[],
        spot?: number,
      ) => {
        if (!isActive) return;
        createHeatmapFrame(bids, asks, timestamp, spot);
      },
      clearHistory: () => {},
    };

    return () => {
      delete (window as unknown as { heatmapCanvas?: unknown }).heatmapCanvas;
    };
  }, [isActive]);

  return null;
}
