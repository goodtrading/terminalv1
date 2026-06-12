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

/**
 * B.2 — Horizontal Persistence V2: stronger resting runs, clearer wall hierarchy,
 * Bookmap-like palette. Toggle off to revert to pre-B.2 visual prepare/render.
 */
export const BOOKMAP_HORIZONTAL_PERSISTENCE_V2 = false;

/** Wider time gap merge for resting run continuity (ms). */
export const H_PERSIST_V2_MERGE_GAP_MS = 24_000;
/** Bridge adjacent price levels within this USD distance. */
export const H_PERSIST_V2_PRICE_BRIDGE_USD = 10;
/** Minimum merged samples before continuity intensity boost applies. */
export const H_PERSIST_V2_MIN_RUN_FOR_BOOST = 3;
/** Max additive intensity from long horizontal runs. */
export const H_PERSIST_V2_MAX_CONTINUITY_BOOST = 0.2;
/** Solid horizontal base rect minimum intensity. */
export const H_PERSIST_V2_SOLID_BASE_MIN_INTENSITY = 0.36;
/** Alpha multiplier for reinforced solid base spans. */
export const H_PERSIST_V2_SOLID_BASE_ALPHA_MUL = 1.18;
/** Historical weak texture alpha scale — keeps grain secondary. */
export const H_PERSIST_V2_WEAK_HISTORICAL_ALPHA_MUL = 0.68;
/** Internal chunk overlay alpha when V2 (less granular noise). */
export const H_PERSIST_V2_CHUNK_OVERLAY_ALPHA = 0.08;
/** Suppress sub-threshold noise in macro zoom. */
export const H_PERSIST_V2_MACRO_NOISE_SIZE_BTC = 4;

/**
 * B.2.1 — Texture Calibration + Heatmap Depth Pass: organic walls, historical
 * texture, thermal palette. Builds on HORIZONTAL_PERSISTENCE_V2.
 */
export const BOOKMAP_TEXTURE_CALIBRATION_V2 = false;
export const BOOKMAP_HEATMAP_DEPTH_PASS_V2 = false;

/** Internal chunk overlay alpha when texture calibration V2 is on. */
export const TEX_CALIB_V2_CHUNK_OVERLAY_ALPHA = 0.11;
/** Weak historical depth layer alpha scale (secondary texture). */
export const TEX_CALIB_V2_WEAK_DEPTH_ALPHA_MUL = 0.54;
/** Temporal edge fade width as fraction of span width. */
export const TEX_CALIB_V2_ORGANIC_EDGE_FADE_PCT = 0.11;
/** Inner heat-core width for dominant walls. */
export const TEX_CALIB_V2_INNER_CORE_WIDTH_PCT = 0.44;
/** Inner heat-core alpha multiplier vs body. */
export const TEX_CALIB_V2_INNER_CORE_ALPHA_MUL = 1.22;
/** Cap flat strong-wall body alpha to avoid UI-rectangle look. */
export const TEX_CALIB_V2_STRONG_BASE_ALPHA_CAP = 0.84;
/** Reduce opacity for long low-intensity horizontal runs. */
export const TEX_CALIB_V2_LONG_WEAK_BASE_ALPHA_MUL = 0.9;
/** Minimum intensity for weak historical texture pass. */
export const TEX_CALIB_V2_WEAK_TEXTURE_MIN_INTENSITY = 0.1;

/** Near-price band (% from mid) for depth visibility boost. */
export const DEPTH_V2_NEAR_PRICE_PCT = 0.35;
/** Additive intensity boost for weak cells near price (capped). */
export const DEPTH_V2_NEAR_PRICE_VISIBILITY_BOOST = 0.09;
/** Max intensity after near-price visibility boost (prevents wall inflation). */
export const DEPTH_V2_MAX_VISIBILITY_INTENSITY = 0.38;
/** Renderer alpha boost multiplier near price for weak/medium spans. */
export const DEPTH_V2_NEAR_PRICE_ALPHA_BOOST = 0.2;
/** Macro zoom weak-cell intensity floor after depth pass. */
export const DEPTH_V2_WEAK_INTENSITY_FLOOR_MACRO = 0.009;
/** Micro/scalp weak-cell intensity floor after depth pass. */
export const DEPTH_V2_WEAK_INTENSITY_FLOOR_MICRO = 0.006;

