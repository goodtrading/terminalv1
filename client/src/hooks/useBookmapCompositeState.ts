import { useMemo, useRef, useState, type MutableRefObject } from "react";
import { useBookmapState, type UseBookmapStateOptions } from "@/hooks/useBookmapState";
import type { BookmapState } from "@/types/bookmapState";
import type { BookmapMarketSource } from "@shared/bookmapMarket";
import {
  DEFAULT_BOOKMAP_SOURCE_MODE,
  DEFAULT_PERP_OVERLAY_OPACITY_PCT,
  type BookmapSourceMode,
  type PerpOverlayOpacityPct,
  resolveActiveMarket,
} from "@shared/bookmapSourceMode";

export type UseBookmapCompositeStateOptions = Omit<UseBookmapStateOptions, "market"> & {
  enabled?: boolean;
};

function useCachedMarketState(
  data: BookmapState | undefined,
  market: BookmapMarketSource,
  cacheRef: MutableRefObject<Record<BookmapMarketSource, BookmapState | null>>,
  loadedRef: MutableRefObject<Record<BookmapMarketSource, boolean>>,
) {
  return useMemo(() => {
    if (data && data.heatmapCells.length > 0) {
      cacheRef.current[market] = data;
      loadedRef.current[market] = true;
      return data;
    }
    return cacheRef.current[market];
  }, [data, market, cacheRef, loadedRef]);
}

export function useBookmapCompositeState(options: UseBookmapCompositeStateOptions = {}) {
  const { enabled = true, ...bookmapOpts } = options;

  const [sourceMode, setSourceMode] = useState<BookmapSourceMode>(DEFAULT_BOOKMAP_SOURCE_MODE);
  const [domSource, setDomSource] = useState<BookmapMarketSource>("perp");
  const [tradeSource, setTradeSource] = useState<BookmapMarketSource>("perp");
  const [perpOverlayOpacityPct, setPerpOverlayOpacityPct] = useState<PerpOverlayOpacityPct>(
    DEFAULT_PERP_OVERLAY_OPACITY_PCT,
  );

  const lastGoodByMarketRef = useRef<Record<BookmapMarketSource, BookmapState | null>>({
    spot: null,
    perp: null,
  });
  const everLoadedByMarketRef = useRef<Record<BookmapMarketSource, boolean>>({
    spot: false,
    perp: false,
  });

  const spotQuery = useBookmapState({
    ...bookmapOpts,
    market: "spot",
    enabled: enabled && (sourceMode === "spot" || sourceMode === "both"),
  });

  const perpQuery = useBookmapState({
    ...bookmapOpts,
    market: "perp",
    enabled: enabled && (sourceMode === "perp" || sourceMode === "both"),
  });

  const effectiveSpot = useCachedMarketState(
    spotQuery.data,
    "spot",
    lastGoodByMarketRef,
    everLoadedByMarketRef,
  );
  const effectivePerp = useCachedMarketState(
    perpQuery.data,
    "perp",
    lastGoodByMarketRef,
    everLoadedByMarketRef,
  );

  const activeDomMarket = resolveActiveMarket(sourceMode, domSource);
  const activeTradeMarket = resolveActiveMarket(sourceMode, tradeSource);

  const primaryHeatmapState = useMemo((): BookmapState | null => {
    if (sourceMode === "perp") return effectivePerp;
    return effectiveSpot;
  }, [sourceMode, effectiveSpot, effectivePerp]);

  const overlayHeatmapState = useMemo((): BookmapState | null => {
    if (sourceMode !== "both") return null;
    return effectivePerp;
  }, [sourceMode, effectivePerp]);

  const effectiveDomState = useMemo((): BookmapState | null => {
    return activeDomMarket === "perp" ? effectivePerp : effectiveSpot;
  }, [activeDomMarket, effectivePerp, effectiveSpot]);

  const waitingMarkets = useMemo(() => {
    const out: BookmapMarketSource[] = [];
    if (sourceMode === "both" || sourceMode === "spot") {
      if (!effectiveSpot?.heatmapCells.length && spotQuery.isLoading) out.push("spot");
      else if (sourceMode === "both" && !everLoadedByMarketRef.current.spot && !effectiveSpot) {
        out.push("spot");
      }
    }
    if (sourceMode === "both" || sourceMode === "perp") {
      if (!effectivePerp?.heatmapCells.length && perpQuery.isLoading) out.push("perp");
      else if (sourceMode === "both" && !everLoadedByMarketRef.current.perp && !effectivePerp) {
        out.push("perp");
      }
    }
    return out;
  }, [
    sourceMode,
    effectiveSpot,
    effectivePerp,
    spotQuery.isLoading,
    perpQuery.isLoading,
  ]);

  const hasRenderableHeatmap = Boolean(
    sourceMode === "both"
      ? effectiveSpot && effectiveSpot.heatmapCells.length > 0
      : primaryHeatmapState && primaryHeatmapState.heatmapCells.length > 0,
  );

  const perpOverlayOpacity = perpOverlayOpacityPct / 100;

  const usingCachedPrimary =
    sourceMode === "perp"
      ? Boolean(effectivePerp && perpQuery.data !== effectivePerp)
      : Boolean(effectiveSpot && spotQuery.data !== effectiveSpot);

  const primaryQuery =
    sourceMode === "perp" ? perpQuery : spotQuery;

  return {
    sourceMode,
    setSourceMode,
    domSource,
    setDomSource,
    tradeSource,
    setTradeSource,
    perpOverlayOpacityPct,
    setPerpOverlayOpacityPct,
    perpOverlayOpacity,
    activeDomMarket,
    activeTradeMarket,
    effectiveSpot,
    effectivePerp,
    primaryHeatmapState,
    overlayHeatmapState,
    effectiveDomState,
    waitingMarkets,
    hasRenderableHeatmap,
    usingCachedPrimary,
    primaryQuery,
    spotQuery,
    perpQuery,
    everLoadedByMarket: everLoadedByMarketRef.current,
  };
}
