import { useEffect, useRef, useState } from "react";
import { RefreshCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDesktopFeedDiagnostics } from "@/lib/desktopDiagnostics";
import { requestDesktopFeedReconnect } from "@/lib/desktopFeedControl";
import {
  deriveDesktopFeedBannerState,
  feedBannerTone,
} from "@/lib/desktopFeedBannerState";
import { isDesktopBuild, writeDesktopLog } from "@/lib/desktopStorage";
import { desktopBookmapFeedEnabled } from "@/hooks/useDesktopBookmapFeed";

export function DesktopFeedStatusBanner() {
  const feed = useDesktopFeedDiagnostics();
  const [now, setNow] = useState(() => Date.now());
  const [reconnectBusy, setReconnectBusy] = useState(false);
  const [disconnectedSince, setDisconnectedSince] = useState<number | null>(null);
  const lastLoggedKindRef = useRef<string | null>(null);

  const isHealthyLive = feed.connected && feed.feedStatus === "live";
  const showBanner = isDesktopBuild && desktopBookmapFeedEnabled;

  useEffect(() => {
    if (isHealthyLive) {
      setDisconnectedSince(null);
      return;
    }
    setDisconnectedSince((current) => current ?? Date.now());
  }, [isHealthyLive, feed.connected, feed.feedStatus]);

  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 1_000);
    return () => window.clearInterval(id);
  }, []);

  const disconnectedForMs =
    disconnectedSince != null ? Math.max(0, now - disconnectedSince) : null;
  const banner = showBanner ? deriveDesktopFeedBannerState(feed, disconnectedForMs) : null;

  useEffect(() => {
    if (!banner) {
      lastLoggedKindRef.current = null;
      return;
    }
    const logKey = `${banner.kind}:${feed.feedStatus}:${feed.connected}`;
    if (lastLoggedKindRef.current === logKey) return;
    lastLoggedKindRef.current = logKey;
    void writeDesktopLog("desktop_feed_status_banner_shown", {
      kind: banner.kind,
      feedStatus: feed.feedStatus,
      connected: feed.connected,
      reconnectCount: feed.reconnectCount,
      lastError: feed.lastError,
    });
  }, [banner, feed.connected, feed.feedStatus, feed.lastError, feed.reconnectCount]);

  if (!showBanner || !banner || banner.kind === "waiting") return null;

  const handleReconnect = async () => {
    setReconnectBusy(true);
    try {
      await requestDesktopFeedReconnect("feed_status_banner");
      setDisconnectedSince(Date.now());
    } finally {
      window.setTimeout(() => setReconnectBusy(false), 800);
    }
  };

  return (
    <div
      className={cn(
        "shrink-0 flex items-center justify-between gap-3 px-4 py-1.5 border-b text-[11px] font-mono",
        feedBannerTone(banner.kind),
      )}
      role="status"
    >
      <div className="flex items-center gap-2 min-w-0">
        {(banner.kind === "connecting" || banner.kind === "reconnecting") && (
          <RefreshCw className="h-3 w-3 shrink-0 animate-spin opacity-80" />
        )}
        <span className="truncate">{banner.message}</span>
      </div>
      <button
        type="button"
        onClick={() => void handleReconnect()}
        disabled={reconnectBusy}
        className="shrink-0 rounded border border-current/30 px-2 py-0.5 text-[10px] uppercase tracking-wide hover:bg-white/5 disabled:opacity-60"
      >
        {reconnectBusy ? "Reconnecting..." : "Reconnect feed"}
      </button>
    </div>
  );
}
