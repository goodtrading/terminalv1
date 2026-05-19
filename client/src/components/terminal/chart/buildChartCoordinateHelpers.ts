import type { IChartApi, ISeriesApi, Time } from "lightweight-charts";
import type { MutableRefObject } from "react";
import { drawDebug } from "../drawings/debug";
import type { DrawingsCoordinateHelpers } from "../drawings/DrawingsLayer";

type UTCTimestamp = number;

type TimeProjectionAnchor = {
  lastTimeSec: number | null;
  barSec: number;
};

export function buildChartCoordinateHelpers(
  chartRef: MutableRefObject<IChartApi | null>,
  candleSeriesRef: MutableRefObject<ISeriesApi<"Candlestick"> | null>,
  anchorRef: MutableRefObject<TimeProjectionAnchor>,
  chartSize: { w: number; h: number } | null,
  viewportVersion: number
): DrawingsCoordinateHelpers {
  return {
    priceToCoordinate: (price: number) => {
      const series = candleSeriesRef.current;
      if (!series) return null;
      try {
        const y = series.priceToCoordinate(price);
        return typeof y === "number" ? y : null;
      } catch {
        return null;
      }
    },
    timeToCoordinate: (time: number) => {
      const chart = chartRef.current;
      if (!chart) return null;
      try {
        const scale = chart.timeScale();
        const x = scale.timeToCoordinate(time as unknown as Time);
        if (typeof x === "number") return x;

        const toLogical = (scale as unknown as { timeToLogical?: (t: UTCTimestamp) => number | null }).timeToLogical;
        const logicalToCoord = (scale as unknown as { logicalToCoordinate?: (l: number) => number | null }).logicalToCoordinate;
        const anchor = anchorRef.current;
        if (!toLogical || !logicalToCoord || anchor.lastTimeSec == null || !Number.isFinite(time)) {
          drawDebug("PROJECT_TIME_TO_X", {
            source: "chartCoordinateHelpers.timeToCoordinate:null",
            viewportVersion,
            time,
          });
          return null;
        }
        const lastLogical = toLogical(anchor.lastTimeSec as UTCTimestamp);
        if (typeof lastLogical !== "number") return null;
        const dtSec = time - anchor.lastTimeSec;
        const logical = lastLogical + dtSec / anchor.barSec;
        const projected = logicalToCoord(logical);
        if (typeof projected !== "number") return null;
        return projected;
      } catch {
        return null;
      }
    },
    coordinateToPrice: (y: number) => {
      const series = candleSeriesRef.current;
      if (!series) return null;
      try {
        const price = series.coordinateToPrice(y);
        return typeof price === "number" ? price : null;
      } catch {
        return null;
      }
    },
    coordinateToTime: (x: number) => {
      const chart = chartRef.current;
      if (!chart) return null;
      try {
        const scale = chart.timeScale();
        const t = scale.coordinateToTime(x);
        if (typeof t === "number") return t;

        const toLogical = (scale as { coordinateToLogical?: (c: number) => number | null }).coordinateToLogical;
        const timeToLogical = (scale as { timeToLogical?: (tt: UTCTimestamp) => number | null }).timeToLogical;
        const anchor = anchorRef.current;
        const visible = scale.getVisibleLogicalRange();
        const lastLogicalFromData =
          anchor.lastTimeSec != null && timeToLogical
            ? timeToLogical(anchor.lastTimeSec as UTCTimestamp)
            : null;
        if (!toLogical || !timeToLogical || anchor.lastTimeSec == null) {
          return null;
        }
        let logical = toLogical(x);
        const lastLogical = timeToLogical(anchor.lastTimeSec as UTCTimestamp);
        if (typeof logical !== "number" && visible && chartSize?.w) {
          logical = visible.from + (x / chartSize.w) * (visible.to - visible.from);
        }
        if (typeof logical !== "number" || typeof lastLogical !== "number") {
          return null;
        }
        const dtSec = (logical - lastLogical) * anchor.barSec;
        return Math.round(anchor.lastTimeSec + dtSec);
      } catch {
        return null;
      }
    },
    coordinateToLogical: (x: number) => {
      const chart = chartRef.current;
      if (!chart) return null;
      try {
        const logical = (chart.timeScale() as { coordinateToLogical?: (c: number) => number | null }).coordinateToLogical?.(x);
        return typeof logical === "number" ? logical : null;
      } catch {
        return null;
      }
    },
    getVisibleLogicalRange: () => {
      const chart = chartRef.current;
      if (!chart) return null;
      try {
        const r = chart.timeScale().getVisibleLogicalRange();
        if (!r) return null;
        return { from: r.from, to: r.to };
      } catch {
        return null;
      }
    },
    getLastDataLogical: () => {
      const chart = chartRef.current;
      const anchor = anchorRef.current;
      if (!chart || anchor.lastTimeSec == null) return null;
      try {
        const logical = (chart.timeScale() as { timeToLogical?: (t: UTCTimestamp) => number | null }).timeToLogical?.(
          anchor.lastTimeSec as UTCTimestamp
        );
        return typeof logical === "number" ? logical : null;
      } catch {
        return null;
      }
    },
    getLastTimeSec: () => anchorRef.current.lastTimeSec,
    getBarSec: () => anchorRef.current.barSec,
  };
}
