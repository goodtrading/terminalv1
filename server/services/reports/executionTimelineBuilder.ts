import type { ExecutionContextSnapshot } from "./executionContextTypes";
import type { PlaybookMatchResult } from "./playbookMatchTypes";
import type { PlaybookEntryExitDelta } from "./playbookDeltaTypes";
import type {
  ExecutionTimelineEvent,
  ExecutionTimelineReplay,
  ExecutionTimelineSeverity,
} from "./executionTimelineTypes";

export type BuildExecutionTimelineParams = {
  tradeId?: string;
  source: "paper" | "bingx";
  side?: "long" | "short";
  entryPrice?: number;
  exitPrice?: number | null;
  pnlUsdt?: number | null;
  accountPct?: number | null;
  status?: "open" | "closed" | "partial" | "cancelled" | "rejected" | string;
  entryTime?: number | string;
  exitTime?: number | string;
  contextAtEntry?: ExecutionContextSnapshot;
  contextAtExit?: ExecutionContextSnapshot;
  playbookAtEntry?: PlaybookMatchResult;
  playbookAtExit?: PlaybookMatchResult;
  playbookMatch?: PlaybookMatchResult;
  playbookDelta?: PlaybookEntryExitDelta;
};

function parseTimestamp(v?: number | string | null): number | undefined {
  if (v == null) return undefined;
  if (typeof v === "number" && Number.isFinite(v)) return v;
  const p = Date.parse(String(v));
  return Number.isFinite(p) ? p : undefined;
}

