import type { Drawing } from "./types";
import { drawDebug, getChartViewportVersion } from "./debug";
import { createDrawingProjection } from "./projection";

interface DrawingHitRegionsProps {
  drawings: Drawing[];
  chartWidth: number;
  chartHeight: number;
  viewportVersion?: number;
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: number) => number | null;
  onSelect: (d: Drawing) => void;
}

const HIT_THRESHOLD = 10;
const BODY_HIT_WIDTH = 16;

function segmentHitStyle(
  x1: number,
  y1: number,
  x2: number,
  y2: number
): React.CSSProperties {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len = Math.max(1, Math.hypot(dx, dy));
  const angleDeg = (Math.atan2(dy, dx) * 180) / Math.PI;
  return {
    left: x1,
    top: y1 - BODY_HIT_WIDTH / 2,
    width: len,
    height: BODY_HIT_WIDTH,
    transformOrigin: "0 50%",
    transform: `rotate(${angleDeg}deg)`,
  };
}

/** Invisible hit regions for selecting drawings. Body first, then endpoints/vertices on top for handle priority. */
export function DrawingHitRegions({
  drawings,
  chartWidth,
  chartHeight,
  viewportVersion = 0,
  priceToCoordinate,
  timeToCoordinate,
  onSelect,
}: DrawingHitRegionsProps) {
  const { timeToX, priceToY } = createDrawingProjection(timeToCoordinate, priceToCoordinate);
  const regions: React.ReactNode[] = [];

  for (const d of drawings) {
    if (d.locked) continue;
    const pts = d.points;
    if (!pts || pts.length === 0) continue;

    if (d.tool === "horizontalLine" && pts[0]) {
      const y = priceToY(pts[0].price);
      if (y == null) continue;
      drawDebug("HIT_REGION", {
        source: "DrawingHitRegions.horizontalLine",
        drawingId: d.id,
        viewportVersion,
        chartViewportVersion: getChartViewportVersion(),
        y,
      });
      const top = Math.max(0, y - HIT_THRESHOLD);
      const h = Math.min(chartHeight - top, HIT_THRESHOLD * 2);
      regions.push(
        <div
          key={d.id}
          className="absolute cursor-pointer pointer-events-auto"
          style={{ left: 0, right: 0, top, height: h }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(d);
          }}
        />
      );
    } else if ((d.tool === "trendLine" || d.tool === "arrow") && pts.length >= 2) {
      const x1 = timeToX(pts[0].time);
      const y1 = priceToY(pts[0].price);
      const x2 = timeToX(pts[1].time);
      const y2 = priceToY(pts[1].price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
      drawDebug("HIT_REGION", {
        source: "DrawingHitRegions.segment",
        drawingId: d.id,
        tool: d.tool,
        viewportVersion,
        chartViewportVersion: getChartViewportVersion(),
        x1,
        y1,
        x2,
        y2,
      });
      regions.push(
        <div
          key={`${d.id}-body`}
          className="absolute cursor-pointer pointer-events-auto"
          style={segmentHitStyle(x1, y1, x2, y2)}
          onClick={(ev) => {
            ev.stopPropagation();
            onSelect(d);
          }}
        />
      );
      [x1, x2].forEach((x, i) => {
        const y = i === 0 ? y1 : y2;
        regions.push(
          <div
            key={`${d.id}-${i}`}
            className="absolute rounded-full cursor-pointer pointer-events-auto"
            style={{
              left: x - HIT_THRESHOLD,
              top: y - HIT_THRESHOLD,
              width: HIT_THRESHOLD * 2,
              height: HIT_THRESHOLD * 2,
            }}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelect(d);
            }}
          />
        );
      });
    } else if (d.tool === "rectangle" && pts.length >= 2) {
      const x1 = timeToX(pts[0].time);
      const y1 = priceToY(pts[0].price);
      const x2 = timeToX(pts[1].time);
      const y2 = priceToY(pts[1].price);
      if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
      const left = Math.max(0, Math.min(x1, x2) - HIT_THRESHOLD);
      const top = Math.max(0, Math.min(y1, y2) - HIT_THRESHOLD);
      const w = Math.min(chartWidth - left, Math.abs(x2 - x1) + HIT_THRESHOLD * 2);
      const h = Math.min(chartHeight - top, Math.abs(y2 - y1) + HIT_THRESHOLD * 2);
      drawDebug("HIT_REGION", {
        source: "DrawingHitRegions.rectangle",
        drawingId: d.id,
        viewportVersion,
        chartViewportVersion: getChartViewportVersion(),
        x1,
        y1,
        x2,
        y2,
        left,
        top,
        w,
        h,
      });
      regions.push(
        <div
          key={d.id}
          className="absolute cursor-pointer pointer-events-auto"
          style={{ left, top, width: w, height: h }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(d);
          }}
        />
      );
    } else if (d.tool === "text" && pts[0]) {
      const x = timeToX(pts[0].time);
      const y = priceToY(pts[0].price);
      const left = x != null ? Math.max(0, x - HIT_THRESHOLD) : 0;
      const top = y != null ? Math.max(0, y - 16) : 0;
      const TEXT_HIT_WIDTH = 180;
      const TEXT_HIT_HEIGHT = 24;
      drawDebug("HIT_REGION", {
        source: "DrawingHitRegions.text",
        drawingId: d.id,
        viewportVersion,
        chartViewportVersion: getChartViewportVersion(),
        x,
        y,
      });
      regions.push(
        <div
          key={d.id}
          className="absolute cursor-pointer pointer-events-auto"
          style={{
            left,
            top,
            width: TEXT_HIT_WIDTH,
            height: TEXT_HIT_HEIGHT,
          }}
          onClick={(e) => {
            e.stopPropagation();
            onSelect(d);
          }}
        />
      );
    } else if (d.tool === "polyline" && pts.length >= 2) {
      for (let j = 0; j < pts.length - 1; j++) {
        const x1 = timeToX(pts[j].time);
        const y1 = priceToY(pts[j].price);
        const x2 = timeToX(pts[j + 1].time);
        const y2 = priceToY(pts[j + 1].price);
        if (x1 == null || y1 == null || x2 == null || y2 == null) continue;
        drawDebug("HIT_REGION", {
          source: "DrawingHitRegions.polylineSegment",
          drawingId: d.id,
          viewportVersion,
          chartViewportVersion: getChartViewportVersion(),
          j,
          x1,
          y1,
          x2,
          y2,
        });
        regions.push(
          <div
            key={`${d.id}-seg-${j}`}
            className="absolute cursor-pointer pointer-events-auto"
            style={segmentHitStyle(x1, y1, x2, y2)}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelect(d);
            }}
          />
        );
      }
      pts.forEach((_, i) => {
        const x = timeToX(pts[i].time);
        const y = priceToY(pts[i].price);
        if (x == null || y == null) return;
        regions.push(
          <div
            key={`${d.id}-${i}`}
            className="absolute rounded-full cursor-pointer pointer-events-auto"
            style={{
              left: x - HIT_THRESHOLD,
              top: y - HIT_THRESHOLD,
              width: HIT_THRESHOLD * 2,
              height: HIT_THRESHOLD * 2,
            }}
            onClick={(ev) => {
              ev.stopPropagation();
              onSelect(d);
            }}
          />
        );
      });
    }
  }

  return <>{regions}</>;
}
