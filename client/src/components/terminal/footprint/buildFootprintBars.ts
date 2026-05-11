import type { AggTrade, FootprintBar, FootprintLevel, FootprintConfig } from "./footprintTypes";
import { tradeTimeToUnixMs } from "./footprintTime";

let lastFootprintBuildLog = "";

/**
 * Duración de vela en ms. Acepta "15m", "15M", "1h", "1H" (M = minutos, nunca meses).
 */
export function timeframeToMs(timeframe: string): number {
  const tf = timeframe.trim().toLowerCase();
  if (tf.length < 2) return 60_000;
  const unit = tf.slice(-1);
  const value = parseInt(tf.slice(0, -1), 10);
  if (!Number.isFinite(value) || value <= 0) return 60_000;
  switch (unit) {
    case "s":
      return value * 1000;
    case "m":
      return value * 60 * 1000;
    case "h":
      return value * 60 * 60 * 1000;
    case "d":
      return value * 24 * 60 * 60 * 1000;
    default:
      return 60_000;
  }
}

export function roundToTick(price: number, tickSize: number): number {
  if (!Number.isFinite(tickSize) || tickSize <= 0) return price;
  return Math.round(price / tickSize) * tickSize;
}

/** `time` = apertura de bucket en ms UNIX (alineado a timeframe). */
function emptyBar(time: number): FootprintBar {
  return {
    time,
    levels: [],
    pocPrice: null,
    totalVolume: 0,
    buyVolume: 0,
    sellVolume: 0,
    delta: 0,
    deltaPct: 0,
    stackedBuyImbalance: false,
    stackedSellImbalance: false,
    unfinishedAuctionHigh: false,
    unfinishedAuctionLow: false,
    absorption: null,
    exhaustion: null,
  };
}

function markStackedImbalances(levelsSortedHighToLow: FootprintLevel[]): void {
  const arr = levelsSortedHighToLow;
  let run: FootprintLevel[] = [];
  let side: "buy" | "sell" | null = null;
  const flush = () => {
    if (run.length >= 3 && side) {
      if (side === "buy") run.forEach((l) => (l as FootprintLevel & { _stackBuy?: boolean })._stackBuy = true);
      else run.forEach((l) => (l as FootprintLevel & { _stackSell?: boolean })._stackSell = true);
    }
    run = [];
    side = null;
  };
  for (const l of arr) {
    const s = l.imbalanceSide ?? null;
    if (s == null) {
      flush();
      continue;
    }
    if (s !== side) {
      flush();
      side = s;
      run = [l];
    } else {
      run.push(l);
    }
  }
  flush();
}

/**
 * Agrupa trades por vela de TF y tickSize dinámico.
 * Convención: `AggTrade.time` y cada `FootprintBar.time` en **ms UNIX**.
 */
