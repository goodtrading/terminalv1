import React, { useRef, useEffect, useState, useCallback, useMemo } from "react";
import type { FootprintBar, FootprintRenderState, FootprintConfig } from "./footprintTypes";
import { DEFAULT_FOOTPRINT_CONFIG } from "./footprintTypes";
import { buildFootprintBars, filterBarsForVisibleRange, timeframeToMs } from "./buildFootprintBars";
import { chartTimeToUnixMs, chartTimeToUnixSec } from "./footprintTime";
import { FOOTPRINT_PRESET_ATAS } from "./footprintPreset";
import { getFootprintTickSize } from "./getFootprintTickSize";
import { useFootprintTrades } from "./useFootprintTrades";
import { paintFootprintBars } from "./paintFootprint";

export type FootprintOverlayProps = {
  chartRef: React.RefObject<any>;
  candleSeriesRef: React.RefObject<any>;
  active: boolean;
  timeframe: string;
  symbol: string;
  width: number;
  height: number;
  onRenderStateChange?: (state: FootprintRenderState) => void;
};

type Snapshot = {
  render: FootprintRenderState;
  /** Apertura primera/última vela visible (ms UNIX). */
  visibleStartMs: number;
  visibleEndMs: number;
  /** Ventana fetch agg-trades (ms UNIX), con margen. */
  tradeStartMs: number;
  tradeEndMs: number;
};

function readCandleData(series: any): { time: unknown; close?: number }[] {
  try {
    const d = series.data?.();
    return Array.isArray(d) ? d : [];
  } catch {
    return [];
  }
}

/**
 * Rango visible desde velas en serie (índices lógicos); no usar getVisibleRange del timeScale
 * (en algunas versiones / estados devuelve valores no comparables con trades en ms).
 */
function computeFootprintSnapshot(
  chart: any,
  series: any,
  active: boolean,
  symbol: string,
  timeframe: string,
  config: FootprintConfig
): Snapshot | null {
  if (!active || !chart || !series) return null;
  const data = readCandleData(series);
  if (!data.length) return null;

  const ts = chart.timeScale();
  const visibleLogical = ts.getVisibleLogicalRange?.();
  if (!visibleLogical) return null;

  const from = Math.max(0, Math.floor(visibleLogical.from));
  const to = Math.min(data.length - 1, Math.ceil(visibleLogical.to));
  const visibleBars = visibleLogical.to - visibleLogical.from + 1;

  const barMs = timeframeToMs(timeframe);

  const tFromMs = chartTimeToUnixMs(data[from]?.time);
  const tToMs = chartTimeToUnixMs(data[to]?.time);
  if (tFromMs == null || tToMs == null) return null;

  const visibleStartMs = Math.min(tFromMs, tToMs);
  const visibleEndMs = Math.max(tFromMs, tToMs);

  /** Fase 1: ventana acotada (máx. 2h) anclada al cierre de rango visible — Binance devuelve trades ascendentes desde startTime. */
  const maxFetchWindowMs = Math.min(Math.max(barMs * 8, 30 * 60 * 1000), 2 * 60 * 60 * 1000);
  const now = Date.now();
  let tradeEndMs = visibleEndMs + barMs * 2;
  if (tradeEndMs > now) tradeEndMs = now;
  let tradeStartMs = Math.max(visibleStartMs - barMs * 2, tradeEndMs - maxFetchWindowMs);
  if (tradeStartMs >= tradeEndMs) {
    tradeStartMs = Math.max(0, tradeEndMs - maxFetchWindowMs);
  }

  const midIdx = Math.min(data.length - 2, Math.max(0, Math.floor((from + to) / 2)));
  const secA = chartTimeToUnixSec(data[midIdx]?.time);
  const secB = chartTimeToUnixSec(data[midIdx + 1]?.time);
  let candleWidthPx = 0;
  if (secA != null && secB != null) {
    const xa = ts.timeToCoordinate(secA as any);
    const xb = ts.timeToCoordinate(secB as any);
    if (typeof xa === "number" && typeof xb === "number") {
      candleWidthPx = Math.abs(xb - xa);
    }
  }
  if (!(candleWidthPx > 0)) {
    const el = chart.chartElement?.();
    const cw = typeof el?.clientWidth === "number" ? el.clientWidth : chart.timeScale?.()?.width?.() ?? 600;
    candleWidthPx = cw / Math.max(1, visibleBars);
  }
  candleWidthPx = Math.max(1, candleWidthPx);

  const { finalTickSize, mode } = getFootprintTickSize({ symbol, timeframe, candleWidthPx });

  const last = data[data.length - 1];
  const referencePrice =
    typeof last?.close === "number" && Number.isFinite(last.close) ? last.close : 50_000;

  let rowHeight = 0;
  try {
    const y1 = series.priceToCoordinate(referencePrice);
    const y2 = series.priceToCoordinate(referencePrice + finalTickSize);
    if (typeof y1 === "number" && typeof y2 === "number") rowHeight = Math.abs(y1 - y2);
  } catch {
    rowHeight = 0;
  }

  const canRender =
    mode !== "hidden" &&
    rowHeight >= config.minRowHeight &&
    visibleBars <= config.maxVisibleBars;

  const render: FootprintRenderState = {
    active: true,
    canRender,
    candleWidth: candleWidthPx,
    rowHeight,
    visibleBars,
    mode,
    finalTickSize,
  };

  return { render, visibleStartMs, visibleEndMs, tradeStartMs, tradeEndMs };
}

