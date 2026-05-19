import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type RefObject,
} from "react";
import type { BookmapPriceScale } from "@/hooks/useBookmapPriceScale";
import type { useBookmapTimeScale } from "@/hooks/useBookmapTimeScale";

type PanSession = {
  startX: number;
  startY: number;
  /** Engine heatmap: pan time + price from drag deltas. */
  surfacePan: boolean;
  /** Legacy / MMB: time axis only. */
  timeOnly: boolean;
  /** Legacy: price axis only. */
  priceOnly: boolean;
  followLiveReleased: boolean;
  priceInteractionNotified: boolean;
  accumDx: number;
  accumDy: number;
};

export type UseBookmapCanvasInteractionOptions = {
  containerRef: RefObject<HTMLElement | null>;
  useEngineRenderer: boolean;
  timeScale: ReturnType<typeof useBookmapTimeScale>;
  priceScale: BookmapPriceScale;
  onPriceInteractionStart?: () => void;
};

export function useBookmapCanvasInteraction({
  containerRef,
  useEngineRenderer,
  timeScale,
  priceScale,
  onPriceInteractionStart,
}: UseBookmapCanvasInteractionOptions) {
  const [isPanning, setIsPanning] = useState(false);
  const panRef = useRef<PanSession | null>(null);

  const releaseFollowLiveForTimePan = useCallback(() => {
    const pan = panRef.current;
    if (!pan || pan.followLiveReleased) return;
    pan.followLiveReleased = true;
    if (timeScale.followLive) {
      timeScale.setFollowLiveEnabled(false);
    }
  }, [timeScale]);

  const notifyPriceInteraction = useCallback(() => {
    const pan = panRef.current;
    if (!pan || pan.priceInteractionNotified) return;
    pan.priceInteractionNotified = true;
    onPriceInteractionStart?.();
  }, [onPriceInteractionStart]);

  const logInteractionDebug = useCallback(
    (session: PanSession) => {
      if (!import.meta.env.DEV) return;
      const innerW = Math.max(
        1,
        (containerRef.current?.clientWidth ?? 0) - 16,
      );
      const span = Math.max(
        1,
        timeScale.viewport.visibleEndTime - timeScale.viewport.visibleStartTime,
      );
      const panTimeMs = -(session.accumDx / innerW) * span;
      const panPriceDelta =
        (session.accumDy / Math.max(priceScale.chartHeight, 1)) *
        priceScale.visibleRange;
      console.debug("[BOOKMAP_INTERACTION]", {
        dragDx: session.accumDx,
        dragDy: session.accumDy,
        panTimeMs: Math.round(panTimeMs),
        panPriceDelta: Number(panPriceDelta.toFixed(2)),
        followLive: timeScale.followLive,
        visibleMinPrice: priceScale.visibleMinPrice,
        visibleMaxPrice: priceScale.visibleMaxPrice,
        visibleStartTime: timeScale.viewport.visibleStartTime,
        visibleEndTime: timeScale.viewport.visibleEndTime,
      });
    },
    [containerRef, timeScale, priceScale],
  );

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      const el = containerRef.current;
      if (!el) return;

      e.preventDefault();
      const rect = el.getBoundingClientRect();
      const plotX = e.clientX - rect.left;
      const verticalWheel = e.ctrlKey || e.altKey;

      if (useEngineRenderer && !verticalWheel) {
        const factor = e.deltaY > 0 ? 1.12 : 0.88;
        timeScale.zoomTimeAt(plotX, factor);
        return;
      }

      notifyPriceInteraction();
      priceScale.handleWheelZoom(e.clientY, rect.top, e.deltaY);
    },
    [
      containerRef,
      useEngineRenderer,
      timeScale,
      priceScale,
      onPriceInteractionStart,
      notifyPriceInteraction,
    ],
  );

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [containerRef, handleWheel]);

  const handleMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0 && e.button !== 1) return;
      if (e.button === 1) e.preventDefault();

      const surfacePan = useEngineRenderer && e.button === 0;
      const timeOnly = useEngineRenderer && e.button === 1;
      const priceOnly = !useEngineRenderer;

      panRef.current = {
        startX: e.clientX,
        startY: e.clientY,
        surfacePan,
        timeOnly,
        priceOnly,
        followLiveReleased: false,
        priceInteractionNotified: false,
        accumDx: 0,
        accumDy: 0,
      };
      setIsPanning(true);
    },
    [useEngineRenderer],
  );

  useEffect(() => {
    if (!isPanning) return;

    const onMove = (e: MouseEvent) => {
      let pan = panRef.current;
      if (!pan) return;

      const deltaX = e.clientX - pan.startX;
      const deltaY = e.clientY - pan.startY;

      if ((pan.surfacePan || pan.timeOnly) && deltaX !== 0) {
        pan = {
          ...pan,
          startX: e.clientX,
          accumDx: pan.accumDx + deltaX,
        };
        timeScale.panByPixels(deltaX);
        panRef.current = pan;
        releaseFollowLiveForTimePan();
      }

      if ((pan.surfacePan || pan.priceOnly) && deltaY !== 0) {
        pan = {
          ...(panRef.current ?? pan),
          startY: e.clientY,
          accumDy: (panRef.current ?? pan).accumDy + deltaY,
        };
        notifyPriceInteraction();
        priceScale.panByPixels(deltaY);
        panRef.current = pan;
      }
    };

    const onUp = () => {
      const session = panRef.current;
      if (session) logInteractionDebug(session);
      panRef.current = null;
      setIsPanning(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [
    isPanning,
    timeScale,
    priceScale,
    releaseFollowLiveForTimePan,
    notifyPriceInteraction,
    logInteractionDebug,
  ]);

  const cursorClass = isPanning
    ? "cursor-grabbing"
    : useEngineRenderer
      ? "cursor-grab"
      : "cursor-crosshair";

  const interactionTitle = useEngineRenderer
    ? "Drag: pan time + price · Wheel: time zoom · Ctrl/Alt+wheel: price zoom · MMB: time pan · PRICE ladder: wheel zoom"
    : "Drag: price pan · Wheel: price zoom";

  return {
    isPanning,
    cursorClass,
    interactionTitle,
    handleMouseDown,
  };
};
