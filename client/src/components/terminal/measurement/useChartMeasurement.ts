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
  options?: {
    pipSize?: number;
    enabled?: boolean;
    viewportVersion?: number;
    timeframeKey?: string;
  }
) {
  const pipSize = options?.pipSize ?? BTCUSDT_PIP_SIZE;
  const enabled = options?.enabled ?? true;

  const [measurement, setMeasurement] = useState<MeasurementState | null>(null);
  const measurementRef = useRef<MeasurementState | null>(null);
  const isMeasuringRef = useRef(false);
  const isMeasurementMouseDownRef = useRef(false);
  const measurementStartRef = useRef<MeasurementPoint | null>(null);
  const measurementEndRef = useRef<MeasurementPoint | null>(null);
  const measurementStartedAtRef = useRef(0);
  const activePointerIdRef = useRef<number | null>(null);
  const globalListenersAttachedRef = useRef(false);
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

  const syncMeasurement = useCallback((start: MeasurementPoint, end: MeasurementPoint) => {
    measurementStartRef.current = start;
    measurementEndRef.current = end;
    const next: MeasurementState = {
      start,
      end,
      isDragging: true,
      isVisible: true,
    };
    measurementRef.current = next;
    setMeasurement(next);
  }, []);

  const clearMeasurementOverlay = useCallback((reason?: string) => {
    const hadMeasurement =
      isMeasuringRef.current ||
      isMeasurementMouseDownRef.current ||
      measurementRef.current != null;

    isMeasuringRef.current = false;
    isMeasurementMouseDownRef.current = false;
    activePointerIdRef.current = null;
    measurementStartRef.current = null;
    measurementEndRef.current = null;
    measurementStartedAtRef.current = 0;
    measurementRef.current = null;
    setMeasurement(null);

    if (import.meta.env.DEV && reason && hadMeasurement) {
      console.debug("[Measurement] cleared", reason);
    }
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

    const detachGlobalMeasurementListeners = () => {
      if (!globalListenersAttachedRef.current) return;
      globalListenersAttachedRef.current = false;
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("pointerup", onPointerUp);
      window.removeEventListener("pointercancel", onPointerUp);
      window.removeEventListener("mouseup", onGlobalMouseUp);
    };

    const finishMeasurement = (reason: string) => {
      if (!isMeasuringRef.current || !isMeasurementMouseDownRef.current) return;

      const pointerId = activePointerIdRef.current;
      if (pointerId != null) {
        try {
          container.releasePointerCapture(pointerId);
        } catch {
          /* ignore */
        }
      }

      isMeasurementMouseDownRef.current = false;
      clearMeasurementOverlay(reason);
      detachGlobalMeasurementListeners();
    };

    const onPointerMove = (e: PointerEvent) => {
      if (!isMeasuringRef.current || !isMeasurementMouseDownRef.current) return;

      const pointerId = activePointerIdRef.current;
      if (pointerId != null && e.pointerId !== pointerId) return;

      if ((e.buttons & 1) === 0) {
        finishMeasurement("pointermove-button-released");
        return;
      }

      const start = measurementStartRef.current;
      if (!start) return;

      const { x, y } = getLocalCoords(e.clientX, e.clientY, container);
      const end = resolvePoint(x, y, coordsRef.current);
      if (!end) return;

      e.preventDefault();
      syncMeasurement(start, end);
    };

    const onPointerUp = (e: PointerEvent) => {
      if (!isMeasuringRef.current || !isMeasurementMouseDownRef.current) return;

      const pointerId = activePointerIdRef.current;
      if (pointerId != null && e.pointerId !== pointerId) return;

      e.preventDefault();
      finishMeasurement("pointer-up");
    };

    const onGlobalMouseUp = (e: MouseEvent) => {
      if (!isMeasuringRef.current || !isMeasurementMouseDownRef.current) return;
      if (e.button !== 0) return;

      const elapsed = performance.now() - measurementStartedAtRef.current;
      if (elapsed < 40) return;

      finishMeasurement("global-pointer-up");
    };

    const attachGlobalMeasurementListeners = () => {
      if (globalListenersAttachedRef.current) return;
      globalListenersAttachedRef.current = true;
      window.addEventListener("pointermove", onPointerMove, { passive: false });
      window.addEventListener("pointerup", onPointerUp);
      window.addEventListener("pointercancel", onPointerUp);
      window.addEventListener("mouseup", onGlobalMouseUp);
    };

    const onPointerDown = (e: PointerEvent) => {
      if (!e.shiftKey || e.button !== 0) return;
      if (!isChartCanvasTarget(e.target)) return;

      e.preventDefault();
      e.stopPropagation();

      const { x, y } = getLocalCoords(e.clientX, e.clientY, container);
      const start = resolvePoint(x, y, coordsRef.current);
      if (!start) return;

      isMeasuringRef.current = true;
      isMeasurementMouseDownRef.current = true;
      measurementStartedAtRef.current = performance.now();
      activePointerIdRef.current = e.pointerId;

      syncMeasurement(start, start);

      try {
        container.setPointerCapture(e.pointerId);
      } catch {
        /* ignore */
      }

      attachGlobalMeasurementListeners();
    };

    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        detachGlobalMeasurementListeners();
        clearMeasurementOverlay("escape");
      }
    };

    const onKeyUp = (e: KeyboardEvent) => {
      if (e.key !== "Shift") return;
      if (!isMeasuringRef.current) return;
      isMeasurementMouseDownRef.current = false;
      detachGlobalMeasurementListeners();
      clearMeasurementOverlay("shift-keyup");
    };

    const onWindowBlur = () => {
      if (!isMeasuringRef.current) return;
      detachGlobalMeasurementListeners();
      clearMeasurementOverlay("window-blur");
    };

    container.addEventListener("pointerdown", onPointerDown, true);
    window.addEventListener("keydown", onKeyDown);
    window.addEventListener("keyup", onKeyUp);
    window.addEventListener("blur", onWindowBlur);

    return () => {
      container.removeEventListener("pointerdown", onPointerDown, true);
      detachGlobalMeasurementListeners();
      window.removeEventListener("keydown", onKeyDown);
      window.removeEventListener("keyup", onKeyUp);
      window.removeEventListener("blur", onWindowBlur);
    };
  }, [
    enabled,
    chartCanvasContainerRef,
    isChartCanvasTarget,
    getLocalCoords,
    clearMeasurementOverlay,
    syncMeasurement,
  ]);

  useEffect(() => {
    clearMeasurementOverlay("timeframe-change");
  }, [options?.timeframeKey, clearMeasurementOverlay]);

  useEffect(() => {
    if (options?.viewportVersion == null) return;
    if (!isMeasuringRef.current || !measurementRef.current?.isVisible) return;

    const projected = reprojectMeasurement(measurementRef.current);
    if (projected) {
      measurementStartRef.current = projected.start;
      measurementEndRef.current = projected.end;
      measurementRef.current = projected;
      setMeasurement(projected);
    }
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

  const displayMeasurement = measurement?.isVisible
    ? reprojectMeasurement(measurement) ?? measurement
    : null;

  return {
    measurement: displayMeasurement,
    metrics: displayMeasurement ? metrics : null,
    isDragging: measurement?.isDragging ?? false,
    clearMeasurement: clearMeasurementOverlay,
  };
}
