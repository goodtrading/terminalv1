import {
  useCallback,
  useEffect,
  useRef,
  useState,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { useQueryClient } from "@tanstack/react-query";
import { LineStyle, type IPriceLine } from "lightweight-charts";
import { cn } from "@/lib/utils";
import type { DrawingsCoordinateHelpers } from "../drawings/DrawingsLayer";
import type { PaperOrderSnapshot } from "../execution/executionTypes";
import {
  patchPaperOrderPrice,
  postPaperCancelOrder,
} from "../execution/paperChartActions";
import { invalidatePaperQueries } from "../execution/paperQueryKeys";
import { formatOverlayPrice, snapOverlayPrice } from "./paperTradeOverlayHelpers";
import { usePaperTradeOverlay } from "./usePaperTradeOverlay";

const PRICE_SCALE_INSET = 108;
const ORDER_BAR_HEIGHT = 20;

const LIMIT_LONG = "rgba(34, 211, 238, 0.85)";
const LIMIT_SHORT = "rgba(249, 115, 22, 0.85)";

type PaperChartLimitOrdersProps = {
  chartWidth: number;
  chartHeight: number;
  viewportVersion: number;
  coordinates: DrawingsCoordinateHelpers;
  candleSeries: {
    createPriceLine: (options: {
      price: number;
      color: string;
      lineWidth: 1 | 2 | 3 | 4;
      lineStyle: number;
      axisLabelVisible: boolean;
      title: string;
    }) => IPriceLine;
    removePriceLine: (line: IPriceLine) => void;
  } | null;
};

function formatOrderSize(order: PaperOrderSnapshot): string {
  const n = order.size;
  if (order.sizeUnit === "USDT") return `${n.toFixed(0)} USDT`;
  if (order.sizeUnit === "BTC") return `${n.toFixed(5)} BTC`;
  return `${n}%`;
}

function LimitOrderBar({
  order,
  y,
  chartWidth,
  chartHeight,
  dragging,
  draftPrice,
  busy,
  onPointerDownLine,
  onCancel,
}: {
  order: PaperOrderSnapshot;
  y: number;
  chartWidth: number;
  chartHeight: number;
  dragging: boolean;
  draftPrice: number | null;
  busy: boolean;
  onPointerDownLine: (e: ReactPointerEvent<HTMLDivElement>) => void;
  onCancel: () => void;
}) {
  const price = draftPrice ?? order.price ?? 0;
  const barTop = Math.min(
    Math.max(y - ORDER_BAR_HEIGHT / 2, 4),
    chartHeight - ORDER_BAR_HEIGHT - 4,
  );
  const isLong = order.side === "long";
  const accent = isLong ? LIMIT_LONG : LIMIT_SHORT;

  return (
    <>
      <div
        className="absolute left-0 z-[11] pointer-events-none"
        style={{ top: y, width: chartWidth - PRICE_SCALE_INSET, height: 0 }}
      >
        <div
          className="absolute left-0 right-0 h-px -translate-y-1/2 pointer-events-none"
          style={{
            backgroundColor: accent,
            opacity: dragging ? 1 : 0.75,
          }}
        />
        <div
          role="slider"
          aria-label="Drag to move limit order price"
          className={cn(
            "absolute left-0 right-0 h-4 -translate-y-1/2 cursor-ns-resize pointer-events-auto",
            dragging && "bg-white/[0.03]",
          )}
          onPointerDown={onPointerDownLine}
        />
      </div>

      <div
        className="absolute z-[15] pointer-events-auto flex items-stretch font-mono text-[9px] leading-none shadow-sm"
        style={{
          top: barTop,
          right: PRICE_SCALE_INSET,
          height: ORDER_BAR_HEIGHT,
          maxWidth: chartWidth - PRICE_SCALE_INSET - 8,
        }}
        onPointerDown={(e) => e.stopPropagation()}
      >
        <div
          className="flex items-center gap-1 rounded-l border border-r-0 px-1.5 shrink-0"
          style={{
            borderColor: accent,
            backgroundColor: "rgba(0,0,0,0.92)",
            color: accent,
          }}
        >
          <span className="font-bold uppercase tracking-wider opacity-90">Limit</span>
        </div>
        <div
          className={cn(
            "flex items-center gap-1 border-y px-1.5 shrink-0 font-bold uppercase",
            isLong ? "text-emerald-400" : "text-orange-400",
          )}
          style={{
            borderColor: `${accent}55`,
            backgroundColor: "rgba(0,0,0,0.92)",
          }}
        >
          {order.side}
          <span className="text-slate-300 font-normal tabular-nums">
            {formatOrderSize(order)}
          </span>
          <span className="text-slate-500 font-normal">@ {formatOverlayPrice(price)}</span>
        </div>
        <button
          type="button"
          disabled={busy}
          title="Cancel limit order"
          onClick={(e) => {
            e.stopPropagation();
            onCancel();
          }}
          className="px-1.5 rounded-r border text-slate-400 hover:text-red-400 hover:bg-red-950/40 shrink-0 disabled:opacity-50"
          style={{
            borderColor: `${accent}55`,
            backgroundColor: "rgba(0,0,0,0.92)",
          }}
        >
          ×
        </button>
      </div>
    </>
  );
}

export function PaperChartLimitOrders({
  chartWidth,
  chartHeight,
  viewportVersion,
  coordinates,
  candleSeries,
}: PaperChartLimitOrdersProps) {
  const queryClient = useQueryClient();
  const rootRef = useRef<HTMLDivElement>(null);
  const lineRefs = useRef<Map<string, IPriceLine>>(new Map());
  const { paperActive, openLimitOrders } = usePaperTradeOverlay();

  const [statusMsg, setStatusMsg] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [draft, setDraft] = useState<{ orderId: string; price: number } | null>(null);

  const showStatus = useCallback((msg: string, ms = 2200) => {
    setStatusMsg(msg);
    window.setTimeout(() => setStatusMsg(null), ms);
  }, []);

  const syncLines = useCallback(() => {
    const series = candleSeries;
    if (!series || !paperActive) {
      for (const line of lineRefs.current.values()) {
        series?.removePriceLine(line);
      }
      lineRefs.current.clear();
      return;
    }

    const activeIds = new Set(openLimitOrders.map((o) => o.id));
    for (const [id, line] of lineRefs.current) {
      if (!activeIds.has(id)) {
        series.removePriceLine(line);
        lineRefs.current.delete(id);
      }
    }

    for (const order of openLimitOrders) {
      const px = draft?.orderId === order.id ? draft.price : order.price;
      if (px == null || !Number.isFinite(px)) continue;
      const color = order.side === "long" ? LIMIT_LONG : LIMIT_SHORT;
      const existing = lineRefs.current.get(order.id);
      if (existing) series.removePriceLine(existing);
      lineRefs.current.set(
        order.id,
        series.createPriceLine({
          price: px,
          color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: "",
        }),
      );
    }
  }, [candleSeries, paperActive, openLimitOrders, draft]);

  useEffect(() => {
    syncLines();
    return () => {
      const series = candleSeries;
      if (!series) return;
      for (const line of lineRefs.current.values()) {
        series.removePriceLine(line);
      }
      lineRefs.current.clear();
    };
  }, [syncLines, candleSeries, viewportVersion]);

  const priceFromClientY = useCallback(
    (clientY: number): number | null => {
      const rect = rootRef.current?.getBoundingClientRect();
      if (!rect) return null;
      const y = clientY - rect.top;
      const p = coordinates.coordinateToPrice(y);
      if (p == null || !Number.isFinite(p)) return null;
      return snapOverlayPrice(p);
    },
    [coordinates],
  );

  const handleCancel = useCallback(
    async (orderId: string) => {
      setBusyId(orderId);
      try {
        await postPaperCancelOrder(orderId);
        await invalidatePaperQueries(queryClient);
        showStatus("Paper order cancelled");
      } catch (err) {
        showStatus(err instanceof Error ? err.message : "Cancel failed", 2800);
      } finally {
        setBusyId(null);
      }
    },
    [queryClient, showStatus],
  );

  const handleLinePointerDown = (
    order: PaperOrderSnapshot,
    committed: number,
    e: ReactPointerEvent<HTMLDivElement>,
  ) => {
    e.preventDefault();
    e.stopPropagation();
    const rect = rootRef.current?.getBoundingClientRect();
    if (!rect) return;

    setDraft({ orderId: order.id, price: committed });

    const onMove = (ev: PointerEvent) => {
      const p = priceFromClientY(ev.clientY);
      if (p != null) setDraft({ orderId: order.id, price: p });
    };

    const onUp = async (ev: PointerEvent) => {
      const final = priceFromClientY(ev.clientY) ?? committed;
      setDraft(null);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);

      if (Math.abs(final - committed) < 0.01) return;

      setBusyId(order.id);
      try {
        await patchPaperOrderPrice(order.id, final);
        await invalidatePaperQueries(queryClient);
        showStatus("Limit order moved");
      } catch (err) {
        setDraft({ orderId: order.id, price: committed });
        showStatus(err instanceof Error ? err.message : "Update failed", 2800);
      } finally {
        setBusyId(null);
      }
    };

    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
  };

  if (!paperActive || openLimitOrders.length === 0) {
    return null;
  }

  return (
    <div
      ref={rootRef}
      className="absolute inset-0 z-[10] pointer-events-none overflow-hidden"
      style={{ width: chartWidth, height: chartHeight }}
    >
      {statusMsg ? (
        <div className="absolute top-1 left-1/2 -translate-x-1/2 z-[20] rounded border border-slate-600 bg-black/90 px-2 py-0.5 text-[9px] font-mono text-slate-200 pointer-events-none">
          {statusMsg}
        </div>
      ) : null}

      {openLimitOrders.map((order) => {
        const px = draft?.orderId === order.id ? draft.price : order.price!;
        const y = coordinates.priceToCoordinate(px);
        if (y == null || !Number.isFinite(y)) return null;

        return (
          <LimitOrderBar
            key={order.id}
            order={order}
            y={y}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            dragging={draft?.orderId === order.id}
            draftPrice={draft?.orderId === order.id ? draft.price : null}
            busy={busyId === order.id}
            onPointerDownLine={(e) => handleLinePointerDown(order, px, e)}
            onCancel={() => void handleCancel(order.id)}
          />
        );
      })}
    </div>
  );
}
