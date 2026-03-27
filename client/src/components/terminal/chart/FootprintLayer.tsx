import { useQuery } from "@tanstack/react-query";
import type { MutableRefObject, RefObject } from "react";
import { useCallback, useEffect, useRef, useState } from "react";
import type { CandlestickData, IChartApi, ISeriesApi, Time } from "lightweight-charts";
import { buildFootprintForBar, getFootprintBarWindowMs } from "@/lib/footprintAggregate";
import {
  FOOTPRINT_DEBUG,
  FOOTPRINT_MAX_PRICE_LEVELS,
  FOOTPRINT_PALETTE,
  FOOTPRINT_MIN_BAR_WIDTH_PX,
  FOOTPRINT_PIPELINE_DEBUG,
  FOOTPRINT_TRADE_DEBOUNCE_MS,
  getFootprintPriceStepUsd,
} from "@/lib/footprintConfig";
import { drawFootprintBar, type FootprintPaintDebug } from "@/lib/footprintBarPainter";
import type { FootprintAggTrade, FootprintCandle, FootprintLevel } from "@/lib/footprintTypes";
import { fetchFootprintAggTrades } from "@/lib/fetchFootprintTrades";

/** Bar open as ms (must match `getFootprintBarWindowMs`: seconds vs ms same rules as MainChart / candle fetch). */
function timeToUnixMsOpen(t: Time): number | null {
  if (typeof t !== "number" || !Number.isFinite(t)) return null;
  const sec = t > 1e10 ? Math.floor(t / 1000) : Math.floor(t);
  return sec * 1000;
}

function visibleTimeToUnixMs(t: unknown): number | null {
  if (typeof t === "number" && Number.isFinite(t)) {
    const sec = t > 1e10 ? Math.floor(t / 1000) : Math.floor(t);
    return sec * 1000;
  }
  return null;
}

/**
 * Y en el mismo espacio que el canvas overlay: LW devuelve `priceToCoordinate` relativo al **pane**
 * de la serie, no al `chartElement`. Sin el offset, el footprint no calza con el eje ni entre velas.
 */
function footprintPriceY(
  chart: IChartApi,
  series: ISeriesApi<"Candlestick">,
  price: number,
): number | null {
  const ySeries = series.priceToCoordinate(price);
  if (ySeries == null || !Number.isFinite(ySeries)) return null;
  const chartEl = chart.chartElement();
  const paneEl = series.getPane().getHTMLElement();
  if (!paneEl) return ySeries;
  const cr = chartEl.getBoundingClientRect();
  const pr = paneEl.getBoundingClientRect();
  return ySeries + (pr.top - cr.top);
}

function fmtQty(q: number): string {
  if (q >= 100) return q.toFixed(0);
  if (q >= 10) return q.toFixed(1);
  return q.toFixed(2);
}

/**
 * Full bitmap wipe. Must reset CTM first — clearRect uses the current transform,
 * so clearing after setTransform(dpr) leaves uncleaned pixels (ghost footprints when zooming out).
 */
function wipeFootprintCanvas(canvas: HTMLCanvasElement | null): void {
  if (!canvas) return;
  const ctx = canvas.getContext("2d");
  if (!ctx) return;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, canvas.width, canvas.height);
}

function getFootprintCached(
  cacheRef: MutableRefObject<{
    trades: FootprintAggTrade[] | null;
    barSec: number | null;
    map: Map<string, FootprintCandle>;
  }>,
  ohlc: { time: number; open: number; high: number; low: number; close: number },
  trades: FootprintAggTrade[],
  barSec: number,
  priceStepUsd: number,
): FootprintCandle {
  const c = cacheRef.current;
  if (c.trades !== trades || c.barSec !== barSec) {
    c.trades = trades;
    c.barSec = barSec;
    c.map.clear();
  }
  const { t0Sec: tKey } = getFootprintBarWindowMs(ohlc, barSec);
  const cacheKey = `${tKey}:${barSec}:${priceStepUsd}`;
  let fp = c.map.get(cacheKey);
  if (!fp) {
    fp = buildFootprintForBar(ohlc, trades, barSec, priceStepUsd);
    c.map.set(cacheKey, fp);
  }
  return fp;
}

type FootprintBarLifeState = "empty" | "partial" | "closed";

type FootprintBarSnapshot = {
  state: FootprintBarLifeState;
  levels: FootprintLevel[];
  stepUsd: number;
  lastSeenMs: number;
};

function barStableKey(t0Sec: number, barSec: number): string {
  return `${t0Sec}:${barSec}`;
}

function mergeLevelsMonotonic(prev: FootprintLevel[], next: FootprintLevel[]): FootprintLevel[] {
  const map = new Map<number, FootprintLevel>();
  for (const l of prev) {
    map.set(l.price, { ...l });
  }
  for (const l of next) {
    const p = map.get(l.price);
    if (!p) {
      map.set(l.price, { ...l });
      continue;
    }
    const bid = Math.max(p.bidVolume, l.bidVolume);
    const ask = Math.max(p.askVolume, l.askVolume);
    map.set(l.price, {
      price: l.price,
      bidVolume: bid,
      askVolume: ask,
      totalVolume: bid + ask,
      delta: ask - bid,
    });
  }
  return Array.from(map.values())
    .sort((a, b) => b.price - a.price)
    .slice(0, FOOTPRINT_MAX_PRICE_LEVELS);
}

