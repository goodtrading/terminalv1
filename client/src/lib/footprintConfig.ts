/**
 * Footprint V2 tuning — horizontal zoom must exceed this (px between consecutive bar centers).
 */
export const FOOTPRINT_MIN_BAR_WIDTH_PX = 18;

/** Progressivo: ancho de vela → detalle dibujado (sin tocar datos). */
export type FootprintZoomTier = "compact" | "standard" | "full" | "detail";

/**
 * Legibilidad adaptativa: cuánto texto mostrar según zoom horizontal (px entre centros de velas).
 * - low: solo colores + POC + imbalance (sin números por fila)
 * - medium: números en POC, imbalances y niveles con volumen relevante
 * - high: bid/ask por fila cuando cabe
 */
export type FootprintDetailMode = "low" | "medium" | "high";

export const FOOTPRINT_ZOOM_COMPACT_MAX = 26;
export const FOOTPRINT_ZOOM_STANDARD_MAX = 40;
export const FOOTPRINT_ZOOM_FULL_MAX = 62;

/** Por debajo: modo low (sin cifras en filas). */
export const FOOTPRINT_DETAIL_LOW_MAX_BAR_PX = 34;
/** Por encima: modo high (texto completo). Entre low y high: medium. */
export const FOOTPRINT_DETAIL_HIGH_MIN_BAR_PX = 52;

export function footprintZoomTier(barW: number): FootprintZoomTier {
  if (barW < FOOTPRINT_ZOOM_COMPACT_MAX) return "compact";
  if (barW < FOOTPRINT_ZOOM_STANDARD_MAX) return "standard";
  if (barW < FOOTPRINT_ZOOM_FULL_MAX) return "full";
  return "detail";
}

export function footprintDetailMode(barW: number): FootprintDetailMode {
  const w = Number(barW);
  if (!Number.isFinite(w)) return "medium";
  if (w < FOOTPRINT_DETAIL_LOW_MAX_BAR_PX) return "low";
  if (w < FOOTPRINT_DETAIL_HIGH_MIN_BAR_PX) return "medium";
  return "high";
}

/** En modo medium: volumen mínimo como fracción del máximo de fila para mostrar texto. */
export const FOOTPRINT_TEXT_MEDIUM_MIN_VOL_RATIO = 0.14;

/** En modo medium: volumen mínimo como fracción del volumen total de la vela. */
export const FOOTPRINT_TEXT_MEDIUM_MIN_BAR_SHARE = 0.035;

/** Muchas filas en pantalla → exigir umbral de volumen un poco mayor (menos ruido). */
export const FOOTPRINT_MANY_LEVELS_THRESHOLD = 13;

export const FOOTPRINT_TEXT_MEDIUM_VOL_RATIO_BUSY_MULT = 1.18;

/** Altura mínima de fila (px) para dibujar texto en medium / high. */
export const FOOTPRINT_MIN_ROW_PX_TEXT_MEDIUM = 10;
export const FOOTPRINT_MIN_ROW_PX_TEXT_HIGH = 8;

export function footprintInnerPadX(tier: FootprintZoomTier): number {
  if (tier === "detail") return 5;
  if (tier === "full") return 4;
  return 3;
}

export function footprintInnerPadY(tier: FootprintZoomTier): number {
  if (tier === "detail") return 3;
  if (tier === "full") return 2;
  return 2;
}

export function footprintSummaryStripHeight(
  tier: FootprintZoomTier,
  colW: number,
  bandH: number,
): number {
  const base =
    tier === "detail" ? 21 : tier === "full" ? 19 : tier === "standard" ? 17 : 15;
  return Math.max(13, Math.min(base, Math.min(colW * 0.22, bandH * 0.22)));
}

/** Máx. niveles por vela (agregación + pintura) — bloque compacto 12–20 */
export const FOOTPRINT_MAX_PRICE_LEVELS = 18;

/**
 * Paso de precio USD **único para todo el viewport**: agregación + filas visuales alineadas (estilo ATAS).
 * 15s/1m → $10; 5m → $15; 15m → $25 si velas estrechas (zoom out), $10 si hay más ancho.
 */
export function getFootprintPriceStepUsd(barSec: number, barWidthPx: number): number {
  const s = Math.max(1, Math.floor(Number(barSec)));
  const w = Number.isFinite(barWidthPx) && barWidthPx > 0 ? barWidthPx : FOOTPRINT_ZOOM_STANDARD_MAX;
  if (s <= 15) return 10;
  if (s <= 60) return 10;
  if (s <= 300) return 15;
  if (s >= 900) return w < FOOTPRINT_ZOOM_STANDARD_MAX ? 25 : 10;
  return 25;
}

/** Niveles con volumen &lt; este ratio del máximo de fila se atenúan */
export const FOOTPRINT_DIM_LEVEL_VOLUME_RATIO = 0.08;

