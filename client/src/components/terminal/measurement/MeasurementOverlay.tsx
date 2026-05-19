import { useMemo } from "react";
import {
  formatMeasurementLine1,
  formatMeasurementLine2,
} from "./measurementFormat";
import type { MeasurementMetrics, MeasurementState } from "./measurementTypes";

const POSITIVE_FILL = "rgba(34, 197, 94, 0.18)";
const NEGATIVE_FILL = "rgba(239, 68, 68, 0.18)";
const POSITIVE_STROKE = "rgba(34, 197, 94, 0.85)";
const NEGATIVE_STROKE = "rgba(239, 68, 68, 0.85)";
const POSITIVE_LABEL = "#22c55e";
const NEGATIVE_LABEL = "#ef4444";

type MeasurementOverlayProps = {
  measurement: MeasurementState | null;
  metrics: MeasurementMetrics | null;
  chartWidth: number;
  chartHeight: number;
  isDragging: boolean;
};

export function MeasurementOverlay({
  measurement,
  metrics,
  chartWidth,
  chartHeight,
  isDragging,
}: MeasurementOverlayProps) {
  const layout = useMemo(() => {
    if (!measurement?.isVisible || !metrics) return null;

    const { start, end } = measurement;
    const left = Math.min(start.x, end.x);
    const right = Math.max(start.x, end.x);
    const top = Math.min(start.y, end.y);
    const bottom = Math.max(start.y, end.y);
    const width = Math.max(1, right - left);
    const height = Math.max(1, bottom - top);

    const isPositive = metrics.isPositive;
    const fill = isPositive ? POSITIVE_FILL : NEGATIVE_FILL;
    const stroke = isPositive ? POSITIVE_STROKE : NEGATIVE_STROKE;
    const labelBg = isPositive ? POSITIVE_LABEL : NEGATIVE_LABEL;

    const arrowX = end.x;
    const arrowFromY = start.y;
    const arrowToY = end.y;

    const labelPad = 8;
    let labelLeft = end.x + labelPad;
    let labelTop = end.y - 28;
    const labelWidth = 168;
    const labelHeight = 40;
    if (labelLeft + labelWidth > chartWidth - 4) {
      labelLeft = end.x - labelWidth - labelPad;
    }
    if (labelTop < 4) labelTop = end.y + labelPad;
    if (labelTop + labelHeight > chartHeight - 4) {
      labelTop = Math.max(4, chartHeight - labelHeight - 4);
    }

    return {
      left,
      top,
      width,
      height,
      startY: start.y,
      endY: end.y,
      fill,
      stroke,
      labelBg,
      arrowX,
      arrowFromY,
      arrowToY,
      labelLeft,
      labelTop,
      line1: formatMeasurementLine1(metrics),
      line2: formatMeasurementLine2(metrics),
    };
  }, [measurement, metrics, chartWidth, chartHeight]);

  if (!layout) return null;

  const {
    left,
    top,
    width,
    height,
    startY,
    endY,
    fill,
    stroke,
    labelBg,
    arrowX,
    arrowFromY,
    arrowToY,
    labelLeft,
    labelTop,
    line1,
    line2,
  } = layout;

  const arrowHeadSize = 5;
  const arrowUp = arrowToY < arrowFromY;

  return (
    <div
      className="absolute inset-0 z-[14] overflow-hidden pointer-events-none"
      style={{ width: chartWidth, height: chartHeight, cursor: isDragging ? "crosshair" : undefined }}
      aria-hidden
    >
      <div
        className="absolute"
        style={{
          left,
          top,
          width,
          height,
          backgroundColor: fill,
          border: `1px solid ${stroke}`,
        }}
      />

      <div
        className="absolute border-t border-dashed"
        style={{
          top: startY,
          left,
          width,
          borderColor: stroke,
          opacity: 0.9,
        }}
      />
      <div
        className="absolute border-t border-dashed"
        style={{
          top: endY,
          left,
          width,
          borderColor: stroke,
          opacity: 0.9,
        }}
      />

      <svg
        className="absolute inset-0 overflow-visible pointer-events-none"
        width={chartWidth}
        height={chartHeight}
        aria-hidden
      >
        <line
          x1={arrowX}
          y1={arrowFromY}
          x2={arrowX}
          y2={arrowToY}
          stroke={stroke}
          strokeWidth={1.5}
        />
        <polygon
          points={
            arrowUp
              ? `${arrowX},${arrowToY} ${arrowX - arrowHeadSize},${arrowToY + arrowHeadSize * 1.6} ${arrowX + arrowHeadSize},${arrowToY + arrowHeadSize * 1.6}`
              : `${arrowX},${arrowToY} ${arrowX - arrowHeadSize},${arrowToY - arrowHeadSize * 1.6} ${arrowX + arrowHeadSize},${arrowToY - arrowHeadSize * 1.6}`
          }
          fill={stroke}
        />
      </svg>

      <div
        className="absolute px-2 py-1 font-mono text-white shadow-lg select-none"
        style={{
          left: labelLeft,
          top: labelTop,
          backgroundColor: labelBg,
          borderRadius: 5,
          fontSize: 11,
          fontWeight: 600,
          lineHeight: 1.35,
          minWidth: 120,
          maxWidth: 220,
        }}
      >
        <div>{line1}</div>
        <div style={{ opacity: 0.95 }}>{line2}</div>
      </div>
    </div>
  );
}
