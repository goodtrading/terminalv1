import { useCallback, useEffect, useMemo, useRef } from "react";
import { LineStyle, type IPriceLine } from "lightweight-charts";
import { cn } from "@/lib/utils";
import type { DrawingsCoordinateHelpers } from "../drawings/DrawingsLayer";
import type {
  BingXNormalizedOrder,
  BrokerSessionState,
} from "../execution/executionTypes";
import { resolveExecutionSymbolForChart } from "../execution/executionContext";
import { formatLastSyncAgo } from "../execution/bingxReadOnlyMessages";
import { PositionRiskOverlay } from "../chartRisk/PositionRiskOverlay";
import { useBingxRealActionsEnabled } from "../chartRisk/useBingxRealActionsEnabled";
import { buildOrderBadgeLabel, orderLineColor, PRICE_SCALE_INSET } from "./bingxReadOnlyChartHelpers";
import {
  bingxPositionToOverlayPosition,
  bingxSnapshotToRiskLevels,
} from "./bingxPositionRiskAdapter";
import {
  isBingXChartOverlaySession,
  useBingXReadOnlyChartData,
} from "./useBingXReadOnlyChartData";
import { useBingXReadOnlyRiskMirror } from "../riskMirror/useBingXReadOnlyRiskMirror";

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

