/**
 * Canvas painter: filas alineadas a la grilla de precio del chart (`priceToCoordinate`),
 * mismo paso USD en todo el viewport — sin “mini tabla” comprimida por vela.
 */

import type { FootprintCandle, FootprintLevel } from "@/lib/footprintTypes";
import {
  FOOTPRINT_DEBUG,
  FOOTPRINT_DIM_LEVEL_VOLUME_RATIO,
  FOOTPRINT_MANY_LEVELS_THRESHOLD,
  FOOTPRINT_MAX_PRICE_LEVELS,
  FOOTPRINT_MIN_BAR_WIDTH_PX,
  FOOTPRINT_MIN_ROW_PX_TEXT_HIGH,
  FOOTPRINT_MIN_ROW_PX_TEXT_MEDIUM,
  FOOTPRINT_PALETTE,
  FOOTPRINT_TEXT_MEDIUM_MIN_VOL_RATIO,
  FOOTPRINT_TEXT_MEDIUM_VOL_RATIO_BUSY_MULT,
  type FootprintDetailMode,
  type FootprintZoomTier,
  footprintDetailMode,
  footprintInnerPadX,
  footprintInnerPadY,
  footprintZoomTier,
} from "@/lib/footprintConfig";

export type FootprintPaintDebug = {
  barsDrawn: number;
  levelRowsRendered: number;
  textRowsSkipped: number;
  imbalanceLevels: number;
  stackedBands: number;
  skippedInvalidGeom: number;
  skippedXOut: number;
  skippedBandSmall: number;
  skippedYOut: number;
  barsInputWithLevels: number;
  barsPairsBuilt: number;
  barsPairsEmpty: number;
};

type FootprintCellState = "normal" | "dominantBid" | "dominantAsk" | "imbalance" | "poc";

export type DrawFootprintBarArgs = {
  ctx: CanvasRenderingContext2D;
  fp: FootprintCandle;
  /** Mismo paso que agregación / grilla global (ej. 10 USD). */
  priceStepUsd: number;
  /** Clip vertical común del pane de precios (no el high/low de la vela) — evita recortar filas y romper la grilla. */
  plotClipTop: number;
  plotClipBottom: number;
  tx: number;
  barW: number;
  width: number;
  height: number;
  bandTop: number;
  bandBottom: number;
  isVolumeLeader: boolean;
  dbg: FootprintPaintDebug;
  /** Coordenada Y del chart para un precio (grilla compartida entre velas). */
  footprintPriceY: (price: number) => number | null;
  fmtQty: (q: number) => string;
};

/** Misma regla que agregación: piso al múltiplo de `step` (evita deriva float en el dibujo). */
function footprintDrawBucket(price: number, step: number): number {
  const s = Number(step);
  if (!Number.isFinite(price) || !Number.isFinite(s) || s <= 0) return price;
  return Math.floor(price / s) * s;
}

function shouldShowFootprintRowText(
  detailMode: FootprintDetailMode,
  a: {
    rowH: number;
    tVol: number;
    maxLvVol: number;
    isDim: boolean;
    volRatioMed: number;
  },
): boolean {
  if (detailMode === "low") return false;
  const { rowH, tVol, maxLvVol, isDim, volRatioMed } = a;
  if (detailMode === "high") {
    return rowH >= FOOTPRINT_MIN_ROW_PX_TEXT_HIGH;
  }
  if (rowH < FOOTPRINT_MIN_ROW_PX_TEXT_MEDIUM) return false;
  if (isDim) return false;
  if (maxLvVol <= 0) return false;
  return tVol >= maxLvVol * volRatioMed || tVol > 0;
}

function getCellState(
  askPct: number,
  bidVol: number,
  askVol: number,
  totalVol: number,
  isPoc: boolean,
): FootprintCellState {
  if (isPoc) return "poc";
  if (totalVol <= 0) return "normal";
  const a = Math.max(askVol, 1e-12);
  const b = Math.max(bidVol, 1e-12);
  const ratio = Math.max(a, b) / Math.min(a, b);
  if (ratio >= 3.0 && (askVol > 0 || bidVol > 0)) return "imbalance";
  if (askPct >= 0.6) return "dominantAsk";
  if (askPct <= 0.4) return "dominantBid";
  return "normal";
}

