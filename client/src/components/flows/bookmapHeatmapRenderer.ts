import { aggregateSideToBookLevels } from "./domLadderUtils";
import {
  computeMaxIntensityFromSizes,
  filterHeatmapForRender,
  filterLevelsByPrice,
  formatHeatmapPrice,
  getBookmapHeatColor,
  HEATMAP_MAJOR_WALL_BTC,
  MAX_LIQUIDITY_SNAPSHOTS,
  normalizeLiquidityIntensity,
  type HeatmapTrade,
  type LiquiditySnapshot,
  type OrderbookLevel,
} from "./liquidityHeatmapUtils";
import {
  PERSISTENT_MAJOR_WALL_BTC,
  type PersistentWall,
} from "./persistentWallsTracker";
import {
  getHeatmapTimeWindow,
  getTradeBubbleRadius,
  getTradeBubbleStyle,
  prepareTradeBubblesForRender,
  timeToX,
  type TradeBubble,
} from "./tradeBubbleUtils";

export const HEATMAP_PAD = { top: 8, right: 8, bottom: 8, left: 8 };

export type BookmapCrosshair = {
  x: number;
  y: number;
  price: number;
} | null;

export type FarWallMarker = {
  side: "bid" | "ask";
  price: number;
  sizeBtc: number;
};

export type BookmapHeatmapRenderParams = {
  width: number;
  height: number;
  minPrice: number;
  maxPrice: number;
  spot: number | null;
  series: LiquiditySnapshot[];
  priceStep: number;
  minVisibleBtc: number;
  majorWallsOnly: boolean;
  showTrades: boolean;
  /** Full rolling buffer; filtered inside renderer to snapshot window. */
  trades: HeatmapTrade[];
  showPersistentWalls?: boolean;
  persistentWalls?: PersistentWall[];
  crosshair?: BookmapCrosshair;
  /** Important liquidity outside the current range (edge labels). */
  farWallMarkers?: FarWallMarker[];
  /** Cap heatmap cell height to match fixed ladder row height (Bookmap viewport). */
  ladderRowHeightPx?: number;
};

export type BookmapPlotMetrics = {
  plotW: number;
  plotH: number;
  priceToY: (price: number) => number;
  columnWidth: number;
  colOffset: number;
  cellHeight: number;
  priceStep: number;
  columns: Array<{ bids: OrderbookLevel[]; asks: OrderbookLevel[] }>;
  maxForIntensity: number;
  minVisibleBtc: number;
  majorWallsOnly: boolean;
  totalCells: number;
};

function buildPlotMetrics(
  params: BookmapHeatmapRenderParams,
): BookmapPlotMetrics | null {
  const { width: w, height: h, minPrice, maxPrice, series } = params;
  const plotW = w - HEATMAP_PAD.left - HEATMAP_PAD.right;
  const plotH = h - HEATMAP_PAD.top - HEATMAP_PAD.bottom;
  const priceSpan = maxPrice - minPrice;
  if (plotW <= 0 || plotH <= 0 || priceSpan <= 0 || !series.length) return null;

  const priceToY = (price: number) =>
    HEATMAP_PAD.top + ((maxPrice - price) / priceSpan) * plotH;

  const columnWidth = Math.max(2, plotW / MAX_LIQUIDITY_SNAPSHOTS);
  const step = Math.max(1, params.priceStep);
  const bucketPx = priceSpan > 0 ? (plotH / priceSpan) * step : 2;
  const rowCap = params.ladderRowHeightPx ?? 8;
  const cellHeight = Math.max(2, Math.min(rowCap, bucketPx));
  const colOffset = MAX_LIQUIDITY_SNAPSHOTS - series.length;

  const columns: Array<{ bids: OrderbookLevel[]; asks: OrderbookLevel[] }> = [];
  const renderSizes: number[] = [];

  for (const snap of series) {
    const aggBidsFull = aggregateSideToBookLevels(snap.bids, step, "bid");
    const aggAsksFull = aggregateSideToBookLevels(snap.asks, step, "ask");
    const bidsAfter = filterHeatmapForRender(aggBidsFull, params.majorWallsOnly);
    const asksAfter = filterHeatmapForRender(aggAsksFull, params.majorWallsOnly);
    const bids = filterLevelsByPrice(bidsAfter, minPrice, maxPrice);
    const asks = filterLevelsByPrice(asksAfter, minPrice, maxPrice);
    columns.push({ bids, asks });
    for (const l of [...bids, ...asks]) renderSizes.push(l.sizeBtc);
  }

  const totalCells = columns.reduce((n, c) => n + c.bids.length + c.asks.length, 0);

  return {
    plotW,
    plotH,
    priceToY,
    columnWidth,
    colOffset,
    cellHeight,
    priceStep: step,
    columns,
    maxForIntensity: computeMaxIntensityFromSizes(renderSizes, params.minVisibleBtc),
    minVisibleBtc: params.minVisibleBtc,
    majorWallsOnly: params.majorWallsOnly,
    totalCells,
  };
}

