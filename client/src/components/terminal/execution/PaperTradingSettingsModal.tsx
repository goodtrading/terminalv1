import { useCallback, useEffect, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { cn } from "@/lib/utils";
import { Loader2 } from "lucide-react";
import type { PaperAccountSnapshot, PaperTradingSettings } from "./executionTypes";

const inputClass =
  "w-full rounded border border-terminal-border bg-terminal-bg px-2 py-1.5 text-[11px] font-mono text-white focus:border-cyan-500/40 focus:outline-none";

type Props = {
  open: boolean;
  onClose: () => void;
};

type Draft = Omit<PaperTradingSettings, "updatedAt">;

const DEFAULT_DRAFT: Draft = {
  initialBalanceUsdt: 10000,
  makerFeeBps: 2,
  takerFeeBps: 5,
  slippageBps: 1,
  maxLeverage: 20,
  defaultLeverage: 5,
  defaultMarginMode: "isolated",
  allowMarketOrders: true,
  allowLimitOrders: true,
};

export function PaperTradingSettingsModal({ open, onClose }: Props) {
  const queryClient = useQueryClient();
  const [draft, setDraft] = useState<Draft>(DEFAULT_DRAFT);
  const [saving, setSaving] = useState(false);
  const [resetting, setResetting] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [confirmReset, setConfirmReset] = useState<string | null>(null);

  const settingsQuery = useQuery<PaperTradingSettings>({
    queryKey: ["/api/paper/settings"],
    queryFn: async () => {
      const res = await fetch("/api/paper/settings");
      if (!res.ok) throw new Error("Failed to load settings");
      return res.json() as Promise<PaperTradingSettings>;
    },
    enabled: open,
  });

  const accountQuery = useQuery<PaperAccountSnapshot>({
    queryKey: ["/api/paper/account"],
    queryFn: async () => {
      const res = await fetch("/api/paper/account");
      if (!res.ok) throw new Error("Failed to load account");
      return res.json() as Promise<PaperAccountSnapshot>;
    },
    enabled: open,
    refetchInterval: open ? 5000 : false,
  });

  useEffect(() => {
    if (settingsQuery.data) {
      const s = settingsQuery.data;
      setDraft({
        initialBalanceUsdt: s.initialBalanceUsdt,
        makerFeeBps: s.makerFeeBps,
        takerFeeBps: s.takerFeeBps,
        slippageBps: s.slippageBps,
        maxLeverage: s.maxLeverage,
        defaultLeverage: s.defaultLeverage,
        defaultMarginMode: s.defaultMarginMode,
        allowMarketOrders: s.allowMarketOrders,
        allowLimitOrders: s.allowLimitOrders,
      });
    }
  }, [settingsQuery.data]);

  const invalidatePaper = useCallback(async () => {
    const keys = [
      "/api/paper/account",
      "/api/paper/settings",
      "/api/paper/orders",
      "/api/paper/position",
      "/api/paper/logs",
      "/api/paper/fills",
      "/api/paper/trades",
      "/api/reports/execution",
    ];
    await Promise.all(
      keys.map((key) => queryClient.invalidateQueries({ queryKey: [key] })),
    );
  }, [queryClient]);

  const buildSettingsPayload = () => ({
    initialBalanceUsdt: Number(draft.initialBalanceUsdt),
    makerFeeBps: Number(draft.makerFeeBps),
    takerFeeBps: Number(draft.takerFeeBps),
    slippageBps: Number(draft.slippageBps),
    maxLeverage: Number(draft.maxLeverage),
    defaultLeverage: Number(draft.defaultLeverage),
    defaultMarginMode: draft.defaultMarginMode,
    allowMarketOrders: Boolean(draft.allowMarketOrders),
    allowLimitOrders: Boolean(draft.allowLimitOrders),
  });

  const saveSettings = async () => {
    setSaving(true);
    setMessage(null);
    const payload = buildSettingsPayload();
    const invalid = Object.entries(payload).some(([key, val]) => {
      if (key === "defaultMarginMode" || key.startsWith("allow")) return false;
      return typeof val === "number" && !Number.isFinite(val);
    });
    if (invalid) {
      setMessage("Invalid numeric values — check all fields.");
      setSaving(false);
      return;
    }
    try {
      let res = await fetch("/api/paper/settings", {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      if (res.status === 404 || res.status === 405) {
        res = await fetch("/api/paper/settings", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(payload),
        });
      }
      let data: { success?: boolean; message?: string; settings?: PaperTradingSettings } = {};
      try {
        data = (await res.json()) as typeof data;
      } catch {
        setMessage(`Unable to save paper settings (HTTP ${res.status}).`);
        return;
      }
      if (!res.ok || data.success === false) {
        setMessage(
          data.message ??
            `Unable to save paper settings (HTTP ${res.status}).`,
        );
        return;
      }
      setMessage("Saved successfully.");
      await invalidatePaper();
    } catch (err) {
      const hint = err instanceof Error ? err.message : "network error";
      setMessage(`Unable to save paper settings: ${hint}`);
    } finally {
      setSaving(false);
    }
  };

  const runReset = async (body: Record<string, boolean>) => {
    setResetting(true);
    setMessage(null);
    try {
      const res = await fetch("/api/paper/reset-account", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (!res.ok) {
        setMessage(data.message ?? "Reset failed");
        return;
      }
      setMessage("Paper state reset.");
      setConfirmReset(null);
      await invalidatePaper();
      await settingsQuery.refetch();
      await accountQuery.refetch();
    } catch {
      setMessage("Reset failed");
    } finally {
      setResetting(false);
    }
  };

  const account = accountQuery.data;
  const loading = settingsQuery.isLoading;

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-w-md border-terminal-border bg-[#0a0a0a] text-slate-200 p-0 gap-0">
        <DialogHeader className="px-4 pt-4 pb-2 border-b border-terminal-border">
          <DialogTitle className="text-sm font-bold uppercase tracking-wider text-white">
            GoodTrading Paper Trading Settings
          </DialogTitle>
          <p className="text-[10px] text-slate-500 font-mono">
            Simulated broker only · No real funds
          </p>
        </DialogHeader>

        <div className="px-4 py-3 max-h-[70vh] overflow-y-auto space-y-4 text-[10px] font-mono">
          {loading ? (
            <div className="flex items-center justify-center gap-2 py-8 text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin" />
              Loading…
            </div>
          ) : (
            <>
              <section className="space-y-2">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-cyan-500/80">
                  Account
                </h3>
                <div className="grid grid-cols-2 gap-2 text-slate-400">
                  <span>Equity</span>
                  <span className="text-right text-slate-200">
                    {account ? `${account.equityUsdt.toFixed(2)} USDT` : "—"}
                  </span>
                  <span>Avail. margin</span>
                  <span className="text-right text-slate-200">
                    {account ? `${account.availableMarginUsdt.toFixed(2)} USDT` : "—"}
                  </span>
                  <span>Realized PnL</span>
                  <span
                    className={cn(
                      "text-right",
                      account && account.realizedPnlUsdt >= 0
                        ? "text-emerald-400/90"
                        : "text-red-400/90",
                    )}
                  >
                    {account ? account.realizedPnlUsdt.toFixed(2) : "—"}
                  </span>
                  <span>Unrealized PnL</span>
                  <span className="text-right text-slate-200">
                    {account ? account.unrealizedPnlUsdt.toFixed(2) : "—"}
                  </span>
                </div>
                <label className="block space-y-1">
                  <span className="text-[8px] uppercase text-slate-500">Initial balance USDT</span>
                  <input
                    className={inputClass}
                    type="number"
                    min={1}
                    value={draft.initialBalanceUsdt}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        initialBalanceUsdt: Number(e.target.value),
                      }))
                    }
                  />
                </label>
              </section>

              <section className="space-y-2">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-cyan-500/80">
                  Costs
                </h3>
                <div className="grid grid-cols-3 gap-2">
                  {(
                    [
                      ["makerFeeBps", "Maker bps"],
                      ["takerFeeBps", "Taker bps"],
                      ["slippageBps", "Slippage bps"],
                    ] as const
                  ).map(([key, label]) => (
                    <label key={key} className="space-y-1">
                      <span className="text-[8px] uppercase text-slate-500">{label}</span>
                      <input
                        className={inputClass}
                        type="number"
                        min={0}
                        value={draft[key]}
                        onChange={(e) =>
                          setDraft((d) => ({ ...d, [key]: Number(e.target.value) }))
                        }
                      />
                    </label>
                  ))}
                </div>
              </section>

              <section className="space-y-2">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-cyan-500/80">
                  Risk
                </h3>
                <div className="grid grid-cols-2 gap-2">
                  <label className="space-y-1">
                    <span className="text-[8px] uppercase text-slate-500">Max leverage</span>
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      max={125}
                      value={draft.maxLeverage}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, maxLeverage: Number(e.target.value) }))
                      }
                    />
                  </label>
                  <label className="space-y-1">
                    <span className="text-[8px] uppercase text-slate-500">Default leverage</span>
                    <input
                      className={inputClass}
                      type="number"
                      min={1}
                      max={draft.maxLeverage}
                      value={draft.defaultLeverage}
                      onChange={(e) =>
                        setDraft((d) => ({
                          ...d,
                          defaultLeverage: Number(e.target.value),
                        }))
                      }
                    />
                  </label>
                </div>
                <label className="block space-y-1">
                  <span className="text-[8px] uppercase text-slate-500">Default margin mode</span>
                  <select
                    className={inputClass}
                    value={draft.defaultMarginMode}
                    onChange={(e) =>
                      setDraft((d) => ({
                        ...d,
                        defaultMarginMode: e.target.value as "isolated" | "cross",
                      }))
                    }
                  >
                    <option value="isolated">Isolated</option>
                    <option value="cross">Cross</option>
                  </select>
                </label>
              </section>

              <section className="space-y-2">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-cyan-500/80">
                  Permissions
                </h3>
                <div className="flex flex-wrap gap-4 text-slate-400">
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.allowMarketOrders}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, allowMarketOrders: e.target.checked }))
                      }
                      className="accent-cyan-500"
                    />
                    Market orders
                  </label>
                  <label className="flex items-center gap-2 cursor-pointer">
                    <input
                      type="checkbox"
                      checked={draft.allowLimitOrders}
                      onChange={(e) =>
                        setDraft((d) => ({ ...d, allowLimitOrders: e.target.checked }))
                      }
                      className="accent-cyan-500"
                    />
                    Limit orders
                  </label>
                </div>
              </section>

              <section className="space-y-2 rounded border border-amber-500/25 bg-amber-950/20 p-2">
                <h3 className="text-[9px] font-bold uppercase tracking-widest text-amber-400/90">
                  Reset
                </h3>
                {confirmReset ? (
                  <div className="space-y-2">
                    <p className="text-[10px] text-amber-200/90">
                      Are you sure? This will reset paper state only ({confirmReset}).
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        disabled={resetting}
                        onClick={() => {
                          const map: Record<string, Record<string, boolean>> = {
                            balance: { resetBalance: true },
                            orders: { resetOrders: true },
                            position: { resetPosition: true },
                            logs: { resetLogs: true },
                            ledger: { resetLedger: true, resetFills: true },
                            full: {
                              resetBalance: true,
                              resetOrders: true,
                              resetPosition: true,
                              resetLogs: true,
                              resetLedger: true,
                              resetFills: true,
                            },
                          };
                          void runReset(map[confirmReset] ?? { resetBalance: true });
                        }}
                        className="flex-1 rounded border border-red-500/40 bg-red-950/40 py-1.5 text-[9px] font-bold uppercase text-red-300 hover:bg-red-950/60"
                      >
                        Confirm
                      </button>
                      <button
                        type="button"
                        onClick={() => setConfirmReset(null)}
                        className="flex-1 rounded border border-terminal-border py-1.5 text-[9px] uppercase text-slate-400"
                      >
                        Cancel
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="grid grid-cols-2 gap-1.5">
                    {(
                      [
                        ["balance", "Reset balance"],
                        ["orders", "Reset orders"],
                        ["position", "Reset position"],
                        ["logs", "Reset logs"],
                        ["ledger", "Reset ledger"],
                        ["full", "Full reset"],
                      ] as const
                    ).map(([key, label]) => (
                      <button
                        key={key}
                        type="button"
                        disabled={resetting}
                        onClick={() => setConfirmReset(key)}
                        className="rounded border border-terminal-border py-1 text-[8px] font-bold uppercase text-slate-400 hover:text-white hover:border-white/20"
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                )}
              </section>

              {message ? (
                <p className="text-[10px] text-cyan-300/90 text-center">{message}</p>
              ) : null}
            </>
          )}
        </div>

        <div className="flex gap-2 px-4 py-3 border-t border-terminal-border">
          <button
            type="button"
            disabled={saving || loading}
            onClick={() => void saveSettings()}
            className="flex-1 rounded border border-cyan-500/45 bg-cyan-600/15 py-2 text-[10px] font-bold uppercase tracking-wider text-cyan-100 hover:bg-cyan-600/25 disabled:opacity-50"
          >
            {saving ? "Saving…" : "Save settings"}
          </button>
          <button
            type="button"
            onClick={onClose}
            className="rounded border border-terminal-border px-4 py-2 text-[10px] font-bold uppercase text-slate-400 hover:text-white"
          >
            Close
          </button>
        </div>
      </DialogContent>
    </Dialog>
  );
}
