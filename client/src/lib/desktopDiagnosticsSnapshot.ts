import { apiBaseUrl } from "@/lib/apiBase";
import { appVersion } from "@/lib/appVersion";
import { isDesktopApp } from "@/lib/desktopRuntime";
import type { DesktopFeedDiagnostics } from "@/lib/desktopDiagnostics";
import type { DesktopUpdateState } from "@/lib/desktopUpdateCheck";

export type DesktopDiagnosticsSnapshot = {
  appVersion: string;
  latestVersion: string | null;
  updateStatus: string;
  apiBaseUrl: string;
  apiMode: string;
  desktopModeEnabled: boolean;
  storageStatus: string;
  feedStatus: string;
  feedLastHeartbeat: string | null;
  lastHeartbeatAt: string | null;
  reconnectCount: number;
  lastFeedError: string | null;
  lastUpdateCheck: string | null;
  timestamp: string;
};

function formatHeartbeatTimestamp(value: number | null): string | null {
  if (value == null) return null;
  try {
    return new Date(value).toISOString();
  } catch {
    return null;
  }
}

export function buildDesktopDiagnosticsSnapshot(params: {
  update: DesktopUpdateState;
  storageOk: boolean | null;
  feed: DesktopFeedDiagnostics;
}): DesktopDiagnosticsSnapshot {
  const apiMode = import.meta.env.VITE_API_BASE_URL?.trim() ? "remote" : "same-origin";
  const heartbeatAge =
    params.feed.lastUpdateAgeMs != null
      ? `${Math.round(params.feed.lastUpdateAgeMs)}ms ago`
      : params.feed.lastHeartbeatAt != null
        ? `${Math.max(0, Math.round((Date.now() - params.feed.lastHeartbeatAt) / 1000))}s ago`
        : null;

  return {
    appVersion: params.update.currentVersion || appVersion,
    latestVersion: params.update.latestVersion,
    updateStatus: params.update.updateStatus,
    apiBaseUrl: apiBaseUrl(),
    apiMode,
    desktopModeEnabled: isDesktopApp(),
    storageStatus:
      params.storageOk == null ? "checking" : params.storageOk ? "ok" : "error",
    feedStatus: params.feed.connected ? "connected" : params.feed.feedStatus,
    feedLastHeartbeat: heartbeatAge,
    lastHeartbeatAt: formatHeartbeatTimestamp(params.feed.lastHeartbeatAt),
    reconnectCount: params.feed.reconnectCount,
    lastFeedError: params.feed.lastError,
    lastUpdateCheck: params.update.lastUpdateCheck,
    timestamp: new Date().toISOString(),
  };
}

export function formatDesktopDiagnosticsSnapshot(snapshot: DesktopDiagnosticsSnapshot): string {
  return JSON.stringify(snapshot, null, 2);
}