export function renderHeatmapBackground(ctx: CanvasRenderingContext2D, w: number, h: number) {
  ctx.fillStyle = "#0b1220";
  ctx.fillRect(0, 0, w, h);
}

export function renderPriceGrid(
  ctx: CanvasRenderingContext2D,
  w: number,
  metrics: BookmapPlotMetrics,
  minPrice: number,
  maxPrice: number,
) {
  const { plotW, plotH, priceToY } = metrics;
  const priceSpan = maxPrice - minPrice;

  ctx.strokeStyle = "rgba(51, 65, 85, 0.35)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 8; i++) {
    const y = HEATMAP_PAD.top + (i / 8) * plotH;
    ctx.beginPath();
    ctx.moveTo(HEATMAP_PAD.left, y);
    ctx.lineTo(HEATMAP_PAD.left + plotW, y);
    ctx.stroke();
    const p = maxPrice - (i / 8) * priceSpan;
    ctx.fillStyle = "rgba(148, 163, 184, 0.65)";
    ctx.font = "9px ui-monospace, monospace";
    ctx.textAlign = "right";
    ctx.fillText(formatHeatmapPrice(p), w - HEATMAP_PAD.right - 2, y + 3);
    ctx.textAlign = "left";
  }
}

export function renderTimeGrid(ctx: CanvasRenderingContext2D, metrics: BookmapPlotMetrics) {
  const { plotW, plotH } = metrics;
  ctx.strokeStyle = "rgba(30, 58, 95, 0.4)";
  ctx.lineWidth = 1;
  for (let i = 0; i <= 10; i++) {
    const x = HEATMAP_PAD.left + (i / 10) * plotW;
    ctx.beginPath();
    ctx.moveTo(x, HEATMAP_PAD.top);
    ctx.lineTo(x, HEATMAP_PAD.top + plotH);
    ctx.stroke();
  }
}

export function renderHeatmapLiquidity(
  ctx: CanvasRenderingContext2D,
  metrics: BookmapPlotMetrics,
) {
  const {
    columns,
    columnWidth,
    colOffset,
    cellHeight,
    priceToY,
    priceStep,
    maxForIntensity,
    minVisibleBtc,
    majorWallsOnly,
  } = metrics;

  columns.forEach((col, i) => {
    const x = HEATMAP_PAD.left + (colOffset + i) * columnWidth;
    const paint = (level: OrderbookLevel) => {
      const y = priceToY(level.price);
      const yNext = priceToY(level.price - priceStep);
      const bucketH = Math.max(2, Math.min(10, Math.abs(yNext - y) || cellHeight));
      const h = Math.max(cellHeight, bucketH);
      const isMajor = level.sizeBtc >= HEATMAP_MAJOR_WALL_BTC;
      const isAboveMin = level.sizeBtc >= minVisibleBtc;
      const intensity = normalizeLiquidityIntensity(level.sizeBtc, maxForIntensity);
      const alphaBoost = majorWallsOnly ? 1 : isAboveMin ? 1 : 0.45;
      ctx.fillStyle = getBookmapHeatColor(intensity, alphaBoost, isMajor);
      ctx.fillRect(x, y - h / 2, columnWidth + 1, h + 0.5);
    };
    col.bids.forEach((l) => paint(l));
    col.asks.forEach((l) => paint(l));
  });
}

