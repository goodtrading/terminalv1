import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { HealthRow, HealthSection, StatusDot, healthToneClass } from "./healthUi";
import type { HealthTone } from "./healthUi";
import { useTerminalHealth } from "./useTerminalHealth";
import { formatAuditTime, type TerminalAuditEntry } from "./terminalAuditLog";
import { registerTerminalAuditBridge } from "./terminalAuditBridge";

function auditLevelTone(level: TerminalAuditEntry["level"]): HealthTone {
  if (level === "error") return "error";
  if (level === "warn") return "warn";
  return "neutral";
}

export function SystemHealthPanel() {
  const h = useTerminalHealth();

  useEffect(() => {
    registerTerminalAuditBridge();
  }, []);

  return (
    <div className="h-full min-h-0 flex flex-col font-mono text-[9px] overflow-hidden">
      <div className="shrink-0 flex items-center justify-between px-2 py-1 border-b border-terminal-border/60 bg-terminal-panel/30">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
          System health
        </span>
        <button
          type="button"
          onClick={h.refresh}
          className="text-[8px] uppercase text-slate-500 hover:text-slate-300 border border-terminal-border/60 rounded px-1.5 py-0.5"
        >
          Refresh
        </button>
      </div>

      <div className="flex-1 min-h-0 overflow-y-auto p-2 space-y-1.5">
        <HealthSection title="1 · BingX read-only">
          <div className="flex items-center gap-1.5 py-0.5">
            <StatusDot tone={h.bingx.connectionTone} />
            <span className={cn("uppercase font-bold", healthToneClass(h.bingx.connectionTone))}>
              {h.bingx.connectionLabel}
            </span>
          </div>
          <HealthRow label="Session" value={h.bingx.active ? "active" : "inactive"} tone={h.bingx.active ? "ok" : "off"} />
          <HealthRow label="Last sync" value={h.bingx.lastSync} />
          <HealthRow label="Latency" value={h.bingx.latencyMs} />
          <HealthRow
            label="Snapshot"
            value={h.bingx.snapshotStatus}
            tone={h.bingx.snapshotTone}
          />
          <HealthRow
            label="Permissions"
            value={
              h.bingx.permissions
                ? `read ${h.bingx.permissions.read ? "✓" : "✗"} · trade ${h.bingx.permissions.trade ? "✗" : "locked"} · withdraw ${h.bingx.permissions.withdraw ? "✗" : "locked"}`
                : "—"
            }
            tone={h.bingx.permissions?.trade === false ? "ok" : "warn"}
          />
        </HealthSection>

        <HealthSection title="2 · Paper trading">
          <div className="flex items-center gap-1.5 py-0.5">
            <StatusDot tone={h.paper.activeTone} />
            <span className={cn("uppercase font-bold", healthToneClass(h.paper.activeTone))}>
              {h.paper.active ? "active" : "inactive"}
            </span>
          </div>
          <HealthRow label="Account" value={h.paper.accountLabel} tone={h.paper.activeTone} />
          <HealthRow
            label="Pending orders"
            value={String(h.paper.pendingCount)}
            tone={h.paper.pendingCount > 0 ? "warn" : "neutral"}
          />
          <HealthRow
            label="Open position"
            value={h.paper.openPosition}
            tone={h.paper.openPosition !== "none" ? "ok" : "neutral"}
          />
        </HealthSection>

        <HealthSection title="3 · Market data">
          <HealthRow label="Candles feed" value={h.market.candlesLabel} tone={h.market.candlesTone} />
          <HealthRow label="Ticker feed" value={h.market.tickerLabel} tone={h.market.tickerTone} />
          <HealthRow label="Orderbook / heatmap" value={h.market.orderbookLabel} tone={h.market.orderbookTone} />
          <HealthRow label="Heatmap panel" value={h.market.heatmapLabel} tone={h.market.heatmapTone} />
        </HealthSection>

        <HealthSection title="4 · Security guard">
          <HealthRow
            label="Live trading"
            value={h.security.liveTradingLabel}
            tone={h.security.liveTradingTone}
          />
          <HealthRow
            label="API trading"
            value={h.security.apiTradingLabel}
            tone={h.security.apiTradingTone}
          />
          <HealthRow
            label="Real order endpoints"
            value={h.security.endpointsLabel}
            tone={h.security.endpointsTone}
          />
          <HealthRow
            label="Max notional (guard)"
            value={
              h.security.maxNotional != null
                ? `${h.security.maxNotional.toLocaleString()} USDT`
                : "—"
            }
          />
          <HealthRow
            label="Max leverage (guard)"
            value={h.security.maxLeverage != null ? `${h.security.maxLeverage}x` : "—"}
          />
        </HealthSection>

        <HealthSection title="5 · Audit log" defaultOpen>
          {h.audit.length === 0 ? (
            <p className="text-[8px] text-slate-600 py-1">No events yet.</p>
          ) : (
            <ul className="max-h-32 overflow-y-auto space-y-0.5 pr-1">
              {h.audit.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    "flex gap-1.5 text-[8px] leading-snug border-b border-terminal-border/30 pb-0.5",
                    healthToneClass(auditLevelTone(e.level)),
                  )}
                >
                  <span className="text-slate-600 shrink-0 tabular-nums">
                    {formatAuditTime(e.ts)}
                  </span>
                  <span className="text-slate-500 shrink-0 uppercase">{e.type.replace(/_/g, " ")}</span>
                  <span className="text-slate-300 truncate">{e.message}</span>
                </li>
              ))}
            </ul>
          )}
        </HealthSection>
      </div>
    </div>
  );
}