export function drawFootprintBar(a: DrawFootprintBarArgs): void {
  const {
    ctx,
    fp,
    priceStepUsd,
    plotClipTop,
    plotClipBottom,
    tx,
    barW,
    width,
    height,
    bandTop: bodyBandTop,
    bandBottom: bodyBandBottom,
    isVolumeLeader,
    dbg,
    footprintPriceY,
    fmtQty,
  } = a;

  if (!Number.isFinite(tx) || !Number.isFinite(barW) || barW < 8) {
    dbg.skippedInvalidGeom++;
    return;
  }

  const tier = footprintZoomTier(barW);
  const detailMode = footprintDetailMode(barW);
  const innerX = footprintInnerPadX(tier);
  const innerY = footprintInnerPadY(tier);
  const colW = Math.max(8, Math.min(barW - innerX * 2, 128));
  const xLeft = tx - colW / 2;
  if (xLeft + colW < -8 || xLeft > width + 8) {
    dbg.skippedXOut++;
    return;
  }

  const bandH = bodyBandBottom - bodyBandTop;
  if (bandH < 4) {
    dbg.skippedBandSmall++;
    return;
  }
  if (bodyBandBottom < -4 || bodyBandTop > height + 4) {
    dbg.skippedYOut++;
    return;
  }

  dbg.barsDrawn++;

  const sliced = fp.levels.slice(0, FOOTPRINT_MAX_PRICE_LEVELS);
  if (sliced.length > 0) dbg.barsInputWithLevels++;
  const step =
    Number.isFinite(priceStepUsd) && priceStepUsd > 0 ? priceStepUsd : 10;
  // 48% bid | 4% separador | 48% ask (con límites para evitar colapso en zoom extremo).
  const gutterW = Math.max(2, Math.min(6, colW * 0.04));

  const pairs: { lvl: FootprintLevel; rowTop: number; rowBottom: number }[] = [];
  for (const lvl of sliced) {
    const y0 = footprintPriceY(lvl.price);
    const y1 = footprintPriceY(lvl.price + step);
    if (y0 == null || y1 == null) continue;
    pairs.push({
      lvl,
      rowTop: Math.min(y0, y1),
      rowBottom: Math.max(y0, y1),
    });
  }
  if (pairs.length > 0) dbg.barsPairsBuilt++;
  else dbg.barsPairsEmpty++;

  const maxLvVol = pairs.reduce((m, p) => Math.max(m, p.lvl.totalVolume), 0);
  const manyLevels = pairs.length >= FOOTPRINT_MANY_LEVELS_THRESHOLD;
  const volRatioMed =
    FOOTPRINT_TEXT_MEDIUM_MIN_VOL_RATIO *
    (manyLevels ? FOOTPRINT_TEXT_MEDIUM_VOL_RATIO_BUSY_MULT : 1);
  let pocIdx = 0;
  let pocVol = -1;
  for (let i = 0; i < pairs.length; i++) {
    const v = pairs[i]!.lvl.totalVolume;
    if (v > pocVol) {
      pocVol = v;
      pocIdx = i;
    }
  }

  // Barra vacía/pending: mantener slot estable sin inventar trades.
  if (sliced.length === 0 || pairs.length === 0) {
    const xContentLeft = xLeft + innerX;
    const xContentRight = xLeft + colW - innerX;
    const xBidEnd = tx - gutterW / 2;
    const xAskStart = tx + gutterW / 2;
    const bidL = xContentLeft;
    const bidR = xBidEnd;
    const askL = xAskStart;
    const askR = xContentRight;
    ctx.save();
    ctx.beginPath();
    ctx.rect(xLeft + 0.5, bodyBandTop + 0.5, Math.max(0, colW - 1), Math.max(0, bandH - 1));
    ctx.clip();
    ctx.fillStyle = "rgba(30, 34, 40, 0.24)";
    ctx.fillRect(bidL, bodyBandTop, Math.max(0, bidR - bidL), bandH);
    ctx.fillRect(askL, bodyBandTop, Math.max(0, askR - askL), bandH);
    ctx.strokeStyle = "rgba(255,255,255,0.045)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + 0.5, bodyBandTop + 0.5);
    ctx.lineTo(tx + 0.5, bodyBandBottom - 0.5);
    ctx.stroke();
    ctx.restore();
    strokeBarFrame(ctx, xLeft, bodyBandTop, colW, bandH, isVolumeLeader);
    return;
  }

  dbg.stackedBands += 0;

  ctx.save();
  const clipPadX = Math.max(0.5, innerX * 0.2);
  const clipY0 = plotClipTop + innerY * 0.1;
  const clipY1 = plotClipBottom - innerY * 0.1;
  const clipH = Math.max(0, clipY1 - clipY0);
  ctx.beginPath();
  ctx.rect(xLeft + clipPadX, clipY0, colW - clipPadX * 2, clipH);
  ctx.clip();

  const xContentLeft = xLeft + innerX;
  const xContentRight = xLeft + colW - innerX;
  const xBidEnd = tx - gutterW / 2;
  const xAskStart = tx + gutterW / 2;
  const bidL = xContentLeft;
  const bidR = xBidEnd;
  const askL = xAskStart;
  const askR = xContentRight;
  const bidCenterX = (bidL + bidR) / 2;
  const askCenterX = (askL + askR) / 2;

  let trackTop = pairs[0]!.rowTop;
  let trackBot = pairs[0]!.rowBottom;
  for (const p of pairs) {
    trackTop = Math.min(trackTop, p.rowTop);
    trackBot = Math.max(trackBot, p.rowBottom);
  }
  ctx.fillStyle = FOOTPRINT_PALETTE.gutterTrack;
  ctx.fillRect(tx - gutterW / 2, trackTop, gutterW, Math.max(0, trackBot - trackTop));

  ctx.strokeStyle = FOOTPRINT_PALETTE.gridCenter;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.moveTo(tx, trackTop + 0.5);
  ctx.lineTo(tx, trackBot - 0.5);
  ctx.stroke();

  for (let i = 0; i < pairs.length; i++) {
    const { lvl, rowTop, rowBottom } = pairs[i]!;
    const rh = rowBottom - rowTop;
    if (rh <= 0) continue;

    dbg.levelRowsRendered++;

    const tVol = lvl.totalVolume;
    const askPct = tVol > 0 ? lvl.askVolume / tVol : 0.5;
    const bidPct = 1 - askPct;
    const isDim =
      maxLvVol > 0 && tVol < maxLvVol * FOOTPRINT_DIM_LEVEL_VOLUME_RATIO && tVol > 0;
    const isPoc = i === pocIdx;
    const state = getCellState(askPct, lvl.bidVolume, lvl.askVolume, tVol, isPoc);

    ctx.fillStyle = FOOTPRINT_PALETTE.rowNeutral;
    ctx.fillRect(bidL, rowTop, xContentRight - bidL, rh);
    if (state === "dominantAsk") {
      ctx.fillStyle = FOOTPRINT_PALETTE.rowBuyLean;
      ctx.globalAlpha = isDim ? 0.22 : 0.52;
      ctx.fillRect(askL, rowTop, askR - askL, rh);
      ctx.globalAlpha = 1;
    } else if (state === "dominantBid") {
      ctx.fillStyle = FOOTPRINT_PALETTE.rowSellLean;
      ctx.globalAlpha = isDim ? 0.22 : 0.52;
      ctx.fillRect(bidL, rowTop, bidR - bidL, rh);
      ctx.globalAlpha = 1;
    } else if (state === "imbalance") {
      const askDominant = askPct >= bidPct;
      ctx.fillStyle = askDominant ? FOOTPRINT_PALETTE.rowBuyLean : FOOTPRINT_PALETTE.rowSellLean;
      ctx.globalAlpha = isDim ? 0.24 : 0.62;
      if (askDominant) ctx.fillRect(askL, rowTop, askR - askL, rh);
      else ctx.fillRect(bidL, rowTop, bidR - bidL, rh);
      ctx.globalAlpha = 1;
      const edgeW = Math.max(1, Math.min(3, gutterW * 0.8));
      ctx.fillStyle = FOOTPRINT_PALETTE.imbalanceYellowSoft;
      if (askDominant) ctx.fillRect(askL, rowTop, edgeW, rh);
      else ctx.fillRect(bidR - edgeW, rowTop, edgeW, rh);
    } else if (state === "poc") {
      ctx.fillStyle = FOOTPRINT_PALETTE.pocBand;
      ctx.globalAlpha = isDim ? 0.2 : 0.34;
      ctx.fillRect(bidL, rowTop, xContentRight - bidL, rh);
      ctx.globalAlpha = 1;
    }

    if (isDim) {
      ctx.fillStyle = FOOTPRINT_PALETTE.rowDimMask;
      ctx.fillRect(bidL, rowTop, xContentRight - bidL, rh);
    }
    // POC: acento limpio de línea fina (sin chip/banner).
    if (state === "poc") {
      ctx.strokeStyle = FOOTPRINT_PALETTE.pocLine;
      ctx.lineWidth = 1;
      ctx.beginPath();
      ctx.moveTo(bidL + 0.5, rowTop + 0.5);
      ctx.lineTo(askR - 0.5, rowTop + 0.5);
      ctx.stroke();
    }

    // Separador central sutil por celda.
    ctx.strokeStyle = "rgba(255,255,255,0.055)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(tx + 0.5, rowTop + 0.5);
    ctx.lineTo(tx + 0.5, rowBottom - 0.5);
    ctx.stroke();

    const showRowText = shouldShowFootprintRowText(detailMode, {
      rowH: rh,
      tVol,
      maxLvVol,
      isDim,
      volRatioMed,
    });
    if (!showRowText) {
      dbg.textRowsSkipped++;
      continue;
    }

    const fq =
      detailMode === "high" && tier === "detail"
        ? (q: number) => {
            if (q >= 100) return q.toFixed(0);
            if (q >= 10) return q.toFixed(1);
            return q.toFixed(2);
          }
        : fmtQty;

    const midY = (rowTop + rowBottom) / 2;
    const bidStr = lvl.bidVolume > 0 ? fq(lvl.bidVolume) : "·";
    const askStr = lvl.askVolume > 0 ? fq(lvl.askVolume) : "·";
    const { font, compact } = footprintRowFont(barW, rh, detailMode);
    ctx.font = font;
    ctx.textBaseline = "middle";
    const pad = compact ? 3 : 4.5;

    ctx.save();
    ctx.beginPath();
    ctx.rect(bidL + 1, rowTop, Math.max(0, bidR - bidL - 2), rh);
    ctx.clip();
    const bidHalfW = Math.max(0, bidR - bidL - 2);
    const askHalfW = Math.max(0, askR - askL - 2);
    const bidFits = ctx.measureText(bidStr).width <= Math.max(6, bidHalfW - pad * 2);
    const askFits = ctx.measureText(askStr).width <= Math.max(6, askHalfW - pad * 2);
    const textAlpha = isDim ? 0.28 : state === "imbalance" || state === "poc" ? 0.98 : state === "normal" ? 0.84 : 0.92;
    ctx.globalAlpha = textAlpha;
    ctx.fillStyle = isDim ? FOOTPRINT_PALETTE.textDimmed : FOOTPRINT_PALETTE.textBid;
    ctx.textAlign = "center";
    if (bidFits) ctx.fillText(bidStr, bidCenterX, midY);
    ctx.restore();

    ctx.save();
    ctx.beginPath();
    ctx.rect(askL + 1, rowTop, Math.max(0, askR - askL - 2), rh);
    ctx.clip();
    ctx.globalAlpha = textAlpha;
    ctx.fillStyle = isDim ? FOOTPRINT_PALETTE.textDimmed : FOOTPRINT_PALETTE.textAsk;
    ctx.textAlign = "center";
    if (askFits) ctx.fillText(askStr, askCenterX, midY);
    ctx.restore();
    ctx.globalAlpha = 1;
  }

  ctx.restore();

  if (FOOTPRINT_DEBUG) {
    ctx.save();
    ctx.strokeStyle = FOOTPRINT_PALETTE.debugMagenta;
    ctx.strokeRect(xLeft, bodyBandTop, colW, bandH);
    ctx.fillStyle = FOOTPRINT_PALETTE.debugMagenta;
    ctx.font = "10px monospace";
    ctx.textAlign = "left";
    ctx.fillText(`lv=${pairs.length} step=${step} w=${colW.toFixed(0)}`, xLeft + 2, bodyBandTop + 12);
    ctx.restore();
  }

  strokeBarFrame(ctx, xLeft, bodyBandTop, colW, bandH, isVolumeLeader);
}

function strokeBarFrame(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  leader: boolean,
): void {
  // Mantener contorno mínimo para no ensuciar la lectura.
  ctx.strokeStyle = leader ? "rgba(150, 188, 210, 0.18)" : "rgba(255,255,255,0.04)";
  ctx.lineWidth = 0.75;
  ctx.strokeRect(x + 0.5, y + 0.5, Math.max(0, w - 1), Math.max(0, h - 1));
}

function footprintRowFont(
  barW: number,
  rowH: number,
  detailMode: FootprintDetailMode,
): { font: string; compact: boolean } {
  const w = Math.max(FOOTPRINT_MIN_BAR_WIDTH_PX, Math.min(barW, 90));
  const tMin = 10;
  const tMax = 13;
  const scaled = Math.round(tMin + (w - 18) * 0.07);
  let base = Math.min(tMax, Math.max(tMin, scaled));
  if (detailMode === "high") base = Math.min(tMax, base + 1);
  const compact = rowH < (detailMode === "high" ? 13 : 14);
  const small = Math.max(tMin, base - 1);
  return {
    font: `650 ${compact ? small : base}px "JetBrains Mono", ui-monospace, monospace`,
    compact,
  };
}