export function renderSpotLine(
  ctx: CanvasRenderingContext2D,
  w: number,
  metrics: BookmapPlotMetrics,
  spot: number,
  minPrice: number,
  maxPrice: number,
) {
  if (spot < minPrice || spot > maxPrice) return;
  const { plotW, priceToY } = metrics;
  const sy = priceToY(spot);
  ctx.strokeStyle = "rgba(250, 204, 21, 0.75)";
  ctx.lineWidth = 1;
  ctx.setLineDash([4, 3]);
  ctx.beginPath();
  ctx.moveTo(HEATMAP_PAD.left, sy);
  ctx.lineTo(HEATMAP_PAD.left + plotW, sy);
  ctx.stroke();
  ctx.setLineDash([]);
  ctx.font = "10px ui-monospace, monospace";
  ctx.fillStyle = "rgba(253, 224, 71, 0.9)";
  ctx.textAlign = "left";
  ctx.fillText(`SPOT ${formatHeatmapPrice(spot)}`, HEATMAP_PAD.left + 4, sy - 4);
}

export function renderFarWallEdgeMarkers(
  ctx: CanvasRenderingContext2D,
  params: BookmapHeatmapRenderParams,
  metrics: BookmapPlotMetrics,
) {
  const markers = params.farWallMarkers;
  if (!markers?.length) return;

  const { minPrice, maxPrice } = params;
  const { plotH } = metrics;
  const yTop = HEATMAP_PAD.top + 2;
  const yBot = HEATMAP_PAD.top + plotH - 10;

  const above = markers.filter((m) => m.side === "ask" && m.price > maxPrice);
  const below = markers.filter((m) => m.side === "bid" && m.price < minPrice);

  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "left";

  above.slice(0, 4).forEach((m, i) => {
    ctx.fillStyle = "rgba(252, 165, 165, 0.95)";
    const txt = `ASK WALL ${formatHeatmapPrice(m.price)} · ${Math.round(m.sizeBtc)} BTC ↑`;
    ctx.fillText(txt, HEATMAP_PAD.left + 4, yTop + i * 11);
  });

  below.slice(0, 4).forEach((m, i) => {
    ctx.fillStyle = "rgba(110, 231, 183, 0.95)";
    const txt = `BID WALL ${formatHeatmapPrice(m.price)} · ${Math.round(m.sizeBtc)} BTC ↓`;
    ctx.fillText(txt, HEATMAP_PAD.left + 4, yBot - i * 11);
  });
}

export function renderPersistentWalls(
  ctx: CanvasRenderingContext2D,
  metrics: BookmapPlotMetrics,
  walls: PersistentWall[],
  minPrice: number,
  maxPrice: number,
) {
  const { plotW, priceToY } = metrics;
  const step = metrics.priceStep;

  for (const wall of walls) {
    if (wall.priceBucket < minPrice - step || wall.priceBucket > maxPrice + step) {
      continue;
    }

    const y = priceToY(wall.priceBucket);
    const yNext = priceToY(wall.priceBucket - step);
    const bandH = Math.max(3, Math.abs(yNext - y) || 4);
    const isMajor = wall.maxSizeBtc >= PERSISTENT_MAJOR_WALL_BTC;
    const persistBoost = Math.min(1, wall.persistenceCount / 8);
    const alpha = isMajor
      ? 0.22 + persistBoost * 0.28
      : 0.12 + persistBoost * 0.2;

    const isBid = wall.side === "bid";
    ctx.fillStyle = isBid
      ? `rgba(0, 220, 140, ${alpha})`
      : `rgba(255, 70, 70, ${alpha})`;
    ctx.fillRect(
      HEATMAP_PAD.left,
      y - bandH / 2,
      plotW,
      bandH + 0.5,
    );

    ctx.strokeStyle = isBid
      ? `rgba(0, 255, 170, ${0.25 + persistBoost * 0.35})`
      : `rgba(255, 100, 100, ${0.25 + persistBoost * 0.35})`;
    ctx.lineWidth = isMajor ? 1.5 : 1;
    ctx.beginPath();
    ctx.moveTo(HEATMAP_PAD.left, y);
    ctx.lineTo(HEATMAP_PAD.left + plotW, y);
    ctx.stroke();

    if (isMajor && wall.persistenceCount >= 2) {
      const tag = `${isBid ? "BID" : "ASK"} ${Math.round(wall.maxSizeBtc)} · P${wall.persistenceCount}`;
      ctx.font = "9px ui-monospace, monospace";
      ctx.fillStyle = isBid ? "rgba(167, 243, 208, 0.95)" : "rgba(252, 165, 165, 0.95)";
      ctx.fillText(tag, HEATMAP_PAD.left + plotW - 96, y - 3);
    }
  }
}

