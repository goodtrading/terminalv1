import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { BOOKMAP_PLOT_PAD } from "@/components/flows/bookmapViewportUtils";
import {
  clampPriceRange,
  zoomPriceRange,
  type PriceRange,
} from "@/components/flows/bookmapViewportUtils";
import {
  buildNiceLabelPrices,
  DEFAULT_LOCAL_RANGE_USD,
} from "@/lib/bookmapPriceScaleUtils";
import {
  chooseVerticalBucketSizes,
  computeDepthRangeFromPreset,
  computeFitWallsRange,
  maxSpanRatioForDepthPreset,
  type DepthRangePreset,
  type VerticalCompressionMode,
} from "@/lib/bookmapDepthRange";
import type { BookLevel } from "@/types/bookmapState";

export type BookmapPriceScaleMode = "auto" | "manual";

export type UseBookmapPriceScaleOptions = {
  spot: number | null;
  plotHeight: number;
  localRangeUsd?: number;
  depthRangePreset?: DepthRangePreset;
  walls?: BookLevel[];
  bookLevels?: BookLevel[];
  followSpot?: boolean;
};

function initialRangeFromPreset(
  spot: number | null,
  preset: DepthRangePreset,
  localRangeUsd: number,
  walls: BookLevel[],
  bookLevels: BookLevel[],
): PriceRange {
  return computeDepthRangeFromPreset(
    preset,
    spot,
    walls,
    localRangeUsd,
    bookLevels,
  );
}

