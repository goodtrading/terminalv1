import type { DesktopFeedDiagnostics } from "@/lib/desktopDiagnostics";

export type DesktopFeedBannerKind = "connecting" | "waiting" | "reconnecting" | "error";

export const DESKTOP_FEED_WAIT_THRESHOLD_MS = 8_000;
export const DESKTOP_FEED_STALE_HEARTBEAT_MS = 10_000;

export type DesktopFeedBannerState = {
  kind: DesktopFeedBannerKind;
  message: string;
  heartbeatLabel: string | null;
};

function formatHeartbeat(feed: DesktopFeedDiagnostics): string | null {
  if (feed.lastHeartbeatAt != null) {
    const ageMs = Math.max(0, Date.now() - feed.lastHeartbeatAt);
    if (ageMs < 1_000) return "just now";
    if (ageMs < 60_000) return `${Math.round(ageMs / 1_000)}s ago`;
    return `${Math.round(ageMs / 60_000)}m ago`;
  }
  if (feed.lastUpdateAgeMs != null) {
    if (feed.lastUpdateAgeMs < 1_000) return "just now";
    if (feed.lastUpdateAgeMs < 60_000) return `${Math.round(feed.lastUpdateAgeMs / 1_000)}s ago`;
    return `${Math.round(feed.lastUpdateAgeMs / 60_000)}m ago`;
  }
  return null;
}

export function deriveDesktopFeedBannerState(
  feed: DesktopFeedDiagnostics,
  disconnectedForMs: number | null,
): DesktopFeedBannerState | null {
  const heartbeatLabel = formatHeartbeat(feed);
  const heartbeatSuffix = heartbeatLabel ? ` · heartbeat ${heartbeatLabel}` : "";

  if (feed.lastError || feed.feedStatus === "error") {
    return {
      kind: "error",
      message: `Market feed connection issue${heartbeatSuffix}`,
      heartbeatLabel,
    };
  }

  const isLive = feed.connected && feed.feedStatus === "live";
  if (isLive) {
    const stale =
      feed.lastUpdateAgeMs != null && feed.lastUpdateAgeMs > DESKTOP_FEED_STALE_HEARTBEAT_MS;
    if (!stale) return null;
    return {
      kind: "waiting",
      message: `Waiting for market data${heartbeatSuffix}`,
      heartbeatLabel,
    };
  }

  if (!feed.connected && feed.reconnectCount > 0) {
    return {
      kind: "reconnecting",
      message: `Reconnecting feed${heartbeatSuffix}`,
      heartbeatLabel,
    };
  }

  if (feed.feedStatus === "loading") {
    if (disconnectedForMs != null && disconnectedForMs >= DESKTOP_FEED_WAIT_THRESHOLD_MS) {
      return {
        kind: "waiting",
        message: `Waiting for market data${heartbeatSuffix}`,
        heartbeatLabel,
      };
    }
    return {
      kind: "connecting",
      message: `Connecting market feed${heartbeatSuffix}`,
      heartbeatLabel,
    };
  }

  if (
    disconnectedForMs != null &&
    disconnectedForMs >= DESKTOP_FEED_WAIT_THRESHOLD_MS
  ) {
    return {
      kind: "waiting",
      message: `Waiting for market data${heartbeatSuffix}`,
      heartbeatLabel,
    };
  }

  if (feed.feedStatus === "offline" || !feed.connected) {
    return {
      kind: "connecting",
      message: `Connecting market feed${heartbeatSuffix}`,
      heartbeatLabel,
    };
  }

  return null;
}

export function feedBannerTone(kind: DesktopFeedBannerKind): string {
  switch (kind) {
    case "error":
      return "border-red-500/30 bg-red-500/10 text-red-200";
    case "reconnecting":
      return "border-amber-500/30 bg-amber-500/10 text-amber-200";
    case "waiting":
      return "border-amber-500/25 bg-amber-500/5 text-amber-100/90";
    default:
      return "border-terminal-border/60 bg-terminal-panel/40 text-slate-300";
  }
}