function tradesOverlapVisibleRange(
  trades: { time: number }[] | undefined,
  visibleStartMs: number,
  visibleEndMs: number
): boolean {
  if (!trades?.length) return false;
  const first = trades[0].time;
  const last = trades[trades.length - 1].time;
  const vs = Math.min(visibleStartMs, visibleEndMs);
  const ve = Math.max(visibleStartMs, visibleEndMs);
  return first <= ve && last >= vs;
}

export function FootprintOverlay({
  chartRef,
  candleSeriesRef,
  active,
  timeframe,
  symbol,
  width,
  height,
  onRenderStateChange,
}: FootprintOverlayProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [viewportVersion, setViewportVersion] = useState(0);
  const config: FootprintConfig = useMemo(
    () => ({
      ...DEFAULT_FOOTPRINT_CONFIG,
      imbalanceRatio: FOOTPRINT_PRESET_ATAS.imbalanceRatio,
      maxLevelsPerBar: FOOTPRINT_PRESET_ATAS.maxLevelsFull,
    }),
    []
  );
  const alignmentLogKeyRef = useRef("");

  const snapshot = useMemo((): Snapshot | null => {
    return computeFootprintSnapshot(
      chartRef.current,
      candleSeriesRef.current,
      active,
      symbol,
      timeframe,
      config
    );
  }, [viewportVersion, active, symbol, timeframe, config]);

  const tradeStart = snapshot?.tradeStartMs;
  const tradeEnd = snapshot?.tradeEndMs;

  const { data: trades, isLoading, isFetching } = useFootprintTrades(
    symbol,
    tradeStart,
    tradeEnd,
    active && !!symbol,
    snapshot
      ? { visibleStartMs: snapshot.visibleStartMs, visibleEndMs: snapshot.visibleEndMs }
      : null
  );

  const barMs = useMemo(() => timeframeToMs(timeframe), [timeframe]);

  const builtFootprintBars = useMemo((): FootprintBar[] => {
    if (!active || !trades?.length || !snapshot || snapshot.render.mode === "hidden") {
      return [];
    }
    const tick = snapshot.render.finalTickSize;
    return buildFootprintBars(trades, timeframe, tick, config);
  }, [active, trades, timeframe, snapshot, config]);

  const visibleFootprintBars = useMemo((): FootprintBar[] => {
    if (!builtFootprintBars.length || !snapshot) return [];
    return filterBarsForVisibleRange(
      builtFootprintBars,
      snapshot.visibleStartMs,
      snapshot.visibleEndMs,
      barMs,
      config.maxVisibleBars + 16
    );
  }, [builtFootprintBars, snapshot, barMs, config.maxVisibleBars]);

  useEffect(() => {
    if (!import.meta.env.DEV || !active || !snapshot) return;
    const key = [
      viewportVersion,
      tradeStart,
      tradeEnd,
      trades?.length ?? 0,
      builtFootprintBars.length,
      visibleFootprintBars.length,
    ].join("|");
    if (key === alignmentLogKeyRef.current) return;
    alignmentLogKeyRef.current = key;
    const vs = snapshot.visibleStartMs;
    const ve = snapshot.visibleEndMs;
    const tc = trades?.length ?? 0;
    const ft = trades?.[0]?.time ?? null;
    const lt = tc && trades ? trades[tc - 1]?.time ?? null : null;
    const fb = builtFootprintBars[0]?.time ?? null;
    const lb = builtFootprintBars.length ? builtFootprintBars[builtFootprintBars.length - 1]?.time ?? null : null;
    const fetchWindowMinutes =
      tradeStart != null && tradeEnd != null ? (tradeEnd - tradeStart) / 60000 : 0;
    const tradesOverlapVisible =
      ft != null && lt != null ? ft <= Math.max(vs, ve) && lt >= Math.min(vs, ve) : false;
    const barsOverlapVisible =
      fb != null && lb != null ? fb <= Math.max(vs, ve) && lb >= Math.min(vs, ve) : false;
    // eslint-disable-next-line no-console
    console.warn("[FootprintTimeAlignment]", {
      visibleStartMs: vs,
      visibleEndMs: ve,
      tradeStartMs: tradeStart ?? null,
      tradeEndMs: tradeEnd ?? null,
      fetchWindowMinutes,
      tradesCount: tc,
      firstTradeTime: ft,
      lastTradeTime: lt,
      barsBuilt: builtFootprintBars.length,
      firstBarTime: fb,
      lastBarTime: lb,
      visibleBars: visibleFootprintBars.length,
      tradesOverlapVisible,
      barsOverlapVisible,
    });
  }, [
    active,
    snapshot,
    tradeStart,
    tradeEnd,
    trades,
    builtFootprintBars,
    visibleFootprintBars,
    viewportVersion,
  ]);

  useEffect(() => {
    if (!active) {
      alignmentLogKeyRef.current = "";
      return;
    }
    const chart = chartRef.current;
    if (!chart) return;

    const bump = () => setViewportVersion((v) => v + 1);
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange?.(bump);
    ts.subscribeVisibleTimeRangeChange?.(bump);

    const ro = new ResizeObserver(bump);
    const el = chart.chartElement?.();
    if (el) ro.observe(el);

    bump();

    return () => {
      ts.unsubscribeVisibleLogicalRangeChange?.(bump);
      ts.unsubscribeVisibleTimeRangeChange?.(bump);
      ro.disconnect();
    };
  }, [active, chartRef]);

  const rangeDebugKeyRef = useRef("");

  useEffect(() => {
    if (!import.meta.env.DEV || !active) return;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    const data = readCandleData(series);
    const ts = chart?.timeScale?.();
    const visibleLogicalRange = ts?.getVisibleLogicalRange?.() ?? null;
    const visibleTimeRange = ts?.getVisibleRange?.() ?? null;
    const firstT = data[0] ? chartTimeToUnixMs(data[0].time) : null;
    const lastT = data.length ? chartTimeToUnixMs(data[data.length - 1].time) : null;
    const key = `${viewportVersion}|${snapshot?.visibleStartMs ?? ""}|${snapshot?.visibleEndMs ?? ""}|${trades?.length ?? ""}|${builtFootprintBars.length}|${visibleFootprintBars.length}`;
    if (key === rangeDebugKeyRef.current) return;
    rangeDebugKeyRef.current = key;
    // eslint-disable-next-line no-console
    console.warn("[FootprintRangeDebug]", {
      timeframe,
      symbol,
      active,
      visibleLogicalRange,
      visibleTimeRange,
      derivedVisibleStartMs: snapshot?.visibleStartMs ?? null,
      derivedVisibleEndMs: snapshot?.visibleEndMs ?? null,
      tradeStart,
      tradeEnd,
      chartDataFirstTime: firstT,
      chartDataLastTime: lastT,
      candleCount: data.length,
      candleWidthPx: snapshot?.render.candleWidth ?? null,
      mode: snapshot?.render.mode ?? null,
      finalTickSize: snapshot?.render.finalTickSize ?? null,
      builtBars: builtFootprintBars.length,
      visibleBarsFiltered: visibleFootprintBars.length,
    });
  }, [
    active,
    builtFootprintBars.length,
    chartRef,
    snapshot,
    symbol,
    timeframe,
    tradeEnd,
    tradeStart,
    trades?.length,
    viewportVersion,
    visibleFootprintBars.length,
  ]);

  const renderNotifyKey = useRef("");

  useEffect(() => {
    if (!active) renderNotifyKey.current = "";
  }, [active]);

  useEffect(() => {
    if (!onRenderStateChange) return;
    const r: FootprintRenderState = !active
      ? {
          active: false,
          canRender: false,
          candleWidth: 0,
          rowHeight: 0,
          visibleBars: 0,
          mode: "hidden",
          finalTickSize: config.tickSize,
        }
      : snapshot?.render ?? {
          active: true,
          canRender: false,
          candleWidth: 0,
          rowHeight: 0,
          visibleBars: 0,
          mode: "hidden",
          finalTickSize: config.tickSize,
        };
    const key = JSON.stringify(r);
    if (key === renderNotifyKey.current) return;
    renderNotifyKey.current = key;
    onRenderStateChange(r);
  }, [active, snapshot, onRenderStateChange, config.tickSize]);

  const drawMessage = useCallback(
    (ctx: CanvasRenderingContext2D, message: string, color: string) => {
      ctx.fillStyle = color;
      ctx.font = "12px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "center";
      ctx.textBaseline = "middle";
      ctx.fillText(message, width / 2, height / 2);
    },
    [width, height]
  );

  const paint = useCallback(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    ctx.clearRect(0, 0, width, height);

    if (!active) {
      return;
    }

    if (!chart || !series) {
      drawMessage(ctx, "FOOTPRINT — chart not ready", "rgba(148, 163, 184, 0.55)");
      return;
    }

    if (!snapshot) {
      drawMessage(ctx, "FOOTPRINT — no viewport", "rgba(148, 163, 184, 0.45)");
      return;
    }

    const { render: state } = snapshot;

    if (state.mode === "hidden") {
      return;
    }

    if (isLoading && !trades?.length) {
      drawMessage(ctx, "FOOTPRINT — loading trades…", "rgba(148, 163, 184, 0.5)");
      return;
    }

    if (!trades?.length) {
      drawMessage(ctx, "FOOTPRINT WAITING FOR TRADES", "rgba(148, 163, 184, 0.55)");
      return;
    }

    if (!state.canRender) {
      let reason = "Zoom in for footprint";
      if (state.visibleBars > config.maxVisibleBars) {
        reason = `Too many bars (${Math.round(state.visibleBars)})`;
      } else if (state.rowHeight < config.minRowHeight) {
        reason = `Price scale too tight (${state.rowHeight.toFixed(1)}px)`;
      }
      drawMessage(ctx, reason, "rgba(148, 163, 184, 0.5)");
      return;
    }

    if (!visibleFootprintBars.length) {
      const vs = snapshot.visibleStartMs;
      const ve = snapshot.visibleEndMs;
      const tradesOverlap = tradesOverlapVisibleRange(trades, vs, ve);
      if (trades?.length && !tradesOverlap) {
        if (import.meta.env.DEV) {
          // eslint-disable-next-line no-console
          console.warn("[FootprintOutsideVisible]", {
            reason: "fetch_window_vs_chart_visible",
            visibleStartMs: vs,
            visibleEndMs: ve,
            firstTradeTime: trades[0]?.time,
            lastTradeTime: trades[trades.length - 1]?.time,
          });
        }
        drawMessage(ctx, "FOOTPRINT — trades outside visible range", "rgba(251, 191, 36, 0.65)");
        return;
      }
      drawMessage(ctx, "FOOTPRINT — no bars in range", "rgba(148, 163, 184, 0.45)");
      return;
    }

    let priceMin = 0;
    let priceMax = 0;
    try {
      priceMin = series.coordinateToPrice(height);
      priceMax = series.coordinateToPrice(0);
    } catch {
      priceMin = 0;
      priceMax = 0;
    }

    const paintMode =
      state.mode === "full" && state.candleWidth < 35 ? "compact" : state.mode;

    paintFootprintBars(ctx, chart, series, visibleFootprintBars, config, {
      mode: paintMode,
      candleWidthPx: state.candleWidth,
      rowHeightPx: state.rowHeight,
      logicalWidth: width,
      logicalHeight: height,
      barTimeframeMs: barMs,
      priceMin,
      priceMax,
      presetOpacity: FOOTPRINT_PRESET_ATAS.opacity,
      maxLevelsCompact: Math.min(3, FOOTPRINT_PRESET_ATAS.maxLevelsCompact),
      maxLevelsFull: Math.min(30, FOOTPRINT_PRESET_ATAS.maxLevelsFull),
      showStackedImbalance: FOOTPRINT_PRESET_ATAS.showStackedImbalance,
    });
  }, [
    active,
    width,
    height,
    symbol,
    timeframe,
    config,
    trades,
    builtFootprintBars,
    visibleFootprintBars,
    isLoading,
    drawMessage,
    barMs,
    snapshot,
    tradeStart,
    tradeEnd,
  ]);

  useEffect(() => {
    const id = requestAnimationFrame(() => paint());
    return () => cancelAnimationFrame(id);
  }, [paint, viewportVersion, isFetching]);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const dpr = window.devicePixelRatio || 1;
    canvas.width = Math.floor(width * dpr);
    canvas.height = Math.floor(height * dpr);
    canvas.style.width = `${width}px`;
    canvas.style.height = `${height}px`;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.setTransform(1, 0, 0, 1, 0, 0);
      ctx.scale(dpr, dpr);
    }
    requestAnimationFrame(() => paint());
  }, [width, height, paint]);

  return (
    <canvas
      ref={canvasRef}
      style={{
        position: "absolute",
        top: 0,
        left: 0,
        width: "100%",
        height: "100%",
        pointerEvents: "none",
        zIndex: 5,
      }}
    />
  );
}
