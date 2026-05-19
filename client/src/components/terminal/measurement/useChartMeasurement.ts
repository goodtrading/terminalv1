import { useCallback, useEffect, useRef, useState, type RefObject } from "react";
import type { UTCTimestamp } from "lightweight-charts";
import {
  BTCUSDT_PIP_SIZE,
  computeMeasurementMetrics,
} from "./measurementFormat";
import type {
  ChartMeasurementCoords,
  MeasurementPoint,
  MeasurementState,
} from "./measurementTypes";

const DRAG_THRESHOLD_PX = 5;

type PendingDrag = {
  pointerId: number;
  startClientX: number;
  startClientY: number;
  start: MeasurementPoint;
};

function projectPoint(
  point: Pick<MeasurementPoint, "price" | "time">,
  coords: ChartMeasurementCoords
): Pick<MeasurementPoint, "x" | "y"> | null {
  const x = coords.timeToCoordinate(point.time);
  const y = coords.priceToCoordinate(point.price);
  if (x == null || y == null) return null;
  return { x, y };
}

function resolvePoint(
  x: number,
  y: number,
  coords: ChartMeasurementCoords
): MeasurementPoint | null {
  const price = coords.coordinateToPrice(y);
  const time = coords.coordinateToTime(x);
  if (price == null || time == null) return null;
  return { x, y, price, time: time as UTCTimestamp };
}

export function useChartMeasurement(
  chartCanvasContainerRef: RefObject<HTMLElement | null>,
  coords: ChartMeasurementCoords,
  candles: readonly { time: number }[],
  options?: { pipSize?: number; enabled?: boolean; viewportVersion?: number }
) {
  const pipSize = options?.pipSize ?? BTCUSDT_PIP_SIZE;
  const enabled = options?.enabled ?? true;

  const [measurement, setMeasurement] = useState<MeasurementState | null>(null);
  const measurementRef = useRef<MeasurementState | null>(null);
  const pendingDragRef = useRef<PendingDrag | null>(null);
  const coordsRef = useRef(coords);
  const candlesRef = useRef(candles);

  useEffect(() => {
    coordsRef.current = coords;
  }, [coords]);

  useEffect(() => {
    candlesRef.current = candles;
  }, [candles]);

  useEffect(() => {
    measurementRef.current = measurement;
  }, [measurement]);

  const clearMeasurement = useCallback(() => {
    pendingDragRef.current = null;
    setMeasurement(null);
  }, []);

  const reprojectMeasurement = useCallback((state: MeasurementState): MeasurementState | null => {
    const startXY = projectPoint(state.start, coordsRef.current);
    const endXY = projectPoint(state.end, coordsRef.current);
    if (!startXY || !endXY) return null;
    return {
      ...state,
      start: { ...state.start, ...startXY },
      end: { ...state.end, ...endXY },
    };
  }, []);

  const isChartCanvasTarget = useCallback(
    (target: EventTarget | null): boolean => {
      if (!(target instanceof HTMLCanvasElement)) return false;
      const container = chartCanvasContainerRef.current;
      return container != null && container.contains(target);
    },
    [chartCanvasContainerRef]
  );

  const getLocalCoords = useCallback(
    (clientX: number, clientY: number, container: HTMLElement) => {
      const rect = container.getBoundingClientRect();
      return { x: clientX - rect.left, y: clientY - rect.top };
    },
    []
  );

  useEffect(() => {
    if (!enabled) return;
    const container = chartCanvasContainerRef.current;
    if (!container) return;

    const tryActivateDrag = (e: PointerEvent, pending: PendingDrag): boolean => {
      const dx = e.clientX - pending.startClientX;
      const dy = e.clientY - pending.startClientY;
      if (Math.hypot(dx, dy) < DRAG_THRESHOLD_PX) return false;

      const { x, y } = getLocalCoords(e.clientX, e.clientY, container);
      const end = resolvePoint(x, y, coordsRef.current);
      if (!end) return false;

      setMeasurement({
        start: pending.start,
        end,
        isDragging: true,
        isVisible: true,
      });
      return true;
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.shiftKey || e.button !== 0) return;
      if (!isChartCanvasTarget(e.target)) return;

      e.preventDefault();

      if (measurementRef.current?.isVisible) {
        setMeasurement(null);
        measurementRef.current = null;
      }

      const { x, y } = getLocalCoords(e.clientX, e.clientY, container);
      const start = resolvePoint(x, y, coordsRef.current);
      if (!start) return;

      pendingDragRef.current = {
        pointerId: e.pointerId,
        startClientX: e.clientX,
        startClientY: e.clientY,
        start,
      };
    };

    const onPointerMove = (e: PointerEvent) => {
      const pending = pendingDragRef.current;

      if (!measurementRef.current?.isDragging) {
        if (!pending || e.pointerId !== pending.pointerId) return;
        if (!tryActivateDrag(e, pending)) return;
        e.preventDefault();
        return;
      }

      if (pending && e.pointerId !== pending.pointerId) return;

      e.preventDefault();

      const { x, y } = getLocalCoords(e.clientX, e.clientY, container);
      const end = resolvePoint(x, y, coordsRef.current);
      if (!end || !measurementRef.current) return;

      setMeasurement({
        start: measurementRef.current.start,
        end,
        isDragging: true,
        isVisible: true,
      });
    };

    const onPointerUp = (e: PointerEvent) => {
      const pending = pendingDragRef.current;
      if (pending && e.pointerId === pending.pointerId) {
        pendingDragRef.current = null;
      }

      if (!measurementRef.current?.isDragging) return;

      e.preventDefault();

      const { x, y } = getLocalCoords(e.clientX, e.clientY, container);
      const end = resolvePoint(x, y, coordsRef.current);
      if (end && measurementRef.current) {
        setMeasurement({
          start: measurementRef.current.start,
          end,
          isDragging: false,
          isVisible: true,
        });
      } else {
        setMeasurement((prev) => (prev ? { ...prev, isDragging: false } : null));
      }
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") clearMeasurement();
    };

    container.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("pointermove", onPointerMove, { passive: false });
    window.addEventListener("pointerup", onPointerUp);
    window.addEventListener("pointercancel", onPointerUp);
    window.addEventListener("keydown", onKeyDown);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [
    enabled,
    chartCanvasContainerRef,
    isChartCanvasTarget,
    getLocalCoords,
    clearMeasurement,
  ]);

  useEffect(() => {
    if (options?.viewportVersion == null) return;
    const current = measurementRef.current;
    if (!current?.isVisible) return;
    const projected = reprojectMeasurement(current);
    if (projected) setMeasurement(projected);
  }, [options?.viewportVersion, reprojectMeasurement]);

  const metrics =
    measurement?.isVisible && measurement.start.price != null
      ? computeMeasurementMetrics(
          measurement.start.price,
          measurement.end.price,
          measurement.start.time,
          measurement.end.time,
          candlesRef.current,
          pipSize
        )
      : null;

  const displayMeasurement =
    measurement?.isVisible
      ? reprojectMeasurement(measurement) ?? measurement
      : null;

  return {
    measurement: displayMeasurement,
    metrics,
    isDragging: measurement?.isDragging ?? false,
    clearMeasurement,
  };
}