function LimitOrderBadge({
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
  console.debug("[BINGX_LIMIT_DIAG][badge-received]", {
    id: order.id,
    symbol: order.symbol,
    status: order.status,
    type: order.type,
    price: order.price ?? null,
    triggerPrice: order.triggerPrice ?? null,
  });
  const price = order.price;
  if (price == null || price <= 0) {
    console.debug("[BINGX_LIMIT_DIAG][badge-skip]", {
      id: order.id,
      reason: "invalid_price",
      price: price ?? null,
    });
    return null;
  }
  const y = coordinates.priceToCoordinate(price);
  if (y == null || !Number.isFinite(y)) {
    console.debug("[BINGX_LIMIT_DIAG][badge-skip]", {
      id: order.id,
      reason: "invalid_coordinate",
      price,
      y: y ?? null,
    });
    return null;
  }

  const barTop = Math.min(
    Math.max(y - BAR_HEIGHT / 2, 4),
    chartHeight - BAR_HEIGHT - 4,
  );
  const tone =
    order.side === "sell" ? "text-orange-300/90" : "text-cyan-300/90";

  return (
    <div
      className={cn(
        "absolute z-[11] pointer-events-none flex items-center font-mono text-[9px] leading-none",
        "border border-slate-600/50 bg-[#080808]/95 px-1.5 py-0.5 rounded max-w-[min(100%,280px)]",
        tone,
      )}
      style={{
        top: barTop,
        right: PRICE_SCALE_INSET + 4,
        height: BAR_HEIGHT,
        maxWidth: chartWidth - PRICE_SCALE_INSET - 12,
      }}
      title="Real BingX limit order. Read-only visualization."
    >
      <span className="truncate tabular-nums">{buildOrderBadgeLabel(order)}</span>
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
  const chartOverlayActive = isBingXChartOverlaySession(brokerSession);

  const {
    positionsForSymbol,
    ordersForSymbol,
    riskOrdersForSymbol,
    snapshot,
    isLoading,
    health,
    lastSyncTime,
    syncError,
    executionSymbol,
  } = useBingXReadOnlyChartData(brokerSession, chartSymbol);

  const bingxRealActionsEnabled = useBingxRealActionsEnabled();
  const riskMirrorEnabled = visible && chartOverlayActive;
  const { snapshot: riskSnapshot } = useBingXReadOnlyRiskMirror({
    brokerSession,
    symbol: executionSymbol,
    enabled: riskMirrorEnabled,
  });
  const riskBadge =
    riskSnapshot?.score.status === "danger"
      ? "RISK: DANGER"
      : riskSnapshot?.score.status === "conflicted"
        ? "RISK: CONFLICTED"
        : null;

  const priceLineRefs = useRef<Map<string, IPriceLine>>(new Map());

  const limitOrderLineSpecs = useMemo(() => {
    const specs: Array<{ key: string; price: number; color: string }> = [];
    for (const order of ordersForSymbol) {
      if (order.price == null || order.price <= 0) {
        console.debug("[BINGX_LIMIT_DIAG][line-spec-skip]", {
          id: order.id,
          symbol: order.symbol,
          status: order.status,
          type: order.type,
          price: order.price ?? null,
          reason: "invalid_price",
        });
        continue;
      }
      specs.push({
        key: `order-${order.id}`,
        price: order.price,
        color: orderLineColor(order),
      });
    }
    console.debug("[BINGX_LIMIT_DIAG][line-specs]", {
      ordersForSymbol: ordersForSymbol.map((o) => ({
        id: o.id,
        symbol: o.symbol,
        status: o.status,
        type: o.type,
        price: o.price ?? null,
        triggerPrice: o.triggerPrice ?? null,
      })),
      specs,
    });
    return specs;
  }, [ordersForSymbol]);

  const syncLimitOrderLines = useCallback(() => {
    const series = candleSeries;
    if (!series || !visible || !chartOverlayActive) {
      for (const [, line] of priceLineRefs.current) {
        series?.removePriceLine(line);
      }
      priceLineRefs.current.clear();
      return;
    }

    const nextKeys = new Set(limitOrderLineSpecs.map((s) => s.key));
    for (const [key, line] of priceLineRefs.current) {
      if (!nextKeys.has(key)) {
        series.removePriceLine(line);
        priceLineRefs.current.delete(key);
      }
    }

    for (const spec of limitOrderLineSpecs) {
      const existing = priceLineRefs.current.get(spec.key);
      if (existing) series.removePriceLine(existing);
      priceLineRefs.current.set(
        spec.key,
        series.createPriceLine({
          price: spec.price,
          color: spec.color,
          lineWidth: 1,
          lineStyle: LineStyle.Dashed,
          axisLabelVisible: false,
          title: "",
        }),
      );
    }
  }, [visible, chartOverlayActive, candleSeries, limitOrderLineSpecs]);

  useEffect(() => {
    syncLimitOrderLines();
    return () => {
      const series = candleSeries;
      if (!series) return;
      for (const [, line] of priceLineRefs.current) {
        series.removePriceLine(line);
      }
      priceLineRefs.current.clear();
    };
  }, [syncLimitOrderLines, candleSeries, viewportVersion]);

  if (import.meta.env.DEV && visible) {
    console.debug("[bingx-chart] overlay gate", {
      visible,
      chartOverlayActive,
      exchange: brokerSession?.exchange,
      connectionMode: brokerSession?.connectionMode,
      connected: brokerSession?.connected,
      connectionId: Boolean(brokerSession?.connectionId),
      positions: positionsForSymbol.length,
    });
  }

  if (!visible || !chartOverlayActive || !brokerSession) {
    return null;
  }

  const { stopLoss, takeProfit } = bingxSnapshotToRiskLevels(
    snapshot,
    riskOrdersForSymbol,
  );

  const hasOverlayContent =
    positionsForSymbol.length > 0 ||
    ordersForSymbol.length > 0 ||
    riskOrdersForSymbol.length > 0;

  return (
    <div
      data-bingx-readonly-chart-root
      className="absolute inset-0 z-[12] overflow-hidden pointer-events-none"
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

      {positionsForSymbol.map((pos) => {
        const overlayPosition = bingxPositionToOverlayPosition(pos);
        if (!overlayPosition) {
          if (import.meta.env.DEV) {
            console.debug("[bingx-chart] skip position normalize", {
              side: pos.side,
              quantity: pos.quantity,
              entryPrice: pos.entryPrice,
            });
          }
          return null;
        }
        return (
          <PositionRiskOverlay
            key={`bingx-risk-${pos.symbol}-${pos.side}`}
            mode="bingx_read_only"
            readonly
            showReadOnlyBadge
            liveTradingEnabled={bingxRealActionsEnabled}
            realActionsEnabled={bingxRealActionsEnabled}
            showLockedActionControls
            position={overlayPosition}
            account={snapshot?.account}
            stopLoss={stopLoss}
            takeProfit={takeProfit}
            liquidationPrice={pos.liquidationPrice}
            chartWidth={chartWidth}
            chartHeight={chartHeight}
            viewportVersion={viewportVersion}
            coordinates={coordinates}
            candleSeries={candleSeries}
            zIndex={12}
          />
        );
      })}

      {ordersForSymbol.map((order) => (
        <LimitOrderBadge
          key={`bingx-order-${order.id}`}
          order={order}
          chartWidth={chartWidth}
          chartHeight={chartHeight}
          coordinates={coordinates}
        />
      ))}
    </div>
  );
}
