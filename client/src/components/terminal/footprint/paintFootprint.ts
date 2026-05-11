import type { FootprintBar, FootprintLevel, FootprintConfig, FootprintMode } from "./footprintTypes";

let lastFootprintRenderLog = "";

/** ATAS_DARK_PRO — fondo transparente, lectura institucional, sin saturar. */
function atasDarkProPalette(opacity: number) {
  const o = Math.min(1, Math.max(0.35, opacity));
  const a = (x: number) => Math.min(1, x * o);
  return {
    bgAsk: `rgba(34, 197, 94, ${a(0.07)})`,
    bgBid: `rgba(185, 28, 28, ${a(0.07)})`,
    textAsk: `rgba(134, 239, 172, ${a(0.95)})`,
    textBid: `rgba(252, 165, 165, ${a(0.92)})`,
    textMuted: `rgba(203, 213, 225, ${a(0.82)})`,
    poc: `rgba(212, 175, 55, ${a(0.55)})`,
    pocLine: `rgba(212, 175, 55, ${a(0.72)})`,
    imbalanceGlow: `rgba(226, 232, 240, ${a(0.14)})`,
    stackedLineBuy: `rgba(52, 211, 153, ${a(0.65)})`,
    stackedLineSell: `rgba(248, 113, 113, ${a(0.6)})`,
    summaryBg: `rgba(15, 23, 42, ${a(0.38)})`,
    watermark: `rgba(148, 163, 184, ${a(0.32)})`,
  };
}

function formatVol(n: number): string {
  if (n >= 1_000_000) return (n / 1_000_000).toFixed(1) + "M";
  if (n >= 10_000) return (n / 1_000).toFixed(1) + "k";
  if (n >= 1_000) return (n / 1_000).toFixed(2) + "k";
  return n >= 100 ? n.toFixed(0) : n.toFixed(2);
}

function formatDelta(n: number): string {
  const a = Math.abs(n);
  const s = a >= 1000 ? (a / 1000).toFixed(1) + "k" : a.toFixed(0);
  return (n >= 0 ? "+" : "−") + s;
}

/** `timeSec` = UTCTimestamp (segundos UNIX). No pasar ms. */
function timeToX(chart: any, timeSec: number): number | null {
  try {
    const ts = chart.timeScale?.();
    if (!ts?.timeToCoordinate) return null;
    return ts.timeToCoordinate(timeSec as any);
  } catch {
    return null;
  }
}

function priceToY(series: any, price: number): number | null {
  try {
    const y = series.priceToCoordinate?.(price);
    return typeof y === "number" ? y : null;
  } catch {
    return null;
  }
}

function barPixelWidth(chart: any, barTimeMs: number, barMs: number): number {
  const t0 = Math.floor(barTimeMs / 1000);
  const t1 = Math.floor((barTimeMs + barMs) / 1000);
  const x0 = timeToX(chart, t0);
  const x1 = timeToX(chart, t1);
  if (x0 != null && x1 != null) return Math.max(6, Math.abs(x1 - x0));
  return 28;
}

function topLevelsByVolume(bar: FootprintBar, n: number): FootprintLevel[] {
  if (!bar.levels.length) return [];
  return [...bar.levels].sort((a, b) => b.totalVolume - a.totalVolume).slice(0, n);
}

function filterLevelsInPriceWindow(
  levels: FootprintLevel[],
  priceMin: number,
  priceMax: number,
  maxRows: number
): FootprintLevel[] {
  const lo = Math.min(priceMin, priceMax);
  const hi = Math.max(priceMin, priceMax);
  const inWin = levels.filter((l) => l.price >= lo && l.price <= hi);
  let sorted = inWin.sort((a, b) => b.price - a.price);
  if (sorted.length === 0 && levels.length) {
    sorted = [...levels].sort((a, b) => b.totalVolume - a.totalVolume).slice(0, maxRows).sort((a, b) => b.price - a.price);
    return sorted;
  }
  if (sorted.length <= maxRows) return sorted;
  return [...sorted].sort((a, b) => b.totalVolume - a.totalVolume).slice(0, maxRows).sort((a, b) => b.price - a.price);
}

