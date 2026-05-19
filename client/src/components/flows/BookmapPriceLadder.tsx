import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { BOOKMAP_PLOT_PAD } from "./bookmapViewportUtils";
import { DOM_FONT_CLASS, bucketPrice, formatBookmapPrice } from "./domLadderUtils";
import type { BookmapPriceScale } from "@/hooks/useBookmapPriceScale";

export type BookmapPriceLadderProps = {
  scale: BookmapPriceScale;
  spot: number | null;
  showPlotBoundsDebug?: boolean;
  onPriceInteractionStart?: () => void;
};

export function BookmapPriceLadder({
  scale,
  spot,
  showPlotBoundsDebug = false,
  onPriceInteractionStart,
}: BookmapPriceLadderProps) {
  const plotRef = useRef<HTMLDivElement>(null);
  const [plotHeight, setPlotHeight] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const dragRef = useRef<{ startY: number } | null>(null);

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;

    const sync = () => setPlotHeight(el.clientHeight);
    const ro = new ResizeObserver(sync);
    ro.observe(el);
    sync();
    return () => ro.disconnect();
  }, []);

  const spotY = useMemo(() => {
    if (spot == null || !Number.isFinite(spot)) return null;
    if (spot < scale.visibleMinPrice || spot > scale.visibleMaxPrice) return null;
    return scale.priceToY(spot);
  }, [spot, scale]);

  const handleWheel = useCallback(
    (e: WheelEvent) => {
      e.preventDefault();
      e.stopPropagation();
      onPriceInteractionStart?.();
      const rect = plotRef.current?.getBoundingClientRect();
      if (!rect) return;
      scale.handleWheelZoom(e.clientY, rect.top, e.deltaY);
    },
    [scale, onPriceInteractionStart],
  );

  useEffect(() => {
    const el = plotRef.current;
    if (!el) return;
    el.addEventListener("wheel", handleWheel, { passive: false });
    return () => el.removeEventListener("wheel", handleWheel);
  }, [handleWheel]);

  const onMouseDown = useCallback(
    (e: React.MouseEvent) => {
      if (e.button !== 0) return;
      onPriceInteractionStart?.();
      dragRef.current = { startY: e.clientY };
      setIsDragging(true);
      e.preventDefault();
    },
    [onPriceInteractionStart],
  );

  useEffect(() => {
    const onMove = (e: MouseEvent) => {
      if (!dragRef.current) return;
      const deltaY = e.clientY - dragRef.current.startY;
      dragRef.current.startY = e.clientY;
      scale.panByPixels(deltaY);
    };

    const onUp = () => {
      if (!dragRef.current) return;
      dragRef.current = null;
      setIsDragging(false);
    };

    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
    return () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
  }, [scale]);

  return (
    <div
      ref={plotRef}
      className={cn(
        "relative min-h-0 h-full shrink-0 overflow-hidden bg-[#0c121a]",
        isDragging ? "cursor-grabbing" : "cursor-grab",
      )}
      title="Wheel: price zoom · Drag: price pan (optional)"
      onMouseDown={onMouseDown}
    >
      <div className="pointer-events-none absolute top-0 left-0 right-0 z-20 border-b border-slate-700/40 bg-[#0c121a]/98">
        <div className="px-1 py-2 text-center">
          <div className="text-[11px] font-mono font-bold uppercase tracking-widest text-slate-300">
            PRICE
          </div>
        </div>
      </div>

      {showPlotBoundsDebug && plotHeight > 0 && (
        <>
          <div
            className="pointer-events-none absolute left-0 right-0 z-30 border-t border-slate-600/40"
            style={{ top: BOOKMAP_PLOT_PAD.top }}
          />
          <div
            className="pointer-events-none absolute left-0 right-0 z-30 border-b border-cyan-400/70"
            style={{ top: plotHeight - BOOKMAP_PLOT_PAD.bottom }}
          />
        </>
      )}

      {scale.labelPrices.map((price) => {
        const y = scale.priceToY(price);
        if (y < BOOKMAP_PLOT_PAD.top - 4 || y > plotHeight - BOOKMAP_PLOT_PAD.bottom + 4) {
          return null;
        }
        const spotBucket =
          spot != null ? bucketPrice(spot, scale.labelStep) : null;
        const isSpot = spotBucket != null && price === spotBucket;

        return (
          <div
            key={price}
            className={cn(
              "pointer-events-none absolute left-0 right-0 z-10 flex items-center justify-center px-0.5 -translate-y-1/2",
              isSpot ? "z-[15] text-amber-200 font-bold" : "",
            )}
            style={{ top: y }}
          >
            <span className={cn("text-center", DOM_FONT_CLASS)}>
              {formatBookmapPrice(price)}
            </span>
          </div>
        );
      })}

      {spotY != null && (
        <div
          className="pointer-events-none absolute left-0 right-0 z-[16] border-t border-amber-400/80"
          style={{ top: spotY }}
        />
      )}
    </div>
  );
}