/**
 * B.2.2 — DEV-only render path proof: canvas watermark + throttled console.
 * Confirms FLOWS uses the active engine renderer (not stale/duplicate files).
 */
export const BOOKMAP_RENDER_PATH_PROOF_DIAG = false;

/**
 * B.2.3 — Aggressive heatmap visual calibration: visible texture, organic walls,
 * reduced flat solid base. Builds on B.2 / B.2.1 flags.
 */
export const BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3 = false;

/** Solid base body alpha scale — reduces flat horizontal bars (~22% reduction). */
export const V3_SOLID_BASE_ALPHA_MUL = 0.76;
/** Reinforced strong-wall base alpha scale (was 1.18× via H_PERSIST). */
export const V3_SOLID_BASE_REINFORCE_MUL = 0.82;
/** Weak historical depth underlay alpha scale. */
export const V3_WEAK_DEPTH_ALPHA_MUL = 0.88;
/** Minimum intensity for weak depth underlay pass. */
export const V3_WEAK_TEXTURE_MIN_INTENSITY = 0.06;
/** Organic edge fade applies from this intensity upward. */
export const V3_ORGANIC_MIN_INTENSITY = 0.22;
/** Temporal edge fade width fraction. */
export const V3_ORGANIC_EDGE_FADE_PCT = 0.14;
/** Inner heat-core minimum intensity. */
export const V3_INNER_CORE_MIN_INTENSITY = 0.45;
/** Inner heat-core minimum size (BTC) with runLength >= V3_INNER_CORE_MIN_RUN. */
export const V3_INNER_CORE_MIN_SIZE_BTC = 20;
/** Inner heat-core minimum continuity run length. */
export const V3_INNER_CORE_MIN_RUN = 2;
/** Dominant wall body alpha cap. */
export const V3_STRONG_BASE_ALPHA_CAP = 0.82;
/** Granular overlay alpha targets by tier (weak / medium / strong). */
export const V3_CHUNK_OVERLAY_WEAK = 0.12;
export const V3_CHUNK_OVERLAY_MEDIUM = 0.2;
export const V3_CHUNK_OVERLAY_STRONG = 0.28;
/** Near-price renderer alpha boost (multiplier component). */
export const V3_NEAR_PRICE_ALPHA_BOOST = 0.2;
/** Near-price prepare intensity boost (additive, capped). */
export const V3_NEAR_PRICE_VISIBILITY_BOOST = 0.14;
/** Max intensity after near-price visibility boost. */
export const V3_MAX_VISIBILITY_INTENSITY = 0.42;
/** Fraction of texture draw cap reserved for weak/medium persistent cells. */
export const V3_WEAK_MEDIUM_CAP_RESERVE_PCT = 0.28;
/** Minimum vi for near-price alpha boost (skip noise). */
export const V3_NEAR_PRICE_MIN_INTENSITY = 0.12;
/** Minimum size (BTC) OR runLength for near-price boost when vi is low. */
export const V3_NEAR_PRICE_MIN_SIZE_OR_RUN = 5;

/**
 * B.3 — Matrix texture mode: preserve granular time×price cells alongside horizontal spans.
 */
export const BOOKMAP_MATRIX_TEXTURE_MODE_V1 = false;

/** DEV-only matrix density audit logs (throttled 2s). */
export const BOOKMAP_MATRIX_AUDIT_DIAG = false;

/**
 * B.3.1 — Draw weak/medium historical matrix as short time-bucket mosaic cells
 * (not stretched horizontal spans). Strong walls remain span-rendered.
 */
export const BOOKMAP_GRANULAR_MATRIX_RENDERER_V1 = false;

/** Live projection alpha scale when granular matrix renderer is active. */
export const BOOKMAP_GRANULAR_LIVE_PROJECTION_ALPHA_MUL = 0.85;

/** Max pixel width for granular matrix cells by zoom regime. */
export const BOOKMAP_GRANULAR_MAX_WIDTH_MACRO_PX = 3;
export const BOOKMAP_GRANULAR_MAX_WIDTH_STD_PX = 7;
export const BOOKMAP_GRANULAR_MAX_WIDTH_SCALP_PX = 10;

