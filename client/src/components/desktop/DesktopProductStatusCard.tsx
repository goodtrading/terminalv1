import { useEffect, useState } from "react";
import { cn } from "@/lib/utils";
import { useDesktopFeedDiagnostics } from "@/lib/desktopDiagnostics";
import { useDesktopUpdateCheck } from "@/hooks/useDesktopUpdateCheck";
import { useBrokerSession } from "@/components/terminal/execution/useBrokerSession";
import { getDesktopStoragePaths, isDesktopBuild } from "@/lib/desktopStorage";
import { isDesktopApp } from "@/lib/desktopRuntime";
import { StatusDot, healthToneClass, type HealthTone } from "@/components/terminal/health/healthUi";

function StatusLine({
  label,
  value,
  tone,
}: {
  label: string;
  value: string;
  tone: HealthTone;
}) {
  return (
    <div className="flex items-center justify-between gap-2 py-0.5 text-[9px] font-mono">
      <span className="text-slate-600 shrink-0">{label}</span>
      <span className={cn("inline-flex items-center gap-1 uppercase tracking-wide", healthToneClass(tone))}>
        <StatusDot tone={tone} />
        {value}
      </span>
    </div>
  );
}

export function DesktopProductStatusCard() {
  const feed = useDesktopFeedDiagnostics();
  const desktopUpdate = useDesktopUpdateCheck();
  const { session } = useBrokerSession();
  const [storageOk, setStorageOk] = useState<boolean | null>(null);

  useEffect(() => {
    if (!isDesktopBuild) return;
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
  }, []);

  if (!isDesktopApp()) return null;

  const marketLive = feed.connected && feed.feedStatus === "live";
  const storageTone: HealthTone =
    storageOk == null ? "warn" : storageOk ? "ok" : "error";
  const paperActive =
    session.connected &&
    (session.exchange === "paper" || session.connectionMode === "paper");
  const brokerConnected =
    session.connected &&
    session.exchange != null &&
    session.exchange !== "paper" &&
    (session.phase === "connected" || session.phase === "connected_demo");
  const tradingTone: HealthTone = paperActive ? "ok" : "warn";
  const updateTone: HealthTone =
    desktopUpdate.update.updateStatus === "error"
      ? "error"
      : desktopUpdate.update.updateStatus === "checking"
        ? "warn"
        : "ok";

  return (
    <div className="rounded border border-terminal-border/70 bg-black/25 px-2 py-1.5 space-y-0.5">
      <div className="text-[8px] font-bold uppercase tracking-widest text-slate-500 pb-0.5">
        Desktop overview
      </div>
      <StatusLine label="GoodTrading Desktop" value="Active" tone="ok" />
      <StatusLine
        label="Market data"
        value={marketLive ? "Live" : "Waiting"}
        tone={marketLive ? "ok" : "warn"}
      />
      <StatusLine
        label="Storage"
        value={storageOk == null ? "Checking" : storageOk ? "OK" : "Warning"}
        tone={storageTone}
      />
      <StatusLine
        label="Trading"
        value={paperActive ? "Paper enabled" : "Locked"}
        tone={tradingTone}
      />
      <StatusLine
        label="Broker"
        value={brokerConnected ? "Connected" : "Not connected"}
        tone={brokerConnected ? "ok" : "off"}
      />
      <StatusLine
        label="Updates"
        value={
          desktopUpdate.update.updateStatus === "optional_update" ||
          desktopUpdate.update.updateStatus === "required_update"
            ? "Available"
            : "Active"
        }
        tone={updateTone}
      />
    </div>
  );
}