function drawPocCrosshair(
  ctx: CanvasRenderingContext2D,
  x: number,
  w: number,
  y: number,
  short: boolean,
  pocLine: string
) {
  const half = short ? Math.min(w * 0.35, 14) : w * 0.42;
  ctx.strokeStyle = pocLine;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(x + w * 0.5 - half, y);
  ctx.lineTo(x + w * 0.5 + half, y);
  ctx.stroke();
}

function paintSummaryBar(
  ctx: CanvasRenderingContext2D,
  series: any,
  bar: FootprintBar,
  x: number,
  w: number,
  candleWidthPx: number,
  pal: ReturnType<typeof atasDarkProPalette>
) {
  const showText = candleWidthPx >= 12;
  const yRef =
    (bar.pocPrice != null ? priceToY(series, bar.pocPrice) : null) ??
    priceToY(series, bar.levels[0]?.price ?? 0);
  if (yRef == null) return;

  if (bar.pocPrice != null) {
    const yPoc = priceToY(series, bar.pocPrice);
    if (yPoc != null) drawPocCrosshair(ctx, x, w, yPoc, true, pal.pocLine);
  }

  if (!showText) {
    const t = bar.totalVolume > 0 ? bar.delta / bar.totalVolume : 0;
    ctx.fillStyle = t >= 0 ? pal.bgAsk : pal.bgBid;
    ctx.fillRect(x + 1, yRef - 10, w - 2, 20);
    return;
  }

  const pad = 2;
  const boxH = 36;
  ctx.fillStyle = pal.summaryBg;
  ctx.fillRect(x + pad, yRef - boxH / 2, w - pad * 2, boxH);

  ctx.font = "500 10px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  const mid = x + w / 2;
  const cy = yRef - 8;
  ctx.fillStyle = bar.delta >= 0 ? pal.textAsk : pal.textBid;
  ctx.fillText(formatDelta(bar.delta), mid, cy);

  ctx.fillStyle = pal.textMuted;
  ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.fillText(formatVol(bar.totalVolume), mid, yRef + 8);

  const bw = Math.max(4, w - 10);
  const bh = 3;
  const bx = x + (w - bw) / 2;
  const by = yRef + 14;
  ctx.fillStyle = "rgba(30, 41, 59, 0.55)";
  ctx.fillRect(bx, by, bw, bh);
  const t = bar.totalVolume > 0 ? Math.abs(bar.delta) / bar.totalVolume : 0;
  const fw = bw * Math.min(1, t);
  ctx.fillStyle = bar.delta >= 0 ? pal.textAsk : pal.textBid;
  if (bar.delta >= 0) ctx.fillRect(bx, by, fw, bh);
  else ctx.fillRect(bx + bw - fw, by, fw, bh);
}