/** Deterministic alpha modulation for granular cells (no per-frame random). */
export const BOOKMAP_GRANULAR_ALPHA_MOD_MIN = 0.92;
export const BOOKMAP_GRANULAR_ALPHA_MOD_RANGE = 0.14;

/**
 * B.4 — Persistent wall anchoring + macro DOM depth coverage.
 */
export const BOOKMAP_PERSISTENT_WALL_ANCHORING_V1 = false;
export const BOOKMAP_MACRO_DOM_DEPTH_COVERAGE_V1 = false;

export const WALL_ANCHOR_MIN_SIZE_BTC = 20;
export const WALL_ANCHOR_MIN_INTENSITY = 0.45;
export const WALL_ANCHOR_PRICE_BRIDGE_USD = 10;
export const WALL_ANCHOR_STALE_GRACE_MS = 120_000;
export const WALL_ANCHOR_FADE_MS = 300_000;
export const WALL_ANCHOR_REFILL_BOOST = 0.18;
export const WALL_ANCHOR_PULL_DECAY = 0.22;
export const WALL_ANCHOR_MAX_TRACKED_WALLS = 96;
export const WALL_ANCHOR_NEAR_PRICE_BOOST_PCT = 0.15;

export const MACRO_DOM_MIN_SIZE_BTC = 8;
export const MACRO_DOM_VISIBLE_RANGE_MIN_RANK = 0.72;
export const MACRO_DOM_MAX_LEVELS_PER_SIDE = 48;
export const MACRO_DOM_INCLUDE_FAR_WALLS = true;
export const MACRO_DOM_DEPTH_ALPHA_MUL = 0.72;
export const MACRO_DOM_FAR_WALL_ALPHA_FLOOR = 0.22;
export const MACRO_DOM_MEDIUM_MIN_SIZE_BTC = 3;
export const MACRO_DOM_WEAK_MIN_SIZE_BTC = 1.5;
export const MACRO_DOM_MEDIUM_LEVELS_PER_SIDE = 32;

/**
 * B.4.1 — Layered anchored wall rendering integrated with historical heatmap.
 */
export const BOOKMAP_ANCHORED_WALL_VISUAL_INTEGRATION_V1 = false;

/** Base body alpha scale — preserves granular matrix underneath. */
export const ANCHORED_WALL_BASE_ALPHA_MUL = 0.76;
export const ANCHORED_WALL_GLOW_ALPHA_MUL = 0.32;
export const ANCHORED_WALL_CORE_ALPHA_MUL = 0.82;
export const ANCHORED_WALL_PROJECTION_ALPHA_MUL = 0.8;
/** Fraction of projection width used for historical→live seam blend. */
export const ANCHORED_WALL_SEAM_BLEND_PCT = 0.16;

/**
 * B.3.2 — Natural historical matrix: lifecycle, mini-fragments, irregular texture.
 */
export const BOOKMAP_NATURAL_MATRIX_LOGIC_V1 = false;

/** Medium mini-fragment intensity band. */
export const NATURAL_MATRIX_MIN_VI_FRAGMENT = 0.22;
export const NATURAL_MATRIX_MAX_VI_FRAGMENT = 0.45;
/** Minimum consecutive buckets for mini-fragment merge. */
export const NATURAL_MATRIX_MIN_RUN_FRAGMENT = 2;
/** Maximum consecutive buckets in a mini-fragment. */
export const NATURAL_MATRIX_MAX_FRAGMENT_BUCKETS = 5;
/** Minimum persistence (ms) for mini-fragment eligibility. */
export const NATURAL_MATRIX_MIN_PERSISTENCE_MS = 1_200;

/** Deterministic visual jitter — breaks perfect grid without moving price level. */
export const NATURAL_MATRIX_JITTER_X_MAX_PX = 0.65;
export const NATURAL_MATRIX_WIDTH_VARIANCE = 0.24;

