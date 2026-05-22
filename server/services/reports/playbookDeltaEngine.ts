import type { ExecutionContextSnapshot } from "./executionContextTypes";
import type { PlaybookMatchResult } from "./playbookMatchTypes";
import type {
  ExitQuality,
  PlaybookDeltaStatus,
  PlaybookEntryExitDelta,
} from "./playbookDeltaTypes";

function primaryConf(pb?: PlaybookMatchResult): number | undefined {
  const c = pb?.primary?.confidence;
  return c != null && Number.isFinite(c) ? c : undefined;
}

function primaryName(pb?: PlaybookMatchResult): string | undefined {
  return pb?.primary?.name;
}

function primaryId(pb?: PlaybookMatchResult): string | undefined {
  return pb?.primary?.id;
}

function isNoMatch(pb?: PlaybookMatchResult): boolean {
  const p = pb?.primary;
  return !p || p.id === "no_match" || p.status === "no_match";
}

function rmStatus(ctx?: ExecutionContextSnapshot): string | undefined {
  return ctx?.risk.riskMirrorStatus;
}

function alignment(ctx?: ExecutionContextSnapshot): string | undefined {
  return ctx?.diagnostics.contextAlignment;
}

function compareContextDeltas(
  entry?: ExecutionContextSnapshot,
  exit?: ExecutionContextSnapshot,
): string[] {
  const reasons: string[] = [];
  if (!entry || !exit) return reasons;

  if (entry.gamma.regime !== exit.gamma.regime && exit.gamma.regime) {
    reasons.push(
      `Gamma regime changed from ${entry.gamma.regime ?? "unknown"} to ${exit.gamma.regime}.`,
    );
  }

  const entryRm = rmStatus(entry);
  const exitRm = rmStatus(exit);
  if (entryRm && exitRm && entryRm !== exitRm) {
    reasons.push(`Risk Mirror changed from ${entryRm} to ${exitRm}.`);
  }

  if (entry.risk.stopLossDetected !== exit.risk.stopLossDetected) {
    reasons.push(
      exit.risk.stopLossDetected
        ? "Stop-loss detected at exit."
        : "Stop-loss no longer detected at exit.",
    );
  }

  if (entry.market.marketDataHealth !== exit.market.marketDataHealth && exit.market.marketDataHealth) {
    reasons.push(
      `Market data health: ${entry.market.marketDataHealth ?? "unknown"} → ${exit.market.marketDataHealth}.`,
    );
  }

  const entryAlign = alignment(entry);
  const exitAlign = alignment(exit);
  if (entryAlign && exitAlign && entryAlign !== exitAlign) {
    reasons.push(`Context alignment: ${entryAlign} → ${exitAlign}.`);
  }

  const entryLiq = entry.liquidity.nearestMagnet?.price;
  const exitLiq = exit.liquidity.nearestMagnet?.price;
  if (
    entryLiq != null &&
    exitLiq != null &&
    Math.abs(entryLiq - exitLiq) / Math.max(entryLiq, 1) > 0.002
  ) {
    reasons.push("Nearest liquidity magnet shifted at exit.");
  }

  const entryLiqDist = entry.risk.distanceToLiquidationPct;
  const exitLiqDist = exit.risk.distanceToLiquidationPct;
  if (
    entryLiqDist != null &&
    exitLiqDist != null &&
    exitLiqDist < entryLiqDist - 2
  ) {
    reasons.push("Distance to liquidation worsened at exit.");
  }

  return reasons;
}

