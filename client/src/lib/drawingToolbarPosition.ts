export type DrawingToolbarPosition = {
  x: number;
  y: number;
  collapsed: boolean;
};

export const DRAWING_TOOLBAR_STORAGE_KEY = "goodtrading:drawing-toolbar-position";

export const DEFAULT_DRAWING_TOOLBAR_POSITION = { x: 16, y: 124 } as const;

export const DRAWING_TOOLBAR_SAFE = {
  left: 12,
  top: 120,
  right: 12,
  bottom: 12,
} as const;

/** Estimated chart header block (symbol, TF, price, regime). */
export const CHART_HEADER_HEIGHT_ESTIMATE = 88;

export const DRAWING_TOOLBAR_DIMS = {
  collapsed: { width: 44, height: 44 },
  expanded: { width: 72, height: 180 },
} as const;

const SMALL_CHART_WIDTH = 480;

export function getDefaultDrawingToolbarPosition(
  chartHeaderHeight = CHART_HEADER_HEIGHT_ESTIMATE,
  collapsed = false,
): DrawingToolbarPosition {
  return {
    x: DEFAULT_DRAWING_TOOLBAR_POSITION.x,
    y: Math.max(DRAWING_TOOLBAR_SAFE.top, chartHeaderHeight + 32),
    collapsed,
  };
}

export function clampDrawingToolbarPosition(
  position: DrawingToolbarPosition,
  containerWidth: number,
  containerHeight: number,
): DrawingToolbarPosition {
  if (containerWidth <= 0 || containerHeight <= 0) return position;

  const dims = position.collapsed ? DRAWING_TOOLBAR_DIMS.collapsed : DRAWING_TOOLBAR_DIMS.expanded;
  const { left, top, right, bottom } = DRAWING_TOOLBAR_SAFE;

  let x = Number.isFinite(position.x) ? position.x : DEFAULT_DRAWING_TOOLBAR_POSITION.x;
  let y = Number.isFinite(position.y) ? position.y : DEFAULT_DRAWING_TOOLBAR_POSITION.y;

  y = Math.max(top, y);
  x = Math.max(left, x);

  const maxX = Math.max(left, containerWidth - dims.width - right);
  const maxY = Math.max(top, containerHeight - dims.height - bottom);

  return {
    ...position,
    x: Math.min(x, maxX),
    y: Math.min(y, maxY),
  };
}

/** Apply safe bounds when loading persisted or legacy positions. */
export function normalizeStoredDrawingToolbarPosition(
  position: DrawingToolbarPosition,
  containerWidth: number,
  containerHeight: number,
  chartHeaderHeight = CHART_HEADER_HEIGHT_ESTIMATE,
): DrawingToolbarPosition {
  const defaults = getDefaultDrawingToolbarPosition(chartHeaderHeight, position.collapsed);
  let next = { ...position };

  if (next.y < DRAWING_TOOLBAR_SAFE.top) {
    next = { ...next, y: defaults.y };
  }

  return clampDrawingToolbarPosition(next, containerWidth, containerHeight);
}

export function safeDefaultDrawingToolbarForChart(
  chartWidth: number,
  chartHeaderHeight = CHART_HEADER_HEIGHT_ESTIMATE,
): DrawingToolbarPosition {
  if (chartWidth > 0 && chartWidth < SMALL_CHART_WIDTH) {
    return getDefaultDrawingToolbarPosition(chartHeaderHeight, true);
  }
  return getDefaultDrawingToolbarPosition(chartHeaderHeight, false);
}

export function clampContextualBarLeft(
  toolbarX: number,
  contextualOffsetX: number,
  chartWidth: number,
  contextualBarWidth = 48,
): number {
  const raw = toolbarX + contextualOffsetX;
  const maxLeft = Math.max(DRAWING_TOOLBAR_SAFE.left, chartWidth - contextualBarWidth - DRAWING_TOOLBAR_SAFE.right);
  return Math.min(Math.max(DRAWING_TOOLBAR_SAFE.left, raw), maxLeft);
}

export function drawingToolbarPanelOpensLeft(
  toolbarX: number,
  chartWidth: number,
  panelWidth = 40,
): boolean {
  const railWidth = DRAWING_TOOLBAR_DIMS.expanded.width;
  return toolbarX + railWidth + panelWidth + DRAWING_TOOLBAR_SAFE.right > chartWidth;
}