/** Life-stage alpha multipliers (historical granular only). */
export const NATURAL_MATRIX_ALPHA_NEW = 0.78;
export const NATURAL_MATRIX_ALPHA_PERSISTENT = 1.1;
export const NATURAL_MATRIX_ALPHA_REINFORCED = 1.2;
export const NATURAL_MATRIX_ALPHA_FADING = 0.58;
export const NATURAL_MATRIX_ALPHA_STALE = 0.45;
export const NATURAL_MATRIX_WEAK_VISIBILITY_BOOST = 1.14;

/** Fraction of texture prepare cap reserved for granular matrix cells. */
export const MATRIX_V1_GRANULAR_CAP_PCT = 0.48;
/** Minimum size (BTC) for horizontal span merge path. */
export const MATRIX_V1_SPAN_MIN_SIZE_BTC = 20;
/** Minimum intensity for horizontal span merge path. */
export const MATRIX_V1_SPAN_MIN_INTENSITY = 0.36;
/** Skip horizontal time merge for granular matrix cells. */
export const MATRIX_V1_GRANULAR_SINGLE_BUCKET = true;

/**
 * B.CLEAN.1 — Minimal stable desktop bookmap renderer (single active path).
 */
export const BOOKMAP_MINIMAL_STABLE_RENDERER_V1 = true;

/** DEV-only clean baseline diagnostics (throttled 2s). */
export const BOOKMAP_CLEAN_BASELINE_DIAG = true;

/**
 * STEP 1 — Desktop historical liquidity surface.
 * Stateful priceLevel x timeBucket matrix fed from active DOM snapshots.
 */
export const BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_V1 = true;

/** DEV-only historical surface diagnostics (throttled 2s). */
export const BOOKMAP_HISTORICAL_LIQUIDITY_SURFACE_DIAG = true;

export const HISTORICAL_SURFACE_RETENTION_MS = 90 * 60 * 1000;
export const HISTORICAL_SURFACE_MAX_CELLS = 72_000;
export const HISTORICAL_SURFACE_MAX_ACTIVE_LEVELS = 6_000;
export const HISTORICAL_SURFACE_MIN_SIZE_BTC = 0.03;
export const HISTORICAL_SURFACE_INITIAL_BACKFILL_MS = 75_000;
export const HISTORICAL_SURFACE_MAX_GAP_FILL_MS = 4_000;
export const HISTORICAL_SURFACE_RENDER_MIN_INTENSITY = 0.006;
export const HISTORICAL_SURFACE_PRICE_BUCKET_USD = 2.5;
export const HISTORICAL_SURFACE_ROW_HEIGHT_USD = 1.6;
export const HISTORICAL_SURFACE_MIN_CELL_WIDTH_MS = 420;
export const HISTORICAL_SURFACE_PERSISTENT_CELL_WIDTH_MS = 800;
export const HISTORICAL_SURFACE_MICROCELL_TEXTURE_V1 = true;
export const HISTORICAL_SURFACE_MICROCELL_MIN_WIDTH_PX = 2.8;
export const HISTORICAL_SURFACE_MICROCELL_GAP_PX = 0.7;
export const HISTORICAL_SURFACE_PROJECTION_TEXTURE_V1 = true;
export const HISTORICAL_SURFACE_CACHE_SAVE_MS = 5_000;
export const HISTORICAL_SURFACE_CACHE_KEY_PREFIX = "goodtrading.bookmap.historicalSurface.v1";

/**
 * B.5 — Clean surface renderer bypassing experimental visual pipeline.
 */
export const BOOKMAP_SURFACE_RENDERER_V1 = false;

/** DEV-only surface renderer diagnostics (throttled 2s). */
export const BOOKMAP_SURFACE_RENDERER_DIAG = false;

export const SURFACE_HISTORICAL_MAX_DRAW = 12_000;
export const SURFACE_LIVE_MAX_PER_SIDE = 180;
export const SURFACE_MACRO_MIN_SIZE_BTC = 1;
export const SURFACE_MICRO_MIN_SIZE_BTC = 0.5;
export const SURFACE_FAR_DISTANCE_ALPHA_MUL = 0.82;

/**
 * B.6 — Limit order lifecycle engine (client-side entity tracking).
 */
export const BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1 = false;

/** DEV-only lifecycle diagnostics (throttled 2s). */
export const BOOKMAP_LIMIT_ORDER_LIFECYCLE_DIAG = false;

