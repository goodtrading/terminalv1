/**
 * Client Market Engine — single in-memory source of truth for BTC OHLC:
 * base series + derived timeframes + live tail updates.
 *
 * LIMITATIONS (see user-facing list in task / README if added):
 * - Binance 1s history capped (~1000) → short lookback for 15s derived bars.
 * - If 1s is unavailable, 1m base cannot reproduce true 15s history; 15s uses server seed + live bucket merge only.
 * - 15m is loaded from native GET ?interval=15m (not aggregated from 1s).
 * - No pagination / streaming yet; periodic refetch refreshes bulk state.
 */

import { useSyncExternalStore } from "react";
import { fetchBtcMarketBasePack, type BtcMarketBasePack } from "@/lib/btcMarketBaseFetch";
import {
  aggregateCandles,
  appendToAggregated,
  sortAndDedupeCandlesByTime,
} from "@/lib/candleAggregationClient";
import { updateLiveCandle } from "@/lib/liveCandleUpdate";
import type { MarketCandle } from "@/lib/marketCandleTypes";
import {
  DEFAULT_CHART_TIMEFRAME,
  type ChartTimeframeId,
  CHART_TIMEFRAMES,
  getChartTimeframeMeta,
  isChartTimeframeId,
} from "@/lib/chartTimeframes";

const STORAGE_KEY = "goodtrading:chartTimeframe";
const MAX_BASE_CANDLES = 1200;

const TF_ORDER: ChartTimeframeId[] = CHART_TIMEFRAMES.map((t) => t.id);

/** Timeframes whose series comes from REST native interval, not client aggregation over `baseCandles`. */
const NATIVE_REST_SERIES: ChartTimeframeId[] = ["15m"];

function emptyByTf(): Record<ChartTimeframeId, MarketCandle[]> {
  return Object.fromEntries(CHART_TIMEFRAMES.map((t) => [t.id, []])) as Record<
    ChartTimeframeId,
    MarketCandle[]
  >;
}

let activeTimeframe: ChartTimeframeId = DEFAULT_CHART_TIMEFRAME;
let baseCandles: MarketCandle[] = [];
let baseBarSec = 1;
let candlesByTimeframe: Record<ChartTimeframeId, MarketCandle[]> = emptyByTf();
let lastUpdateTs: number | undefined;
let lastPack: BtcMarketBasePack | null = null;

const tfListeners = new Set<() => void>();
const dataListeners = new Set<() => void>();

function readStoredTimeframe(): ChartTimeframeId {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (raw && isChartTimeframeId(raw)) return raw;
  } catch {
    /* ignore */
  }
  return DEFAULT_CHART_TIMEFRAME;
}

activeTimeframe = readStoredTimeframe();

function emitTf() {
  tfListeners.forEach((fn) => fn());
}

function emitData() {
  dataListeners.forEach((fn) => fn());
}

export function subscribeChartTimeframe(listener: () => void): () => void {
  tfListeners.add(listener);
  return () => tfListeners.delete(listener);
}

export function subscribeMarketData(listener: () => void): () => void {
  dataListeners.add(listener);
  return () => dataListeners.delete(listener);
}

export function getChartTimeframe(): ChartTimeframeId {
  return activeTimeframe;
}

export function getChartTimeframeBarSec(): number {
  return getChartTimeframeMeta(activeTimeframe).barSec;
}

export function setChartTimeframe(id: ChartTimeframeId): void {
  if (activeTimeframe === id) return;
  activeTimeframe = id;
  try {
    localStorage.setItem(STORAGE_KEY, id);
  } catch {
    /* ignore */
  }
  ensureTimeframeFromCache(id);
  emitTf();
  emitData();
}

export function useChartTimeframe(): ChartTimeframeId {
  return useSyncExternalStore(subscribeChartTimeframe, () => activeTimeframe, () => DEFAULT_CHART_TIMEFRAME);
}

/** True when target TF can be derived purely from current base granularity */
export function canDeriveTimeframeFromBase(targetBarSec: number, baseSec: number): boolean {
  return baseSec > 0 && targetBarSec % baseSec === 0 && baseSec <= targetBarSec;
}

function rebuildAllDerived(): void {
  const saved15m = candlesByTimeframe["15m"];
  candlesByTimeframe = emptyByTf();
  candlesByTimeframe["15m"] = saved15m;
  for (const tf of TF_ORDER) {
    if (NATIVE_REST_SERIES.includes(tf)) continue;
    const sec = getChartTimeframeMeta(tf).barSec;
    if (canDeriveTimeframeFromBase(sec, baseBarSec)) {
      candlesByTimeframe[tf] = aggregateCandles(baseCandles, sec);
    }
  }
}

function applySeed15s(seed: MarketCandle[] | undefined): void {
  if (seed?.length) {
    candlesByTimeframe["15s"] = sortAndDedupeCandlesByTime(seed);
  }
}