function inferDeltaStatus(
  entryPb?: PlaybookMatchResult,
  exitPb?: PlaybookMatchResult,
  confidenceDelta: number | undefined,
): PlaybookDeltaStatus {
  const entryId = primaryId(entryPb);
  const exitId = primaryId(exitPb);
  const entryConf = primaryConf(entryPb) ?? 0;
  const exitConf = primaryConf(exitPb) ?? 0;

  if (!entryPb || isNoMatch(entryPb)) return "unknown";

  if (
    entryConf >= 70 &&
    (isNoMatch(exitPb) ||
      exitConf <= 35 ||
      exitPb?.primary.status === "no_match" ||
      exitPb?.primary.id === "no_match")
  ) {
    return "invalidated";
  }

  if (entryId && exitId && entryId !== exitId) {
    return "changed";
  }

  if (
    entryPb.primary.status === "partial" &&
    exitPb &&
    exitPb.primary.status === "matched" &&
    (confidenceDelta ?? 0) >= 15
  ) {
    return "improved";
  }

  if ((confidenceDelta ?? 0) <= -35) return "invalidated";
  if ((confidenceDelta ?? 0) <= -15) return "weakened";
  if ((confidenceDelta ?? 0) >= 15 && exitConf > entryConf) return "improved";

  if (entryId && exitId && entryId === exitId) {
    return "held";
  }

  if (exitPb && !isNoMatch(exitPb)) return "weakened";

  return "unknown";
}

function inferExitQuality(
  status: PlaybookDeltaStatus,
  params: {
    pnlUsdt?: number;
    rMultiple?: number | null;
    contextAtEntry?: ExecutionContextSnapshot;
    contextAtExit?: ExecutionContextSnapshot;
    playbookAtEntry?: PlaybookMatchResult;
    playbookAtExit?: PlaybookMatchResult;
    tradeStatus?: string;
  },
): ExitQuality {
  const { pnlUsdt, contextAtEntry, contextAtExit, playbookAtEntry, tradeStatus } =
    params;

  if (tradeStatus === "open") {
    const entryInv =
      playbookAtEntry &&
      !isNoMatch(playbookAtEntry) &&
      contextAtExit &&
      (contextAtExit.risk.riskMirrorStatus === "danger" ||
        contextAtExit.diagnostics.contextAlignment === "danger");
    if (entryInv) return "unjustified_hold";
    return "unknown";
  }

  const slAtExit = contextAtExit?.risk.stopLossDetected;
  const slAtEntry = contextAtEntry?.risk.stopLossDetected;
  if (
    slAtExit &&
    pnlUsdt != null &&
    pnlUsdt < 0 &&
    (slAtEntry || contextAtExit?.risk.stopLossPrice != null)
  ) {
    return "forced_exit";
  }

  if (status === "invalidated") {
    if (pnlUsdt != null && pnlUsdt < 0) return "late_exit";
    return "good_exit";
  }

  const exitRm = rmStatus(contextAtExit);
  const entryRm = rmStatus(contextAtEntry);
  if (
    (exitRm === "danger" || exitRm === "conflicted") &&
    pnlUsdt != null &&
    pnlUsdt <= 0
  ) {
    return status === "invalidated" ? "late_exit" : "good_exit";
  }

  if (
    (status === "held" || status === "improved") &&
    pnlUsdt != null &&
    Math.abs(pnlUsdt) < 30 &&
    (pnlUsdt <= 0 || (params.rMultiple != null && params.rMultiple < 0.5))
  ) {
    return "early_exit";
  }

  if (status === "weakened" && pnlUsdt != null && pnlUsdt > 0) {
    return "good_exit";
  }

  if (status === "held" && pnlUsdt != null && pnlUsdt > 0) {
    return "good_exit";
  }

  if (
    status === "invalidated" &&
    entryRm !== "danger" &&
    exitRm === "danger"
  ) {
    return "late_exit";
  }

  if (pnlUsdt != null && pnlUsdt < 0 && status === "weakened") {
    return "late_exit";
  }

  return "unknown";
}

