import { useState } from "react";
import { cn } from "@/lib/utils";
import type { BingXSavedConnection } from "./executionTypes";
import { isBingXReadOnlySession } from "./bingxSession";
import type { BrokerSessionState } from "./executionTypes";

type Props = {
  session: BrokerSessionState;
  saved: BingXSavedConnection;
  paperActive?: boolean;
  onUseSaved: () => void;
  onManage: () => void;
  onDeleteSaved: (connectionId?: string) => void | Promise<void>;
};

export function BingXSavedConnectionCard({
  session,
  saved,
  paperActive = false,
  onUseSaved,
  onManage,
  onDeleteSaved,
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const bingxActive = isBingXReadOnlySession(session);

  if (bingxActive) return null;

  return (
    <div className="rounded border border-slate-600/50 bg-slate-950/40 p-2.5 space-y-2 font-mono text-[9px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold text-white">BingX</div>
          <div className="text-slate-400 mt-0.5">
            {saved.connectionMode === "secure-api" || saved.tradingPermissionConfirmed
              ? paperActive
                ? "Saved secure API · inactive"
                : "Saved secure API"
              : paperActive
                ? "Saved read-only · inactive"
                : "Saved read-only"}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <span className="rounded border border-slate-500/40 bg-slate-800/60 px-1 py-0.5 text-[7px] font-bold uppercase text-slate-300">
            Saved
          </span>
          <span className="rounded border border-emerald-500/30 bg-emerald-950/20 px-1 py-0.5 text-[7px] font-bold uppercase text-emerald-300/90">
            Read-only
          </span>
          <span className="rounded border border-red-900/50 bg-red-950/30 px-1 py-0.5 text-[7px] font-bold uppercase text-red-300/80">
            Trading locked
          </span>
        </div>
      </div>

      <div className="grid grid-cols-[auto_1fr] gap-x-2 gap-y-0.5 text-slate-500">
        <span>API</span>
        <span className="text-slate-200">{saved.apiKeyMasked}</span>
        <span>Mode</span>
        <span>Read-only</span>
        <span>Trading</span>
        <span className="text-amber-400/90">Locked</span>
      </div>

      {paperActive ? (
        <p className="text-[8px] text-cyan-400/80 leading-snug">
          Paper is active. BingX credentials remain saved — no API secret required to
          switch back.
        </p>
      ) : null}

      <div className="flex flex-wrap gap-1.5 pt-0.5">
        <button
          type="button"
          onClick={onUseSaved}
          className="flex-1 min-w-[100px] rounded border border-cyan-500/45 bg-cyan-600/20 py-1 text-[8px] font-bold uppercase text-cyan-100 hover:bg-cyan-600/30"
        >
          Use BingX
        </button>
        <button
          type="button"
          onClick={onManage}
          className="rounded border border-terminal-border px-2 py-1 text-[8px] font-bold uppercase text-slate-300 hover:border-white/25"
        >
          Manage
        </button>
        {!confirmDelete ? (
          <button
            type="button"
            onClick={() => setConfirmDelete(true)}
            className="rounded border border-terminal-border px-2 py-1 text-[8px] font-bold uppercase text-slate-500 hover:text-red-300"
          >
            Delete saved
          </button>
        ) : (
          <button
            type="button"
            onClick={() => {
              setConfirmDelete(false);
              void onDeleteSaved(saved.id);
            }}
            className={cn(
              "rounded border border-red-900/50 bg-red-950/30 px-2 py-1",
              "text-[8px] font-bold uppercase text-red-300",
            )}
          >
            Confirm delete
          </button>
        )}
      </div>
    </div>
  );
}