export function buildFootprintBars(
  trades: AggTrade[],
  timeframe: string,
  tickSize: number,
  config: FootprintConfig
): FootprintBar[] {
  const barMs = timeframeToMs(timeframe);
  const barsMap = new Map<number, FootprintBar>();

  for (const trade of trades) {
    const tMs = tradeTimeToUnixMs(trade.time);
    const barTime = Math.floor(tMs / barMs) * barMs;
    if (!barsMap.has(barTime)) barsMap.set(barTime, emptyBar(barTime));
    const bar = barsMap.get(barTime)!;
    const priceLevel = roundToTick(trade.price, tickSize);

    let level = bar.levels.find((l) => l.price === priceLevel);
    if (!level) {
      level = {
        price: priceLevel,
        bidVolume: 0,
        askVolume: 0,
        totalVolume: 0,
        delta: 0,
        imbalance: null,
        imbalanceSide: null,
        absorptionSide: null,
        isPoc: false,
      };
      bar.levels.push(level);
    }

    if (trade.side === "sell") {
      level.bidVolume += trade.qty;
      bar.sellVolume += trade.qty;
      bar.totalVolume += trade.qty;
    } else {
      level.askVolume += trade.qty;
      bar.buyVolume += trade.qty;
      bar.totalVolume += trade.qty;
    }
    level.totalVolume = level.bidVolume + level.askVolume;
    level.delta = level.askVolume - level.bidVolume;
    bar.delta = bar.buyVolume - bar.sellVolume;
  }

  const bars = Array.from(barsMap.values()).sort((a, b) => a.time - b.time);

  for (const bar of bars) {
    bar.levels.sort((a, b) => b.price - a.price);
    const n = bar.levels.length;
    const avgLevelVol = n > 0 ? bar.totalVolume / n : 0;
    const minVolumeThreshold = Math.max(avgLevelVol * 0.25, 0.25);

    let poc: FootprintLevel | null = null;
    for (const level of bar.levels) {
      if (!poc || level.totalVolume > poc.totalVolume) poc = level;
    }
    bar.pocPrice = poc?.price ?? null;

    for (const level of bar.levels) {
      level.isPoc = bar.pocPrice != null && level.price === bar.pocPrice;
      const bid = level.bidVolume;
      const ask = level.askVolume;
      level.imbalanceSide = null;
      level.imbalance = null;
      if (ask >= bid * config.imbalanceRatio && ask >= minVolumeThreshold) {
        level.imbalanceSide = "buy";
        level.imbalance = "ask";
      } else if (bid >= ask * config.imbalanceRatio && bid >= minVolumeThreshold) {
        level.imbalanceSide = "sell";
        level.imbalance = "bid";
      }
    }

    markStackedImbalances(bar.levels);
    for (const level of bar.levels) {
      const any = level as FootprintLevel & { _stackBuy?: boolean; _stackSell?: boolean };
      if (any._stackBuy) bar.stackedBuyImbalance = true;
      if (any._stackSell) bar.stackedSellImbalance = true;
      delete any._stackBuy;
      delete any._stackSell;
    }

    bar.deltaPct = bar.totalVolume > 0 ? (bar.delta / bar.totalVolume) * 100 : 0;

    if (bar.levels.length > config.maxLevelsPerBar) {
      const byVol = [...bar.levels].sort((a, b) => b.totalVolume - a.totalVolume);
      const keep = new Set(byVol.slice(0, config.maxLevelsPerBar).map((l) => l.price));
      bar.levels = bar.levels.filter((l) => keep.has(l.price));
      bar.levels.sort((a, b) => b.price - a.price);
    }
  }

  if (import.meta.env.DEV) {
    const levelsSum = bars.length ? bars.reduce((s, b) => s + b.levels.length, 0) : 0;
    const logKey = `${bars.length}|${tickSize}|${trades.length}|${barMs}`;
    if (logKey !== lastFootprintBuildLog) {
      lastFootprintBuildLog = logKey;
      const t0 = trades[0] ? tradeTimeToUnixMs(trades[0].time) : null;
      const t1 = trades.length ? tradeTimeToUnixMs(trades[trades.length - 1].time) : null;
      // eslint-disable-next-line no-console
      console.warn("[FootprintBuildDebug]", {
        timeframe,
        timeframeMs: barMs,
        tickSize,
        totalTrades: trades.length,
        firstTradeTime: t0,
        lastTradeTime: t1,
        barsBuilt: bars.length,
        firstBarTime: bars[0]?.time ?? null,
        lastBarTime: bars[bars.length - 1]?.time ?? null,
      });
    }
  }

  return bars;
}

/**
 * Filtra barras cuyo `bar.time` está en ms UNIX.
 * `visibleStartMs` / `visibleEndMs`: aperturas de la primera/última vela visible (ms).
 * Margen: ± (timeframeMs * 2) como pide el pipeline.
 */
export function filterBarsForVisibleRange(
  bars: FootprintBar[],
  visibleStartMs: number,
  visibleEndMs: number,
  timeframeMs: number,
  maxBars: number
): FootprintBar[] {
  const bufferMs = timeframeMs * 2;
  const v0 = Math.min(visibleStartMs, visibleEndMs);
  const v1 = Math.max(visibleStartMs, visibleEndMs);
  const lo = v0 - bufferMs;
  const hi = v1 + bufferMs;
  const filtered = bars.filter((bar) => bar.time >= lo && bar.time <= hi);
  if (import.meta.env.DEV && bars.length > 0 && filtered.length === 0) {
    const b0 = bars[0]?.time;
    const b1 = bars[bars.length - 1]?.time;
    // eslint-disable-next-line no-console
    console.warn("[FootprintFilterDebug]", {
      visibleStartMs: v0,
      visibleEndMs: v1,
      bufferMs,
      filterLoMs: lo,
      filterHiMs: hi,
      timeframeMs,
      barsCount: bars.length,
      firstBarTime: b0 ?? null,
      lastBarTime: b1 ?? null,
      unitNote: "FootprintBar.time and bounds are ms UNIX",
    });
  }
  if (filtered.length > maxBars) return filtered.slice(-maxBars);
  return filtered;
}

export function calculateFootprintStats(bars: FootprintBar[]) {
  if (bars.length === 0) {
    return {
      totalBars: 0,
      totalVolume: 0,
      totalDelta: 0,
      avgDelta: 0,
      maxVolume: 0,
      maxDelta: 0,
    };
  }
  const totalVolume = bars.reduce((sum, bar) => sum + bar.totalVolume, 0);
  const totalDelta = bars.reduce((sum, bar) => sum + bar.delta, 0);
  const maxVolume = Math.max(...bars.map((bar) => bar.totalVolume));
  const maxDelta = Math.max(...bars.map((bar) => Math.abs(bar.delta)));
  return {
    totalBars: bars.length,
    totalVolume,
    totalDelta,
    avgDelta: totalDelta / bars.length,
    maxVolume,
    maxDelta,
  };
}
