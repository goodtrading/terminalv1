import { useCallback, useEffect, useMemo, useRef } from "react";
import { LineStyle, type IPriceLine } from "lightweight-charts";
import { cn } from "@/lib/utils";
import type { DrawingsCoordinateHelpers } from "../drawings/DrawingsLayer";
import type {
  BingXNormalizedOrder,
  BingXNormalizedPosition,
  BrokerSessionState,
} from "../execution/executionTypes";
import { isBingXReadOnlySession } from "../execution/bingxSession";
import { formatLastSyncAgo } from "../execution/bingxReadOnlyMessages";
import {
  BINGX_LIQ_LINE,
  buildOrderBadgeLabel,
  buildPositionBadgeLabel,
  orderLineColor,
  positionLineColor,
  PRICE_SCALE_INSET,
} from "./bingxReadOnlyChartHelpers";
import { useBingXReadOnlyChartData } from "./useBingXReadOnlyChartData";
import { useBingXReadOnlyRiskMirror } from "../riskMirror/useBingXReadOnlyRiskMirror";
import { formatOverlayPrice } from "../paperChart/paperTradeOverlayHelpers";

const BAR_HEIGHT = 22;

type BingXReadOnlyChartOverlayProps = {
  brokerSession: BrokerSessionState | null;
  chartWidth: number;
  chartHeight: number;
  viewportVersion: number;
  coordinates: DrawingsCoordinateHelpers;
  visible?: boolean;
  chartSymbol?: string;
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

function ReadOnlyBadge({
  y,
  chartWidth,
  chartHeight,
  label,
  accentClass,
  title,
}: {
  y: number;
  chartWidth: number;
  chartHeight: number;
  label: string;
  accentClass: string;
  title?: string;
}) {
  if (!Number.isFinite(y)) return null;
  const barTop = Math.min(
    Math.max(y - BAR_HEIGHT / 2, 4),
    chartHeight - BAR_HEIGHT - 4,
  );

  return (
    <div
      className={cn(
        "absolute z-[11] pointer-events-none flex items-center font-mono text-[9px] leading-none",
        "border border-slate-600/50 bg-[#080808]/95 px-1.5 py-0.5 rounded max-w-[min(100%,280px)]",
        accentClass,
      )}
      style={{
        top: barTop,
        right: PRICE_SCALE_INSET + 4,
        height: BAR_HEIGHT,
        maxWidth: chartWidth - PRICE_SCALE_INSET - 12,
      }}
      title={title}
    >
      <span className="truncate tabular-nums">{label}</span>
    </div>
  );
}

function SyncStatusBadge({
  health,
  lastSyncTime,
  syncError,
  hasOverlayContent,
}: {
  health: string;
  lastSyncTime?: number;
  syncError: string | null;
  hasOverlayContent: boolean;
}) {
  const syncAgo = formatLastSyncAgo(lastSyncTime);

  let label = `BINGX REAL READ-ONLY · SYNC ${syncAgo.toUpperCase()}`;
  let tone = "text-slate-400 border-slate-600/60";

  if (syncError) {
    label = "BINGX REAL READ-ONLY · SYNC ERROR";
    tone = "text-red-300/90 border-red-900/50";
  } else if (health === "degraded") {
    label = "BINGX REAL READ-ONLY · DEGRADED";
    tone = "text-amber-300/80 border-amber-900/40";
  } else if (!hasOverlayContent) {
    label = `BINGX REAL READ-ONLY · TRADING LOCKED · ${syncAgo.toUpperCase()}`;
  }

  return (
    <div
      className={cn(
        "absolute top-1 left-1 z-[11] pointer-events-none rounded border px-1.5 py-0.5",
        "text-[8px] font-mono font-bold uppercase tracking-wider bg-black/85",
        tone,
      )}
    >
      {label}
    </div>
  );
}

export function BingXReadOnlyChartOverlay({
  brokerSession,
  chartWidth,
  chartHeight,
  viewportVersion,
  coordinates,
  visible = true,
  chartSymbol,
  candleSeries,
}: BingXReadOnlyChartOverlayProps) {
  const {
    bingxActive,
    positionsForSymbol,
    ordersForSymbol,
    isLoading,
    health,
    lastSyncTime,
    syncError,
  } = useBingXReadOnlyChartData(chartSymbol);

  const sym = chartSymbol ?? "BTC-USDT";
  const riskMirrorEnabled =
    visible &&
    brokerSession != null &&
    isBingXReadOnlySession(brokerSession);
  const { snapshot: riskSnapshot } = useBingXReadOnlyRiskMirror({
    brokerSession,
    symbol: sym,
    enabled: riskMirrorEnabled,
  });
  const riskBadge =
    riskSnapshot?.score.status === "danger"
      ? "RISK: DANGER"
      : riskSnapshot?.score.status === "conflicted"
        ? "CONTEXT: CONFLICTED"
        : null;

  const priceLineRefs = useRef<Map<string, IPriceLine>>(new Map());

  const lineSpecs = useMemo(() => {
    const specs: Array<{
      key: string;
      price: number;
      color: string;
      lineWidth: 1 | 2;
      lineStyle: number;
      thin?: boolean;
    }> = [];

    for (const pos of positionsForSymbol) {
      if (pos.entryPrice != null && pos.entryPrice > 0) {
        specs.push({
          key: `entry-${pos.symbol}-${pos.side}`,
          price: pos.entryPrice,
          color: positionLineColor(pos),
          lineWidth: 1,
          lineStyle: LineStyle.Solid,
        });
      }
      if (
        pos.liquidationPrice != null &&
        Number.isFinite(pos.liquidationPrice) &&
        pos.liquidationPrice > 0
      ) {
        specs.push({
          key: `liq-${pos.symbol}`,
          price: pos.liquidationPrice,
          color: BINGX_LIQ_LINE,
          lineWidth: 1,
          lineStyle: LineStyle.Dotted,
          thin: true,
        });
      }
    }

    for (const order of ordersForSymbol) {
      if (order.price == null || order.price <= 0) continue;
      specs.push({
        key: `order-${order.id}`,
        price: order.price,
        color: orderLineColor(order),
        lineWidth: 1,
        lineStyle: LineStyle.Dashed,
      });
    }

    return specs;
  }, [positionsForSymbol, ordersForSymbol]);

  const syncPriceLines = useCallback(() => {
    const series = candleSeries;
    if (!series || !bingxActive || !visible) {
      for (const [, line] of priceLineRefs.current) {
        series?.removePriceLine(line);
      }
      priceLineRefs.current.clear();
      return;
    }

    const nextKeys = new Set(lineSpecs.map((s) => s.key));

    for (const [key, line] of priceLineRefs.current) {
      if (!nextKeys.has(key)) {
        series.removePriceLine(line);
        priceLineRefs.current.delete(key);
      }
    }

    for (const spec of lineSpecs) {
      const existing = priceLineRefs.current.get(spec.key);
      if (existing) series.removePriceLine(existing);
      priceLineRefs.current.set(
        spec.key,
        series.createPriceLine({
          price: spec.price,
          color: spec.color,
          lineWidth: spec.lineWidth,
          lineStyle: spec.lineStyle,
          axisLabelVisible: false,
          title: "",
        }),
      );
    }
  }, [bingxActive, visible, candleSeries, lineSpecs]);

  useEffect(() => {
    syncPriceLines();
    return () => {
      const series = candleSeries;
      if (!series) return;
      for (const [, line] of priceLineRefs.current) {
        series.removePriceLine(line);
      }
      priceLineRefs.current.clear();
    };
  }, [syncPriceLines, candleSeries, viewportVersion]);

  if (
    !visible ||
    !bingxActive ||
    !brokerSession ||
    !isBingXReadOnlySession(brokerSession)
  ) {
    return null;
  }

  const hasOverlayContent =
    positionsForSymbol.length > 0 || ordersForSymbol.length > 0;

  return (
    <div
      data-bingx-readonly-chart-root
      className="absolute inset-0 z-[11] overflow-hidden pointer-events-none"
      style={{ width: chartWidth, height: chartHeight }}
    >
      <SyncStatusBadge
        health={health}
        lastSyncTime={lastSyncTime}
        syncError={syncError}
        hasOverlayContent={hasOverlayContent}
      />
      {riskBadge ? (
        <div
          className={cn(
            "absolute top-1 left-[min(52%,280px)] z-[11] pointer-events-none rounded border px-1.5 py-0.5",
            "text-[7px] font-mono font-bold uppercase tracking-wider bg-black/90",
            riskSnapshot?.score.status === "danger"
              ? "text-red-300/95 border-red-900/50"
              : "text-amber-300/90 border-amber-900/45",
          )}
        >
          {riskBadge}
        </div>
      ) : null}

      {isLoading && !hasOverlayContent ? (
        <div className="absolute top-7 left-1 z-[11] pointer-events-none text-[8px] font-mono text-slate-500">
          Syncing BingX read-only…
        </div>
      ) : null}

      {positionsForSymbol.map((pos) => (
        <PositionVisuals
          key={`pos-${pos.symbol}-${pos.side}`}
          pos={pos}
          chartWidth={chartWidth}
          chartHeight={chartHeight}
          coordinates={coordinates}
        />
      ))}

      {ordersForSymbol.map((order) => (
        <OrderVisuals
          key={order.id}
          order={order}
          chartWidth={chartWidth}
          chartHeight={chartHeight}
          coordinates={coordinates}
        />
      ))}
    </div>
  );
}

function PositionVisuals({
  pos,
  chartWidth,
  chartHeight,
  coordinates,
}: {
  pos: BingXNormalizedPosition;
  chartWidth: number;
  chartHeight: number;
  coordinates: DrawingsCoordinateHelpers;
}) {
  const entryY =
    pos.entryPrice != null ? coordinates.priceToCoordinate(pos.entryPrice) : null;
  const liqY =
    pos.liquidationPrice != null && pos.liquidationPrice > 0
      ? coordinates.priceToCoordinate(pos.liquidationPrice)
      : null;

  const sideTone =
    pos.side === "short" ? "text-orange-300/95" : "text-cyan-300/95";

  return (
    <>
      {entryY != null ? (
        <ReadOnlyBadge
          y={entryY}
          chartWidth={chartWidth}
          chartHeight={chartHeight}
          label={buildPositionBadgeLabel(pos)}
          accentClass={sideTone}
          title="Real BingX position. Read-only visualization. Trading locked."
        />
      ) : null}
      {liqY != null ? (
        <ReadOnlyBadge
          y={liqY}
          chartWidth={chartWidth}
          chartHeight={chartHeight}
          label={`LIQ REAL ${formatOverlayPrice(pos.liquidationPrice!)} · READ ONLY`}
          accentClass="text-red-400/70"
          title="Real liquidation price. Read-only. No actions."
        />
      ) : null}
    </>
  );
}

function OrderVisuals({
  order,
  chartWidth,
  chartHeight,
  coordinates,
}: {
  order: BingXNormalizedOrder;
  chartWidth: number;
  chartHeight: number;
  coordinates: DrawingsCoordinateHelpers;
}) {
  const price = order.price;
  if (price == null || price <= 0) return null;
  const y = coordinates.priceToCoordinate(price);
  if (y == null || !Number.isFinite(y)) return null;

  const tone =
    order.side === "sell" ? "text-orange-300/90" : "text-cyan-300/90";

  return (
    <ReadOnlyBadge
      y={y}
      chartWidth={chartWidth}
      chartHeight={chartHeight}
      label={buildOrderBadgeLabel(order)}
      accentClass={tone}
      title="Real BingX order. Read-only visualization."
    />
  );
}
