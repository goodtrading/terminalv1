import type { PlaybookMatchResult } from "./playbookMatchTypes";
import type { ExecutionContextSnapshot } from "./executionContextTypes";
import type { PlaybookEntryExitDelta } from "./playbookDeltaTypes";

/** Adjust execution quality score using playbook match + context. */
export function applyPlaybookToExecutionScore(
  score: number,
  playbook: PlaybookMatchResult | undefined,
  context: ExecutionContextSnapshot | undefined,
): number {
  let s = score;
  const primary = playbook?.primary;

  if (primary && primary.id !== "no_match") {
    if (primary.confidence >= 70 && primary.status === "matched") s += 10;
    else if (primary.confidence >= 55) s += 4;
    else if (primary.confidence < 40) s -= 8;
    if (primary.invalidations.length >= 2) s -= 10;
    if (primary.tags.includes("impulsive")) s -= 12;
    if (primary.tags.includes("structural")) s += 6;
  } else {
    s -= 6;
  }

  if (context) {
    if (context.risk.stopLossDetected) s += 4;
    else s -= 10;
    if (context.diagnostics.contextAlignment === "aligned") s += 5;
    if (context.risk.riskMirrorStatus === "danger") s -= 14;
  }

  return Math.max(0, Math.min(100, Math.round(s)));
}

/** Adjust score using entry/exit playbook delta (closed trades). */
export function applyPlaybookDeltaToExecutionScore(
  score: number,
  delta: PlaybookEntryExitDelta | undefined,
  pnlUsdt?: number,
): number {
  if (!delta || delta.status === "unknown") return score;

  let s = score;

  if (delta.status === "held" && pnlUsdt != null && pnlUsdt > 0) {
    s += 8;
  }

  if (delta.exitQuality === "good_exit") {
    s += 10;
  }

  if (delta.exitQuality === "forced_exit") {
    s += 4;
  }

  if (delta.status === "invalidated" && delta.exitQuality === "late_exit") {
    s -= 18;
  }

  if (delta.exitQuality === "unjustified_hold") {
    s -= 14;
  }

  if (
    (delta.status === "held" || delta.status === "improved") &&
    delta.exitQuality === "early_exit"
  ) {
    s -= 8;
  }

  if (
    delta.confidenceDelta != null &&
    delta.confidenceDelta <= -35 &&
    delta.exitQuality === "late_exit"
  ) {
    s -= 12;
  }

  if (delta.status === "improved" && delta.exitQuality === "early_exit") {
    s -= 4;
  }

  return Math.max(0, Math.min(100, Math.round(s)));
}
