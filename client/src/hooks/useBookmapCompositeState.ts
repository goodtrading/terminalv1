import { useEffect, useMemo, useRef, useState, type MutableRefObject } from "react";
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
import { isOrderbookDead, isOrderbookStale } from "@shared/bookmapFreshness";

export type UseBookmapCompositeStateOptions = Omit<UseBookmapStateOptions, "market"> & {
  enabled?: boolean;
};

function marketHasRenderableBookData(state: BookmapState | null | undefined): boolean {
  if (!state) return false;
  return (
    state.heatmapCells.length > 0 ||
    state.bids.length > 0 ||
    state.asks.length > 0
  );
}

function useCachedMarketState(
  data: BookmapState | undefined,
  market: BookmapMarketSource,
  ageMs: number | null,
  cacheRef: MutableRefObject<Record<BookmapMarketSource, BookmapState | null>>,
  loadedRef: MutableRefObject<Record<BookmapMarketSource, boolean>>,
) {
  return useMemo(() => {
    if (data && marketHasRenderableBookData(data)) {
      if (!isOrderbookDead(ageMs)) {
        cacheRef.current[market] = data;
        loadedRef.current[market] = true;
      }
      return data;
    }
    const cached = cacheRef.current[market];
    if (cached) {
      const cacheAge =
        cached.timestamp != null ? Math.max(0, Date.now() - cached.timestamp) : null;
      if (!isOrderbookDead(cacheAge)) return cached;
    }
    return null;
  }, [data, market, ageMs, cacheRef, loadedRef]);
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
  const lastFrontendDiagAtRef = useRef(0);

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
    spotQuery.ageMs,
    lastGoodByMarketRef,
    everLoadedByMarketRef,
  );
  const effectivePerp = useCachedMarketState(
    perpQuery.data,
    "perp",
    perpQuery.ageMs,
    lastGoodByMarketRef,
    everLoadedByMarketRef,
  );

  const spotAvailable = marketHasRenderableBookData(effectiveSpot) && !isOrderbookDead(spotQuery.ageMs);
  const perpAvailable = marketHasRenderableBookData(effectivePerp) && !isOrderbookDead(perpQuery.ageMs);

  const activeDomMarket = resolveActiveMarket(sourceMode, domSource);
  const activeTradeMarket = resolveActiveMarket(sourceMode, tradeSource);

  const effectiveSourceMode = useMemo((): BookmapSourceMode => {
    if (sourceMode === "spot" && !spotAvailable && perpAvailable) {
      return "perp";
    }
    return sourceMode;
  }, [sourceMode, spotAvailable, perpAvailable]);

  const primaryHeatmapState = useMemo((): BookmapState | null => {
    if (effectiveSourceMode === "perp") return effectivePerp;
    if (effectiveSourceMode === "both") {
      const domState = activeDomMarket === "perp" ? effectivePerp : effectiveSpot;
      if (marketHasRenderableBookData(domState)) return domState;
      if (activeDomMarket === "spot" && perpAvailable) return effectivePerp;
      if (activeDomMarket === "perp" && spotAvailable) return effectiveSpot;
      return domState;
    }
    if (marketHasRenderableBookData(effectiveSpot)) return effectiveSpot;
    if (perpAvailable) return effectivePerp;
    return effectiveSpot;
  }, [
    effectiveSourceMode,
    activeDomMarket,
    effectiveSpot,
    effectivePerp,
    spotAvailable,
    perpAvailable,
  ]);

  const overlayHeatmapState = useMemo((): BookmapState | null => {
    if (sourceMode !== "both") return null;
    return activeDomMarket === "perp" ? effectiveSpot : effectivePerp;
  }, [sourceMode, activeDomMarket, effectiveSpot, effectivePerp]);

  const effectiveDomState = useMemo((): BookmapState | null => {
    const preferred = activeDomMarket === "perp" ? effectivePerp : effectiveSpot;
    if (marketHasRenderableBookData(preferred)) return preferred;
    return activeDomMarket === "perp" ? effectiveSpot : effectivePerp;
  }, [activeDomMarket, effectivePerp, effectiveSpot]);

  const waitingMarkets = useMemo(() => {
    const out: BookmapMarketSource[] = [];
    if (sourceMode === "both" || sourceMode === "spot") {
      if (!marketHasRenderableBookData(effectiveSpot) && spotQuery.isLoading) {
        out.push("spot");
      } else if (
        sourceMode === "both" &&
        !everLoadedByMarketRef.current.spot &&
        !effectiveSpot
      ) {
        out.push("spot");
      } else if (sourceMode === "spot" && !spotAvailable && !perpAvailable && spotQuery.isLoading) {
        out.push("spot");
      }
    }
    if (sourceMode === "both" || sourceMode === "perp") {
      if (!marketHasRenderableBookData(effectivePerp) && perpQuery.isLoading) {
        out.push("perp");
      } else if (
        sourceMode === "both" &&
        !everLoadedByMarketRef.current.perp &&
        !effectivePerp
      ) {
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
    spotAvailable,
    perpAvailable,
  ]);

  const hasRenderableHeatmap = marketHasRenderableBookData(primaryHeatmapState);

  const perpOverlayOpacity = perpOverlayOpacityPct / 100;

  const usingCachedPrimary =
    effectiveSourceMode === "perp"
      ? Boolean(effectivePerp && perpQuery.data !== effectivePerp)
      : Boolean(effectiveSpot && spotQuery.data !== effectiveSpot);

  const primaryQuery =
    effectiveSourceMode === "perp" ? perpQuery : spotQuery;

  const activeDomAgeMs =
    activeDomMarket === "perp" ? perpQuery.ageMs : spotQuery.ageMs;
  const activeTradeAgeMs =
    activeTradeMarket === "perp" ? perpQuery.ageMs : spotQuery.ageMs;

  const perpBookmapStale = isOrderbookStale(perpQuery.ageMs);
  const perpBookmapDead = isOrderbookDead(perpQuery.ageMs);

  useEffect(() => {
    if (!import.meta.env.DEV && import.meta.env.MODE !== "production") return;
    const now = Date.now();
    if (now - lastFrontendDiagAtRef.current < 2_000) return;
    lastFrontendDiagAtRef.current = now;

    const payload = primaryHeatmapState;
    const timestampAgeMs =
      payload?.timestamp != null ? Math.max(0, now - payload.timestamp) : null;
    const reasonIfEmpty = !hasRenderableHeatmap
      ? !spotAvailable && !perpAvailable
        ? "spot_and_perp_unavailable"
        : !payload
          ? "no_primary_payload"
          : "payload_missing_book_and_cells"
      : null;

    console.debug("[BOOKMAP_FRONTEND_DATA_DIAG]", {
      selectedSource: sourceMode,
      effectiveSource: effectiveSourceMode,
      activeTradeMarket,
      hasEnginePayload: Boolean(payload),
      heatmapCells: payload?.heatmapCells.length ?? 0,
      bidCount: payload?.bids.length ?? 0,
      askCount: payload?.asks.length ?? 0,
      status: primaryQuery.error
        ? "error"
        : primaryQuery.isLoading
          ? "loading"
          : hasRenderableHeatmap
            ? "live"
            : "empty",
      error: primaryQuery.error ? String(primaryQuery.error) : null,
      timestampAgeMs,
    });

    console.debug("[BOOKMAP_RAILWAY_ENABLE_AUDIT]", {
      ok: hasRenderableHeatmap,
      selectedSource: sourceMode,
      effectiveSource: effectiveSourceMode,
      spotAvailable,
      perpAvailable,
      hasOrderbook: Boolean(
        (payload?.bids.length ?? 0) > 0 && (payload?.asks.length ?? 0) > 0,
      ),
      hasTrades: null,
      heatmapCells: payload?.heatmapCells.length ?? 0,
      liveProjectionLevels: null,
      tradeDots: null,
      reasonIfEmpty,
    });
  }, [
    sourceMode,
    effectiveSourceMode,
    activeTradeMarket,
    primaryHeatmapState,
    hasRenderableHeatmap,
    spotAvailable,
    perpAvailable,
    primaryQuery.error,
    primaryQuery.isLoading,
  ]);

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
    effectiveSourceMode,
    effectiveSpot,
    effectivePerp,
    primaryHeatmapState,
    overlayHeatmapState,
    effectiveDomState,
    waitingMarkets,
    hasRenderableHeatmap,
    spotAvailable,
    perpAvailable,
    usingCachedPrimary,
    primaryQuery,
    spotQuery,
    perpQuery,
    spotAgeMs: spotQuery.ageMs,
    perpAgeMs: perpQuery.ageMs,
    spotDataUpdatedAt: spotQuery.dataUpdatedAt,
    perpDataUpdatedAt: perpQuery.dataUpdatedAt,
    activeDomAgeMs,
    activeTradeAgeMs,
    perpBookmapStale,
    perpBookmapDead,
    everLoadedByMarket: everLoadedByMarketRef.current,
  };
}
