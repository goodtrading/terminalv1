import { useCallback, useMemo, useState } from "react";
import { HEATMAP_PAD } from "@/components/flows/bookmapHeatmapRenderer";

export type BookmapTimeViewport = {
  dataStartTime: number;
  dataEndTime: number;
  visibleStartTime: number;
  visibleEndTime: number;
  /** Right edge of projection zone (live follow anchor). */
  liveEdgeTime: number;
  rightSpacePct: number;
  /** Offset from live-follow window when user has panned. */
  horizontalOffsetMs: number;
  followLive: boolean;
};

export type UseBookmapTimeScaleOptions = {
  dataStartTime: number;
  dataEndTime: number;
  rightSpacePct: number;
  /** Full canvas/container width in CSS px. */
  plotWidth: number;
  enabled?: boolean;
};

type VisibleWindow = {
  visibleStartTime: number;
  visibleEndTime: number;
  liveEdgeTime: number;
};

/** Bookmap-style window: latest data at (1 − rightSpace%) across the plot. */
export function computeLiveTimeWindow(
  dataStartTime: number,
  dataEndTime: number,
  rightSpacePct: number,
): VisibleWindow {
  const dataSpan = Math.max(1, dataEndTime - dataStartTime);
  const frac = Math.max(0, Math.min(0.95, rightSpacePct / 100));

  if (frac <= 0) {
    return {
      visibleStartTime: dataStartTime,
      visibleEndTime: dataEndTime,
      liveEdgeTime: dataEndTime,
    };
  }

  const visibleSpan = dataSpan / (1 - frac);
  const visibleEndTime = dataEndTime + visibleSpan * frac;
  const visibleStartTime = visibleEndTime - visibleSpan;

  return {
    visibleStartTime,
    visibleEndTime,
    liveEdgeTime: visibleEndTime,
  };
}

export function buildBookmapTimeMappers(
  viewport: Pick<BookmapTimeViewport, "visibleStartTime" | "visibleEndTime">,
  width: number,
) {
  const plotLeft = HEATMAP_PAD.left;
  const plotW = Math.max(1, width - HEATMAP_PAD.left - HEATMAP_PAD.right);
  const span = Math.max(1, viewport.visibleEndTime - viewport.visibleStartTime);

  const timeToX = (timeMs: number) =>
    plotLeft + ((timeMs - viewport.visibleStartTime) / span) * plotW;

  const xToTime = (x: number) =>
    viewport.visibleStartTime + ((x - plotLeft) / plotW) * span;

  return { timeToX, xToTime, plotLeft, plotW };
}

export function useBookmapTimeScale({
  dataStartTime,
  dataEndTime,
  rightSpacePct,
  plotWidth,
  enabled = true,
}: UseBookmapTimeScaleOptions) {
  const [followLive, setFollowLive] = useState(true);
  const [manualWindow, setManualWindow] = useState<VisibleWindow | null>(null);

  const liveWindow = useMemo(
    () =>
      enabled
        ? computeLiveTimeWindow(dataStartTime, dataEndTime, rightSpacePct)
        : {
            visibleStartTime: dataStartTime,
            visibleEndTime: dataEndTime,
            liveEdgeTime: dataEndTime,
          },
    [enabled, dataStartTime, dataEndTime, rightSpacePct],
  );

  const activeWindow = followLive ? liveWindow : (manualWindow ?? liveWindow);

  const horizontalOffsetMs = followLive
    ? 0
    : activeWindow.visibleStartTime - liveWindow.visibleStartTime;

  const viewport: BookmapTimeViewport = useMemo(
    () => ({
      dataStartTime,
      dataEndTime,
      visibleStartTime: activeWindow.visibleStartTime,
      visibleEndTime: activeWindow.visibleEndTime,
      liveEdgeTime: activeWindow.liveEdgeTime,
      rightSpacePct,
      horizontalOffsetMs,
      followLive,
    }),
    [
      dataStartTime,
      dataEndTime,
      activeWindow,
      rightSpacePct,
      horizontalOffsetMs,
      followLive,
    ],
  );

  const timeMappers = useMemo(
    () => buildBookmapTimeMappers(viewport, plotWidth),
    [viewport, plotWidth],
  );

  const panTime = useCallback(
    (deltaMs: number) => {
      if (!enabled || deltaMs === 0) return;
      setFollowLive(false);
      setManualWindow((prev) => {
        const base = prev ?? liveWindow;
        return {
          visibleStartTime: base.visibleStartTime + deltaMs,
          visibleEndTime: base.visibleEndTime + deltaMs,
          liveEdgeTime: base.liveEdgeTime + deltaMs,
        };
      });
    },
    [enabled, liveWindow],
  );

  const panByPixels = useCallback(
    (deltaPx: number) => {
      if (!enabled || plotWidth <= 0) return;
      const innerW = Math.max(
        1,
        plotWidth - HEATMAP_PAD.left - HEATMAP_PAD.right,
      );
      const span = viewport.visibleEndTime - viewport.visibleStartTime;
      const msPerPx = span / innerW;
      panTime(-deltaPx * msPerPx);
    },
    [enabled, plotWidth, viewport.visibleEndTime, viewport.visibleStartTime, panTime],
  );

  const zoomTimeAt = useCallback(
    (plotX: number, factor: number) => {
      if (!enabled || !Number.isFinite(factor) || factor <= 0) return;
      const innerW = Math.max(
        1,
        plotWidth - HEATMAP_PAD.left - HEATMAP_PAD.right,
      );
      const plotLeft = HEATMAP_PAD.left;
      const clampedFactor = Math.max(0.35, Math.min(3, factor));

      setFollowLive(false);
      setManualWindow((prev) => {
        const base = prev ?? liveWindow;
        const span = Math.max(1, base.visibleEndTime - base.visibleStartTime);
        const dataSpan = Math.max(1, dataEndTime - dataStartTime);
        const minSpan = 60_000;
        const maxSpan = Math.max(minSpan, dataSpan * 4);
        const newSpan = Math.max(
          minSpan,
          Math.min(maxSpan, span * clampedFactor),
        );

        const clampedX = Math.max(plotLeft, Math.min(plotLeft + innerW, plotX));
        const anchorFrac = (clampedX - plotLeft) / innerW;
        const anchorTime = base.visibleStartTime + anchorFrac * span;
        const anchorRatio = (anchorTime - base.visibleStartTime) / span;
        const newStart = anchorTime - anchorRatio * newSpan;
        const newEnd = newStart + newSpan;

        return {
          visibleStartTime: newStart,
          visibleEndTime: newEnd,
          liveEdgeTime: newEnd,
        };
      });
    },
    [enabled, plotWidth, liveWindow, dataStartTime, dataEndTime],
  );

  const resetTimeView = useCallback(() => {
    setManualWindow(null);
    setFollowLive(true);
  }, []);

  const setFollowLiveEnabled = useCallback((on: boolean) => {
    if (on) {
      setManualWindow(null);
      setFollowLive(true);
    } else {
      setFollowLive(false);
      setManualWindow((prev) => prev ?? liveWindow);
    }
  }, [liveWindow]);

  return {
    viewport,
    followLive,
    horizontalOffsetMs,
    timeToX: timeMappers.timeToX,
    xToTime: timeMappers.xToTime,
    panTime,
    panByPixels,
    zoomTimeAt,
    resetTimeView,
    setFollowLiveEnabled,
  };
}
