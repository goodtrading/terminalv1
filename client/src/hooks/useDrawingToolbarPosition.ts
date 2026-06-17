import { useCallback, useEffect, useRef, useState } from "react";
import {
  type DrawingToolbarPosition,
  DRAWING_TOOLBAR_DIMS,
  DRAWING_TOOLBAR_STORAGE_KEY,
  CHART_HEADER_HEIGHT_ESTIMATE,
  clampDrawingToolbarPosition,
  clampContextualBarLeft,
  normalizeStoredDrawingToolbarPosition,
  safeDefaultDrawingToolbarForChart,
} from "@/lib/drawingToolbarPosition";

export type { DrawingToolbarPosition };

const SMALL_CHART_WIDTH = 480;

function readStoredPosition(): DrawingToolbarPosition | null {
  try {
    const raw = localStorage.getItem(DRAWING_TOOLBAR_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Partial<DrawingToolbarPosition>;
    return {
      x: typeof parsed.x === "number" ? parsed.x : 16,
      y: typeof parsed.y === "number" ? parsed.y : 124,
      collapsed: Boolean(parsed.collapsed),
    };
  } catch {
    return null;
  }
}

function persistPosition(position: DrawingToolbarPosition): void {
  try {
    localStorage.setItem(DRAWING_TOOLBAR_STORAGE_KEY, JSON.stringify(position));
  } catch {
    /* ignore quota / private mode */
  }
}

export function useDrawingToolbarPosition(
  chartWidth: number,
  chartHeight: number,
  chartHeaderHeight = CHART_HEADER_HEIGHT_ESTIMATE,
) {
  const [position, setPosition] = useState<DrawingToolbarPosition>(() => {
    const stored = readStoredPosition();
    const base =
      stored ??
      safeDefaultDrawingToolbarForChart(chartWidth > 0 ? chartWidth : SMALL_CHART_WIDTH, chartHeaderHeight);
    return normalizeStoredDrawingToolbarPosition(base, chartWidth, chartHeight, chartHeaderHeight);
  });

  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    setPosition((prev) => {
      if (chartWidth > 0 && chartWidth < SMALL_CHART_WIDTH) {
        return normalizeStoredDrawingToolbarPosition(
          safeDefaultDrawingToolbarForChart(chartWidth, chartHeaderHeight),
          chartWidth,
          chartHeight,
          chartHeaderHeight,
        );
      }
      return normalizeStoredDrawingToolbarPosition(prev, chartWidth, chartHeight, chartHeaderHeight);
    });
  }, [chartWidth, chartHeight, chartHeaderHeight]);

  const commitPosition = useCallback(
    (next: DrawingToolbarPosition) => {
      const clamped = clampDrawingToolbarPosition(next, chartWidth, chartHeight);
      setPosition(clamped);
      persistPosition(clamped);
    },
    [chartWidth, chartHeight],
  );

  const onDragHandlePointerDown = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      event.preventDefault();
      event.stopPropagation();
      event.currentTarget.setPointerCapture(event.pointerId);
      dragRef.current = {
        startX: event.clientX,
        startY: event.clientY,
        originX: position.x,
        originY: position.y,
      };
    },
    [position.x, position.y],
  );

  const onDragHandlePointerMove = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current) return;
      event.preventDefault();
      const dx = event.clientX - dragRef.current.startX;
      const dy = event.clientY - dragRef.current.startY;
      setPosition((prev) =>
        clampDrawingToolbarPosition(
          { ...prev, x: dragRef.current!.originX + dx, y: dragRef.current!.originY + dy },
          chartWidth,
          chartHeight,
        ),
      );
    },
    [chartWidth, chartHeight],
  );

  const onDragHandlePointerUp = useCallback(
    (event: React.PointerEvent<HTMLElement>) => {
      if (!dragRef.current) return;
      dragRef.current = null;
      if (event.currentTarget.hasPointerCapture(event.pointerId)) {
        event.currentTarget.releasePointerCapture(event.pointerId);
      }
      setPosition((prev) => {
        const clamped = clampDrawingToolbarPosition(prev, chartWidth, chartHeight);
        persistPosition(clamped);
        return clamped;
      });
    },
    [chartWidth, chartHeight],
  );

  const toggleCollapsed = useCallback(() => {
    setPosition((prev) => {
      const next = clampDrawingToolbarPosition({ ...prev, collapsed: !prev.collapsed }, chartWidth, chartHeight);
      persistPosition(next);
      return next;
    });
  }, [chartWidth, chartHeight]);

  const resetPosition = useCallback(() => {
    commitPosition(safeDefaultDrawingToolbarForChart(chartWidth, chartHeaderHeight));
  }, [chartWidth, chartHeaderHeight, commitPosition]);

  const contextualOffsetX = position.collapsed
    ? DRAWING_TOOLBAR_DIMS.collapsed.width + 8
    : DRAWING_TOOLBAR_DIMS.expanded.width + 8;

  const contextualLeft = clampContextualBarLeft(position.x, contextualOffsetX, chartWidth);

  return {
    position,
    contextualOffsetX,
    contextualLeft,
    toggleCollapsed,
    resetPosition,
    onDragHandlePointerDown,
    onDragHandlePointerMove,
    onDragHandlePointerUp,
  };
}