function buildSummary(
  status: PlaybookDeltaStatus,
  exitQuality: ExitQuality,
  confidenceDelta: number | undefined,
  entryName?: string,
): string {
  const confStr =
    confidenceDelta != null
      ? ` (${confidenceDelta >= 0 ? "+" : ""}${confidenceDelta} pts confidence)`
      : "";

  switch (status) {
    case "held":
      return `Original playbook${entryName ? ` (${entryName})` : ""} remained valid into exit${confStr}.`;
    case "weakened":
      return `Playbook weakened before/during exit; review whether exit timing matched context${confStr}.`;
    case "invalidated":
      if (exitQuality === "late_exit") {
        return "Playbook invalidated before exit; trade may have been held too long.";
      }
      if (exitQuality === "good_exit") {
        return "Playbook invalidated; exit aligned with deteriorating context.";
      }
      return "Entry playbook no longer valid at exit.";
    case "improved":
      if (exitQuality === "early_exit") {
        return "Context improved after entry; exit may have been early.";
      }
      return `Context improved into exit${confStr}.`;
    case "changed":
      return "Exit playbook differs from entry — thesis changed during the trade.";
    default:
      if (exitQuality === "unknown") {
        return "Exit delta unavailable.";
      }
      return "Insufficient entry/exit playbook data for delta.";
  }
}

export function computePlaybookEntryExitDelta(params: {
  status: "open" | "closed";
  source?: "paper" | "bingx";
  playbookAtEntry?: PlaybookMatchResult;
  playbookAtExit?: PlaybookMatchResult;
  contextAtEntry?: ExecutionContextSnapshot;
  contextAtExit?: ExecutionContextSnapshot;
  pnlUsdt?: number;
  rMultiple?: number | null;
  tradeStatus?: string;
}): PlaybookEntryExitDelta {
  try {
    return computePlaybookEntryExitDeltaInner(params);
  } catch (err) {
    console.warn(
      "[playbook-delta] compute failed",
      err instanceof Error ? err.message : err,
    );
    return {
      status: "unknown",
      exitQuality: "unknown",
      reasons: [],
      warnings: ["Playbook delta unavailable."],
      summary: "Playbook delta unavailable.",
    };
  }
}