export const LIMIT_ORDER_PRICE_BUCKET_USD = 10;
export const LIMIT_ORDER_FADE_MS = 90_000;
export const LIMIT_ORDER_STALE_MS = 180_000;
export const LIMIT_ORDER_PULL_THRESHOLD = 0.18;
export const LIMIT_ORDER_REFILL_THRESHOLD = 0.12;
export const LIMIT_ORDER_MIN_SIZE_BTC_MACRO = 1;
export const LIMIT_ORDER_MIN_SIZE_BTC_MICRO = 0.5;
export const LIMIT_ORDER_WALL_SIZE_BTC = 20;
export const LIMIT_ORDER_DOMINANT_SIZE_BTC = 100;
export const LIMIT_ORDER_MAX_TRACKED_LEVELS = 2_000;
export const LIMIT_ORDER_PERSISTENT_MS = 8_000;
export const LIMIT_ORDER_TOUCH_PCT = 0.08;

/**
 * B.reset / B.rebuild.1 — Canonical heatmap: single visual grammar for historical + live.
 * Takes priority over surface/lifecycle render paths when active.
 */
export const BOOKMAP_CANONICAL_HEATMAP_V1 = false;

/** DEV-only canonical heatmap diagnostics (throttled 2s). */
export const BOOKMAP_CANONICAL_HEATMAP_DIAG = false;

export const CANONICAL_HISTORICAL_MAX_DRAW = 14_000;
export const CANONICAL_LIVE_MAX_PER_SIDE = 200;
export const CANONICAL_MACRO_MIN_SIZE_BTC = 1;
export const CANONICAL_MICRO_MIN_SIZE_BTC = 0.5;
export const CANONICAL_FAR_DISTANCE_ALPHA_MUL = 0.84;
export const CANONICAL_WALL_SIZE_BTC = 20;
export const CANONICAL_DOMINANT_SIZE_BTC = 100;

/** DEV audit: why the old right-side looked enlarged vs historical. */
export const CANONICAL_LEGACY_RIGHT_SIDE_MISMATCH_CAUSE =
  "bookmapSurfaceRenderer stacked three right-side passes per level: " +
  "drawLiveDepthSurface/drawLifecycleLiveSurface used a wide overlap column " +
  "(dataEndTime - BOOKMAP_TEXTURE_SAMPLER_MS*2 → dataEndTime, colW ≫ 1 bucket), " +
  "drawLiveProjectionSurface/drawLifecycleLiveProjection added a second dual-layer fill " +
  "(edgeW 14% + body 86% at higher alpha), and drawImportantWalls/drawLifecycleWalls " +
  "added glow bands at height*1.22 plus a third full-width projection rect — while " +
  "historical cells used single BOOKMAP_ENGINE_BUCKET_MS-wide rects at bodyAlpha only.";

/** Count experimental visual flags still enabled (diag helper). */
export function countBookmapExperimentalVisualFlagsEnabled(): number {
  let count = 0;
  if (BOOKMAP_HORIZONTAL_PERSISTENCE_V2) count += 1;
  if (BOOKMAP_TEXTURE_CALIBRATION_V2) count += 1;
  if (BOOKMAP_HEATMAP_DEPTH_PASS_V2) count += 1;
  if (BOOKMAP_AGGRESSIVE_HEATMAP_CALIBRATION_V3) count += 1;
  if (BOOKMAP_MATRIX_TEXTURE_MODE_V1) count += 1;
  if (BOOKMAP_GRANULAR_MATRIX_RENDERER_V1) count += 1;
  if (BOOKMAP_NATURAL_MATRIX_LOGIC_V1) count += 1;
  if (BOOKMAP_PERSISTENT_WALL_ANCHORING_V1) count += 1;
  if (BOOKMAP_MACRO_DOM_DEPTH_COVERAGE_V1) count += 1;
  if (BOOKMAP_ANCHORED_WALL_VISUAL_INTEGRATION_V1) count += 1;
  if (BOOKMAP_SURFACE_RENDERER_V1) count += 1;
  if (BOOKMAP_CANONICAL_HEATMAP_V1) count += 1;
  if (BOOKMAP_LIMIT_ORDER_LIFECYCLE_V1) count += 1;
  return count;
}