function paintCompactBar(
  ctx: CanvasRenderingContext2D,
  series: any,
  bar: FootprintBar,
  x: number,
  w: number,
  candleWidthPx: number,
  rowHeightPx: number,
  pal: ReturnType<typeof atasDarkProPalette>,
  maxTopLevels: number,
  showStacked: boolean
) {
  const showNums = candleWidthPx >= 16 && rowHeightPx >= 8;
  const tops = topLevelsByVolume(bar, maxTopLevels);

  ctx.textAlign = "center";
  ctx.textBaseline = "middle";
  ctx.font = "500 9px ui-monospace, SFMono-Regular, Menlo, monospace";

  const anchorY =
    (bar.pocPrice != null ? priceToY(series, bar.pocPrice) : null) ??
    priceToY(series, tops[0]?.price ?? 0);
  if (anchorY == null) return;

  let yCursor = anchorY - (tops.length * 10) / 2 - 18;
  ctx.fillStyle = bar.delta >= 0 ? pal.textAsk : pal.textBid;
  if (showNums) ctx.fillText(formatDelta(bar.delta), x + w / 2, yCursor);
  yCursor += 12;

  if (bar.pocPrice != null) {
    const yP = priceToY(series, bar.pocPrice);
    if (yP != null) drawPocCrosshair(ctx, x, w, yP, false, pal.pocLine);
  }

  if (showStacked && tops.length && (bar.stackedBuyImbalance || bar.stackedSellImbalance)) {
    const ys = tops.map((lv) => priceToY(series, lv.price)).filter((y): y is number => y != null);
    if (ys.length) {
      const yLo = Math.min(...ys);
      const yHi = Math.max(...ys);
      ctx.strokeStyle = bar.stackedBuyImbalance ? pal.stackedLineBuy : pal.stackedLineSell;
      ctx.lineWidth = 2;
      ctx.beginPath();
      if (bar.stackedBuyImbalance) {
        ctx.moveTo(x - 2, yLo - 6);
        ctx.lineTo(x - 2, yHi + 6);
      } else {
        ctx.moveTo(x + w + 2, yLo - 6);
        ctx.lineTo(x + w + 2, yHi + 6);
      }
      ctx.stroke();
    }
  }

  for (const lv of tops) {
    const yy = priceToY(series, lv.price);
    if (yy == null) continue;
    if (lv.imbalanceSide === "buy") {
      ctx.fillStyle = pal.bgAsk;
      ctx.fillRect(x + 1, yy - 5, w - 2, 10);
    } else if (lv.imbalanceSide === "sell") {
      ctx.fillStyle = pal.bgBid;
      ctx.fillRect(x + 1, yy - 5, w - 2, 10);
    }
    if (lv.isPoc) {
      ctx.strokeStyle = pal.poc;
      ctx.strokeRect(x + 0.5, yy - 5.5, w - 1, 11);
    }
    if (showNums) {
      ctx.fillStyle = pal.textMuted;
      const label = `${formatVol(lv.bidVolume)}|${formatVol(lv.askVolume)}`;
      ctx.fillText(label, x + w / 2, yy);
    } else {
      const t = lv.totalVolume > 0 ? lv.delta / lv.totalVolume : 0;
      ctx.fillStyle = t >= 0 ? pal.bgAsk : pal.bgBid;
      ctx.fillRect(x + 3, yy - 3, w - 6, 6);
    }
    yCursor = yy;
  }
}

function paintFullBar(
  ctx: CanvasRenderingContext2D,
  chart: any,
  series: any,
  bar: FootprintBar,
  x: number,
  w: number,
  priceMin: number,
  priceMax: number,
  config: FootprintConfig,
  rowHeightPx: number,
  pal: ReturnType<typeof atasDarkProPalette>,
  maxLevelsFull: number,
  showStacked: boolean
) {
  const maxRows = Math.min(
    maxLevelsFull,
    rowHeightPx >= 10 ? 28 : rowHeightPx >= 8 ? 20 : 14
  );
  const levels = filterLevelsInPriceWindow(bar.levels, priceMin, priceMax, maxRows);
  const showText = rowHeightPx >= 8;
  const rowH = Math.max(4, Math.min(14, rowHeightPx * 0.92));

  let yMin = Infinity;
  let yMax = -Infinity;
  for (const lv of levels) {
    const y = priceToY(series, lv.price);
    if (y == null) continue;
    yMin = Math.min(yMin, y);
    yMax = Math.max(yMax, y);
  }

  if (showStacked && yMin !== Infinity && (bar.stackedBuyImbalance || bar.stackedSellImbalance)) {
    ctx.strokeStyle = bar.stackedBuyImbalance ? pal.stackedLineBuy : pal.stackedLineSell;
    ctx.lineWidth = 2;
    ctx.beginPath();
    if (bar.stackedBuyImbalance) {
      ctx.moveTo(x - 2, yMin - rowH);
      ctx.lineTo(x - 2, yMax + rowH);
    } else {
      ctx.moveTo(x + w + 2, yMin - rowH);
      ctx.lineTo(x + w + 2, yMax + rowH);
    }
    ctx.stroke();
  }

  for (const lv of levels) {
    const y = priceToY(series, lv.price);
    if (y == null) continue;
    const y0 = y - rowH / 2;

    if (lv.imbalanceSide) {
      ctx.strokeStyle = pal.imbalanceGlow;
      ctx.lineWidth = 1;
      ctx.strokeRect(x + 0.5, y0 - 0.5, w - 1, rowH + 1);
    }

    const mid = x + w / 2;
    if (showText) {
      ctx.font = "9px ui-monospace, SFMono-Regular, Menlo, monospace";
      ctx.textAlign = "right";
      ctx.textBaseline = "middle";
      ctx.fillStyle = lv.imbalanceSide === "sell" ? pal.textBid : pal.textMuted;
      ctx.fillText(lv.bidVolume > 0 ? formatVol(lv.bidVolume) : "", mid - 3, y);

      ctx.textAlign = "left";
      ctx.fillStyle = lv.imbalanceSide === "buy" ? pal.textAsk : pal.textMuted;
      ctx.fillText(lv.askVolume > 0 ? formatVol(lv.askVolume) : "", mid + 3, y);
    } else {
      const maxV = Math.max(lv.bidVolume, lv.askVolume, 1e-9);
      const bwL = ((w / 2 - 4) * lv.bidVolume) / maxV;
      const bwR = ((w / 2 - 4) * lv.askVolume) / maxV;
      ctx.fillStyle = pal.bgBid;
      ctx.fillRect(x + 2, y0, bwL, rowH);
      ctx.fillStyle = pal.bgAsk;
      ctx.fillRect(mid, y0, bwR, rowH);
    }

    if (lv.isPoc) {
      ctx.strokeStyle = pal.pocLine;
      ctx.lineWidth = 1.25;
      ctx.beginPath();
      ctx.moveTo(x - 1, y);
      ctx.lineTo(x + w + 1, y);
      ctx.stroke();
    }
  }
}