function fmtPrice(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  return n.toLocaleString("en-US", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function fmtPnl(n?: number | null): string {
  if (n == null || !Number.isFinite(n)) return "—";
  const sign = n >= 0 ? "+" : "";
  return `${sign}${n.toFixed(2)} USDT`;
}

function gammaRegimeLabel(
  r?: ExecutionContextSnapshot["gamma"]["regime"],
): string {
  if (r === "long_gamma") return "Long gamma";
  if (r === "short_gamma") return "Short gamma";
  if (r === "transition") return "Transition";
  if (r === "unknown") return "Unknown gamma";
  return "Gamma unavailable";
}

function primaryPlaybook(pb?: PlaybookMatchResult) {
  return pb?.primary;
}

function isNoMatch(pb?: PlaybookMatchResult): boolean {
  const p = primaryPlaybook(pb);
  return !p || p.id === "no_match" || p.status === "no_match";
}

function playbookSeverity(pb?: PlaybookMatchResult): ExecutionTimelineSeverity {
  const p = primaryPlaybook(pb);
  if (!p || isNoMatch(pb)) return "neutral";
  if (p.status === "matched" && p.confidence >= 70) return "positive";
  if (p.status === "partial") return "warning";
  return "neutral";
}

function riskSeverity(ctx?: ExecutionContextSnapshot): ExecutionTimelineSeverity {
  if (!ctx?.risk) return "neutral";
  const r = ctx.risk;
  if (!r.stopLossDetected) return "danger";
  if (r.riskMirrorStatus === "danger") return "danger";
  if (
    r.distanceToLiquidationPct != null &&
    r.distanceToLiquidationPct < 7
  ) {
    return "danger";
  }
  if (r.riskMirrorStatus === "conflicted") return "warning";
  if (r.stopLossDetected && r.takeProfitDetected) return "positive";
  if (r.stopLossDetected) return "positive";
  if (!r.takeProfitDetected) return "warning";
  return "info";
}

function deltaSeverity(
  delta?: PlaybookEntryExitDelta,
  pnl?: number | null,
): ExecutionTimelineSeverity {
  if (!delta) return "neutral";
  if (delta.status === "invalidated") return "danger";
  if (delta.status === "weakened") return "warning";
  if (delta.exitQuality === "late_exit") return "danger";
  if (delta.exitQuality === "good_exit") return "positive";
  if (delta.status === "held" && pnl != null && pnl > 0) return "positive";
  if (delta.status === "improved") return "positive";
  if (delta.status === "held") return "neutral";
  return "neutral";
}

function buildTimelineSummary(params: BuildExecutionTimelineParams): string {
  const source = params.source;
  const side = params.side === "short" ? "short" : "long";
  const isOpen = params.status === "open";
  const ctx = params.contextAtEntry;
  const pb = params.playbookAtEntry ?? params.playbookMatch;
  const p = primaryPlaybook(pb);
  const delta = params.playbookDelta;

  if (!ctx && !params.contextAtExit) {
    if (params.entryPrice) {
      return "Timeline unavailable — context was not captured for this legacy trade.";
    }
    return "Timeline unavailable — context was not captured for this trade.";
  }

  if (source === "bingx" && isOpen) {
    const pbBit =
      p && !isNoMatch(pb)
        ? ` with ${p.name} ${p.confidence}%`
        : "";
    return `Real BingX position is open${pbBit}. Exit replay unavailable.`;
  }

  if (isOpen) {
    const pbBit =
      p && !isNoMatch(pb)
        ? ` with ${p.name} ${p.confidence}%`
        : "";
    return `Open paper ${side}${pbBit}. Exit delta unavailable.`;
  }

  if (delta?.summary && !delta.summary.toLowerCase().includes("unavailable")) {
    if (
      delta.status === "invalidated" ||
      delta.status === "weakened" ||
      delta.exitQuality === "late_exit" ||
      delta.exitQuality === "unjustified_hold"
    ) {
      return "Playbook weakened before exit; trade was held after context deterioration.";
    }
    if (
      delta.status === "held" ||
      delta.status === "improved" ||
      delta.exitQuality === "good_exit"
    ) {
      return "Trade followed the original playbook and exited coherently.";
    }
    return delta.summary.slice(0, 200);
  }

  if (p && !isNoMatch(pb) && p.confidence >= 70) {
    return "Trade aligned with institutional playbook at entry.";
  }

  return "Execution timeline replay available for this trade.";
}

function buildDiagnosisMessage(
  params: BuildExecutionTimelineParams,
): { message: string; severity: ExecutionTimelineSeverity } {
  const delta = params.playbookDelta;
  const pnl = params.pnlUsdt;
  const ctx = params.contextAtExit ?? params.contextAtEntry;
  const pb = params.playbookAtExit ?? params.playbookAtEntry ?? params.playbookMatch;

  if (params.status === "open") {
    if (params.source === "bingx") {
      return {
        severity: "neutral",
        message: "Open read-only position — final diagnosis pending exit.",
      };
    }
    return {
      severity: "neutral",
      message: "Position still open — final diagnosis pending exit.",
    };
  }

  if (!ctx) {
    return {
      severity: "neutral",
      message: "Insufficient context for final diagnosis.",
    };
  }

  const alignment = ctx.diagnostics?.contextAlignment ?? "unknown";

  if (delta?.status === "invalidated") {
    return {
      severity: "danger",
      message: "Playbook invalidated before exit; thesis failed.",
    };
  }
  if (delta?.status === "weakened" || delta?.exitQuality === "late_exit") {
    return {
      severity: "warning",
      message: "Playbook weakened into exit; timing or context deteriorated.",
    };
  }
  if (
    (delta?.status === "held" || delta?.status === "improved") &&
    pnl != null &&
    pnl >= 0
  ) {
    return {
      severity: "positive",
      message: `Trade followed playbook; exit ${alignment} · ${fmtPnl(pnl)}.`,
    };
  }
  if (delta?.exitQuality === "good_exit") {
    return {
      severity: "positive",
      message: "Coherent exit relative to entry playbook and context.",
    };
  }
  if (isNoMatch(pb)) {
    return {
      severity: "neutral",
      message: `No institutional playbook match; context ${alignment}.`,
    };
  }

  const p = primaryPlaybook(pb);
  return {
    severity: pnl != null && pnl < 0 ? "warning" : "info",
    message: `${p?.name ?? "Playbook"} · context ${alignment} · ${fmtPnl(pnl)}.`,
  };
}

export function buildExecutionTimelineReplay(
  params: BuildExecutionTimelineParams,
): ExecutionTimelineReplay {
  const prefix = params.tradeId ?? "trade";
  let seq = 0;
  const events: ExecutionTimelineEvent[] = [];
  const push = (e: Omit<ExecutionTimelineEvent, "id">) => {
    events.push({ id: `${prefix}-tl-${seq++}`, ...e });
  };

  const sourceLabel = params.source === "bingx" ? "BingX read-only" : "Paper";
  const sideLabel = params.side === "short" ? "Short" : "Long";
  const isOpen = params.status === "open";
  const isClosed =
    params.status === "closed" || params.status === "partial";
  const cancelled =
    params.status === "cancelled" || params.status === "rejected";

  const ctxEntry = params.contextAtEntry;
  const ctxExit = params.contextAtExit;
  const pbEntry = params.playbookAtEntry ?? params.playbookMatch;
  const pbExit = params.playbookAtExit;
  const delta = params.playbookDelta;

  const entryTs =
    parseTimestamp(params.entryTime) ?? ctxEntry?.timestamp;
  const exitTs =
    parseTimestamp(params.exitTime) ?? ctxExit?.timestamp;

  const hasUsableContext = Boolean(
    ctxEntry &&
      ctxEntry.risk &&
      ctxEntry.diagnostics &&
      !(ctxEntry.diagnostics.warnings ?? []).some((w) =>
        w.toLowerCase().includes("context unavailable"),
      ),
  );

  if (!params.entryPrice && !hasUsableContext) {
    return {
      status: "unavailable",
      summary: buildTimelineSummary(params),
      events: [],
    };
  }

  if (cancelled) {
    push({
      type: "entry",
      severity: "neutral",
      title: "ENTRY",
      message: `${sideLabel} · ${params.status} · ${sourceLabel}`,
      timestamp: entryTs,
    });
    push({
      type: "diagnosis",
      severity: "neutral",
      title: "DIAGNOSIS",
      message: `Trade ${params.status}; timeline replay not applicable.`,
      timestamp: exitTs ?? entryTs,
    });
    return {
      status: "partial",
      summary: buildTimelineSummary(params),
      events,
    };
  }

  if (params.entryPrice != null) {
    push({
      type: "entry",
      severity: "info",
      title: "ENTRY",
      message: `${sideLabel} @ ${fmtPrice(params.entryPrice)} · ${sourceLabel}`,
      timestamp: entryTs,
      metadata: { price: params.entryPrice },
    });
  }

  if (hasUsableContext && ctxEntry) {
    const risk = ctxEntry.risk;
    const regime = gammaRegimeLabel(ctxEntry.gamma?.regime);
    const flip =
      ctxEntry.gamma?.flip != null
        ? ` · Flip ${fmtPrice(ctxEntry.gamma.flip)}`
        : "";
    const slBit = risk.stopLossDetected ? "SL detected" : "No SL";
    const tpBit = risk.takeProfitDetected ? "TP on" : "TP no";
    const rm = risk.riskMirrorStatus ?? "unknown";
    const warnCtx = (ctxEntry.diagnostics?.warnings ?? []).some((w) =>
      w.toLowerCase().includes("unavailable"),
    );

    push({
      type: "context_captured",
      severity: warnCtx
        ? "warning"
        : risk.riskMirrorStatus === "danger"
          ? "danger"
          : risk.riskMirrorStatus === "conflicted"
            ? "warning"
            : "info",
      title: "CONTEXT",
      message: `${regime}${flip} · Risk Mirror ${rm} · ${slBit} · ${tpBit}`,
      timestamp: ctxEntry.timestamp ?? entryTs,
      metadata: {
        riskStatus: rm,
        contextAlignment: ctxEntry.diagnostics?.contextAlignment,
        stopLossDetected: risk.stopLossDetected,
        takeProfitDetected: risk.takeProfitDetected,
      },
    });
  } else {
    push({
      type: "context_captured",
      severity: "neutral",
      title: "CONTEXT",
      message: "Context not captured for this trade.",
      timestamp: entryTs,
    });
  }

  const pEntry = primaryPlaybook(pbEntry);
  if (pEntry && !isNoMatch(pbEntry)) {
    push({
      type: "playbook_detected",
      severity: playbookSeverity(pbEntry),
      title: "PLAYBOOK",
      message: `${pEntry.name} · ${pEntry.confidence}% · ${pEntry.status}`,
      timestamp: ctxEntry?.timestamp ?? entryTs,
      metadata: {
        playbook: pEntry.name,
        confidence: pEntry.confidence,
      },
    });
  } else if (pbEntry) {
    push({
      type: "playbook_detected",
      severity: "neutral",
      title: "PLAYBOOK",
      message: "No Playbook Match",
      timestamp: entryTs,
      metadata: { playbook: "no_match", confidence: 0 },
    });
  } else if (hasUsableContext) {
    push({
      type: "playbook_detected",
      severity: "neutral",
      title: "PLAYBOOK",
      message: "Playbook not captured",
      timestamp: entryTs,
    });
  }

  const riskCtx = ctxEntry ?? ctxExit;
  if (riskCtx?.risk) {
    const r = riskCtx.risk;
    const parts: string[] = [];
    parts.push(r.stopLossDetected ? "SL detected" : "SL no");
    parts.push(r.takeProfitDetected ? "TP yes" : "TP no");
    parts.push(`Risk ${r.riskMirrorStatus ?? "unknown"}`);
    if (r.estimatedLossUsdt != null && r.estimatedLossUsdt > 0) {
      parts.push(`Est. loss ${fmtPnl(-Math.abs(r.estimatedLossUsdt))}`);
    }
    if (r.estimatedGainUsdt != null && r.estimatedGainUsdt > 0) {
      parts.push(`Est. gain ${fmtPnl(r.estimatedGainUsdt)}`);
    }
    if (r.distanceToLiquidationPct != null) {
      parts.push(`Liq dist ${r.distanceToLiquidationPct.toFixed(1)}%`);
    }

    push({
      type: "risk_update",
      severity: riskSeverity(riskCtx),
      title: "RISK",
      message: parts.join(" · "),
      timestamp: riskCtx.timestamp ?? entryTs,
      metadata: {
        stopLossDetected: r.stopLossDetected,
        takeProfitDetected: r.takeProfitDetected,
        riskStatus: r.riskMirrorStatus,
        accountPct: r.estimatedLossAccountPct ?? r.estimatedGainAccountPct,
      },
    });
  }

  if (
    isClosed &&
    ctxExit?.risk &&
    ctxEntry?.risk &&
    (ctxExit.risk.stopLossPrice !== ctxEntry.risk.stopLossPrice ||
      ctxExit.risk.takeProfitPrice !== ctxEntry.risk.takeProfitPrice)
  ) {
    push({
      type: "sl_tp_update",
      severity: "info",
      title: "SL/TP",
      message: `Exit protection · SL ${ctxExit.risk.stopLossDetected ? "on" : "off"} · TP ${ctxExit.risk.takeProfitDetected ? "on" : "off"}`,
      timestamp: exitTs ?? ctxExit.timestamp,
      metadata: {
        stopLossDetected: ctxExit.risk.stopLossDetected,
        takeProfitDetected: ctxExit.risk.takeProfitDetected,
      },
    });
  }

  if (isOpen) {
    push({
      type: "exit",
      severity: "neutral",
      title: "EXIT",
      message:
        params.source === "bingx"
          ? "Position still open · exit replay unavailable"
          : "Position still open",
      timestamp: Date.now(),
      metadata: {
        pnlUsdt: params.pnlUsdt ?? undefined,
        accountPct: params.accountPct ?? undefined,
      },
    });
  } else if (isClosed && params.exitPrice != null) {
    push({
      type: "exit",
      severity:
        params.pnlUsdt != null && params.pnlUsdt < 0
          ? "warning"
          : params.pnlUsdt != null && params.pnlUsdt > 0
            ? "positive"
            : "info",
      title: "EXIT",
      message: `Closed @ ${fmtPrice(params.exitPrice)} · ${fmtPnl(params.pnlUsdt)}`,
      timestamp: exitTs,
      metadata: {
        price: params.exitPrice,
        pnlUsdt: params.pnlUsdt ?? undefined,
        accountPct: params.accountPct ?? undefined,
      },
    });
  } else if (isClosed) {
    push({
      type: "exit",
      severity: "info",
      title: "EXIT",
      message: `Closed · ${fmtPnl(params.pnlUsdt)}`,
      timestamp: exitTs,
      metadata: { pnlUsdt: params.pnlUsdt ?? undefined },
    });
  }

  if (delta) {
    const deltaMsg = `${delta.status.toUpperCase()} · ${delta.exitQuality.replace(/_/g, " ")}`;
    const conf =
      delta.entryConfidence != null
        ? ` · ${delta.entryConfidence}% entry`
        : "";
    push({
      type: "playbook_delta",
      severity: deltaSeverity(delta, params.pnlUsdt),
      title: "DELTA",
      message: `${deltaMsg}${conf}`,
      timestamp: exitTs ?? entryTs,
      metadata: {
        deltaStatus: delta.status,
        exitQuality: delta.exitQuality,
        confidence: delta.exitConfidence ?? delta.entryConfidence,
      },
    });
  } else if (isOpen) {
    push({
      type: "playbook_delta",
      severity: "neutral",
      title: "DELTA",
      message: "Exit delta unavailable",
      timestamp: entryTs,
    });
  }

  const diag = buildDiagnosisMessage(params);
  push({
    type: "diagnosis",
    severity: diag.severity,
    title: "DIAGNOSIS",
    message: diag.message,
    timestamp: exitTs ?? entryTs ?? Date.now(),
  });

  let status: ExecutionTimelineReplay["status"] = "available";
  if (!hasUsableContext && params.entryPrice == null) {
    status = "unavailable";
  } else if (!hasUsableContext) {
    status = "partial";
  } else if (isOpen) {
    status = "partial";
  } else if (isClosed && hasUsableContext) {
    status = "available";
  }

  if (events.length === 0) {
    status = "unavailable";
  }

  return {
    status,
    summary: buildTimelineSummary(params),
    events,
  };
}
