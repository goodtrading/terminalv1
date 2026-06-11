import { useEffect, useState } from "react";

export type DesktopFeedDiagnostics = {
  provider: string;
  symbol: string;
  connected: boolean;
  feedStatus: string;
  lastUpdateAgeMs: number | null;
  reconnectCount: number;
  resyncCount: number;
  rawBidsCount: number;
  rawAsksCount: number;
  visibleBidsCount: number;
  visibleAsksCount: number;
  heatmapCellCount: number;
  lastError: string | null;
  updatedAt: number;
};

const DEFAULT_FEED_DIAGNOSTICS: DesktopFeedDiagnostics = {
  provider: "Binance Spot",
  symbol: "BTCUSDT",
  connected: false,
  feedStatus: "unknown",
  lastUpdateAgeMs: null,
  reconnectCount: 0,
  resyncCount: 0,
  rawBidsCount: 0,
  rawAsksCount: 0,
  visibleBidsCount: 0,
  visibleAsksCount: 0,
  heatmapCellCount: 0,
  lastError: null,
  updatedAt: 0,
};

let feedDiagnostics = DEFAULT_FEED_DIAGNOSTICS;
const listeners = new Set<() => void>();

function emit(): void {
  for (const listener of Array.from(listeners)) {
    listener();
  }
}

export function publishDesktopFeedDiagnostics(
  patch: Partial<DesktopFeedDiagnostics>,
): void {
  feedDiagnostics = {
    ...feedDiagnostics,
    ...patch,
    updatedAt: Date.now(),
  };
  emit();
}

export function getDesktopFeedDiagnostics(): DesktopFeedDiagnostics {
  return feedDiagnostics;
}

export function useDesktopFeedDiagnostics(): DesktopFeedDiagnostics {
  const [snapshot, setSnapshot] = useState(feedDiagnostics);

  useEffect(() => {
    const listener = () => setSnapshot(feedDiagnostics);
    listeners.add(listener);
    listener();
    return () => {
      listeners.delete(listener);
    };
  }, []);

  return snapshot;
}