/** Debounce trade-window refetch while panning/zooming */
export const FOOTPRINT_TRADE_DEBOUNCE_MS = 450;

/**
 * Highlight imbalance when one side is this many times larger than the other (both sides),
 * or when only one side has volume (treated as imbalance).
 */
export const FOOTPRINT_IMBALANCE_RATIO = 2.2;

/**
 * When `true`, draws clip diagnostics and aggregates render stats (dev only).
 * Off by default.
 */
export const FOOTPRINT_DEBUG = false;

/**
 * Console + on-canvas pipeline stats (fetch window, trade count, bars with levels).
 * Enable while diagnosing missing footprint data; turn off when done.
 */
export const FOOTPRINT_PIPELINE_DEBUG =
  typeof import.meta !== "undefined" && import.meta.env?.DEV === true;

/** Min row height (px) to draw bid/ask text */
export const FOOTPRINT_MIN_TEXT_ROW_PX = 8;

/** Slightly taller rows use primary font size; shorter rows use compact size */
export const FOOTPRINT_MIN_TEXT_ROW_PX_COMFORT = 12;

/** Min footprint column width to draw bid/ask numbers */
export const FOOTPRINT_MIN_COLUMN_PX_FOR_TEXT = 30;

/** Min column width (px) to draw per-candle summary / bias strip */
export const FOOTPRINT_MIN_COL_PX_FOR_SUMMARY = 34;

/** Min column width (px) to draw total-delta label under the footprint */
export const FOOTPRINT_MIN_COL_PX_FOR_DELTA_LABEL = 48;

/** Min band height (px) to show candle delta label */
export const FOOTPRINT_MIN_BAND_H_FOR_DELTA_LABEL = 28;

/** Visual center gutter between bid (left) and ask (right) columns */
export const FOOTPRINT_CENTER_GUTTER_PX = 2;

/** Half-width of per-level delta strip at bar center */
export const FOOTPRINT_DELTA_STRIP_HALF_PX = 1.25;

/** Min consecutive imbalanced levels to apply stacked highlight */
export const FOOTPRINT_STACKED_IMBALANCE_MIN = 2;

/**
 * Paleta institucional: carbón translúcido, compra fría (cian), venta rojo quemado,
 * imbalance ámbar controlado, POC y texto con contraste alto sin saturación retail.
 */
export const FOOTPRINT_PALETTE = {
  panelBg: "rgba(18, 20, 24, 0.92)",
  rowNeutral: "rgba(34, 38, 44, 0.94)",
  rowBuyLean: "rgba(56, 118, 165, 0.38)",
  rowSellLean: "rgba(165, 64, 58, 0.36)",
  rowDimMask: "rgba(8, 9, 11, 0.42)",
  gridCenter: "rgba(255,255,255,0.06)",
  gutterTrack: "rgba(0, 0, 0, 0.32)",
  border: "rgba(255,255,255,0.06)",
  prominenceBorder: "rgba(120, 180, 210, 0.42)",
  emptyHint: "rgba(160, 168, 182, 0.42)",
  labelWatermark: "rgba(255, 255, 255, 0.12)",
  deltaPos: { r: 86, g: 178, b: 212 },
  deltaNeg: { r: 198, g: 82, b: 76 },
  imbalanceYellow: "rgba(218, 175, 72, 0.92)",
  imbalanceYellowSoft: "rgba(212, 168, 70, 0.45)",
  stackedYellow: "rgba(200, 155, 55, 0.22)",
  stackedYellowBorder: "rgba(218, 175, 72, 0.28)",
  pocBand: "rgba(62, 145, 185, 0.34)",
  pocRowBase: "rgba(52, 128, 168, 0.4)",
  pocBarTop: "rgba(130, 205, 235, 0.55)",
  pocBarMid: "rgba(160, 220, 245, 0.28)",
  pocBorder: "rgba(96, 200, 248, 0.85)",
  pocLine: "rgba(180, 230, 250, 0.75)",
  summaryBg: "rgba(12, 14, 18, 0.96)",
  summaryBgLift: "rgba(28, 32, 38, 0.55)",
  summarySepTop: "rgba(255,255,255,0.07)",
  summaryVol: "rgba(188, 194, 206, 0.9)",
  summaryPoc: "rgba(140, 200, 228, 0.88)",
  summaryAskText: "rgba(120, 205, 235, 0.98)",
  summaryBidText: "rgba(235, 150, 145, 0.98)",
  textAsk: "rgba(175, 228, 245, 0.98)",
  textBid: "rgba(245, 190, 186, 0.96)",
  textPrimary: "rgba(236, 239, 245, 0.98)",
  textSecondary: "rgba(200, 206, 216, 0.9)",
  textDimmed: "rgba(130, 138, 150, 0.68)",
  textMuted: "rgba(148, 156, 168, 0.72)",
  debugMagenta: "magenta",
} as const;
