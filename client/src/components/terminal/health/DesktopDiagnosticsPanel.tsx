import { useEffect, useState } from "react";
import { useTerminalAuth } from "@/contexts/TerminalAuthContext";
import { apiBaseUrl } from "@/lib/apiBase";
import {
  getDesktopStoragePaths,
  isDesktopBuild,
  openDesktopStoragePath,
  readDesktopLogTail,
  type DesktopStoragePaths,
} from "@/lib/desktopStorage";
import { useDesktopFeedDiagnostics } from "@/lib/desktopDiagnostics";
import { HealthRow, HealthSection } from "./healthUi";
import { useDesktopUpdateCheck } from "@/hooks/useDesktopUpdateCheck";
import { desktopUpdateEndpoint } from "@/lib/desktopUpdateCheck";

function shortAge(ms: number | null): string {
  if (ms == null) return "unknown";
  if (ms < 1_000) return `${Math.round(ms)}ms`;
  return `${(ms / 1_000).toFixed(1)}s`;
}

function statusTone(ok: boolean | null): "ok" | "warn" | "error" | "neutral" {
  if (ok == null) return "neutral";
  return ok ? "ok" : "error";
}

function updateStatusTone(status: string): "ok" | "warn" | "error" | "neutral" {
  if (status === "up_to_date") return "ok";
  if (status === "optional_update" || status === "checking" || status === "idle") return "warn";
  if (status === "required_update" || status === "error") return "error";
  return "neutral";
}

