export const PRICE_LADDER_WIDTH_PX = 82;
export const DOM_MIN_WIDTH_PX = 360;
export const DOM_MAX_WIDTH_PX = 580;
export const DOM_DEFAULT_WIDTH_PX = 430;
export const HEATMAP_MIN_WIDTH_PX = 240;
/** Show numeric text in DOM cells (bars still render). */
export const DOM_SHOW_NUMBERS_WIDTH_PX = 300;
/** COB column visible. */
export const DOM_SHOW_COB_WIDTH_PX = 360;
/** SVP column visible. */
export const DOM_SHOW_SVP_WIDTH_PX = 430;
export const DOM_RESIZE_HANDLE_PX = 0;

export type DomColumnLayout = "full" | "no-svp" | "bid-ask";

export type DomDisplayFlags = {
  layout: DomColumnLayout;
  showSvp: boolean;
  showCob: boolean;
  showNumbers: boolean;
};

export function clampDomWidth(width: number): number {
  return Math.min(DOM_MAX_WIDTH_PX, Math.max(DOM_MIN_WIDTH_PX, width));
}

export function getDomDisplayFlags(panelWidth: number): DomDisplayFlags {
  const w = clampDomWidth(panelWidth);
  let layout: DomColumnLayout = "full";
  if (w < DOM_SHOW_COB_WIDTH_PX) layout = "bid-ask";
  else if (w < DOM_SHOW_SVP_WIDTH_PX) layout = "no-svp";

  return {
    layout,
    showSvp: w >= DOM_SHOW_SVP_WIDTH_PX,
    showCob: w >= DOM_SHOW_COB_WIDTH_PX,
    showNumbers: w >= DOM_SHOW_NUMBERS_WIDTH_PX,
  };
}

/** @deprecated Use getDomDisplayFlags(panelWidth).layout */
export function getDomColumnLayout(panelWidth: number): DomColumnLayout {
  return getDomDisplayFlags(panelWidth).layout;
}

export function getMinBookmapBodyWidth(): number {
  return (
    HEATMAP_MIN_WIDTH_PX +
    PRICE_LADDER_WIDTH_PX +
    DOM_MIN_WIDTH_PX +
    DOM_RESIZE_HANDLE_PX
  );
}

export function getDomGridClass(layout: DomColumnLayout): string {
  switch (layout) {
    case "bid-ask":
      return "grid grid-cols-[minmax(88px,1fr)_minmax(88px,1fr)] gap-0";
    case "no-svp":
      return "grid grid-cols-[minmax(72px,1fr)_minmax(90px,1fr)_minmax(90px,1fr)] gap-0";
    case "full":
    default:
      return "grid grid-cols-[minmax(72px,1fr)_minmax(90px,1fr)_minmax(90px,1fr)_minmax(76px,1fr)] gap-0";
  }
}