export function useBookmapPriceScale({
  spot,
  plotHeight,
  localRangeUsd = DEFAULT_LOCAL_RANGE_USD,
  depthRangePreset = "local",
  walls = [],
  bookLevels = [],
  followSpot = false,
}: UseBookmapPriceScaleOptions) {
  const [range, setRange] = useState<PriceRange>(() =>
    initialRangeFromPreset(spot, depthRangePreset, localRangeUsd, walls, bookLevels),
  );
  const [mode, setMode] = useState<BookmapPriceScaleMode>("auto");
  const [activePreset, setActivePreset] = useState<DepthRangePreset>(depthRangePreset);
  const dragAnchorRef = useRef<number | null>(null);

  const maxSpanRatio = maxSpanRatioForDepthPreset(activePreset);

  const clampRange = useCallback(
    (next: PriceRange) => clampPriceRange(next, spot, maxSpanRatio),
    [spot, maxSpanRatio],
  );

  const visibleMinPrice = range.minPrice;
  const visibleMaxPrice = range.maxPrice;
  const visibleRange = visibleMaxPrice - visibleMinPrice;
  const centerPrice = (visibleMinPrice + visibleMaxPrice) / 2;

  const chartHeight = Math.max(
    1,
    plotHeight - BOOKMAP_PLOT_PAD.top - BOOKMAP_PLOT_PAD.bottom,
  );

  const verticalMetrics = useMemo(
    () => chooseVerticalBucketSizes(visibleRange, chartHeight),
    [visibleRange, chartHeight],
  );

  const verticalMode: VerticalCompressionMode = verticalMetrics.verticalMode;
  const labelStep = verticalMetrics.labelStep;
  const heatmapBucketSize = verticalMetrics.heatmapBucketSize;
  const domBucketSize = verticalMetrics.domBucketSize;

  const labelPrices = useMemo(
    () => buildNiceLabelPrices(visibleMinPrice, visibleMaxPrice, labelStep),
    [visibleMinPrice, visibleMaxPrice, labelStep],
  );

  const dollarsPerPixel = visibleRange / chartHeight;

  const priceToY = useCallback(
    (price: number) => {
      const span = visibleMaxPrice - visibleMinPrice;
      if (span <= 0) return BOOKMAP_PLOT_PAD.top;
      const rel = (visibleMaxPrice - price) / span;
      return BOOKMAP_PLOT_PAD.top + rel * chartHeight;
    },
    [visibleMinPrice, visibleMaxPrice, chartHeight],
  );

  const yToPrice = useCallback(
    (y: number) => {
      const span = visibleMaxPrice - visibleMinPrice;
      const rel = (y - BOOKMAP_PLOT_PAD.top) / Math.max(chartHeight, 1);
      return visibleMaxPrice - rel * span;
    },
    [visibleMinPrice, visibleMaxPrice, chartHeight],
  );

  const setVisibleRange = useCallback(
    (next: PriceRange) => {
      setMode("manual");
      setRange(clampRange(next));
    },
    [clampRange],
  );

  const setCenterPrice = useCallback(
    (price: number) => {
      if (!Number.isFinite(price)) return;
      const half = visibleRange / 2;
      setVisibleRange({
        minPrice: price - half,
        maxPrice: price + half,
      });
    },
    [visibleRange, setVisibleRange],
  );

  const applyDepthRange = useCallback(
    (preset: DepthRangePreset) => {
      setActivePreset(preset);
      setMode("auto");
      setRange(
        clampRange(
          computeDepthRangeFromPreset(
            preset,
            spot,
            walls,
            localRangeUsd,
            bookLevels,
          ),
        ),
      );
    },
    [spot, walls, bookLevels, localRangeUsd, clampRange],
  );

  const zoomAtPrice = useCallback(
    (anchorPrice: number, factor: number) => {
      if (!Number.isFinite(anchorPrice) || !Number.isFinite(factor) || factor <= 0) {
        return;
      }
      setMode("manual");
      setRange((prev) =>
        clampRange(zoomPriceRange(prev, anchorPrice, factor, spot)),
      );
    },
    [spot, clampRange],
  );

  const panPrice = useCallback(
    (deltaPrice: number) => {
      if (!Number.isFinite(deltaPrice)) return;
      setMode("manual");
      setRange((prev) =>
        clampRange({
          minPrice: prev.minPrice + deltaPrice,
          maxPrice: prev.maxPrice + deltaPrice,
        }),
      );
    },
    [clampRange],
  );

  const panByPixels = useCallback(
    (deltaY: number) => {
      const deltaPrice = (deltaY / Math.max(chartHeight, 1)) * visibleRange;
      panPrice(deltaPrice);
    },
    [chartHeight, visibleRange, panPrice],
  );

  const resetToSpot = useCallback(() => {
    setMode("auto");
    setActivePreset(depthRangePreset);
    setRange(
      clampRange(
        initialRangeFromPreset(
          spot,
          depthRangePreset,
          localRangeUsd,
          walls,
          bookLevels,
        ),
      ),
    );
  }, [spot, depthRangePreset, localRangeUsd, walls, bookLevels, clampRange]);

  const fitToWalls = useCallback(() => {
    const fit = computeFitWallsRange(spot, walls, { paddingPct: 0.04 });
    if (!fit) {
      resetToSpot();
      return;
    }
    setMode("manual");
    setRange(
      clampRange({ minPrice: fit.minPrice, maxPrice: fit.maxPrice }),
    );
  }, [spot, walls, resetToSpot, clampRange]);

  const fitToMajorWalls = useCallback(() => {
    setActivePreset("majorWalls");
    const fit = computeFitWallsRange(spot, walls, {
      majorOnly: true,
      paddingPct: 0.04,
    });
    if (!fit) {
      resetToSpot();
      return;
    }
    setMode("auto");
    setRange(
      clampRange({ minPrice: fit.minPrice, maxPrice: fit.maxPrice }),
    );
  }, [spot, walls, resetToSpot, clampRange]);

  const zoomIn = useCallback(() => {
    zoomAtPrice(centerPrice, 0.85);
  }, [centerPrice, zoomAtPrice]);

  const zoomOut = useCallback(() => {
    zoomAtPrice(centerPrice, 1.18);
  }, [centerPrice, zoomAtPrice]);

  const handleWheelZoom = useCallback(
    (clientY: number, containerTop: number, deltaY: number) => {
      const y = clientY - containerTop;
      const anchor = yToPrice(y);
      const factor = deltaY > 0 ? 1.1 : 0.9;
      zoomAtPrice(anchor, factor);
    },
    [yToPrice, zoomAtPrice],
  );

  const beginScaleDrag = useCallback((anchorPrice: number) => {
    dragAnchorRef.current = anchorPrice;
  }, []);

  const handleScaleDrag = useCallback(
    (deltaY: number, anchorPrice?: number) => {
      const anchor = anchorPrice ?? dragAnchorRef.current ?? centerPrice;
      const factor = Math.exp(deltaY * 0.004);
      zoomAtPrice(anchor, factor);
    },
    [centerPrice, zoomAtPrice],
  );

  const endScaleDrag = useCallback(() => {
    dragAnchorRef.current = null;
  }, []);

  useEffect(() => {
    setActivePreset(depthRangePreset);
  }, [depthRangePreset]);

  useEffect(() => {
    if (mode !== "auto" || !followSpot) return;
    if (spot == null || !Number.isFinite(spot) || spot <= 0) return;
    setRange(
      clampRange(
        computeDepthRangeFromPreset(
          activePreset,
          spot,
          walls,
          localRangeUsd,
          bookLevels,
        ),
      ),
    );
  }, [
    mode,
    followSpot,
    spot,
    activePreset,
    localRangeUsd,
    walls,
    bookLevels,
    clampRange,
  ]);

  const priceRange: PriceRange = useMemo(
    () => ({ minPrice: visibleMinPrice, maxPrice: visibleMaxPrice }),
    [visibleMinPrice, visibleMaxPrice],
  );

  const visibleWallCounts = useMemo(() => {
    let important = 0;
    let structural = 0;
    let major = 0;
    for (const w of walls) {
      if (w.price < visibleMinPrice || w.price > visibleMaxPrice) continue;
      if (w.isMajor && w.maxSeenSize >= 300) major++;
      else if (w.isStructural && w.maxSeenSize >= 150) structural++;
      else if (w.isImportant && w.maxSeenSize >= 100) important++;
    }
    return { important, structural, major };
  }, [walls, visibleMinPrice, visibleMaxPrice]);

  return {
    visibleMinPrice,
    visibleMaxPrice,
    visibleRange,
    centerPrice,
    priceRange,
    labelStep,
    heatmapBucketSize,
    domBucketSize,
    labelPrices,
    dollarsPerPixel,
    verticalMode,
    depthRangePreset: activePreset,
    visibleWallCounts,
    mode,
    priceToY,
    yToPrice,
    setVisibleRange,
    setCenterPrice,
    applyDepthRange,
    zoomAtPrice,
    panPrice,
    panByPixels,
    resetToSpot,
    fitToWalls,
    fitToMajorWalls,
    zoomIn,
    zoomOut,
    handleWheelZoom,
    beginScaleDrag,
    handleScaleDrag,
    endScaleDrag,
    setMode,
    chartHeight,
  };
}

export type BookmapPriceScale = ReturnType<typeof useBookmapPriceScale>;
