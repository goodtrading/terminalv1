import type { UTCTimestamp } from "lightweight-charts";

export type MeasurementPoint = {
  x: number;
  y: number;
  price: number;
  time: UTCTimestamp;
};

export type MeasurementState = {
  start: MeasurementPoint;
  end: MeasurementPoint;
  isDragging: boolean;
  isVisible: boolean;
};

export type ChartMeasurementCoords = {
  coordinateToPrice: (y: number) => number | null;
  coordinateToTime: (x: number) => number | null;
  priceToCoordinate: (price: number) => number | null;
  timeToCoordinate: (time: number) => number | null;
};

export type MeasurementMetrics = {
  priceDiff: number;
  pctDiff: number;
  pips: number;
  bars: number;
  elapsedSec: number;
  isPositive: boolean;
};
