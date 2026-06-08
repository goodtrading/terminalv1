import { HEATMAP_PAD } from "./bookmapHeatmapRenderer";
import { formatHeatmapPrice } from "./liquidityHeatmapUtils";

/** Execution overlay palette — intentionally separate from heatmap yellow/orange ramp. */
export const BOOKMAP_EXEC_LIMIT_COLOR = "rgba(34, 211, 238, 0.85)";
export const BOOKMAP_EXEC_ENTRY_COLOR = "rgba(34, 211, 238, 0.75)";
export const BOOKMAP_EXEC_SL_COLOR = "rgba(239, 68, 68, 0.9)";
export const BOOKMAP_EXEC_TP_COLOR = "rgba(34, 197, 94, 0.9)";
/** Label text — white-cyan, not heatmap yellow/orange. */
export const BOOKMAP_EXEC_LABEL_TEXT = "rgba(224, 242, 254, 0.95)";

export type BookmapExecutionOrderKind = "limit" | "entry" | "sl" | "tp";

export type BookmapExecutionOrderLine = {
  kind: BookmapExecutionOrderKind;
  price: number;
  label: string;
  dashed: boolean;
  lineWidth: number;
  color: string;
};

export type ExecutionOrderRenderStats = {
  renderedOrderLineCount: number;
};

type PaperOverlayInput = {
  paperActive: boolean;
  openLimitOrders: Array<{
    id: string;
    side: "long" | "short";
    price: number | null;
    orderType?: string;
  }>;
  overlay: {
    entryPrice: number | null;
    stopLoss: number | null;
    takeProfit: number | null;
    side: "long" | "short";
  } | null;
};

export function buildBookmapExecutionOrdersFromPaper(
  input: PaperOverlayInput,
): BookmapExecutionOrderLine[] {
  if (!input.paperActive) return [];

  const lines: BookmapExecutionOrderLine[] = [];

  for (const order of input.openLimitOrders) {
    if (order.price == null || !Number.isFinite(order.price) || order.price <= 0) {
      continue;
    }
    lines.push({
      kind: "limit",
      price: order.price,
      label: "LIMIT",
      dashed: true,
      lineWidth: 1.5,
      color: BOOKMAP_EXEC_LIMIT_COLOR,
    });
  }

  const pos = input.overlay;
  if (pos?.entryPrice != null && Number.isFinite(pos.entryPrice) && pos.entryPrice > 0) {
    lines.push({
      kind: "entry",
      price: pos.entryPrice,
      label: "ENTRY",
      dashed: false,
      lineWidth: 1.5,
      color: BOOKMAP_EXEC_ENTRY_COLOR,
    });
  }
  if (pos?.stopLoss != null && Number.isFinite(pos.stopLoss) && pos.stopLoss > 0) {
    lines.push({
      kind: "sl",
      price: pos.stopLoss,
      label: "SL",
      dashed: true,
      lineWidth: 1.5,
      color: BOOKMAP_EXEC_SL_COLOR,
    });
  }
  if (pos?.takeProfit != null && Number.isFinite(pos.takeProfit) && pos.takeProfit > 0) {
    lines.push({
      kind: "tp",
      price: pos.takeProfit,
      label: "TP",
      dashed: true,
      lineWidth: 1.5,
      color: BOOKMAP_EXEC_TP_COLOR,
    });
  }

  return lines;
}

export function renderBookmapExecutionOrders(
  ctx: CanvasRenderingContext2D,
  metrics: {
    plotW: number;
    plotH: number;
    priceToY: (price: number) => number;
  },
  orders: BookmapExecutionOrderLine[],
  minPrice: number,
  maxPrice: number,
  statsOut?: ExecutionOrderRenderStats,
): number {
  const plotLeft = HEATMAP_PAD.left;
  const plotRight = plotLeft + metrics.plotW;
  const plotTop = HEATMAP_PAD.top;
  const plotBottom = plotTop + metrics.plotH;

  let drawn = 0;
  ctx.save();
  ctx.font = "9px ui-monospace, monospace";
  ctx.textAlign = "right";
  ctx.textBaseline = "middle";

  for (const order of orders) {
    if (order.price < minPrice || order.price > maxPrice) continue;

    const y = metrics.priceToY(order.price);
    if (y < plotTop - 2 || y > plotBottom + 2) continue;

    ctx.strokeStyle = order.color;
    ctx.lineWidth = order.lineWidth;
    if (order.dashed) {
      ctx.setLineDash([5, 4]);
    } else {
      ctx.setLineDash([]);
    }
    ctx.beginPath();
    ctx.moveTo(plotLeft, y);
    ctx.lineTo(plotRight, y);
    ctx.stroke();
    ctx.setLineDash([]);

    const label = `${order.label} ${formatHeatmapPrice(order.price)}`;
    const textW = ctx.measureText(label).width;
    const labelX = plotRight - 4;
    const labelY = y;
    ctx.fillStyle = "rgba(15, 23, 42, 0.82)";
    ctx.fillRect(labelX - textW - 6, labelY - 7, textW + 8, 14);
    ctx.fillStyle = BOOKMAP_EXEC_LABEL_TEXT;
    ctx.fillText(label, labelX, labelY);

    drawn += 1;
  }

  ctx.restore();

  if (statsOut) {
    statsOut.renderedOrderLineCount = drawn;
  }
  return drawn;
}
