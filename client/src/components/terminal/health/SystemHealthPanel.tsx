import { useEffect } from "react";
import { cn } from "@/lib/utils";
import { HealthRow, HealthSection, StatusDot, healthToneClass } from "./healthUi";
import type { HealthTone } from "./healthUi";
import { useTerminalHealth } from "./useTerminalHealth";
import { LiveTradingReadinessBlock } from "./LiveTradingReadinessBlock";
import { formatAuditTime } from "./terminalAuditLog";
import type { TerminalAuditEntry } from "./auditTypes";
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
      <div className="shrink-0 flex items-center justify-between gap-2 px-2 py-1 border-b border-terminal-border/60 bg-terminal-panel/30">
        <span className="text-[9px] font-bold uppercase tracking-widest text-slate-400">
          System health
        </span>
        <span
          className={cn(
            "shrink-0 rounded border px-1.5 py-0.5 text-[7px] font-bold uppercase tracking-wider",
            healthToneClass(h.riskMirror.globalBadgeTone),
            h.riskMirror.globalBadgeTone === "ok" && "border-emerald-500/35",
            h.riskMirror.globalBadgeTone === "warn" && "border-amber-500/40",
            h.riskMirror.globalBadgeTone === "error" && "border-red-500/45",
            h.riskMirror.globalBadgeTone === "off" && "border-slate-600/40",
            h.riskMirror.globalBadgeTone === "neutral" && "border-slate-500/40",
          )}
          title="Real Risk Mirror (BingX read-only)"
        >
          {h.riskMirror.globalBadgeLabel}
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

        <HealthSection title="4 · Real Risk Mirror (BingX)">
          <div className="flex items-center gap-1.5 py-0.5">
            <StatusDot tone={h.riskMirror.statusTone} />
            <span
              className={cn(
                "uppercase font-bold",
                healthToneClass(h.riskMirror.statusTone),
              )}
            >
              {h.riskMirror.statusLabel}
            </span>
          </div>
          {h.serverOverall ? (
            <HealthRow
              label="System overall"
              value={h.serverOverall.toUpperCase()}
              tone={h.serverOverallTone}
            />
          ) : null}
          {!h.riskMirror.active ? (
            <p className="text-[8px] text-slate-500 leading-snug">
              {h.riskMirror.message ??
                "Risk Mirror inactive — no BingX read-only connection."}
            </p>
          ) : (
            <>
              <HealthRow label="Exchange" value="BingX" tone="ok" />
              <HealthRow label="Mode" value="Read-only" tone="ok" />
              <HealthRow
                label="Position"
                value={h.riskMirror.positionOpen ? "open" : "none"}
                tone={h.riskMirror.positionOpen ? "warn" : "neutral"}
              />
              <HealthRow
                label="Score"
                value={h.riskMirror.scoreLabel}
                tone={h.riskMirror.scoreTone}
              />
              <HealthRow
                label="Confidence"
                value={
                  h.riskMirror.scoreConfidence != null
                    ? `${h.riskMirror.scoreConfidence}%`
                    : "—"
                }
              />
              <HealthRow
                label="Warnings"
                value={String(h.riskMirror.warningsCount)}
                tone={
                  h.riskMirror.warningsCount > 0 ? "warn" : "neutral"
                }
              />
              <HealthRow
                label="Danger"
                value={String(h.riskMirror.dangerWarningsCount)}
                tone={
                  h.riskMirror.dangerWarningsCount > 0 ? "error" : "neutral"
                }
              />
              <HealthRow label="Trading" value="LOCKED" tone="ok" />
              {h.riskMirror.summary ? (
                <p className="text-[8px] text-slate-400 leading-snug pt-0.5">
                  {h.riskMirror.summary}
                </p>
              ) : null}
              {!h.riskMirror.positionOpen && h.riskMirror.message ? (
                <p className="text-[8px] text-slate-500 italic">
                  {h.riskMirror.message}
                </p>
              ) : null}
              {h.riskMirror.recentWarnings.length > 0 ? (
                <ul className="mt-1 space-y-0.5 max-h-20 overflow-y-auto">
                  {h.riskMirror.recentWarnings.map((w) => (
                    <li
                      key={w.id}
                      className={cn(
                        "text-[7px] leading-snug border-l-2 pl-1",
                        w.severity === "danger"
                          ? "border-red-500/60 text-red-300/90"
                          : w.severity === "warning"
                            ? "border-amber-500/50 text-amber-200/90"
                            : "border-slate-600 text-slate-500",
                      )}
                    >
                      <span className="font-bold uppercase">{w.title}</span>:{" "}
                      {w.message}
                    </li>
                  ))}
                </ul>
              ) : null}
            </>
          )}
        </HealthSection>

        <LiveTradingReadinessBlock
          readiness={h.liveReadiness}
          isLoading={h.liveReadinessLoading}
          isPaperMode={h.paper.active && !h.bingx.active}
        />

        <HealthSection title="5 · Security guard">
          <HealthRow
            label="Live trading"
            value={
              h.liveTradingSummary
                ? h.liveTradingSummary.status.replace(/_/g, " ").toUpperCase()
                : h.security.liveTradingLabel
            }
            tone={
              h.liveTradingSummary?.status === "locked"
                ? "ok"
                : h.liveTradingSummary?.status === "ready_for_live"
                  ? "error"
                  : h.security.liveTradingTone
            }
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

        <HealthSection title="6 · Audit log" defaultOpen>
          <p className="text-[7px] text-slate-600 pb-0.5">
            {h.auditPersistentUnavailable
              ? "Local fallback — persistent audit unavailable"
              : h.auditSource === "persistent"
                ? "Persistent — server-side audit log"
                : "Local fallback — in-memory only"}
          </p>
          {h.audit.length === 0 ? (
            <p className="text-[8px] text-slate-600 py-1">No events yet.</p>
          ) : (
            <ul className="max-h-32 overflow-y-auto space-y-0.5 pr-1">
              {h.audit.map((e) => (
                <li
                  key={e.id}
                  className={cn(
                    "flex flex-col gap-0 text-[8px] leading-snug border-b border-terminal-border/30 pb-0.5",
                    healthToneClass(auditLevelTone(e.level)),
                  )}
                >
                  <div className="flex gap-1.5 min-w-0">
                    <span className="text-slate-600 shrink-0 tabular-nums">
                      {formatAuditTime(e.ts)}
                    </span>
                    <span className="text-slate-500 shrink-0 uppercase">
                      {e.type.replace(/_/g, " ")}
                    </span>
                    <span className="text-slate-300 truncate">{e.message}</span>
                  </div>
                  {e.metadataSummary ? (
                    <span className="text-slate-600 truncate pl-0.5 text-[7px]">
                      {e.metadataSummary}
                    </span>
                  ) : null}
                </li>
              ))}
            </ul>
          )}
        </HealthSection>
      </div>
    </div>
  );
}