export type FootprintLayerProps = {
  chartRef: RefObject<IChartApi | null>;
  candleSeriesRef: RefObject<ISeriesApi<"Candlestick"> | null>;
  chartReady: boolean;
  viewportVersion: number;
  barSec: number;
  width: number;
  height: number;
  symbol?: string;
  /**
   * When footprint zoom mode is on, parent should ghost LW candle bodies so LW candles
   * do not paint giant red/green blocks over the footprint canvas.
   */
  onFootprintVisualActiveChange?: (active: boolean) => void;
};

export function FootprintLayer({
  chartRef,
  candleSeriesRef,
  chartReady,
  viewportVersion,
  barSec,
  width,
  height,
  symbol = "BTCUSDT",
  onFootprintVisualActiveChange,
}: FootprintLayerProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  /** Evita resetear width/height del bitmap en cada frame si no cambió el layout (menos flicker). */
  const canvasLayoutRef = useRef({ w: 0, h: 0, dpr: 0 });
  const fpCacheRef = useRef<{
    trades: FootprintAggTrade[] | null;
    barSec: number | null;
    map: Map<string, FootprintCandle>;
  }>({
    trades: null,
    barSec: null,
    map: new Map(),
  });
  const barLifeRef = useRef<Map<string, FootprintBarSnapshot>>(new Map());
  const liveTradesRef = useRef<Map<string, FootprintAggTrade>>(new Map());
  const liveTradeWatermarkRef = useRef(0);
  const mergedTradesRef = useRef<FootprintAggTrade[]>([]);
  const tradesDirtyRef = useRef(true);
  const baseTradesRef = useRef<FootprintAggTrade[]>([]);
  const flowLogTsRef = useRef(0);
  const diagLogTsRef = useRef(0);
  const drawDiagLogTsRef = useRef(0);
  const schedulePaintRef = useRef<() => void>(() => {});
  const [zoom, setZoom] = useState({ active: false, barWidthPx: 0 });
  const [fetchWindow, setFetchWindow] = useState<{ startMs: number; endMs: number } | null>(null);
  const debounceTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const scheduleWindow = useCallback((w: { startMs: number; endMs: number } | null) => {
    if (debounceTimer.current) clearTimeout(debounceTimer.current);
    if (!w || w.endMs <= w.startMs) {
      debounceTimer.current = null;
      setFetchWindow(null);
      return;
    }
    debounceTimer.current = setTimeout(() => {
      setFetchWindow(w);
      debounceTimer.current = null;
    }, FOOTPRINT_TRADE_DEBOUNCE_MS);
  }, []);

  useEffect(() => {
    // Timeframe switch must rebuild buckets from scratch for the new bar size.
    fpCacheRef.current.trades = null;
    fpCacheRef.current.barSec = barSec;
    fpCacheRef.current.map.clear();
    barLifeRef.current.clear();
  }, [barSec]);

  useEffect(() => {
    return () => {
      if (debounceTimer.current) clearTimeout(debounceTimer.current);
      wipeFootprintCanvas(canvasRef.current);
    };
  }, []);

  useEffect(() => {
    if (!zoom.active) {
      wipeFootprintCanvas(canvasRef.current);
    }
  }, [zoom.active]);

  useEffect(() => {
    onFootprintVisualActiveChange?.(zoom.active);
  }, [zoom.active, onFootprintVisualActiveChange]);

  useEffect(() => {
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chartReady || !chart || !series) {
      setZoom({ active: false, barWidthPx: 0 });
      scheduleWindow(null);
      return;
    }

    const measure = () => {
      const vr = chart.timeScale().getVisibleLogicalRange();
      const tr = chart.timeScale().getVisibleRange();
      const data = series.data() as CandlestickData<Time>[];
      if (!vr || data.length < 2) {
        setZoom({ active: false, barWidthPx: 0 });
        scheduleWindow(null);
        return;
      }
      const i = Math.max(0, Math.min(data.length - 2, Math.floor(vr.from)));
      const t0 = data[i].time;
      const t1 = data[i + 1].time;
      const x0 = chart.timeScale().timeToCoordinate(t0);
      const x1 = chart.timeScale().timeToCoordinate(t1);
      if (x0 == null || x1 == null) {
        setZoom({ active: false, barWidthPx: 0 });
        scheduleWindow(null);
        return;
      }
      const barWidthPx = Math.abs(x1 - x0);
      const active = barWidthPx >= FOOTPRINT_MIN_BAR_WIDTH_PX;
      setZoom({ active, barWidthPx });

      if (!active) {
        scheduleWindow(null);
        return;
      }
      const barMs = Math.max(1, barSec) * 1000;
      // Preferred: visible time range from chart API (from/to in chart time coordinates).
      if (tr) {
        const tFromMs = visibleTimeToUnixMs((tr as any).from);
        const tToMs = visibleTimeToUnixMs((tr as any).to);
        if (tFromMs != null && tToMs != null) {
          const left = Math.min(tFromMs, tToMs);
          const right = Math.max(tFromMs, tToMs) + barMs; // inclusive->exclusive
          const now = Date.now();
          const expandedStartMs = Math.max(0, left - 2 * barMs);
          const expandedEndMs = Math.min(now, right + 2 * barMs);
          if (expandedEndMs > expandedStartMs) {
            scheduleWindow({ startMs: expandedStartMs, endMs: expandedEndMs });
            return;
          }
        }
      }
      /** Fallback: derive from visible logical range indexes. */
      let idxFirst = Math.max(0, Math.floor(vr.from) - 1);
      let idxLast = Math.min(data.length - 1, Math.ceil(vr.to) + 1);
      if (idxFirst > idxLast) {
        const s = idxFirst;
        idxFirst = idxLast;
        idxLast = s;
      }
      const firstOpenMs = timeToUnixMsOpen(data[idxFirst]!.time);
      const lastOpenMs = timeToUnixMsOpen(data[idxLast]!.time);
      if (firstOpenMs == null || lastOpenMs == null) {
        scheduleWindow(null);
        return;
      }
      /** ±2·barMs so debounced refetch and scale rounding still cover every visible bar. */
      const visibleEndExclusiveMs = lastOpenMs + barMs;
      const expandedStartMs = Math.max(0, firstOpenMs - 2 * barMs);
      const now = Date.now();
      const expandedEndMs = Math.min(visibleEndExclusiveMs + 2 * barMs, now);
      if (expandedEndMs <= expandedStartMs) {
        scheduleWindow({ startMs: now - 60_000, endMs: now });
        return;
      }
      scheduleWindow({
        startMs: expandedStartMs,
        endMs: expandedEndMs,
      });
    };

    measure();
    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(measure);
    ts.subscribeVisibleTimeRangeChange(measure);
    return () => {
      ts.unsubscribeVisibleLogicalRangeChange(measure);
      ts.unsubscribeVisibleTimeRangeChange(measure);
    };
  }, [chartReady, barSec, chartRef, candleSeriesRef, viewportVersion, scheduleWindow]);

  const queryEnabled = zoom.active && fetchWindow != null && fetchWindow.endMs > fetchWindow.startMs;

  const {
    data: trades,
    isPending,
    isError,
    isFetching,
    isPlaceholderData,
    error: queryError,
  } = useQuery({
    queryKey: ["footprint-agg-trades", symbol, barSec, fetchWindow?.startMs, fetchWindow?.endMs],
    queryFn: () =>
      fetchFootprintAggTrades(symbol, fetchWindow!.startMs, fetchWindow!.endMs, 5000, barSec),
    enabled: queryEnabled,
    staleTime: 45_000,
    gcTime: 120_000,
    /** Keep prior window's trades while a new range loads — avoids painting empty footprint on every pan/zoom. */
    placeholderData: (previousData) => previousData,
  });

  baseTradesRef.current = (trades ?? []) as FootprintAggTrade[];
  tradesDirtyRef.current = true;

  const getMergedTrades = useCallback((): FootprintAggTrade[] => {
    if (!tradesDirtyRef.current) return mergedTradesRef.current;
    const keepAfter =
      fetchWindow != null
        ? Math.max(0, fetchWindow.startMs - Math.max(1, barSec) * 1000 * 4)
        : 0;
    const base = baseTradesRef.current;
    const map = new Map<string, FootprintAggTrade>();
    for (const t of base) {
      if (t.time >= keepAfter) map.set(t.id, t);
    }
    for (const [id, t] of liveTradesRef.current.entries()) {
      if (t.time < keepAfter) {
        liveTradesRef.current.delete(id);
        continue;
      }
      map.set(id, t);
    }
    mergedTradesRef.current = Array.from(map.values()).sort((a, b) => a.time - b.time);
    tradesDirtyRef.current = false;
    if (process.env.NODE_ENV !== "production") {
      const now = Date.now();
      if (now - flowLogTsRef.current > 1500) {
        flowLogTsRef.current = now;
        console.debug("[FootprintFlow] merge sizes", {
          baseTrades: base.length,
          liveTrades: liveTradesRef.current.size,
          mergedTrades: mergedTradesRef.current.length,
          barSec,
        });
      }
    }
    return mergedTradesRef.current;
  }, [barSec, fetchWindow]);

  const pipelineLogRef = useRef(0);

  useEffect(() => {
    if (!zoom.active || !queryEnabled) return;
    const since = Math.max(0, liveTradeWatermarkRef.current || Date.now() - 1_500);
    const es = new EventSource(
      `/api/market/agg-trades/stream?symbol=${encodeURIComponent(symbol)}&since=${since}`,
    );
    es.onmessage = (ev) => {
      try {
        const rowRaw = JSON.parse(ev.data) as FootprintAggTrade;
        const row = {
          ...rowRaw,
          time: rowRaw.time < 1e11 ? Math.floor(rowRaw.time * 1000) : Math.floor(rowRaw.time),
        } as FootprintAggTrade;
        if (
          !row ||
          typeof row.id !== "string" ||
          !Number.isFinite(row.price) ||
          !Number.isFinite(row.qty) ||
          !Number.isFinite(row.time)
        ) {
          return;
        }
        liveTradesRef.current.set(row.id, row);
        if (row.time > liveTradeWatermarkRef.current) liveTradeWatermarkRef.current = row.time;
        tradesDirtyRef.current = true;
        schedulePaintRef.current();
      } catch {
        // ignore malformed SSE row
      }
    };
    return () => {
      es.close();
    };
  }, [zoom.active, queryEnabled, symbol]);

  useEffect(() => {
    if (!FOOTPRINT_PIPELINE_DEBUG || !zoom.active || !fetchWindow || !queryEnabled) return;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return;
    const vr = chart.timeScale().getVisibleLogicalRange();
    const seriesData = series.data() as CandlestickData<Time>[];
    if (!vr || seriesData.length === 0) return;
    let fromI = Math.max(0, Math.floor(vr.from));
    let toI = Math.min(seriesData.length - 1, Math.ceil(vr.to));
    if (fromI > toI) {
      const s = fromI;
      fromI = toI;
      toI = s;
    }
    const agg = getMergedTrades();
    const priceStepUsd = getFootprintPriceStepUsd(barSec, zoom.barWidthPx);
    let barsVis = 0;
    let barsWithLevels = 0;
    let maxLv = 0;
    let tradesTouchedBars = 0;
    const barRows: { barTime: number; barStartMs: number; barEndMsExclusive: number; tradesInBar: number }[] =
      [];
    for (let idx = fromI; idx <= toI; idx++) {
      const bar = seriesData[idx];
      if (!bar || typeof (bar as CandlestickData<Time>).open !== "number") continue;
      const ohlc = {
        time: Number(bar.time),
        open: bar.open,
        high: bar.high,
        low: bar.low,
        close: bar.close,
      };
      const fp = getFootprintCached(fpCacheRef, ohlc, agg, barSec, priceStepUsd);
      barsVis++;
      const n = fp.levels.length;
      if (n > 0) {
        barsWithLevels++;
        maxLv = Math.max(maxLv, n);
      }
      const { barStartMs, barEndMsExclusive } = getFootprintBarWindowMs(ohlc, barSec);
      let tradesInBar = 0;
      for (const t of agg) {
        if (t.time >= barStartMs && t.time < barEndMsExclusive) tradesInBar++;
      }
      if (tradesInBar > 0) tradesTouchedBars++;
      barRows.push({
        barTime: ohlc.time,
        barStartMs,
        barEndMsExclusive,
        tradesInBar,
      });
    }
    const inWin = agg.filter(
      (t) => t.time >= fetchWindow.startMs && t.time <= fetchWindow.endMs,
    ).length;
    const now = Date.now();
    if (now - pipelineLogRef.current < 1800) return;
    pipelineLogRef.current = now;
    console.groupCollapsed(
      `[FootprintPipeline] sym=${symbol} trades=${agg.length} inFetchWindow=${inWin} bars=${barsVis} withLevels=${barsWithLevels}`,
    );
    console.log("fetchWindow ms", fetchWindow.startMs, "→", fetchWindow.endMs, "barSec", barSec);
    console.log("query", {
      isPending,
      isFetching,
      isError,
      isPlaceholderData,
      error: isError ? queryError : undefined,
      dataUndefined: trades === undefined,
    });
    console.log("aggregate", {
      barsVisible: barsVis,
      barsWithLevels,
      maxLevelsOnBar: maxLv,
      barsWithTradesMs: tradesTouchedBars,
    });
    console.log(
      "BAR WINDOWS (time=s open, barStartMs, barEndMsExclusive, tradesInBar)",
      barRows.slice(0, 48),
    );
    console.groupEnd();
  }, [
    zoom.active,
    queryEnabled,
    fetchWindow,
    getMergedTrades,
    barSec,
    symbol,
    chartRef,
    candleSeriesRef,
    viewportVersion,
    isPending,
    isFetching,
    isError,
    isPlaceholderData,
    queryError,
    zoom.barWidthPx,
  ]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    if (!zoom.active || !queryEnabled || !fetchWindow) return;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;
    if (!chart || !series) return;
    const now = Date.now();
    if (now - diagLogTsRef.current < 2000) return;
    diagLogTsRef.current = now;

    const data = series.data() as CandlestickData<Time>[];
    const vr = chart.timeScale().getVisibleLogicalRange();
    if (!vr || data.length === 0) return;
    let from = Math.max(0, Math.floor(vr.from));
    let to = Math.min(data.length - 1, Math.ceil(vr.to));
    if (from > to) [from, to] = [to, from];
    const bars = data.slice(from, to + 1).filter((b) => b && typeof (b as any).open === "number");
    if (bars.length === 0) return;
    const barMs = Math.max(1, barSec) * 1000;
    const first = bars[0]!;
    const last = bars[bars.length - 1]!;
    const firstOpenMs = timeToUnixMsOpen(first.time as Time);
    const lastOpenMs = timeToUnixMsOpen(last.time as Time);
    const firstBarStartMs = firstOpenMs ?? 0;
    const lastBarEndMs = (lastOpenMs ?? 0) + barMs;

    const merged = getMergedTrades();
    const inVisibleBars = merged.filter(
      (t) => t.time >= firstBarStartMs && t.time < lastBarEndMs,
    );
    const sample = merged.slice(0, 10).map((t) => {
      const barStart = Math.floor(t.time / barMs) * barMs;
      const falls = barStart >= firstBarStartMs && barStart < lastBarEndMs;
      return {
        tradeTime: t.time,
        barStartMs: barStart,
        barEndMs: barStart + barMs,
        fallsInVisibleBars: falls,
      };
    });

    let barsWithLevels = 0;
    let barsWithTrades = 0;
    for (const b of bars) {
      const ohlc = {
        time: Number(b.time),
        open: b.open,
        high: b.high,
        low: b.low,
        close: b.close,
      };
      const fp = getFootprintCached(fpCacheRef, ohlc, merged, barSec, getFootprintPriceStepUsd(barSec, zoom.barWidthPx));
      if (fp.levels.length > 0) barsWithLevels++;
      const w = getFootprintBarWindowMs(ohlc, barSec);
      const n = merged.filter((t) => t.time >= w.barStartMs && t.time < w.barEndMsExclusive).length;
      if (n > 0) barsWithTrades++;
    }

    const statuses = { empty: 0, partial: 0, closed: 0 };
    for (const b of bars) {
      const { t0Sec } = getFootprintBarWindowMs({ time: Number(b.time) }, barSec);
      const s = barLifeRef.current.get(barStableKey(t0Sec, barSec))?.state ?? "empty";
      (statuses as any)[s] = ((statuses as any)[s] ?? 0) + 1;
    }

    let minTradeTime = Number.POSITIVE_INFINITY;
    let maxTradeTime = Number.NEGATIVE_INFINITY;
    for (const t of merged) {
      if (t.time < minTradeTime) minTradeTime = t.time;
      if (t.time > maxTradeTime) maxTradeTime = t.time;
    }

    console.groupCollapsed("[FootprintDiag] checklist");
    console.log("TEST1 timeframe", { barSec, barMs });
    console.log("TEST2 coverage", {
      visibleFrom: vr.from,
      visibleTo: vr.to,
      firstBarStartMs,
      lastBarEndMs,
      visibleBars: bars.length,
    });
    console.log("TEST3 fetch window", {
      startTime: fetchWindow.startMs,
      endTime: fetchWindow.endMs,
      returnedTradesMerged: merged.length,
      minTradeTime: Number.isFinite(minTradeTime) ? minTradeTime : null,
      maxTradeTime: Number.isFinite(maxTradeTime) ? maxTradeTime : null,
    });
    console.log("TEST4 merge", {
      baseTrades: baseTradesRef.current.length,
      liveTrades: liveTradesRef.current.size,
      mergedTrades: merged.length,
    });
    console.log("TEST5 trade->bar sample", sample);
    console.log("TEST6 trade->level", {
      barsWithTrades,
      barsWithLevels,
      priceStep: getFootprintPriceStepUsd(barSec, zoom.barWidthPx),
      inVisibleBarsTrades: inVisibleBars.length,
    });
    console.log("TEST7 snapshot states", statuses);
    console.groupEnd();
  }, [zoom.active, queryEnabled, fetchWindow, barSec, getMergedTrades, chartRef, candleSeriesRef, zoom.barWidthPx]);

  useEffect(() => {
    if (process.env.NODE_ENV === "production") return;
    const now = Date.now();
    if (now - flowLogTsRef.current < 1200) return;
    flowLogTsRef.current = now;
    console.debug("[FootprintFlow] query update", {
      queryEnabled,
      isPending,
      isFetching,
      isError,
      isPlaceholderData,
      baseTrades: baseTradesRef.current.length,
      liveTrades: liveTradesRef.current.size,
      barSec,
    });
  }, [queryEnabled, isPending, isFetching, isError, isPlaceholderData, barSec, trades]);

  useEffect(() => {
    const canvas = canvasRef.current;
    const chart = chartRef.current;
    const series = candleSeriesRef.current;

    if (!canvas) return;

    if (!zoom.active) {
      wipeFootprintCanvas(canvas);
      return;
    }

    if (!chart || !series || width < 48 || height < 48) {
      wipeFootprintCanvas(canvas);
      return;
    }

    let rafId = 0;
    let lastDataSig = "";

    const paint = () => {
      rafId = 0;
      const canvas2 = canvasRef.current;
      const chart2 = chartRef.current;
      const series2 = candleSeriesRef.current;
      if (!canvas2 || !chart2 || !series2 || !zoom.active) return;

      const dpr = window.devicePixelRatio || 1;
      const cw = Math.floor(width * dpr);
      const ch = Math.floor(height * dpr);
      const lay = canvasLayoutRef.current;
      if (lay.w !== cw || lay.h !== ch || lay.dpr !== dpr) {
        lay.w = cw;
        lay.h = ch;
        lay.dpr = dpr;
        canvas2.width = cw;
        canvas2.height = ch;
        canvas2.style.width = `${width}px`;
        canvas2.style.height = `${height}px`;
      }

      const ctx = canvas2.getContext("2d");
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.clearRect(0, 0, width, height);

      const vr = chart2.timeScale().getVisibleLogicalRange();
      const data = series2.data() as CandlestickData<Time>[];
      if (!vr || data.length === 0) return;

      let from = Math.max(0, Math.floor(vr.from));
      let to = Math.min(data.length - 1, Math.ceil(vr.to));
      if (from > to) {
        const s = from;
        from = to;
        to = s;
      }
      const agg = getMergedTrades();
      const priceStepUsd = getFootprintPriceStepUsd(barSec, zoom.barWidthPx);
      let plotClipTop = 0;
      let plotClipBottom = height;
      const chartElPaint = chart2.chartElement();
      const paneElPaint = series2.getPane().getHTMLElement();
      if (chartElPaint && paneElPaint) {
        const cr = chartElPaint.getBoundingClientRect();
        const pr = paneElPaint.getBoundingClientRect();
        plotClipTop = pr.top - cr.top;
        plotClipBottom = pr.bottom - cr.top;
      } else {
        const tsH = chart2.timeScale().height();
        plotClipBottom = Math.max(12, height - tsH);
      }

      const dbg: FootprintPaintDebug = {
        barsDrawn: 0,
        levelRowsRendered: 0,
        textRowsSkipped: 0,
        imbalanceLevels: 0,
        stackedBands: 0,
        skippedInvalidGeom: 0,
        skippedXOut: 0,
        skippedBandSmall: 0,
        skippedYOut: 0,
        barsInputWithLevels: 0,
        barsPairsBuilt: 0,
        barsPairsEmpty: 0,
      };

      type BarDraw = {
        ohlc: { time: number; open: number; high: number; low: number; close: number };
        fp: FootprintCandle;
        tx: number;
        barW: number;
        vol: number;
        bandTop: number;
        bandBottom: number;
        state: FootprintBarLifeState;
      };

      const queue: BarDraw[] = [];
      const nowMs = Date.now();
      const lastBar = data[data.length - 1];
      const liveTimeSec = lastBar
        ? Math.floor((Number(lastBar.time) > 1e10 ? Number(lastBar.time) / 1000 : Number(lastBar.time)))
        : null;
      const ts = chart2.timeScale();
      const logicalToCoordinate = (ts as any).logicalToCoordinate as
        | ((logical: number) => number | null)
        | undefined;

      let visibleBarsCount = 0;
      for (let idx = from; idx <= to; idx++) {
        const bar = data[idx];
        if (!bar || typeof (bar as CandlestickData<Time>).open !== "number") continue;
        visibleBarsCount++;
        const ohlc = {
          time: Number(bar.time),
          open: bar.open,
          high: bar.high,
          low: bar.low,
          close: bar.close,
        };
        const fpRaw = getFootprintCached(fpCacheRef, ohlc, agg, barSec, priceStepUsd);
        const { t0Sec } = getFootprintBarWindowMs(ohlc, barSec);
        const key = barStableKey(t0Sec, barSec);
        const prevSnap = barLifeRef.current.get(key);
        const isCurrent = liveTimeSec != null && t0Sec === liveTimeSec;

        let mergedLevels = fpRaw.levels;
        if (prevSnap) {
          if (prevSnap.stepUsd !== priceStepUsd) {
            // On zoom-step changes, rebuild from current aggregation to keep buckets consistent.
            mergedLevels = fpRaw.levels;
          } else
          if (prevSnap.state === "closed") {
            mergedLevels = prevSnap.levels;
          } else if (fpRaw.levels.length === 0 && prevSnap.levels.length > 0) {
            // Never drop an existing bar because this frame has no trades.
            mergedLevels = prevSnap.levels;
          } else {
            mergedLevels = mergeLevelsMonotonic(prevSnap.levels, fpRaw.levels);
          }
        }

        let state: FootprintBarLifeState;
        if (isCurrent) {
          state = mergedLevels.length > 0 ? "partial" : "empty";
        } else {
          // Non-current bars are frozen: they must persist and never flicker.
          state = "closed";
        }

        const fp: FootprintCandle = { ...fpRaw, levels: mergedLevels };
        barLifeRef.current.set(key, {
          state,
          levels: mergedLevels,
          stepUsd: priceStepUsd,
          lastSeenMs: nowMs,
        });

        let tx = ts.timeToCoordinate(bar.time);
        if (tx == null && logicalToCoordinate) {
          const x0 = logicalToCoordinate.call(ts, idx - 0.5);
          const x1 = logicalToCoordinate.call(ts, idx + 0.5);
          if (x0 != null && x1 != null) tx = (x0 + x1) / 2;
        }
        if (tx == null) {
          const visSpan = Math.max(1, to - from + 1);
          tx = ((idx - from) + 0.5) * (width / visSpan);
        }

        let barW = zoom.barWidthPx;
        if (logicalToCoordinate) {
          const x0 = logicalToCoordinate.call(ts, idx - 0.5);
          const x1 = logicalToCoordinate.call(ts, idx + 0.5);
          if (x0 != null && x1 != null) {
            barW = Math.max(2, Math.abs(x1 - x0));
          }
        } else {
          const next = data[idx + 1];
          if (next) {
            const tx2 = ts.timeToCoordinate(next.time);
            if (tx2 != null) barW = Math.abs(tx2 - tx);
          } else {
            const prev = data[idx - 1];
            if (prev) {
              const tx0 = ts.timeToCoordinate(prev.time);
              if (tx0 != null) barW = Math.abs(tx - tx0);
            }
          }
        }

        const ys = [
          footprintPriceY(chart2, series2, ohlc.high),
          footprintPriceY(chart2, series2, ohlc.low),
          footprintPriceY(chart2, series2, ohlc.open),
          footprintPriceY(chart2, series2, ohlc.close),
        ].filter((y): y is number => y != null && Number.isFinite(y));

        let bandTop = 0;
        let bandBottom = 0;
        if (ys.length >= 2) {
          bandTop = Math.min(...ys);
          bandBottom = Math.max(...ys);
        } else if (ys.length === 1) {
          bandTop = ys[0]! - 3;
          bandBottom = ys[0]! + 3;
        } else {
          // Último fallback: usar clip del plot para no dejar huecos visuales.
          const yMid = (plotClipTop + plotClipBottom) / 2;
          bandTop = yMid - 3;
          bandBottom = yMid + 3;
        }
        if (bandBottom - bandTop < 2) bandBottom = bandTop + 2;

        let vol = 0;
        for (const l of fp.levels) vol += l.totalVolume;

        queue.push({ ohlc, fp, tx, barW, vol, bandTop, bandBottom, state });
      }

      // Prune very old snapshots to keep memory bounded, but keep enough history for panning.
      if (liveTimeSec != null) {
        const minKeepSec = liveTimeSec - Math.max(1, barSec) * 2200;
        for (const [k, snap] of barLifeRef.current.entries()) {
          const t = Number(k.split(":")[0]);
          if (Number.isFinite(t) && t < minKeepSec && nowMs - snap.lastSeenMs > 30_000) {
            barLifeRef.current.delete(k);
          }
        }
      }

      const maxVol = queue.reduce((m, b) => Math.max(m, b.vol), 0);
      const levelsToDraw = queue.reduce((sum, b) => sum + b.fp.levels.length, 0);

      if (FOOTPRINT_PIPELINE_DEBUG) {
        const miss = visibleBarsCount - queue.length;
        if (miss !== 0) {
          console.warn("[FootprintCoverage] visible vs queued mismatch", {
            visibleBars: visibleBarsCount,
            queuedBars: queue.length,
            missing: miss,
            from,
            to,
            barSec,
          });
        } else {
          console.debug("[FootprintCoverage] full visible coverage", {
            visibleBars: visibleBarsCount,
            queuedBars: queue.length,
            barSec,
          });
        }
      }

      for (const b of queue) {
        drawFootprintBar({
          ctx,
          fp: b.fp,
          priceStepUsd,
          plotClipTop,
          plotClipBottom,
          tx: b.tx,
          barW: b.barW,
          width,
          height,
          bandTop: b.bandTop,
          bandBottom: b.bandBottom,
          isVolumeLeader: maxVol > 0 && b.vol >= maxVol * 0.88 && b.vol > 0,
          dbg,
          footprintPriceY: (price: number) => footprintPriceY(chart2, series2, price),
          fmtQty,
        });
      }

      if (process.env.NODE_ENV !== "production") {
        const nowDraw = Date.now();
        if (nowDraw - drawDiagLogTsRef.current > 1000) {
          drawDiagLogTsRef.current = nowDraw;
          const sampleBars = queue.slice(0, 3).map((b) => ({
            x: Number.isFinite(b.tx) ? Number(b.tx.toFixed(2)) : b.tx,
            yTop: Number.isFinite(b.bandTop) ? Number(b.bandTop.toFixed(2)) : b.bandTop,
            yBottom: Number.isFinite(b.bandBottom) ? Number(b.bandBottom.toFixed(2)) : b.bandBottom,
            barWidth: Number.isFinite(b.barW) ? Number(b.barW.toFixed(2)) : b.barW,
            levels: b.fp.levels.length,
          }));
          console.log("DRAW FOOTPRINT FRAME", {
            canvasWidth: width,
            canvasHeight: height,
            dpr,
            barsQueued: queue.length,
            levelsToDraw,
            priceStepUsd,
            barsInputWithLevels: dbg.barsInputWithLevels,
            barsPairsBuilt: dbg.barsPairsBuilt,
            barsPairsEmpty: dbg.barsPairsEmpty,
            skipGeom: dbg.skippedInvalidGeom,
            skipX: dbg.skippedXOut,
            skipBand: dbg.skippedBandSmall,
            skipY: dbg.skippedYOut,
            barsDrawn: dbg.barsDrawn,
            levelRowsRendered: dbg.levelRowsRendered,
            sampleBars,
          });
          console.log("levels to draw:", levelsToDraw);
        }
      }

      if (process.env.NODE_ENV !== "production") {
        // Manual canvas visibility test: if this red square does not appear, the issue is canvas/layer z-index.
        ctx.save();
        ctx.fillStyle = "red";
        ctx.globalAlpha = 0.9;
        ctx.fillRect(100, 100, 50, 50);
        ctx.restore();
      }

      ctx.fillStyle = FOOTPRINT_PALETTE.labelWatermark;
      ctx.font = '500 10px "JetBrains Mono", ui-monospace, monospace';
      ctx.textAlign = "right";
      ctx.textBaseline = "alphabetic";
      ctx.fillText("FOOTPRINT", width - 8, 14);

      if (FOOTPRINT_DEBUG) {
        ctx.save();
        ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = FOOTPRINT_PALETTE.debugMagenta;
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const lines = [
          `bars=${dbg.barsDrawn}`,
          `rows=${dbg.levelRowsRendered}`,
          `txtSkip=${dbg.textRowsSkipped}`,
          `imb=${dbg.imbalanceLevels}`,
          `stack=${dbg.stackedBands}`,
          `skipGeom=${dbg.skippedInvalidGeom}`,
          `skipX=${dbg.skippedXOut}`,
          `skipBand=${dbg.skippedBandSmall}`,
          `skipY=${dbg.skippedYOut}`,
          `inLvl=${dbg.barsInputWithLevels}`,
          `pairs=${dbg.barsPairsBuilt}`,
          `pairs0=${dbg.barsPairsEmpty}`,
        ];
        let ly = 18;
        for (const line of lines) {
          ctx.fillText(line, 8, ly);
          ly += 11;
        }
        ctx.restore();
      }

      if (FOOTPRINT_PIPELINE_DEBUG) {
        ctx.save();
        ctx.font = '9px "JetBrains Mono", ui-monospace, monospace';
        ctx.fillStyle = "rgba(250, 200, 120, 0.92)";
        ctx.textAlign = "left";
        ctx.textBaseline = "top";
        const py = FOOTPRINT_DEBUG ? 62 : 18;
        const linesPl = [
          `${symbol} | barSec=${barSec}`,
          `trades=${agg.length} pend=${isPending} fetch=${isFetching} ph=${isPlaceholderData}`,
            `err=${isError ? 1 : 0}`,
        ];
        let ly = py;
        for (const line of linesPl) {
          ctx.fillText(line, 8, ly);
          ly += 12;
        }
        ctx.restore();
      }
    };

    const schedulePaint = () => {
      if (rafId) return;
      rafId = requestAnimationFrame(paint);
    };
    schedulePaintRef.current = schedulePaint;

    const onDataChanged = () => {
      schedulePaint();
    };

    const ts = chart.timeScale();
    ts.subscribeVisibleLogicalRangeChange(schedulePaint);
    ts.subscribeVisibleTimeRangeChange(schedulePaint);

    // Lightweight Charts v5 expone subscribeDataChanged en series; usarlo cuando esté disponible.
    const seriesAny = series as any;
    const hasDataChangedApi =
      typeof seriesAny.subscribeDataChanged === "function" &&
      typeof seriesAny.unsubscribeDataChanged === "function";
    if (hasDataChangedApi) {
      seriesAny.subscribeDataChanged(onDataChanged);
    }

    // Fallback robusto: detectar firma de datos si el adaptador no dispara eventos.
    const dataPoll = window.setInterval(() => {
      const s = candleSeriesRef.current;
      if (!s || !zoom.active) return;
      const d = s.data() as CandlestickData<Time>[];
      if (d.length === 0) return;
      const last = d[d.length - 1]!;
      const sig = `${d.length}:${String(last.time)}:${last.open}:${last.high}:${last.low}:${last.close}`;
      if (sig !== lastDataSig) {
        lastDataSig = sig;
        schedulePaint();
      }
    }, 250);

    schedulePaint();
    return () => {
      schedulePaintRef.current = () => {};
      ts.unsubscribeVisibleLogicalRangeChange(schedulePaint);
      ts.unsubscribeVisibleTimeRangeChange(schedulePaint);
      if (hasDataChangedApi) {
        seriesAny.unsubscribeDataChanged(onDataChanged);
      }
      window.clearInterval(dataPoll);
      if (rafId) cancelAnimationFrame(rafId);
    };
  }, [
    zoom.active,
    zoom.barWidthPx,
    getMergedTrades,
    width,
    height,
    barSec,
    viewportVersion,
    chartRef,
    candleSeriesRef,
    queryEnabled,
    isPending,
    isFetching,
    isError,
    isPlaceholderData,
    symbol,
  ]);

  if (!chartReady) return null;

  return (
    <canvas
      ref={canvasRef}
      className="absolute inset-0 z-[6] pointer-events-none"
      aria-hidden
    />
  );
}