export function DesktopDiagnosticsPanel() {
  const auth = useTerminalAuth();
  const feed = useDesktopFeedDiagnostics();
  const desktopUpdate = useDesktopUpdateCheck();
  const { update } = desktopUpdate;
  const [paths, setPaths] = useState<DesktopStoragePaths | null>(null);
  const [storageError, setStorageError] = useState<string | null>(null);
  const [actionStatus, setActionStatus] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    getDesktopStoragePaths()
      .then((next) => {
        if (cancelled) return;
        setPaths(next);
        setStorageError(null);
      })
      .catch((error) => {
        if (cancelled) return;
        setStorageError(error instanceof Error ? error.message : String(error));
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const copyLogs = async () => {
    try {
      const logs = await readDesktopLogTail(300);
      await navigator.clipboard.writeText(logs || "No desktop logs found.");
      setActionStatus("Últimos logs copiados");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "No se pudieron copiar logs");
    }
  };

  const openPath = async (target: "appData" | "logs") => {
    try {
      await openDesktopStoragePath(target);
      setActionStatus(target === "logs" ? "Carpeta de logs abierta" : "AppData abierto");
    } catch (error) {
      setActionStatus(error instanceof Error ? error.message : "No se pudo abrir carpeta");
    }
  };

  const authStatus = !auth.authReady
    ? "unknown"
    : auth.authenticated
      ? "logged in"
      : "logged out";
  const plan = auth.access?.subscription?.planName ?? auth.access?.reason ?? "unknown";

  return (
    <HealthSection title="Desktop diagnostics" defaultOpen>
      <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 max-[900px]:grid-cols-1">
        <HealthRow label="App version" value={update.currentVersion} />
        <HealthRow label="Platform" value={isDesktopBuild ? "desktop" : "web"} tone={isDesktopBuild ? "ok" : "neutral"} />
        <HealthRow label="API base URL" value={apiBaseUrl()} />
        <HealthRow label="Auth status" value={authStatus} tone={auth.authenticated ? "ok" : "warn"} />
        <HealthRow label="User email" value={auth.user?.email ?? "none"} />
        <HealthRow label="License / plan" value={plan} tone={auth.access?.allowed ? "ok" : "warn"} />
        <HealthRow label="Storage status" value={storageError ? "error" : paths ? "OK" : "loading"} tone={statusTone(storageError ? false : paths ? true : null)} />
        <HealthRow label="AppData path" value={paths?.baseDir ?? "loading"} />
        <HealthRow label="Logs path" value={paths?.logs ?? "loading"} />
        <HealthRow label="Sessions path" value={paths?.sessions ?? "loading"} />
        <HealthRow label="Heatmap path" value={paths?.heatmap ?? "loading"} />
        <HealthRow label="Feed status" value={feed.feedStatus} tone={feed.connected ? "ok" : "warn"} />
        <HealthRow label="Feed provider" value={feed.provider} />
        <HealthRow label="Symbol" value={feed.symbol} />
        <HealthRow label="Connected" value={String(feed.connected)} tone={feed.connected ? "ok" : "warn"} />
        <HealthRow label="Last update age" value={shortAge(feed.lastUpdateAgeMs)} tone={feed.lastUpdateAgeMs != null && feed.lastUpdateAgeMs < 2_000 ? "ok" : "warn"} />
        <HealthRow label="Reconnect count" value={String(feed.reconnectCount)} tone={feed.reconnectCount === 0 ? "ok" : "warn"} />
        <HealthRow label="Resync count" value={String(feed.resyncCount)} tone={feed.resyncCount <= 1 ? "ok" : "warn"} />
        <HealthRow label="Raw bids / asks" value={`${feed.rawBidsCount} / ${feed.rawAsksCount}`} />
        <HealthRow label="Visible bids / asks" value={`${feed.visibleBidsCount} / ${feed.visibleAsksCount}`} />
        <HealthRow label="Heatmap cells" value={String(feed.heatmapCellCount)} tone={feed.heatmapCellCount > 0 ? "ok" : "neutral"} />
        <HealthRow label="Last error" value={feed.lastError ?? "none"} tone={feed.lastError ? "error" : "neutral"} />
      </div>

      <div className="pt-2 mt-2 border-t border-terminal-border/50">
        <p className="pb-1 text-[9px] font-bold uppercase tracking-widest text-slate-500">Update</p>
        <div className="grid grid-cols-2 gap-x-4 gap-y-0.5 max-[900px]:grid-cols-1">
          <HealthRow label="Current version" value={update.currentVersion} />
          <HealthRow label="Latest version" value={update.latestVersion ?? "unknown"} />
          <HealthRow label="Min supported" value={update.minSupportedVersion ?? "unknown"} />
          <HealthRow label="Mandatory" value={String(update.mandatory ?? false)} tone={update.mandatory ? "error" : "neutral"} />
          <HealthRow label="Update endpoint" value={desktopUpdateEndpoint()} />
          <HealthRow label="Update status" value={update.updateStatus} tone={updateStatusTone(update.updateStatus)} />
          <HealthRow
            label="Optional modal"
            value={
              update.updateStatus === "optional_update"
                ? desktopUpdate.shouldShowOptionalModal
                  ? "visible"
                  : "dismissed"
                : update.updateStatus === "required_update"
                  ? "required"
                  : "hidden"
            }
            tone={
              update.updateStatus === "optional_update" && !desktopUpdate.shouldShowOptionalModal
                ? "warn"
                : updateStatusTone(update.updateStatus)
            }
          />
          <HealthRow label="Last check" value={update.lastUpdateCheck ?? "never"} />
          <HealthRow label="Download URL" value={update.downloadUrl || "not configured"} />
          <HealthRow label="Last error" value={update.lastUpdateError ?? "none"} tone={update.lastUpdateError ? "error" : "neutral"} />
        </div>
        <div className="flex flex-wrap items-center gap-2 pt-2">
          <button
            type="button"
            onClick={() => void desktopUpdate.checkNow()}
            className="text-[9px] px-2 py-1 rounded border border-terminal-border/70 text-slate-300 hover:text-white"
          >
            Re-chequear update
          </button>
          {update.updateStatus === "optional_update" && !desktopUpdate.shouldShowOptionalModal ? (
            <button
              type="button"
              onClick={desktopUpdate.showOptionalModal}
              className="text-[9px] px-2 py-1 rounded border border-terminal-accent/40 text-terminal-accent hover:text-white"
            >
              Mostrar aviso de update
            </button>
          ) : null}
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-2 pt-2">
        <button
          type="button"
          onClick={copyLogs}
          className="text-[9px] px-2 py-1 rounded border border-terminal-border/70 text-slate-300 hover:text-white"
        >
          Copiar últimos logs
        </button>
        <button
          type="button"
          onClick={() => void openPath("logs")}
          className="text-[9px] px-2 py-1 rounded border border-terminal-border/70 text-slate-300 hover:text-white"
        >
          Abrir carpeta de logs
        </button>
        <button
          type="button"
          onClick={() => void openPath("appData")}
          className="text-[9px] px-2 py-1 rounded border border-terminal-border/70 text-slate-300 hover:text-white"
        >
          Abrir carpeta AppData
        </button>
        {actionStatus ? <span className="text-[9px] text-slate-500">{actionStatus}</span> : null}
      </div>
    </HealthSection>
  );
}