function applyNative15m(seed: MarketCandle[] | undefined): void {
  if (seed?.length) {
    candlesByTimeframe["15m"] = sortAndDedupeCandlesByTime(seed);
  }
}

/**
 * Replace engine state from REST pack (called after successful React Query fetch).
 */
export function hydrateMarketEngine(pack: BtcMarketBasePack): void {
  lastPack = pack;
  baseCandles = sortAndDedupeCandlesByTime(pack.base);
  baseBarSec = pack.baseBarSec;
  if (baseCandles.length > MAX_BASE_CANDLES) {
    baseCandles = baseCandles.slice(-MAX_BASE_CANDLES);
  }
  rebuildAllDerived();
  applySeed15s(pack.seed15s);
  applyNative15m(pack.native15m);
  lastUpdateTs = Date.now();
  emitData();
}

/** Re-fetch helper for useQuery */
export function fetchAndShapeBtcBasePack(): Promise<BtcMarketBasePack> {
  return fetchBtcMarketBasePack();
}

function ensureTimeframeFromCache(id: ChartTimeframeId): void {
  if (candlesByTimeframe[id].length > 0) return;
  if (NATIVE_REST_SERIES.includes(id)) return;
  const sec = getChartTimeframeMeta(id).barSec;
  if (canDeriveTimeframeFromBase(sec, baseBarSec)) {
    candlesByTimeframe[id] = aggregateCandles(baseCandles, sec);
  }
}

function alignToBase(sec: number): number {
  return Math.floor(sec / baseBarSec) * baseBarSec;
}

function trimBase(): void {
  if (baseCandles.length > MAX_BASE_CANDLES) {
    baseCandles = baseCandles.slice(-MAX_BASE_CANDLES);
  }
}

/** Live merge for TFs that are not mathematically derivable from base (e.g. 15s with 1m base). */
function applyLivePriceToTail(
  existing: MarketCandle[],
  price: number,
  nowSec: number,
  tfSec: number,
): MarketCandle[] {
  return updateLiveCandle(existing, price, nowSec, tfSec);
}

/**
 * Incremental live update from ticker — updates base tail then derived TFs without full aggregation scans.
 */
export function applyMarketTicker(price: number, timestampMs: number): void {
  if (!Number.isFinite(price) || !Number.isFinite(timestampMs) || baseCandles.length === 0) return;

  const nowSec = Math.floor(timestampMs / 1000);
  const aligned = alignToBase(nowSec);
  const lastBase = baseCandles[baseCandles.length - 1]!;

  let delta: MarketCandle[];
  if (lastBase.time === aligned) {
    const updated: MarketCandle = {
      ...lastBase,
      close: price,
      high: Math.max(lastBase.high, price),
      low: Math.min(lastBase.low, price),
    };
    baseCandles = [...baseCandles.slice(0, -1), updated];
    delta = [updated];
  } else if (aligned > lastBase.time) {
    const neu: MarketCandle = {
      time: aligned,
      open: price,
      high: price,
      low: price,
      close: price,
      volume: 0,
    };
    baseCandles = [...baseCandles, neu];
    trimBase();
    delta = [neu];
  } else {
    return;
  }

  for (const tf of TF_ORDER) {
    const sec = getChartTimeframeMeta(tf).barSec;
    if (NATIVE_REST_SERIES.includes(tf)) {
      if (candlesByTimeframe[tf].length > 0) {
        candlesByTimeframe[tf] = applyLivePriceToTail(candlesByTimeframe[tf], price, nowSec, sec);
      }
      continue;
    }
    if (canDeriveTimeframeFromBase(sec, baseBarSec)) {
      candlesByTimeframe[tf] = appendToAggregated(candlesByTimeframe[tf], delta, sec);
    } else if (tf === "15s" && candlesByTimeframe["15s"].length > 0) {
      candlesByTimeframe["15s"] = applyLivePriceToTail(candlesByTimeframe["15s"], price, nowSec, sec);
    }
  }

  lastUpdateTs = Date.now();
  emitData();
}

/** Immutable copy for chart / UI */
export function getCandlesSliceForTimeframe(tf: ChartTimeframeId): MarketCandle[] {
  return (candlesByTimeframe[tf] ?? []).map((c) => ({ ...c }));
}

export function getActiveCandlesSlice(): MarketCandle[] {
  return getCandlesSliceForTimeframe(activeTimeframe);
}

export function getLastCandleForTimeframe(tf: ChartTimeframeId): MarketCandle | null {
  const s = candlesByTimeframe[tf];
  if (!s?.length) return null;
  const c = s[s.length - 1]!;
  return { ...c };
}

export function getMarketEngineInternals(): {
  baseBarSec: number;
  baseLen: number;
  lastUpdateTs?: number;
  lastPackMode: "1s" | "1m+fallback" | "none";
} {
  return {
    baseBarSec,
    baseLen: baseCandles.length,
    lastUpdateTs,
    lastPackMode:
      lastPack == null ? "none" : lastPack.baseBarSec === 1 ? "1s" : "1m+fallback",
  };
}
