/**
 * Phase 4.5 — conflict resolution across candle vol, gamma, and liquidity layers.
 */

import type {
  VolatilityEngineOutput,
  VolTradeQuality,
  VolEngineAction,
  LiquidityContextInput,
  OrderflowConfirmationLevel,
  SignalAlignment,
  ResolutionState,
  ExecutionBias,
} from "@/lib/volatilityEngine";
import type { GammaInterpretationBundle } from "@/lib/volatilityGammaInterpretation";

export type ConflictResolutionInput = {
  liquidity?: LiquidityContextInput;
  gamma?: GammaInterpretationBundle;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function tradeQualityFromScore(score: number): VolTradeQuality {
  if (score <= 25) return "NO TRADE";
  if (score <= 45) return "LOW";
  if (score <= 70) return "GOOD";
  return "EXCELLENT";
}

function confirmMeets(
  level: OrderflowConfirmationLevel | undefined,
  min: OrderflowConfirmationLevel,
): boolean {
  const rank: Record<OrderflowConfirmationLevel, number> = {
    NONE: 0,
    WEAK: 1,
    MODERATE: 2,
    STRONG: 3,
  };
  return rank[level ?? "NONE"] >= rank[min];
}

function displayEnum(s: string): string {
  return s.replace(/_/g, " ");
}

type ConflictScan = {
  conflictReasons: string[];
  primaryConflict: string;
  signalAlignment: SignalAlignment;
  resolutionState: ResolutionState;
  resolutionHint: string;
  executionBias: ExecutionBias;
  cleanContinuation: boolean;
  cleanSide: "UP" | "DOWN" | null;
};

function scanConflicts(
  output: VolatilityEngineOutput,
  input: ConflictResolutionInput,
): ConflictScan {
  const reasons: string[] = [];
  const ctx = input.liquidity;
  const gamma = input.gamma;
  const dir = output.directionalPressure;
  const hp = ctx?.heatmapPressure ?? "UNKNOWN";
  const abs = ctx?.absorption;
  const sweep = ctx?.sweep;
  const wall = ctx?.nearestWall;

  const isDown = dir === "DOWNSIDE";
  const isUp = dir === "UPSIDE";
  const isTwoSided = dir === "TWO-SIDED" || dir === "NEUTRAL";

  // A) Directional vs heatmap
  if (isDown && hp === "UPSIDE") {
    reasons.push("Heatmap pressure conflicts with downside candle pressure.");
  }
  if (isUp && hp === "DOWNSIDE") {
    reasons.push("Heatmap pressure conflicts with upside candle pressure.");
  }

  // B) Absorption conflict
  const absSide = abs?.side;
  const absActive = abs?.detected === true || absSide === "BID" || absSide === "ASK";
  if (isDown && absSide === "BID") {
    reasons.push("Bid absorption can stall downside continuation.");
  }
  if (isUp && absSide === "ASK") {
    reasons.push("Ask absorption can stall upside continuation.");
  }
  if (absActive && absSide === "BOTH") {
    reasons.push("Two-sided absorption degrades continuation quality.");
  }

  // C) Gamma flip / fakeout
  const nearFlip =
    gamma?.nearFlip ||
    gamma?.gammaRegime === "NEAR_FLIP" ||
    output.gammaRegimeClass === "NEAR_FLIP";
  const fakeoutGamma =
    gamma?.gammaVolImpact?.includes("FAKEOUT") ||
    output.gammaVolImpact?.includes("FAKEOUT") ||
    gamma?.gammaRegime === "MIXED";
  if (nearFlip || fakeoutGamma) {
    reasons.push("Gamma transition zone increases first-break failure risk.");
  }

  // D) Exhausted move
  if (output.volState === "EXHAUSTED" || output.moveUsed > 80) {
    reasons.push("Most of expected move is already consumed.");
  }

  // E) Sweep setup — handled in resolution, may add reason
  const sweepSetup = sweep?.status === "SETUP";
  if (sweepSetup && sweep?.direction === "DOWN" && isDown && absSide === "BID") {
    reasons.push("Downside sweep setup into bid absorption — resolution required.");
  }
  if (sweepSetup && sweep?.direction === "UP" && isUp && absSide === "ASK") {
    reasons.push("Upside sweep setup into ask absorption — resolution required.");
  }

  // F) Liquidity wall
  if (wall?.side === "BID" && isDown) {
    reasons.push("Downside continuation needs acceptance below bid wall.");
  }
  if (wall?.side === "ASK" && isUp) {
    reasons.push("Upside continuation needs acceptance above ask wall.");
  }

  // G) Clean continuation check
  const trigger = output.triggerConfirmation;
  let cleanSide: "UP" | "DOWN" | null = null;
  if (
    isUp &&
    hp === "UPSIDE" &&
    absSide !== "ASK" &&
    !nearFlip &&
    output.moveUsed < 80 &&
    confirmMeets(trigger?.upside, "MODERATE")
  ) {
    cleanSide = "UP";
  }
  if (
    isDown &&
    hp === "DOWNSIDE" &&
    absSide !== "BID" &&
    !nearFlip &&
    output.moveUsed < 80 &&
    confirmMeets(trigger?.downside, "MODERATE")
  ) {
    cleanSide = "DOWN";
  }
  const cleanContinuation = cleanSide != null && reasons.length === 0;

  // Signal alignment from conflict count
  let signalAlignment: SignalAlignment = "UNKNOWN";
  if (reasons.length === 0 && cleanContinuation) signalAlignment = "ALIGNED";
  else if (reasons.length === 0 && (isUp || isDown)) signalAlignment = "PARTIALLY_ALIGNED";
  else if (reasons.length >= 3) signalAlignment = "STRONGLY_CONFLICTED";
  else if (reasons.length >= 1) signalAlignment = "CONFLICTED";

  if (isTwoSided && reasons.length >= 2) signalAlignment = "STRONGLY_CONFLICTED";

  // Resolution state (priority order)
  let resolutionState: ResolutionState = "UNKNOWN";
  let resolutionHint = "";

  if (sweepSetup) {
    resolutionState = "WAIT_SWEEP_RESOLUTION";
    if (sweep?.direction === "DOWN") {
      resolutionHint =
        "Wait for downside sweep resolution: reclaim favors reversal, acceptance below wall favors continuation.";
    } else if (sweep?.direction === "UP") {
      resolutionHint =
        "Wait for upside sweep resolution: reclaim favors reversal, acceptance above wall favors continuation.";
    } else {
      resolutionHint = "Wait for sweep resolution before committing directional bias.";
    }
  }

  const absorptionReversal =
    (isDown && absSide === "BID" && (absActive || output.liquidityRegime === "ABSORPTION_ACTIVE")) ||
    (isUp && absSide === "ASK" && (absActive || output.liquidityRegime === "ABSORPTION_ACTIVE")) ||
    (output.volState === "EXHAUSTED" && output.liquidityRegime === "ABSORPTION_ACTIVE");

  if (absorptionReversal && resolutionState === "UNKNOWN") {
    resolutionState = "ABSORPTION_REVERSAL_RISK";
    resolutionHint =
      "Reclaim favors reversal; failed continuation or trap below/above wall favors resumption.";
  }

  if ((nearFlip || fakeoutGamma) && signalAlignment !== "ALIGNED" && resolutionState === "UNKNOWN") {
    resolutionState = "FAKEOUT_RISK";
    resolutionHint = "First break risk is elevated — wait for acceptance or sweep reclaim.";
  }

  if (cleanContinuation && resolutionState === "UNKNOWN") {
    resolutionState = "CLEAN_CONTINUATION";
    resolutionHint =
      cleanSide === "DOWN"
        ? "Heatmap, trigger confirmation and liquidity path align with downside continuation."
        : "Heatmap, trigger confirmation and liquidity path align with upside continuation.";
  }

  if (
    (isDown || isUp) &&
    reasons.length > 0 &&
    resolutionState === "UNKNOWN"
  ) {
    resolutionState = "CONFLICTED_CONTINUATION";
    resolutionHint = buildConflictedHint(isDown, isUp, reasons);
  }

  const wallBlocks =
    (wall?.side === "BID" && isDown && !confirmMeets(trigger?.downside, "MODERATE")) ||
    (wall?.side === "ASK" && isUp && !confirmMeets(trigger?.upside, "MODERATE"));
  if (wallBlocks && resolutionState === "UNKNOWN") {
    resolutionState = "WAIT_ACCEPTANCE";
    resolutionHint =
      wall?.side === "BID"
        ? "Acceptance below the bid wall is required before downside execution."
        : "Acceptance above the ask wall is required before upside execution.";
  }

  if (
    signalAlignment === "STRONGLY_CONFLICTED" &&
    (isTwoSided || output.volState === "COMPRESSED" || output.tradeQuality === "NO TRADE")
  ) {
    resolutionState = "CHOP_NO_TRADE";
    resolutionHint =
      "Gamma transition, mixed liquidity and poor trade quality require resolution before entry.";
  }

  if (resolutionState === "UNKNOWN" && reasons.length > 0) {
    resolutionState = "CONFLICTED_CONTINUATION";
    resolutionHint = buildConflictedHint(isDown, isUp, reasons);
  }

  // Execution bias
  let executionBias: ExecutionBias = "CONFLICTED";
  if (signalAlignment === "STRONGLY_CONFLICTED") {
    executionBias = "NO_TRADE";
  } else if (signalAlignment === "CONFLICTED") {
    executionBias = "CONFLICTED";
  } else if (resolutionState === "CLEAN_CONTINUATION" && cleanSide === "DOWN") {
    executionBias = "SHORT";
  } else if (resolutionState === "CLEAN_CONTINUATION" && cleanSide === "UP") {
    executionBias = "LONG";
  } else if (nearFlip || isTwoSided) {
    executionBias =
      output.tradeQuality === "NO TRADE" || output.tradeQuality === "LOW"
        ? "NO_TRADE"
        : "TWO_SIDED";
  } else if (resolutionState === "CHOP_NO_TRADE" || resolutionState === "WAIT_SWEEP_RESOLUTION") {
    executionBias = "NO_TRADE";
  } else if (isDown && signalAlignment === "PARTIALLY_ALIGNED") {
    executionBias = "CONFLICTED";
  } else if (isUp && signalAlignment === "PARTIALLY_ALIGNED") {
    executionBias = "CONFLICTED";
  } else if (isDown && signalAlignment === "ALIGNED") {
    executionBias = "SHORT";
  } else if (isUp && signalAlignment === "ALIGNED") {
    executionBias = "LONG";
  }

  const primaryConflict = derivePrimaryConflict(isDown, isUp, reasons);

  return {
    conflictReasons: [...new Set(reasons)].slice(0, 6),
    primaryConflict,
    signalAlignment,
    resolutionState,
    resolutionHint,
    executionBias,
    cleanContinuation,
    cleanSide,
  };
}

function buildConflictedHint(isDown: boolean, isUp: boolean, reasons: string[]): string {
  if (isDown) {
    return `Downside pressure exists, but continuation is conflicted (${reasons.length} factors). ${reasons[0] ?? ""}`.trim();
  }
  if (isUp) {
    return `Upside pressure exists, but continuation is conflicted (${reasons.length} factors). ${reasons[0] ?? ""}`.trim();
  }
  return "Directional signals are mixed — wait for alignment before entry.";
}

function derivePrimaryConflict(isDown: boolean, isUp: boolean, reasons: string[]): string {
  if (isDown && reasons.some((r) => r.includes("Bid absorption"))) {
    return "Downside pressure vs bid absorption";
  }
  if (isUp && reasons.some((r) => r.includes("Ask absorption"))) {
    return "Upside pressure vs ask absorption";
  }
  if (reasons.some((r) => r.includes("Heatmap"))) {
    return isDown ? "Downside pressure vs heatmap bid support" : "Upside pressure vs heatmap ask resistance";
  }
  if (reasons.some((r) => r.includes("Gamma"))) {
    return "Directional bias vs gamma transition risk";
  }
  if (reasons.some((r) => r.includes("wall"))) {
    return isDown ? "Downside vs bid wall" : "Upside vs ask wall";
  }
  if (reasons.length) return reasons[0]!.replace(/\.$/, "");
  return "Mixed signals — no dominant edge";
}

function resolveExecutive(
  output: VolatilityEngineOutput,
  scan: ConflictScan,
): { headline: string; subtext: string } | null {
  const { resolutionState, signalAlignment, executionBias } = scan;
  const dir = output.directionalPressure;

  if (resolutionState === "CHOP_NO_TRADE" || signalAlignment === "STRONGLY_CONFLICTED") {
    return {
      headline: "SIGNALS ARE CONFLICTED. NO-TRADE CONDITIONS.",
      subtext:
        scan.resolutionHint ||
        "Gamma transition, mixed liquidity and poor trade quality require resolution before entry.",
    };
  }

  if (resolutionState === "WAIT_SWEEP_RESOLUTION") {
    if (dir === "DOWNSIDE") {
      return {
        headline: "DOWNSIDE PRESSURE IS CONFLICTED. WAIT FOR SWEEP RESOLUTION.",
        subtext:
          "Bid absorption, heatmap pressure and gamma flip risk can reject late continuation. Acceptance below the wall is required.",
      };
    }
    if (dir === "UPSIDE") {
      return {
        headline: "UPSIDE PRESSURE IS CONFLICTED. WAIT FOR SWEEP RESOLUTION.",
        subtext:
          "Ask absorption, heatmap pressure and gamma flip risk can reject late continuation. Acceptance above the wall is required.",
      };
    }
    return {
      headline: "SWEEP SETUP ACTIVE. WAIT FOR RESOLUTION.",
      subtext: scan.resolutionHint,
    };
  }

  if (
    resolutionState === "CONFLICTED_CONTINUATION" ||
    (signalAlignment === "CONFLICTED" && (dir === "DOWNSIDE" || dir === "UPSIDE"))
  ) {
    if (dir === "DOWNSIDE") {
      return {
        headline: "DOWNSIDE PRESSURE IS CONFLICTED. WAIT FOR SWEEP RESOLUTION.",
        subtext:
          "Bid absorption, heatmap pressure and gamma flip risk can reject late continuation. Acceptance below the wall is required.",
      };
    }
    if (dir === "UPSIDE") {
      return {
        headline: "UPSIDE PRESSURE IS CONFLICTED. WAIT FOR CONFIRMATION.",
        subtext:
          "Ask absorption, heatmap pressure and gamma flip risk can reject late continuation. Acceptance above the wall is required.",
      };
    }
  }

  if (resolutionState === "CLEAN_CONTINUATION" && executionBias === "SHORT") {
    return {
      headline: "DOWNSIDE EXPANSION IS CONFIRMED. DO NOT FADE ACCEPTED MOVE.",
      subtext:
        "Heatmap pressure, trigger confirmation and liquidity path align with continuation.",
    };
  }

  if (resolutionState === "CLEAN_CONTINUATION" && executionBias === "LONG") {
    return {
      headline: "UPSIDE EXPANSION IS CONFIRMED. DO NOT FADE ACCEPTED MOVE.",
      subtext:
        "Heatmap pressure, trigger confirmation and liquidity path align with continuation.",
    };
  }

  if (resolutionState === "ABSORPTION_REVERSAL_RISK") {
    return {
      headline: "ABSORPTION ACTIVE AFTER EXTENSION. REVERSAL RISK IS BUILDING.",
      subtext:
        "Continuation quality is degraded. Wait for reclaim or failed continuation confirmation.",
    };
  }

  if (resolutionState === "FAKEOUT_RISK") {
    return {
      headline: "FAKEOUT RISK ELEVATED NEAR GAMMA TRANSITION.",
      subtext: scan.resolutionHint,
    };
  }

  return null;
}

function resolvePlaybook(scan: ConflictScan): { bestPlay?: string; avoid?: string } | null {
  switch (scan.resolutionState) {
    case "WAIT_SWEEP_RESOLUTION":
      return {
        bestPlay:
          "Wait for sweep resolution. Reclaim after sweep favors reversal; acceptance below the bid wall favors continuation.",
        avoid:
          "Do not chase downside into bid absorption near gamma flip. Do not fade accepted breakdown if the wall fails.",
      };
    case "ABSORPTION_REVERSAL_RISK":
      return {
        bestPlay:
          "Wait for absorption to confirm with reclaim, failed continuation or trapped sellers.",
        avoid: "Do not continue chasing into active absorption.",
      };
    case "CLEAN_CONTINUATION":
      return {
        bestPlay:
          "Favor continuation pullbacks after accepted trigger. Do not fade without absorption.",
        avoid: "Do not countertrend an accepted expansion path.",
      };
    case "CHOP_NO_TRADE":
      return {
        bestPlay:
          "Stand aside until price leaves the compression/magnet zone with confirmation.",
        avoid: "Do not trade midpoint noise.",
      };
    case "WAIT_ACCEPTANCE":
      return {
        bestPlay: scan.resolutionHint,
        avoid: "Do not execute before wall acceptance or sweep resolution.",
      };
    case "CONFLICTED_CONTINUATION":
      return {
        bestPlay: scan.resolutionHint,
        avoid: "Do not chase first break while signals remain conflicted.",
      };
    default:
      return null;
  }
}

function applyTradeQualityCaps(
  output: VolatilityEngineOutput,
  alignment: SignalAlignment,
  resolutionState: ResolutionState,
): { tradeQuality: VolTradeQuality; tradeQualityScore: number; qualityReasons: string[] } {
  let score = output.tradeQualityScore;
  const reasons = [...output.qualityReasons];

  if (alignment === "STRONGLY_CONFLICTED") {
    score = Math.min(score, 20);
    reasons.push("Strongly conflicted signals — no trade");
  } else if (alignment === "CONFLICTED") {
    score = Math.min(score, 40);
    reasons.push("Conflicted continuation — reduced quality");
  }

  if (resolutionState === "CLEAN_CONTINUATION" && output.moveUsed < 70) {
    score = clamp(score + 8, 0, 85);
    if (!reasons.some((r) => r.includes("align"))) {
      reasons.push("Clean continuation path — quality may improve on acceptance");
    }
  }

  if (
    resolutionState === "ABSORPTION_REVERSAL_RISK" &&
    alignment !== "ALIGNED"
  ) {
    score = Math.min(score, 35);
    let quality = tradeQualityFromScore(score);
    if (quality === "GOOD" || quality === "EXCELLENT") quality = "LOW";
    return {
      tradeQuality: quality === "EXCELLENT" ? "LOW" : quality,
      tradeQualityScore: score,
      qualityReasons: [...new Set(reasons)].slice(0, 4),
    };
  }

  let quality = tradeQualityFromScore(score);
  if (alignment === "STRONGLY_CONFLICTED") quality = "NO TRADE";

  return {
    tradeQuality: quality,
    tradeQualityScore: score,
    qualityReasons: [...new Set(reasons)].slice(0, 4),
  };
}

function resolveAction(
  output: VolatilityEngineOutput,
  executionBias: ExecutionBias,
  resolutionState: ResolutionState,
): VolEngineAction {
  if (executionBias === "NO_TRADE" || resolutionState === "CHOP_NO_TRADE") {
    return "NO TRADE";
  }
  if (
    resolutionState === "WAIT_SWEEP_RESOLUTION" ||
    resolutionState === "WAIT_ACCEPTANCE" ||
    resolutionState === "ABSORPTION_REVERSAL_RISK"
  ) {
    return output.volState === "EXHAUSTED" ? "WAIT ABSORPTION" : "WAIT CONFIRMATION";
  }
  if (resolutionState === "CLEAN_CONTINUATION") {
    return "TRAIL / DO NOT FADE";
  }
  if (resolutionState === "CONFLICTED_CONTINUATION" || executionBias === "CONFLICTED") {
    return "WAIT CONFIRMATION";
  }
  return output.action;
}

/** Apply conflict resolution after gamma + liquidity refinement. */
export function refineVolatilityWithConflictResolution(
  output: VolatilityEngineOutput,
  input: ConflictResolutionInput = {},
): VolatilityEngineOutput {
  const scan = scanConflicts(output, input);
  const tq = applyTradeQualityCaps(output, scan.signalAlignment, scan.resolutionState);
  const exec = resolveExecutive(output, scan);
  const playbook = resolvePlaybook(scan);
  const action = resolveAction(output, scan.executionBias, scan.resolutionState);

  const directionalWarning =
    scan.conflictReasons.length > 0
      ? scan.resolutionHint || scan.primaryConflict
      : output.explanations.directionalWarning;

  const conflictStripTag = [
    `ALIGN: ${displayEnum(scan.signalAlignment)}`,
    `RES: ${displayEnum(scan.resolutionState)}`,
    `EXEC: ${displayEnum(scan.executionBias)}`,
  ].join(" · ");

  return {
    ...output,
    ...tq,
    action,
    signalAlignment: scan.signalAlignment,
    resolutionState: scan.resolutionState,
    primaryConflict: scan.primaryConflict,
    conflictReasons: scan.conflictReasons,
    resolutionHint: scan.resolutionHint,
    executionBias: scan.executionBias,
    conflictStripTag,
    explanations: {
      ...output.explanations,
      executiveDecision: exec?.headline ?? output.explanations.executiveDecision,
      executiveSubtext: exec?.subtext ?? output.explanations.executiveSubtext,
      directionalWarning,
      bestPlay: playbook?.bestPlay ?? output.explanations.bestPlay,
      avoid: playbook?.avoid
        ? `${playbook.avoid} ${output.explanations.avoid}`.trim()
        : output.explanations.avoid,
    },
  };
}
