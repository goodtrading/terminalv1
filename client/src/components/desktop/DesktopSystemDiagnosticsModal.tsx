import { useCallback, useEffect, useState } from "react";
import { Copy, FolderOpen, RefreshCw, RotateCw } from "lucide-react";
import { cn } from "@/lib/utils";
import { useDesktopUpdateCheck, type ManualCheckFeedback } from "@/hooks/useDesktopUpdateCheck";
import { useDesktopFeedDiagnostics } from "@/lib/desktopDiagnostics";
import {
  buildDesktopDiagnosticsSnapshot,
  formatDesktopDiagnosticsSnapshot,
} from "@/lib/desktopDiagnosticsSnapshot";
import { requestDesktopFeedReconnect } from "@/lib/desktopFeedControl";
import {
  getDesktopStoragePaths,
  isDesktopBuild,
  openDesktopStoragePath,
} from "@/lib/desktopStorage";
import { isDesktopApp } from "@/lib/desktopRuntime";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type DesktopSystemDiagnosticsModalProps = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
};

function feedbackLabel(feedback: ManualCheckFeedback): string | null {
  switch (feedback) {
    case "checking":
      return "Checking...";
    case "up_to_date":
      return "Up to date";
    case "update_available":
      return "Update available";
    case "error":
      return "Error checking update";
    default:
      return null;
  }
}

function updateStatusTone(status: string): string {
  if (status === "up_to_date") return "text-emerald-400";
  if (status === "optional_update" || status === "checking") return "text-amber-300";
  if (status === "required_update" || status === "error") return "text-red-300";
  return "text-slate-400";
}

function Row({ label, value, valueClassName }: { label: string; value: string; valueClassName?: string }) {
  return (
    <div className="flex items-center justify-between gap-3 py-1 text-[11px] font-mono">
      <span className="text-terminal-muted shrink-0">{label}</span>
      <span className={cn("text-right truncate text-white", valueClassName)} title={value}>
        {value}
      </span>
    </div>
  );
}

export function DesktopSystemDiagnosticsModal({
  open,
  onOpenChange,
}: DesktopSystemDiagnosticsModalProps) {
  const desktopUpdate = useDesktopUpdateCheck();
  const feed = useDesktopFeedDiagnostics();
  const { update, manualCheckFeedback } = desktopUpdate;
  const [storageOk, setStorageOk] = useState<boolean | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);
  const [feedReconnectBusy, setFeedReconnectBusy] = useState(false);

  useEffect(() => {
    if (!open || !isDesktopBuild) return;
    let cancelled = false;
    getDesktopStoragePaths()
      .then((paths) => {
        if (!cancelled) setStorageOk(paths.mode === "tauri");
      })
      .catch(() => {
        if (!cancelled) setStorageOk(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open]);

  const snapshot = buildDesktopDiagnosticsSnapshot({
    update,
    storageOk,
    feed,
  });

  const copyDiagnostics = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(formatDesktopDiagnosticsSnapshot(snapshot));
      setActionStatus("Diagnostics copied");
    } catch (error) {
      setActionStatus(
        error instanceof Error ? error.message : "Could not copy diagnostics",
      );
    }
  }, [snapshot]);

  const openLogsFolder = useCallback(async () => {
    try {
      await openDesktopStoragePath("logs");
      setActionStatus("Logs folder opened");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "Could not open logs folder");
    }
  }, []);

  const reconnectFeed = useCallback(async () => {
    setFeedReconnectBusy(true);
    try {
      const ok = await requestDesktopFeedReconnect("system_diagnostics");
      setActionStatus(ok ? "Feed reconnect requested" : "Feed reconnect unavailable");
    } finally {
      window.setTimeout(() => setFeedReconnectBusy(false), 800);
    }
  }, []);

  const manualFeedback = feedbackLabel(manualCheckFeedback);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md border-terminal-border bg-terminal-panel text-terminal-text font-mono">
        <DialogHeader>
          <DialogTitle className="text-sm font-bold tracking-wide text-white">
            System diagnostics
          </DialogTitle>
          <DialogDescription className="text-[11px] text-terminal-muted">
            Desktop runtime, update and feed status.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-1 rounded border border-terminal-border/70 bg-terminal-bg/50 px-3 py-2">
          <Row label="App version" value={snapshot.appVersion} />
          <Row label="Latest version" value={snapshot.latestVersion ?? "unknown"} />
          <Row
            label="Update status"
            value={snapshot.updateStatus}
            valueClassName={updateStatusTone(snapshot.updateStatus)}
          />
          <Row label="API mode" value={snapshot.apiMode} />
          <Row label="API base URL" value={snapshot.apiBaseUrl} />
          <Row
            label="Desktop mode"
            value={snapshot.desktopModeEnabled ? "enabled" : "disabled"}
            valueClassName={snapshot.desktopModeEnabled ? "text-emerald-400" : "text-slate-400"}
          />
          <Row label="Storage status" value={snapshot.storageStatus} />
          <Row label="Feed status" value={snapshot.feedStatus} />
          <Row label="Feed heartbeat" value={snapshot.feedLastHeartbeat ?? "unknown"} />
          <Row label="Last heartbeat at" value={snapshot.lastHeartbeatAt ?? "unknown"} />
          <Row label="Reconnect count" value={String(snapshot.reconnectCount)} />
          <Row label="Last feed error" value={snapshot.lastFeedError ?? "none"} />
          <Row label="Last update check" value={snapshot.lastUpdateCheck ?? "never"} />
        </div>

        {manualFeedback ? (
          <p className="text-[10px] text-terminal-muted uppercase tracking-wide">{manualFeedback}</p>
        ) : null}

        <div className="flex flex-wrap items-center gap-2 pt-1">
          {isDesktopApp() ? (
            <button
              type="button"
              onClick={() => void desktopUpdate.checkManually()}
              disabled={manualCheckFeedback === "checking"}
              className="inline-flex items-center gap-1.5 rounded border border-terminal-border px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-slate-300 hover:text-white hover:border-terminal-accent/40 disabled:opacity-60"
            >
              <RefreshCw className={cn("h-3 w-3", manualCheckFeedback === "checking" && "animate-spin")} />
              Check for updates
            </button>
          ) : null}
          <button
            type="button"
            onClick={() => void copyDiagnostics()}
            className="inline-flex items-center gap-1.5 rounded border border-terminal-border px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-slate-300 hover:text-white hover:border-terminal-accent/40"
          >
            <Copy className="h-3 w-3" />
            Copy diagnostics
          </button>
          <button
            type="button"
            onClick={() => void reconnectFeed()}
            disabled={feedReconnectBusy || !isDesktopBuild}
            className="inline-flex items-center gap-1.5 rounded border border-terminal-border px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-slate-300 hover:text-white hover:border-terminal-accent/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <RotateCw className={cn("h-3 w-3", feedReconnectBusy && "animate-spin")} />
            Reconnect feed
          </button>
          <button
            type="button"
            onClick={() => void openLogsFolder()}
            disabled={!isDesktopBuild}
            title={isDesktopBuild ? "Open logs folder" : "Desktop only"}
            className="inline-flex items-center gap-1.5 rounded border border-terminal-border px-2.5 py-1.5 text-[10px] uppercase tracking-wide text-slate-300 hover:text-white hover:border-terminal-accent/40 disabled:opacity-40 disabled:cursor-not-allowed"
          >
            <FolderOpen className="h-3 w-3" />
            Open logs folder
          </button>
        </div>

        {actionStatus ? <p className="text-[10px] text-slate-500">{actionStatus}</p> : null}
      </DialogContent>
    </Dialog>
  );
}
