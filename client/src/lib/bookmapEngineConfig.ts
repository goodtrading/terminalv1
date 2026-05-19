/** When true, Liquidity Heatmap / Flows uses GET /api/bookmap/state (falls back on error/empty). */
export const USE_BOOKMAP_ENGINE = true;

export const BOOKMAP_ENGINE_REFETCH_MS = 1000;
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
