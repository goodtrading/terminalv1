/** Bookmap-style DOM/COB visual tokens (layout/typography only). */

export const DOM_BID_RGB = [22, 150, 65] as const;
export const DOM_ASK_RGB = [175, 45, 45] as const;
export const DOM_COB_RGB = [100, 110, 125] as const;

export const DOM_BID_FILL = "rgba(22, 150, 65, 0.85)";
export const DOM_ASK_FILL = "rgba(175, 45, 45, 0.88)";
export const DOM_COB_FILL_BASE = "rgba(90, 98, 112, 0.55)";

export const DOM_TEXT_PRIMARY = "#f2f6f8";
export const DOM_TEXT_DIM = "rgba(242, 246, 248, 0.72)";

export const DOM_FONT_CLASS =
  "font-mono tabular-nums text-[13px] font-semibold leading-none whitespace-nowrap text-[#f2f6f8]";

export const DOM_HEADER_CLASS =
  "text-[11px] font-mono font-bold uppercase tracking-wide text-slate-300";

/** Minimum bar width in px for non-zero liquidity. */
export const DOM_MIN_BAR_PX = 16;

export const DOM_MIN_BAR_WIDTH_PCT = 18;
export const DOM_MAX_BAR_WIDTH_PCT = 98;
