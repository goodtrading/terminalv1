/** When true, Liquidity Heatmap / Flows uses GET /api/bookmap/state (falls back on error/empty). */
export const USE_BOOKMAP_ENGINE = true;

export const BOOKMAP_ENGINE_REFETCH_MS = 2_000;
export const BOOKMAP_ENGINE_PRICE_RANGE_PCT = 10;
export const BOOKMAP_ENGINE_BUCKET_MS = 500;
export const BOOKMAP_ENGINE_MAX_RENDER_CELLS = 8_000;

export const WALL_IMPORTANT_BTC = 100;
export const WALL_STRUCTURAL_BTC = 150;
export const WALL_MAJOR_BTC = 300;

/** Bottom ATAS-style Delta / Volume matrix + trade aggregation. */
export const ENABLE_BOOKMAP_DELTA_VOLUME = true;

/** Trade dots overlay on the Bookmap engine heatmap canvas. */
export const ENABLE_BOOKMAP_TRADE_DOTS = true;

export type TradeDotColorMode = "bookmapClassic" | "goodtradingOrange";

/** Aggressor dot colors: Bookmap green/red vs Goodtrading orange/red. */
export const TRADE_DOT_COLOR_MODE: TradeDotColorMode = "bookmapClassic";
/** Right-side CVD/Delta block above DOM — off by default (CVD shown in bottom matrix header). */
export const ENABLE_RIGHT_CVD_SUMMARY = false;

/** Phase 6A — PERP render-only span caps (spot unchanged). */
export const PERP_RENDER_ACTIVE_CAP = 90;
export const PERP_RENDER_CLOSED_CAP = 45;
export const PERP_RENDER_MIN_LIFETIME_MS = 2_000;
export const PERP_RENDER_ROW_MIN_GAP_PX = 4;
/** Target max rendered stripe density vs plot height (DEV acceptance). */
export const PERP_STRIPE_SATURATION_MAX_PCT = 18;

/** Visual parity — zoom regime thresholds (visible price range %). */
export const ZOOM_REGIME_MACRO_THRESHOLD_PCT = 3.0;
export const ZOOM_REGIME_SCALP_THRESHOLD_PCT = 1.0;
export const ZOOM_REGIME_ULTRA_MICRO_THRESHOLD_PCT = 0.5;

export type BookmapZoomRegime = "macro" | "micro" | "scalp" | "ultra_micro";

export function resolveZoomRegime(
  visiblePriceRangePct: number,
): BookmapZoomRegime {
  if (visiblePriceRangePct <= ZOOM_REGIME_ULTRA_MICRO_THRESHOLD_PCT) {
    return "ultra_micro";
  }
  if (visiblePriceRangePct <= ZOOM_REGIME_SCALP_THRESHOLD_PCT) {
    return "scalp";
  }
  if (visiblePriceRangePct <= ZOOM_REGIME_MACRO_THRESHOLD_PCT) {
    return "micro";
  }
  return "macro";
}

export function computeVisiblePriceRangePct(
  minPrice: number,
  maxPrice: number,
): number {
  const mid = (minPrice + maxPrice) / 2;
  if (mid <= 0) return 100;
  return ((maxPrice - minPrice) / mid) * 100;
}

/** L2 stable band — relevance and material-change thresholds. */
export const L2_RELEVANT_MIN_BTC = 20;
export const L2_NEAR_HALF_PCT_MIN_BTC = 8;
export const L2_NEAR_QUARTER_PCT_MIN_BTC = 5;
export const L2_WEAK_GRANULAR_MAX_BTC = 5;
export const L2_MATERIAL_SIZE_CHANGE_BTC = 5;
export const L2_MATERIAL_SIZE_CHANGE_RELATIVE = 0.25;
export const L2_STABLE_MAX_SIZE_BLEND = 0.75;

/** Fixed visual intensity for large wall bands (orange / red only). */
export const WALL_BAND_STABLE_INTENSITY_IMPORTANT = 0.78;
export const WALL_BAND_STABLE_INTENSITY_STRUCTURAL = 0.86;
export const WALL_BAND_STABLE_INTENSITY_MAJOR = 0.94;

/** Passive liquidity body alpha — hierarchy via opacity, not pastel wash. */
export const PALETTE_ALPHA_ACTIVE_WEAK_MIN = 0.28;
export const PALETTE_ALPHA_ACTIVE_STRONG_MIN = 0.68;
export const PALETTE_ALPHA_ACTIVE_EXTREME_MAX = 0.92;
export const PALETTE_ALPHA_CLOSED_RECENT_MUL = 0.55;
export const PALETTE_ALPHA_CLOSED_OLD_MUL = 0.22;
/** Strong band alpha floor for parity diagnostics. */
export const PALETTE_STRONG_BAND_ALPHA_FLOOR = 0.68;
export const PALETTE_RELEVANT_L2_ALPHA_FLOOR = 0.55;