export type PaintFootprintOptions = {
  mode: FootprintMode;
  candleWidthPx: number;
  rowHeightPx: number;
  logicalWidth: number;
  logicalHeight: number;
  barTimeframeMs: number;
  priceMin: number;
  priceMax: number;
  /** ATAS_DARK_PRO opacity (0–1). Default 0.85 */
  presetOpacity?: number;
  maxLevelsCompact?: number;
  maxLevelsFull?: number;
  showStackedImbalance?: boolean;
};

export function paintFootprintBars(
  ctx: CanvasRenderingContext2D,
  chart: any,
  series: any,
  bars: FootprintBar[],
  config: FootprintConfig,
  opt: PaintFootprintOptions
): void {
  if (!chart || !series || bars.length === 0) return;

  if (import.meta.env.DEV) {
    const key = `${opt.mode}|${bars.length}|${Math.round(opt.candleWidthPx)}|${Math.round(opt.rowHeightPx)}`;
    if (key !== lastFootprintRenderLog) {
      lastFootprintRenderLog = key;
      // eslint-disable-next-line no-console
      console.debug("[FootprintRender]", {
        mode: opt.mode,
        bars: bars.length,
        candleWidthPx: opt.candleWidthPx,
        rowHeightPx: opt.rowHeightPx,
      });
    }
  }

  const {
    mode,
    barTimeframeMs,
    logicalWidth,
    priceMin,
    priceMax,
    presetOpacity = 0.85,
    maxLevelsCompact = 5,
    maxLevelsFull = 40,
    showStackedImbalance = true,
  } = opt;

  const pal = atasDarkProPalette(presetOpacity);

  for (const bar of bars) {
    // FootprintBar.time está en ms; Lightweight Charts espera segundos.
    const chartTimeSec = Math.floor(bar.time / 1000);
    const bx = timeToX(chart, chartTimeSec);
    if (bx == null) continue;

    const bw = barPixelWidth(chart, bar.time, barTimeframeMs);

    if (mode === "summary") {
      paintSummaryBar(ctx, series, bar, bx - bw / 2, bw, opt.candleWidthPx, pal);
    } else if (mode === "compact") {
      paintCompactBar(
        ctx,
        series,
        bar,
        bx - bw / 2,
        bw,
        opt.candleWidthPx,
        opt.rowHeightPx,
        pal,
        maxLevelsCompact,
        showStackedImbalance
      );
    } else if (mode === "full") {
      paintFullBar(
        ctx,
        chart,
        series,
        bar,
        bx - bw / 2,
        bw,
        priceMin,
        priceMax,
        config,
        opt.rowHeightPx,
        pal,
        maxLevelsFull,
        showStackedImbalance
      );
    }
  }

  ctx.fillStyle = pal.watermark;
  ctx.font = "500 9px ui-monospace, SFMono-Regular, Menlo, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "top";
  ctx.fillText("FOOTPRINT", opt.logicalWidth - 6, 6);
}