export function renderMajorWallLabels(
  ctx: CanvasRenderingContext2D,
  w: number,
  metrics: BookmapPlotMetrics,
) {
  const latestCol = metrics.columns[metrics.columns.length - 1];
  if (!latestCol) return;

  const { plotW, priceToY } = metrics;
  const labeled = new Set<number>();

  for (const l of [...latestCol.bids, ...latestCol.asks]) {
    if (l.sizeBtc < HEATMAP_MAJOR_WALL_BTC) continue;
    const key = Math.round(l.price * 100);
    if (labeled.has(key)) continue;
    labeled.add(key);
    const y = priceToY(l.price);
    ctx.strokeStyle =
      l.side === "bid" ? "rgba(0, 220, 140, 0.5)" : "rgba(255, 70, 70, 0.5)";
    ctx.lineWidth = 1;
    ctx.beginPath();
    ctx.moveTo(HEATMAP_PAD.left, y);
    ctx.lineTo(HEATMAP_PAD.left + plotW, y);
    ctx.stroke();
    const tag =
      l.side === "bid"
        ? `BID ${Math.round(l.sizeBtc)}`
        : `ASK ${Math.round(l.sizeBtc)}`;
    ctx.font = "9px ui-monospace, monospace";
    ctx.fillStyle = l.side === "bid" ? "#6ee7b7" : "#fca5a5";
    ctx.fillText(tag, HEATMAP_PAD.left + 4, y - 2);
  }
}

function drawTradeBubble(
  ctx: CanvasRenderingContext2D,
  xi: number,
  yi: number,
  bubble: TradeBubble,
) {
  const r = getTradeBubbleRadius(bubble.sizeBtc);
  if (r <= 0) return;

  const style = getTradeBubbleStyle(bubble.sizeBtc, bubble.side);

  if (style.glow !== "transparent") {
    ctx.beginPath();
    ctx.arc(xi, yi, r + 2, 0, Math.PI * 2);
    ctx.fillStyle = style.glow;
    ctx.fill();
  }

  ctx.beginPath();
  ctx.arc(xi, yi, r, 0, Math.PI * 2);
  ctx.fillStyle = style.fill;
  ctx.fill();
  ctx.strokeStyle = style.stroke;
  ctx.lineWidth = style.lineWidth;
  ctx.stroke();
}

export function renderTradeBubbles(
  ctx: CanvasRenderingContext2D,
  params: BookmapHeatmapRenderParams,
  metrics: BookmapPlotMetrics,
  series: LiquiditySnapshot[],
) {
  if (!params.showTrades || !series.length) return;

  const { minPrice, maxPrice, trades, priceStep } = params;
  const { columnWidth, colOffset, priceToY } = metrics;
  const { grouped } = prepareTradeBubblesForRender(
    trades,
    series,
    minPrice,
    maxPrice,
    priceStep,
  );
  const { tMin, tMax } = getHeatmapTimeWindow(series);
  const plotLeft = HEATMAP_PAD.left + colOffset * columnWidth;
  const plotWidth = Math.max(1, series.length * columnWidth);

  const sorted = [...grouped].sort((a, b) => a.sizeBtc - b.sizeBtc);

  for (const bubble of sorted) {
    const xi = timeToX(bubble.timeMs, { min: tMin, max: tMax }, plotLeft, plotWidth);
    const yi = priceToY(bubble.price);
    if (!Number.isFinite(xi) || !Number.isFinite(yi)) continue;
    drawTradeBubble(ctx, xi, yi, bubble);
  }
}