function computePlaybookEntryExitDeltaInner(params: {
  playbookAtEntry?: PlaybookMatchResult;
  playbookAtExit?: PlaybookMatchResult;
  contextAtEntry?: ExecutionContextSnapshot;
  contextAtExit?: ExecutionContextSnapshot;
  pnlUsdt?: number;
  rMultiple?: number | null;
  status?: "open" | "closed" | "partial" | "cancelled" | "rejected";
  source?: "paper" | "bingx";
}): PlaybookEntryExitDelta {
  const warnings: string[] = [];
  const reasons: string[] = [];

  if (params.status === "open") {
    if (params.source === "bingx") {
      return {
        status: "unknown",
        exitQuality: "unknown",
        entryPlaybookName: primaryName(params.playbookAtEntry),
        entryConfidence: primaryConf(params.playbookAtEntry),
        reasons: [],
        warnings: [],
        summary: "Real BingX position is open. Exit delta unavailable.",
      };
    }
    return {
      status: "unknown",
      exitQuality: "unknown",
      entryPlaybookName: primaryName(params.playbookAtEntry),
      entryConfidence: primaryConf(params.playbookAtEntry),
      reasons: [],
      warnings: [],
      summary: "Trade is still open or exit context is unavailable.",
    };
  }

  if (params.status !== "closed" && params.status !== "partial") {
    return {
      status: "unknown",
      exitQuality: "unknown",
      reasons: [],
      warnings: [],
      summary: "Exit delta unavailable for this trade status.",
    };
  }

  if (!params.contextAtExit && !params.playbookAtExit) {
    warnings.push("Exit context unavailable.");
    return {
      status: "unknown",
      exitQuality: "unknown",
      entryPlaybookName: primaryName(params.playbookAtEntry),
      entryConfidence: primaryConf(params.playbookAtEntry),
      reasons: [],
      warnings,
      summary: "Exit delta unavailable.",
    };
  }

  if (!params.playbookAtEntry && !params.contextAtEntry) {
    warnings.push("Entry playbook unavailable.");
    return {
      status: "unknown",
      exitQuality: "unknown",
      exitPlaybookName: primaryName(params.playbookAtExit),
      exitConfidence: primaryConf(params.playbookAtExit),
      reasons: [],
      warnings,
      summary: "Entry playbook unavailable.",
    };
  }

  const entryConf = primaryConf(params.playbookAtEntry);
  const exitConf = primaryConf(params.playbookAtExit);
  const confidenceDelta =
    entryConf != null && exitConf != null ? exitConf - entryConf : undefined;

  if (confidenceDelta != null) {
    reasons.push(
      `Playbook confidence ${entryConf}% → ${exitConf}% (${confidenceDelta >= 0 ? "+" : ""}${confidenceDelta}).`,
    );
  }

  const entryAlign = alignment(params.contextAtEntry);
  const exitAlign = alignment(params.contextAtExit);
  const contextAlignmentDelta = {
    entry: entryAlign,
    exit: exitAlign,
    changed: Boolean(entryAlign && exitAlign && entryAlign !== exitAlign),
  };

  const entryRm = rmStatus(params.contextAtEntry);
  const exitRm = rmStatus(params.contextAtExit);
  const riskDelta = {
    entryRisk: entryRm,
    exitRisk: exitRm,
    worsened: Boolean(
      entryRm &&
        exitRm &&
        (entryRm === "aligned" || entryRm === "neutral") &&
        (exitRm === "conflicted" || exitRm === "danger"),
    ),
    improved: Boolean(
      entryRm &&
        exitRm &&
        (entryRm === "conflicted" || entryRm === "danger") &&
        (exitRm === "aligned" || exitRm === "neutral"),
    ),
  };

  if (riskDelta.worsened) {
    reasons.push(`Risk Mirror worsened (${entryRm} → ${exitRm}).`);
  }
  if (riskDelta.improved) {
    reasons.push(`Risk Mirror improved (${entryRm} → ${exitRm}).`);
  }

  reasons.push(...compareContextDeltas(params.contextAtEntry, params.contextAtExit));

  if (
    params.contextAtExit?.diagnostics.warnings.some((w) =>
      w.toLowerCase().includes("resistance"),
    ) ||
    params.contextAtExit?.diagnostics.warnings.some((w) =>
      w.toLowerCase().includes("support"),
    )
  ) {
    reasons.push("Exit context flagged nearby structural level.");
  }

  const status = inferDeltaStatus(
    params.playbookAtEntry,
    params.playbookAtExit,
    confidenceDelta,
  );

  const exitQuality = inferExitQuality(status, {
    ...params,
    tradeStatus: params.status,
  });

  if (status === "held" && params.contextAtExit) {
    const stillSupported =
      !isNoMatch(params.playbookAtExit) &&
      (confidenceDelta ?? 0) >= -14;
    if (stillSupported) {
      reasons.push("Exit context still supported original playbook.");
    }
  }

  if (status === "invalidated") {
    reasons.push("Trade closed after playbook invalidation.");
  }

  const summary = buildSummary(
    status,
    exitQuality,
    confidenceDelta,
    primaryName(params.playbookAtEntry),
  );

  return {
    status,
    exitQuality,
    entryPlaybookName: primaryName(params.playbookAtEntry),
    exitPlaybookName: primaryName(params.playbookAtExit),
    entryConfidence: entryConf,
    exitConfidence: exitConf,
    confidenceDelta,
    contextAlignmentDelta,
    riskDelta,
    reasons: reasons.slice(0, 8),
    warnings: warnings.slice(0, 4),
    summary,
  };
}

/** Delta for open positions (exit not available yet). */
export function computeOpenPositionPlaybookDelta(params: {
  playbookAtEntry?: PlaybookMatchResult;
  contextAtEntry?: ExecutionContextSnapshot;
  source?: "paper" | "bingx";
}): PlaybookEntryExitDelta {
  return computePlaybookEntryExitDelta({
    status: "open",
    source: params.source,
    playbookAtEntry: params.playbookAtEntry,
    contextAtEntry: params.contextAtEntry,
  });
}
