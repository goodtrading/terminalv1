import type { BookmapTimeViewport } from "@/hooks/useBookmapTimeScale";
import { HEATMAP_PAD } from "./bookmapHeatmapRenderer";
import type { SpotPerpDivergenceSignal } from "./bookmapDivergenceEngine";
import { formatDivergenceContextLabel } from "./bookmapDivergenceQuality";

function markerLabel(signal: SpotPerpDivergenceSignal): string {
  switch (signal.context) {
    case "trap":
      return "TRAP?";
    case "absorption":
      return "ABS";
    case "continuation":
      return "S/P";
    case "confluence":
      return "CONF";
    case "liquidity_warning":
      return "WARN";
    default:
      return formatDivergenceContextLabel(signal.context).slice(0, 4);
  }
}

export function renderDivergenceMarkers(
  ctx: CanvasRenderingContext2D,
  signals: SpotPerpDivergenceSignal[],
  params: {
    plotW: number;
    plotH: number;
    priceToY: (price: number) => number;
    timeToX: (timeMs: number) => number;
    timeViewport: BookmapTimeViewport;
    minPrice: number;
    maxPrice: number;
  },
) {
  const plotLeft = HEATMAP_PAD.left;
  const plotRight = plotLeft + params.plotW;
  const plotTop = HEATMAP_PAD.top;
  const plotBottom = plotTop + params.plotH;

  const highOnly = signals.filter((s) => s.severity === "high").slice(0, 3);
  if (highOnly.length === 0) return;

  ctx.save();
  ctx.font = "8px ui-monospace, monospace";
  ctx.textAlign = "left";

  for (const s of highOnly) {
    if (s.price < params.minPrice || s.price > params.maxPrice) continue;
    const x = params.timeToX(
      Math.max(
        params.timeViewport.visibleStartTime,
        Math.min(params.timeViewport.visibleEndTime, s.timestamp),
      ),
    );
    const y = params.priceToY(s.price);
    if (x < plotLeft || x > plotRight || y < plotTop || y > plotBottom) continue;

    const label = markerLabel(s);
    const textW = ctx.measureText(label).width;
    ctx.fillStyle = "rgba(12, 18, 28, 0.85)";
    ctx.fillRect(x + 2, y - 5, textW + 4, 10);
    ctx.fillStyle =
      s.type === "PERP_PRESSURE_NO_SPOT_CONFIRMATION"
        ? "rgba(251, 191, 36, 0.95)"
        : "rgba(196, 181, 253, 0.95)";
    ctx.fillText(label, x + 4, y + 3);
  }

  ctx.restore();
}
