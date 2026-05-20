import type { VerticalCompressionMode } from "@/lib/bookmapDepthRange";
import type { ExecutionRailLength } from "@/components/terminal/bookmap/bookmapSettings";
import { HEATMAP_PAD } from "./bookmapHeatmapRenderer";
import {
  clusterDisplaySizeBtc,
  deterministicDotJitter,
  sizeTierFromRadius,
  tradeDotRadius,
  type EngineTradeDot,
  type TradeDotSizeTier,
  type TradeDotVisualContext,
} from "./bookmapEngineTradeDots";

const HALO_SCALE = 1.48;

const RAIL_LENGTH_PX: Record<TradeDotSizeTier, number> = {
  small: 12,
  medium: 18,
  large: 28,
  huge: 40,
};

const RAIL_LINE_WIDTH: Record<TradeDotSizeTier, number> = {
  small: 1,
  medium: 1.5,
  large: 2,
  huge: 2.5,
};

const LENGTH_SCALE: Record<ExecutionRailLength, number> = {
  short: 0.75,
  normal: 1,
  long: 1.35,
};

const BUY_RAIL = "rgba(0, 255, 120, 0.75)";
const SELL_RAIL = "rgba(255, 80, 95, 0.75)";

export type ExecutionRailRenderOptions = {
  verticalMode: VerticalCompressionMode;
  railLength: ExecutionRailLength;
  visual?: TradeDotVisualContext;
};

function modeAlphaMultiplier(verticalMode: VerticalCompressionMode): number {
  switch (verticalMode) {
    case "micro":
      return 1;
    case "intraday":
      return 0.88;
    case "macro":
    case "fullDepth":
    default:
      return 0.6;
  }
}

function tierAllowedInMode(
  tier: TradeDotSizeTier,
  verticalMode: VerticalCompressionMode,
): boolean {
  if (verticalMode === "micro" || verticalMode === "intraday") return true;
  return tier !== "small";
}

function railColor(side: "buy" | "sell", alphaMul: number): string {
  const base = side === "buy" ? BUY_RAIL : SELL_RAIL;
  if (alphaMul >= 0.999) return base;
  const m = base.match(/rgba\((\d+),\s*(\d+),\s*(\d+),\s*([\d.]+)\)/);
  if (!m) return base;
  const a = Math.min(1, parseFloat(m[4]) * alphaMul);
  return `rgba(${m[1]}, ${m[2]}, ${m[3]}, ${a.toFixed(3)})`;
}

type RailLayout = {
  x: number;
  y: number;
  halfLen: number;
  lineWidth: number;
  side: "buy" | "sell";
  tier: TradeDotSizeTier;
};

function layoutRailsForDots(
  dots: EngineTradeDot[],
  timeToX: (timeMs: number) => number,
  priceToY: (price: number) => number,
  plotW: number,
  plotH: number,
  options: ExecutionRailRenderOptions,
): RailLayout[] {
  const { verticalMode, railLength, visual } = options;
  const plotLeft = HEATMAP_PAD.left;
  const plotTop = HEATMAP_PAD.top;
  const plotRight = plotLeft + plotW;
  const plotBottom = plotTop + plotH;
  const lenMul = LENGTH_SCALE[railLength];
  const alphaMul = modeAlphaMultiplier(verticalMode);
  const layouts: RailLayout[] = [];

  for (const dot of dots) {
    const displaySize = clusterDisplaySizeBtc(dot);
    const radius = tradeDotRadius(displaySize, verticalMode, visual);
    if (radius <= 0) continue;

    const tier = sizeTierFromRadius(radius);
    if (!tierAllowedInMode(tier, verticalMode)) continue;

    const { dx, dy } = deterministicDotJitter(dot.jitterKey, radius);
    const x = timeToX(dot.timestamp) + dx;
    const yBase = priceToY(dot.price) + dy;
    const y =
      dot.side === "buy" ? yBase - 0.5 : dot.side === "sell" ? yBase + 0.5 : yBase;
    const pad = radius * HALO_SCALE + 2;

    if (x + pad < plotLeft || x - pad > plotRight) continue;
    if (y + pad < plotTop || y - pad > plotBottom) continue;

    layouts.push({
      x,
      y,
      halfLen: (RAIL_LENGTH_PX[tier] * lenMul) / 2,
      lineWidth: RAIL_LINE_WIDTH[tier],
      side: dot.side,
      tier,
    });
  }

  return layouts;
}

/** Count rails that would render (for debug). */
export function countExecutionRails(
  dots: EngineTradeDot[],
  timeToX: (timeMs: number) => number,
  priceToY: (price: number) => number,
  plotW: number,
  plotH: number,
  options: ExecutionRailRenderOptions,
): number {
  if (!dots.length) return 0;
  return layoutRailsForDots(dots, timeToX, priceToY, plotW, plotH, options).length;
}

/** Draw bid/ask execution tick lines under trade dots (same clustered dots). */
export function renderEngineExecutionRails(
  ctx: CanvasRenderingContext2D,
  dots: EngineTradeDot[],
  timeToX: (timeMs: number) => number,
  priceToY: (price: number) => number,
  plotW: number,
  plotH: number,
  options: ExecutionRailRenderOptions,
): number {
  if (!dots.length) return 0;

  const layouts = layoutRailsForDots(
    dots,
    timeToX,
    priceToY,
    plotW,
    plotH,
    options,
  );
  if (!layouts.length) return 0;

  const alphaMul = modeAlphaMultiplier(options.verticalMode);
  ctx.save();
  ctx.lineCap = "round";

  for (const rail of layouts) {
    ctx.strokeStyle = railColor(rail.side, alphaMul);
    ctx.lineWidth = rail.lineWidth;
    ctx.beginPath();
    ctx.moveTo(rail.x - rail.halfLen, rail.y);
    ctx.lineTo(rail.x + rail.halfLen, rail.y);
    ctx.stroke();
  }

  ctx.restore();
  return layouts.length;
}
