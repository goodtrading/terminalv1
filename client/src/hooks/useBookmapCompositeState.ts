import { useCallback, useMemo, useRef, useState, type MutableRefObject } from "react";
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

function defaultSubSourceForSourceMode(mode: BookmapSourceMode): BookmapMarketSource {
  return mode === "perp" ? "perp" : "spot";
}

function logBookmapSourceModeSyncDiag(payload: {
  action: "source_change" | "dom_change" | "trade_change";
  previousSourceMode: BookmapSourceMode;
  nextSourceMode: BookmapSourceMode;
  previousDomSource: BookmapMarketSource;
  nextDomSource: BookmapMarketSource;
  previousTradeSource: BookmapMarketSource;
  nextTradeSource: BookmapMarketSource;
  wasManualDomOverride: boolean;
  wasManualTradeOverride: boolean;
  reason: string;
}) {
  if (!import.meta.env.DEV) return;
  console.debug("[BOOKMAP_SOURCE_MODE_SYNC_DIAG]", payload);
}

function useCachedMarketState(
  data: BookmapState | undefined,
  market: BookmapMarketSource,
  ageMs: number | null,
  cacheRef: MutableRefObject<Record<BookmapMarketSource, BookmapState | null>>,
  loadedRef: MutableRefObject<Record<BookmapMarketSource, boolean>>,
) {
  return useMemo(() => {
    if (data && data.heatmapCells.length > 0) {
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
  const [domSource, setDomSource] = useState<BookmapMarketSource>(
    defaultSubSourceForSourceMode(DEFAULT_BOOKMAP_SOURCE_MODE),
  );
  const [tradeSource, setTradeSource] = useState<BookmapMarketSource>(
    defaultSubSourceForSourceMode(DEFAULT_BOOKMAP_SOURCE_MODE),
  );
  const manualDomOverrideRef = useRef(false);
  const manualTradeOverrideRef = useRef(false);
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

  const activeDomMarket = resolveActiveMarket(sourceMode, domSource);
  const activeTradeMarket = resolveActiveMarket(sourceMode, tradeSource);

  const primaryHeatmapState = useMemo((): BookmapState | null => {
    if (sourceMode === "perp") return effectivePerp;
    if (sourceMode === "both") {
      return activeDomMarket === "perp" ? effectivePerp : effectiveSpot;
    }
    return effectiveSpot;
  }, [sourceMode, activeDomMarket, effectiveSpot, effectivePerp]);

  const overlayHeatmapState = useMemo((): BookmapState | null => {
    if (sourceMode !== "both") return null;
    return activeDomMarket === "perp" ? effectiveSpot : effectivePerp;
  }, [sourceMode, activeDomMarket, effectiveSpot, effectivePerp]);

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
      ? primaryHeatmapState && primaryHeatmapState.heatmapCells.length > 0
      : primaryHeatmapState && primaryHeatmapState.heatmapCells.length > 0,
  );

  const perpOverlayOpacity = perpOverlayOpacityPct / 100;

  const usingCachedPrimary =
    sourceMode === "perp"
      ? Boolean(effectivePerp && perpQuery.data !== effectivePerp)
      : Boolean(effectiveSpot && spotQuery.data !== effectiveSpot);

  const primaryQuery =
    sourceMode === "perp" ? perpQuery : spotQuery;

  const activeDomAgeMs =
    activeDomMarket === "perp" ? perpQuery.ageMs : spotQuery.ageMs;
  const activeTradeAgeMs =
    activeTradeMarket === "perp" ? perpQuery.ageMs : spotQuery.ageMs;

  const perpBookmapStale = isOrderbookStale(perpQuery.ageMs);
  const perpBookmapDead = isOrderbookDead(perpQuery.ageMs);

  const handleSourceModeChange = useCallback(
    (next: BookmapSourceMode) => {
      const nextDom = defaultSubSourceForSourceMode(next);
      const nextTrade = defaultSubSourceForSourceMode(next);
      logBookmapSourceModeSyncDiag({
        action: "source_change",
        previousSourceMode: sourceMode,
        nextSourceMode: next,
        previousDomSource: domSource,
        nextDomSource: nextDom,
        previousTradeSource: tradeSource,
        nextTradeSource: nextTrade,
        wasManualDomOverride: false,
        wasManualTradeOverride: false,
        reason: `source_defaults_synced_to_${next}`,
      });
      setSourceMode(next);
      setDomSource(nextDom);
      setTradeSource(nextTrade);
      manualDomOverrideRef.current = false;
      manualTradeOverrideRef.current = false;
    },
    [sourceMode, domSource, tradeSource],
  );

  const handleDomSourceChange = useCallback(
    (next: BookmapMarketSource) => {
      logBookmapSourceModeSyncDiag({
        action: "dom_change",
        previousSourceMode: sourceMode,
        nextSourceMode: sourceMode,
        previousDomSource: domSource,
        nextDomSource: next,
        previousTradeSource: tradeSource,
        nextTradeSource: tradeSource,
        wasManualDomOverride: true,
        wasManualTradeOverride: manualTradeOverrideRef.current,
        reason:
          sourceMode === "both"
            ? "manual_dom_override_in_both_mode"
            : "manual_dom_change_while_source_locked",
      });
      if (sourceMode === "both") {
        manualDomOverrideRef.current = true;
      }
      setDomSource(next);
    },
    [sourceMode, domSource, tradeSource],
  );

  const handleTradeSourceChange = useCallback(
    (next: BookmapMarketSource) => {
      logBookmapSourceModeSyncDiag({
        action: "trade_change",
        previousSourceMode: sourceMode,
        nextSourceMode: sourceMode,
        previousDomSource: domSource,
        nextDomSource: domSource,
        previousTradeSource: tradeSource,
        nextTradeSource: next,
        wasManualDomOverride: manualDomOverrideRef.current,
        wasManualTradeOverride: true,
        reason:
          sourceMode === "both"
            ? "manual_trade_override_in_both_mode"
            : "manual_trade_change_while_source_locked",
      });
      if (sourceMode === "both") {
        manualTradeOverrideRef.current = true;
      }
      setTradeSource(next);
    },
    [sourceMode, domSource, tradeSource],
  );

  return {
    sourceMode,
    setSourceMode: handleSourceModeChange,
    domSource,
    setDomSource: handleDomSourceChange,
    tradeSource,
    setTradeSource: handleTradeSourceChange,
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
