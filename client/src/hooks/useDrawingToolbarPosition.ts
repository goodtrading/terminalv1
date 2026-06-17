import { useCallback, useEffect, useRef, useState } from "react";

export type DrawingToolbarPosition = {
  x: number;
  y: number;
  collapsed: boolean;
};

const STORAGE_KEY = "goodtrading:drawing-toolbar-position";
const DEFAULT_POSITION: DrawingToolbarPosition = { x: 16, y: 72, collapsed: false };
const TOOLBAR_WIDTH = 44;
const TOOLBAR_HEIGHT = 140;
const COLLAPSED_SIZE = 36;
const SMALL_CHART_WIDTH = 480;

function readStoredPosition(): DrawingToolbarPosition {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULT_POSITION;
    const parsed = JSON.parse(raw) as Partial<DrawingToolbarPosition>;
    return {
      x: typeof parsed.x === "number" ? parsed.x : DEFAULT_POSITION.x,
      y: typeof parsed.y === "number" ? parsed.y : DEFAULT_POSITION.y,
      collapsed: Boolean(parsed.collapsed),
    };
  } catch {
    return DEFAULT_POSITION;
  }
}

function persistPosition(position: DrawingToolbarPosition): void {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(position));
  } catch {
    /* ignore quota / private mode */
  }
}

function clampPosition(
  position: DrawingToolbarPosition,
  chartWidth: number,
  chartHeight: number,
): DrawingToolbarPosition {
  const width = position.collapsed ? COLLAPSED_SIZE : TOOLBAR_WIDTH;
  const height = position.collapsed ? COLLAPSED_SIZE : TOOLBAR_HEIGHT;
  const maxX = Math.max(0, chartWidth - width);
  const maxY = Math.max(0, chartHeight - height);

  const x = Number.isFinite(position.x) ? Math.min(Math.max(0, position.x), maxX) : DEFAULT_POSITION.x;
  const y = Number.isFinite(position.y) ? Math.min(Math.max(0, position.y), maxY) : DEFAULT_POSITION.y;

  if (x !== position.x || y !== position.y) {
    return { ...position, x, y };
  }
  return position;
}

function safeDefaultForChart(chartWidth: number): DrawingToolbarPosition {
  if (chartWidth > 0 && chartWidth < SMALL_CHART_WIDTH) {
    return { ...DEFAULT_POSITION, collapsed: true };
  }
  return DEFAULT_POSITION;
}

export function useDrawingToolbarPosition(chartWidth: number, chartHeight: number) {
  const [position, setPosition] = useState<DrawingToolbarPosition>(() => {
    const stored = readStoredPosition();
    if (chartWidth > 0 && chartWidth < SMALL_CHART_WIDTH) {
      return clampPosition(safeDefaultForChart(chartWidth), chartWidth, chartHeight);
    }
    return clampPosition(stored, chartWidth, chartHeight);
  });

  const dragRef = useRef<{ startX: number; startY: number; originX: number; originY: number } | null>(null);

  useEffect(() => {
    setPosition((prev) => {
      const next = clampPosition(prev, chartWidth, chartHeight);
      if (chartWidth > 0 && chartWidth < SMALL_CHART_WIDTH && (prev.x !== DEFAULT_POSITION.x || prev.y !== DEFAULT_POSITION.y)) {
        return clampPosition(safeDefaultForChart(chartWidth), chartWidth, chartHeight);
      }
      return next;
    });
  }, [chartWidth, chartHeight]);

  const commitPosition = useCallback((next: DrawingToolbarPosition) => {
    const clamped = clampPosition(next, chartWidth, chartHeight);
    setPosition(clamped);
    persistPosition(clamped);
  }, [chartWidth, chartHeight]);

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
        clampPosition(
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
        const clamped = clampPosition(prev, chartWidth, chartHeight);
        persistPosition(clamped);
        return clamped;
      });
    },
    [chartWidth, chartHeight],
  );

  const toggleCollapsed = useCallback(() => {
    setPosition((prev) => {
      const next = clampPosition({ ...prev, collapsed: !prev.collapsed }, chartWidth, chartHeight);
      persistPosition(next);
      return next;
    });
  }, [chartWidth, chartHeight]);

  const resetPosition = useCallback(() => {
    commitPosition(safeDefaultForChart(chartWidth));
  }, [chartWidth, commitPosition]);

  const contextualOffsetX = position.collapsed ? COLLAPSED_SIZE + 8 : TOOLBAR_WIDTH + 8;

  return {
    position,
    contextualOffsetX,
    toggleCollapsed,
    resetPosition,
    onDragHandlePointerDown,
    onDragHandlePointerMove,
    onDragHandlePointerUp,
  };
}
