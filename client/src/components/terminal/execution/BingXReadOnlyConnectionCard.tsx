import { useCallback, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { cn } from "@/lib/utils";
import type { BingXReadOnlyHealthResponse, BrokerSessionState } from "./executionTypes";
import { bingxApiFetch } from "./bingxApiClient";
import {
  bingxReadOnlyErrorMessage,
  formatLastSyncAgo,
} from "./bingxReadOnlyMessages";
import { hasPersistedBingXConnection } from "./bingxSession";

function healthColor(health: string): string {
  switch (health) {
    case "healthy":
      return "text-emerald-400";
    case "degraded":
      return "text-amber-400";
    case "error":
      return "text-red-400";
    default:
      return "text-slate-400";
  }
}

type BingXReadOnlyConnectionCardProps = {
  session: BrokerSessionState;
  onManage: () => void;
  /** Deactivate active session only — keeps saved credentials. */
  onDisconnect: () => void;
  onDeleteSaved: () => void | Promise<void>;
};

export function BingXReadOnlyConnectionCard({
  session,
  onManage,
  onDisconnect,
  onDeleteSaved,
}: BingXReadOnlyConnectionCardProps) {
  const [confirmDelete, setConfirmDelete] = useState(false);
  const queryClient = useQueryClient();
  const connectionId = session.connectionId;
  const canSync = hasPersistedBingXConnection(session);

  const { data: healthData, isFetching: healthFetching } =
    useQuery<BingXReadOnlyHealthResponse>({
      queryKey: ["/api/bingx/read-only/health", connectionId],
      queryFn: async () => {
        const res = await bingxApiFetch(
          `/api/bingx/read-only/health?connectionId=${encodeURIComponent(connectionId!)}`,
          { method: "GET", assertOk: false },
        );
        const json = (await res.json()) as BingXReadOnlyHealthResponse & {
          code?: string;
          message?: string;
        };
        if (!res.ok) {
          return {
            success: false,
            health: "error" as const,
            permissions: { read: false, trade: false, withdraw: false },
            warnings: [],
            code: json.code,
            message: json.message,
          };
        }
        return json;
      },
      enabled: canSync,
      refetchInterval: canSync ? 12_000 : false,
      staleTime: 8_000,
      retry: 1,
    });

  const health = healthData?.health ?? (canSync ? "checking" : "error");
  const lastSync = healthData?.lastSyncTime;
  const syncError =
    healthData?.health === "error"
      ? bingxReadOnlyErrorMessage(healthData.code, healthData.message)
      : null;

  const handleSync = useCallback(() => {
    if (!connectionId) return;
    void queryClient.invalidateQueries({
      queryKey: ["/api/bingx/read-only/health", connectionId],
    });
    void queryClient.invalidateQueries({
      queryKey: ["/api/bingx/read-only/snapshot", connectionId],
    });
  }, [connectionId, queryClient]);

  return (
    <div className="rounded border border-emerald-500/30 bg-emerald-950/15 p-2.5 space-y-2 font-mono text-[9px]">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-[11px] font-bold text-white">BingX</div>
          <div className="text-slate-400 mt-0.5">Status: Connected Read-Only</div>
          <div className={cn("mt-0.5 uppercase font-bold", healthColor(health))}>
            Health: {health === "checking" ? "Checking…" : health}
            {healthData?.latencyMs != null ? (
              <span className="font-normal text-slate-500 ml-1">
                · {healthData.latencyMs}ms
              </span>
            ) : null}
          </div>
          <div className="text-slate-500 mt-0.5">
            Last sync: {formatLastSyncAgo(lastSync)}
            {healthFetching ? " · syncing…" : ""}
          </div>
        </div>
        <div className="flex flex-col gap-1 shrink-0">
          <span className="rounded border border-emerald-500/40 bg-emerald-500/10 px-1 py-0.5 text-[7px] font-bold uppercase text-emerald-300">
            Read only
          </span>
          <span className="rounded border border-amber-500/40 bg-amber-500/10 px-1 py-0.5 text-[7px] font-bold uppercase text-amber-200">
            Real account
          </span>
          <span className="rounded border border-red-900/50 bg-red-950/30 px-1 py-0.5 text-[7px] font-bold uppercase text-red-300/90">
            Trading locked
          </span>
        </div>
      </div>

      {session.apiKeyMasked ? (
        <div className="text-slate-500">
          API <span className="text-slate-300">{session.apiKeyMasked}</span>
        </div>
      ) : null}

      {!canSync ? (
        <p className="text-amber-400/90 leading-snug">
          Connection tested only — save credentials on connect to enable account sync.
        </p>
      ) : null}

      {syncError ? (
        <div className="rounded border border-red-500/30 bg-red-950/25 px-2 py-1.5 text-red-200/90 leading-snug">
          <div className="font-bold uppercase text-[8px] mb-0.5">
            Connection needs attention
          </div>
          {syncError}
          <div className="text-[8px] text-red-300/70 mt-1">
            Check API key, secret, or read permissions.
          </div>
        </div>
      ) : null}

      {healthData?.warnings && healthData.warnings.length > 0 ? (
        <ul className="text-amber-400/80 list-disc pl-3.5 space-y-0.5">
          {healthData.warnings.map((w) => (
            <li key={w}>{w}</li>
          ))}
        </ul>
      ) : null}

      <div className="flex gap-1.5 pt-1">
        <button
          type="button"
          disabled={!canSync || healthFetching}
          onClick={handleSync}
          className="flex-1 rounded border border-cyan-500/40 py-1 text-[8px] font-bold uppercase text-cyan-200 hover:bg-cyan-950/40 disabled:opacity-50"
        >
          Sync
        </button>
        <button
          type="button"
          onClick={onManage}
          className="flex-1 rounded border border-terminal-border py-1 text-[8px] font-bold uppercase text-slate-300 hover:border-white/25"
        >
          View details
        </button>
        <button
          type="button"
          onClick={onDisconnect}
          className="rounded border border-terminal-border px-2 py-1 text-[8px] font-bold uppercase text-slate-400 hover:text-slate-300"
          title="Deactivate session (saved credentials kept)"
        >
          Deactivate
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
              void onDeleteSaved();
            }}
            className="rounded border border-red-900/50 bg-red-950/30 px-2 py-1 text-[8px] font-bold uppercase text-red-300"
          >
            Confirm
          </button>
        )}
      </div>
    </div>
  );
}