export function paintBookmapHeatmapFrame(
  ctx: CanvasRenderingContext2D,
  params: BookmapHeatmapRenderParams,
) {
  const { width: w, height: h, minPrice, maxPrice, spot, series, majorWallsOnly } = params;

  renderHeatmapBackground(ctx, w, h);

  if (!series.length) {
    ctx.fillStyle = "#64748b";
    ctx.font = "12px ui-monospace, monospace";
    ctx.fillText("Waiting for orderbook…", HEATMAP_PAD.left + 8, HEATMAP_PAD.top + 20);
    return;
  }

  const metrics = buildPlotMetrics(params);
  if (!metrics) return;

  renderTimeGrid(ctx, metrics);
  renderPriceGrid(ctx, w, metrics, minPrice, maxPrice);

  if (metrics.totalCells === 0) {
    ctx.fillStyle = "#64748b";
    ctx.font = "11px ui-monospace, monospace";
    ctx.fillText(
      majorWallsOnly ? "No major walls in range" : "No liquidity above threshold",
      HEATMAP_PAD.left + 8,
      HEATMAP_PAD.top + 24,
    );
    if (spot != null) renderSpotLine(ctx, w, metrics, spot, minPrice, maxPrice);
    renderTradeBubbles(ctx, params, metrics, series);
    renderFarWallEdgeMarkers(ctx, params, metrics);
    return;
  }

  renderHeatmapLiquidity(ctx, metrics);

  if (params.showPersistentWalls && params.persistentWalls?.length) {
    renderPersistentWalls(
      ctx,
      metrics,
      params.persistentWalls,
      minPrice,
      maxPrice,
    );
  }

  if (spot != null) renderSpotLine(ctx, w, metrics, spot, minPrice, maxPrice);
  renderTradeBubbles(ctx, params, metrics, series);
  renderMajorWallLabels(ctx, w, metrics);
  renderFarWallEdgeMarkers(ctx, params, metrics);
  if (params.crosshair) renderCrosshair(ctx, w, h, params.crosshair, metrics);
}

export function renderCrosshair(
  ctx: CanvasRenderingContext2D,
  w: number,
  _h: number,
  crosshair: NonNullable<BookmapCrosshair>,
  metrics: BookmapPlotMetrics,
) {
  const { plotW, plotH, priceToY } = metrics;
  const y = priceToY(crosshair.price);
  const x = crosshair.x;

  if (y < HEATMAP_PAD.top || y > HEATMAP_PAD.top + plotH) return;

  ctx.strokeStyle = "rgba(148, 163, 184, 0.45)";
  ctx.lineWidth = 1;
  ctx.setLineDash([3, 3]);
  ctx.beginPath();
  ctx.moveTo(HEATMAP_PAD.left, y);
  ctx.lineTo(HEATMAP_PAD.left + plotW, y);
  ctx.stroke();
  ctx.beginPath();
  ctx.moveTo(x, HEATMAP_PAD.top);
  ctx.lineTo(x, HEATMAP_PAD.top + plotH);
  ctx.stroke();
  ctx.setLineDash([]);

  ctx.fillStyle = "rgba(15, 23, 42, 0.92)";
  ctx.fillRect(w - HEATMAP_PAD.right - 52, y - 9, 50, 14);
  ctx.fillStyle = "#e2e8f0";
  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.fillText(formatHeatmapPrice(crosshair.price), w - HEATMAP_PAD.right - 4, y + 3);
  ctx.textAlign = "left";
}
