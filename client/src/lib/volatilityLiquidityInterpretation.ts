/**
 * Phase 4 — liquidity / orderflow refinement on candle + gamma vol output.
 */

import type {
  VolatilityEngineOutput,
  VolExpansionRiskLevel,
  VolEngineAction,
  VolReversalWatch,
  LiquidityContextInput,
  LiquidityRegime,
  LiquidityBias,
  LiquidityVolImpact,
  OrderflowConfirmationLevel,
  NearestLiquidityLevelType,
} from "@/lib/volatilityEngine";
import type { NormalizedLiquidityResult } from "@/lib/normalizeLiquidityContext";
import type { GammaInterpretationBundle } from "@/lib/volatilityGammaInterpretation";

export type LiquidityInterpretationBundle = {
  liquidityIntegrated: boolean;
  liquidityRegime: LiquidityRegime;
  liquidityBias: LiquidityBias;
  liquidityVolImpact: LiquidityVolImpact;
  liquidityReasons: string[];
  heatmapPressure: string;
  orderflowConfirmation: OrderflowConfirmationLevel;
  nearestLiquidityLevel: VolatilityEngineOutput["nearestLiquidityLevel"];
  liquidityCompact: string;
  flowCompact: string;
  liquidityStripTag: string;
};

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

function bumpRisk(level: VolExpansionRiskLevel): VolExpansionRiskLevel {
  const order: VolExpansionRiskLevel[] = ["LOW", "MEDIUM", "HIGH", "EXTREME"];
  const i = order.indexOf(level);
  return order[Math.min(i + 1, order.length - 1)]!;
}

function bumpConfirm(
  c: OrderflowConfirmationLevel,
): OrderflowConfirmationLevel {
  if (c === "NONE") return "WEAK";
  if (c === "WEAK") return "MODERATE";
  if (c === "MODERATE") return "STRONG";
  return "STRONG";
}

function scoreToConfirm(score: number): OrderflowConfirmationLevel {
  if (score >= 4) return "STRONG";
  if (score >= 2) return "MODERATE";
  if (score >= 1) return "WEAK";
  return "NONE";
}

function fmtPrice(n: number): string {
  return Math.round(n).toLocaleString("en-US");
}

function spotNearMagnet(spot: number | undefined, magnet: number | undefined): boolean {
  if (spot == null || magnet == null) return false;
  return Math.abs(magnet - spot) / spot <= 0.0035;
}

function spotInVoid(
  spot: number | undefined,
  v: { low: number; high: number } | undefined,
): boolean {
  if (spot == null || !v) return false;
  const pad = spot * 0.002;
  return spot >= v.low - pad && spot <= v.high + pad;
}

function computeTriggerConfirmation(
  ctx: LiquidityContextInput,
  pressure: VolatilityEngineOutput["directionalPressure"],
): VolatilityEngineOutput["triggerConfirmation"] {
  let upScore = 0;
  let downScore = 0;
  const hp = ctx.heatmapPressure;
  if (hp === "UPSIDE") upScore += 2;
  if (hp === "DOWNSIDE") downScore += 2;

  const v = ctx.nearestVoid;
  if (v?.direction === "UP") upScore += 1;
  if (v?.direction === "DOWN") downScore += 1;

  const sweep = ctx.sweep;
  const sweepActive =
    sweep?.status === "TRIGGERED" || sweep?.status === "IN_PROGRESS";
  if (sweepActive && sweep?.direction === "UP") upScore += 2;
  if (sweepActive && sweep?.direction === "DOWN") downScore += 2;

  const cascade = ctx.cascade;
  if (cascade?.risk === "HIGH" || cascade?.risk === "EXTREME") {
    if (cascade.direction === "UP") upScore += 1;
    if (cascade.direction === "DOWN") downScore += 1;
  }

  const wall = ctx.nearestWall;
  if (wall && wall.side === "ASK" && (wall.distancePct ?? 99) < 0.5) {
    downScore += 0.5;
  }
  if (wall && wall.side === "BID" && (wall.distancePct ?? 99) < 0.5) {
    upScore += 0.5;
  }

  if (pressure === "UPSIDE") upScore += 0.5;
  if (pressure === "DOWNSIDE") downScore += 0.5;

  return {
    upside: scoreToConfirm(Math.round(upScore)),
    downside: scoreToConfirm(Math.round(downScore)),
  };
}

function resolveNearestLevel(
  ctx: LiquidityContextInput,
  spot?: number,
): VolatilityEngineOutput["nearestLiquidityLevel"] {
  const candidates: Array<{
    type: NearestLiquidityLevelType;
    price?: number;
    distancePct?: number;
    description: string;
    dist: number;
  }> = [];

  const wall = ctx.nearestWall;
  if (wall?.price != null) {
    candidates.push({
      type: "WALL",
      price: wall.price,
      distancePct: wall.distancePct,
      description: `${wall.side ?? "—"} wall · ${fmtPrice(wall.price)} · ${wall.strength ?? "—"}`,
      dist: wall.distancePct ?? 99,
    });
  }
  if (ctx.activeMagnet != null && spot != null) {
    const d = (Math.abs(ctx.activeMagnet - spot) / spot) * 100;
    candidates.push({
      type: "MAGNET",
      price: ctx.activeMagnet,
      distancePct: d,
      description: `Liquidity magnet · ${fmtPrice(ctx.activeMagnet)}`,
      dist: d,
    });
  }
  const v = ctx.nearestVoid;
  if (v && spot != null) {
    const mid = (v.low + v.high) / 2;
    const d = (Math.abs(mid - spot) / spot) * 100;
    candidates.push({
      type: "VOID",
      price: mid,
      distancePct: d,
      description: `Thin liquidity · ${fmtPrice(v.low)}–${fmtPrice(v.high)}`,
      dist: d,
    });
  }
  if (ctx.sweep?.level != null) {
    candidates.push({
      type: "SWEEP_LEVEL",
      price: ctx.sweep.level,
      description: `Sweep level · ${fmtPrice(ctx.sweep.level)}`,
      dist: spot != null ? (Math.abs(ctx.sweep.level - spot) / spot) * 100 : 50,
    });
  }
  if (ctx.cascade?.triggerLevel != null) {
    const p = ctx.cascade.triggerLevel;
    candidates.push({
      type: "CASCADE_TRIGGER",
      price: p,
      description: `Cascade trigger · ${fmtPrice(p)}`,
      dist: spot != null ? (Math.abs(p - spot) / spot) * 100 : 50,
    });
  }
  if (ctx.absorption?.level != null) {
    const p = ctx.absorption.level;
    candidates.push({
      type: "ABSORPTION_LEVEL",
      price: p,
      description: `Absorption · ${fmtPrice(p)}`,
      dist: spot != null ? (Math.abs(p - spot) / spot) * 100 : 50,
    });
  }

  if (!candidates.length) {
    return { type: "NONE", description: "No nearby liquidity structure" };
  }
  candidates.sort((a, b) => a.dist - b.dist);
  const best = candidates[0]!;
  return {
    type: best.type,
    price: best.price,
    distancePct: best.distancePct,
    description: best.description,
  };
}

function buildCompactLines(ctx: LiquidityContextInput): {
  liquidityCompact: string;
  flowCompact: string;
} {
  const wall = ctx.nearestWall;
  const wallStr = wall
    ? `Nearest Wall: ${wall.side ?? "—"} ${fmtPrice(wall.price)} (${(wall.distancePct ?? 0).toFixed(2)}%)`
    : "Nearest Wall: —";
  const magnetStr =
    ctx.activeMagnet != null
      ? `Active Magnet: ${fmtPrice(ctx.activeMagnet)}`
      : "Active Magnet: —";
  const voidStr = ctx.nearestVoid
    ? `Nearest Void: ${fmtPrice(ctx.nearestVoid.low)}–${fmtPrice(ctx.nearestVoid.high)}`
    : "Nearest Void: —";

  const sweep = ctx.sweep;
  const sweepStr = sweep?.status
    ? `Sweep: ${sweep.status}${sweep.direction ? ` · ${sweep.direction}` : ""}`
    : "Sweep: —";
  const cascade = ctx.cascade;
  const cascadeStr = cascade?.risk
    ? `Cascade: ${cascade.risk}${cascade.direction ? ` · ${cascade.direction}` : ""}`
    : "Cascade: —";
  const abs = ctx.absorption;
  const absStr = abs?.detected
    ? `Absorption: ${abs.side ?? "—"} · ${abs.strength ?? "—"}`
    : "Absorption: —";

  return {
    liquidityCompact: `${wallStr} · ${magnetStr} · ${voidStr}`,
    flowCompact: `${sweepStr} · ${cascadeStr} · ${absStr}`,
  };
}

function executiveWithLiquidity(
  output: VolatilityEngineOutput,
  regime: LiquidityRegime,
  impact: LiquidityVolImpact,
  spot: number | undefined,
  gamma?: GammaInterpretationBundle,
  ctx?: LiquidityContextInput,
): { headline: string; subtext: string } | null {
  const vol = output.volState;
  const nearFlip = gamma?.nearFlip || gamma?.gammaRegime === "NEAR_FLIP";
  const shortGamma = gamma?.gammaRegime === "SHORT_GAMMA";
  const pinned = regime === "PINNED" || spotNearMagnet(spot, ctx?.activeMagnet);

  if (nearFlip && (regime === "PINNED" || pinned)) {
    return {
      headline: "MARKET IS PINNED NEAR GAMMA FLIP. FAKEOUT RISK IS HIGH.",
      subtext:
        "Liquidity magnet and gamma transition can reject first breaks. Wait for acceptance, sweep reclaim, or displacement.",
    };
  }
  if (shortGamma && (regime === "THIN_LIQUIDITY" || regime === "BREAKOUT_PATH")) {
    return {
      headline: "SHORT GAMMA + THIN LIQUIDITY. ACCELERATION RISK IS HIGH.",
      subtext:
        "Accepted movement into the void can expand quickly. Favor pullback continuation, avoid blind fades.",
    };
  }
  if (vol === "EXHAUSTED" && regime === "ABSORPTION_ACTIVE") {
    return {
      headline: "MARKET IS EXTENDED AND ABSORPTION IS ACTIVE.",
      subtext:
        "Late continuation has poor quality. Wait for failed continuation, reclaim, or reversal confirmation.",
    };
  }
  if (impact === "CASCADE_RISK" || ctx?.cascade?.risk === "HIGH" || ctx?.cascade?.risk === "EXTREME") {
    return {
      headline: "CASCADE RISK ACTIVE. DO NOT FADE ACCEPTED EXPANSION.",
      subtext:
        "Accepted trigger can force directional repricing. Manage late-entry risk carefully.",
    };
  }
  if (regime === "SWEEP_ACTIVE") {
    return {
      headline: "LIQUIDITY SWEEP IN PROGRESS.",
      subtext:
        "Wait for sweep resolution: reclaim for reversal, acceptance for continuation.",
    };
  }
  return null;
}

function playbookWithLiquidity(
  regime: LiquidityRegime,
  impact: LiquidityVolImpact,
  output: VolatilityEngineOutput,
  gamma?: GammaInterpretationBundle,
  ctx?: LiquidityContextInput,
): { bestPlay?: string; avoid?: string } | null {
  const parts: { bestPlay?: string; avoid?: string } = {};

  if (regime === "PINNED" || regime === "WALL_BLOCKED") {
    parts.bestPlay =
      "Wait for displacement away from magnet or accepted break through the nearest wall.";
  }
  if (
    (regime === "THIN_LIQUIDITY" || regime === "BREAKOUT_PATH") &&
    gamma?.gammaRegime === "SHORT_GAMMA"
  ) {
    parts.bestPlay =
      "If trigger accepts into thin liquidity, favor continuation pullbacks. Do not fade without absorption.";
  }
  if (regime === "ABSORPTION_ACTIVE" && output.volState === "EXHAUSTED") {
    parts.bestPlay =
      "Wait for absorption to confirm with reclaim or failed continuation before entry.";
  }
  if (regime === "SWEEP_ACTIVE") {
    parts.bestPlay =
      "Wait for sweep resolution: reclaim for reversal, acceptance for continuation.";
  }

  const avoidLines: string[] = [];
  if (gamma?.nearFlip && (regime === "PINNED" || ctx?.activeMagnet != null)) {
    avoidLines.push("Do not chase first break near gamma flip and liquidity magnet.");
  }
  if (
    gamma?.gammaRegime === "SHORT_GAMMA" &&
    (regime === "THIN_LIQUIDITY" || impact === "EXPANSION_PATH")
  ) {
    avoidLines.push("Do not fade accepted short-gamma expansion into a liquidity void.");
  }
  if (regime === "ABSORPTION_ACTIVE") {
    avoidLines.push("Do not continue chasing into active absorption.");
  }
  if (avoidLines.length) parts.avoid = avoidLines.join(" ");

  return Object.keys(parts).length ? parts : null;
}

export type LiquidityRefinedResult = {
  output: VolatilityEngineOutput;
  liquidity: LiquidityInterpretationBundle;
};

export function refineVolatilityWithLiquidity(
  output: VolatilityEngineOutput,
  ctx: NormalizedLiquidityResult,
  spot?: number,
  gamma?: GammaInterpretationBundle,
): LiquidityRefinedResult {
  const offlineBundle: LiquidityInterpretationBundle = {
    liquidityIntegrated: false,
    liquidityRegime: "UNKNOWN",
    liquidityBias: "UNKNOWN",
    liquidityVolImpact: "UNKNOWN",
    liquidityReasons: [],
    heatmapPressure: "—",
    orderflowConfirmation: "NONE",
    nearestLiquidityLevel: { type: "NONE", description: "—" },
    liquidityCompact: "—",
    flowCompact: "—",
    liquidityStripTag: "",
  };

  if (!ctx.liquidityIntegrated) {
    return {
      output: { ...output, liquidityIntegrated: false },
      liquidity: offlineBundle,
    };
  }

  let regime: LiquidityRegime = "NEUTRAL";
  let impact: LiquidityVolImpact = "UNKNOWN";
  let bias: LiquidityBias = "UNKNOWN";
  const reasons: string[] = [];

  let expansionRisk = output.expansionRisk;
  let tradeRiskLabel = output.tradeRiskLabel;
  let cleanExpansionRiskLabel = output.cleanExpansionRiskLabel;
  let lateChaseRisk = output.lateChaseRisk;
  let reversalWatch = output.reversalWatch;
  let action: VolEngineAction = output.action;
  const qualityReasons = [...output.qualityReasons];

  const wall = ctx.nearestWall;
  const magnetNear = spotNearMagnet(spot, ctx.activeMagnet);
  const voidNear = spotInVoid(spot, ctx.nearestVoid);

  // A) Major wall
  if (wall && (wall.distancePct ?? 99) <= 0.35) {
    regime = wall.strength === "HIGH" || wall.strength === "EXTREME" ? "WALL_BLOCKED" : "PINNED";
    impact = "FAKEOUT_RISK";
    tradeRiskLabel = bumpRisk(tradeRiskLabel);
    reasons.push(
      wall.side === "ASK"
        ? "Large ask wall overhead — upside needs acceptance through wall"
        : "Large bid wall below — downside needs acceptance below wall",
    );
  }

  // B) Magnet
  if (magnetNear) {
    regime = "PINNED";
    impact = "COMPRESSION";
    expansionRisk = clamp(expansionRisk - 8, 0, 100);
    reasons.push("Price is pinned near active liquidity magnet.");
  }

  // C) Void
  if (voidNear || ctx.nearestVoid) {
    const inVoid = voidNear;
    if (inVoid || (ctx.nearestVoid && spot != null)) {
      regime = regime === "PINNED" ? "BREAKOUT_PATH" : "THIN_LIQUIDITY";
      if (impact === "UNKNOWN" || impact === "COMPRESSION") impact = "EXPANSION_PATH";
      const voidDir = ctx.nearestVoid?.direction;
      if (
        voidDir === "UP" &&
        output.directionalPressure === "UPSIDE"
      ) {
        expansionRisk = clamp(expansionRisk + 10, 0, 100);
      }
      if (
        voidDir === "DOWN" &&
        output.directionalPressure === "DOWNSIDE"
      ) {
        expansionRisk = clamp(expansionRisk + 10, 0, 100);
      }
      reasons.push("Thin liquidity path can accelerate accepted movement.");
    }
  }

  // D) Sweep
  const sweep = ctx.sweep;
  const sweepActive =
    sweep?.status === "TRIGGERED" || sweep?.status === "IN_PROGRESS";
  if (sweepActive) {
    regime = "SWEEP_ACTIVE";
    if (
      sweep?.direction === "UP" &&
      output.directionalPressure === "UPSIDE"
    ) {
      bias = "UPSIDE";
    } else if (
      sweep?.direction === "DOWN" &&
      output.directionalPressure === "DOWNSIDE"
    ) {
      bias = "DOWNSIDE";
    } else if (sweep?.direction === "TWO_SIDED") {
      bias = "TWO_SIDED";
    }
    const opposite =
      (sweep?.direction === "UP" && output.directionalPressure === "DOWNSIDE") ||
      (sweep?.direction === "DOWN" && output.directionalPressure === "UPSIDE");
    if (opposite) {
      impact = "FAKEOUT_RISK";
      reversalWatch =
        reversalWatch === "INACTIVE" ? "ACTIVE" : reversalWatch === "ACTIVE" ? "HIGH" : reversalWatch;
      reasons.push("Sweep direction conflicts with vol bias — reclaim risk elevated");
    }
  }

  // E) Cascade
  const cascade = ctx.cascade;
  if (cascade?.risk === "HIGH" || cascade?.risk === "EXTREME") {
    impact = "CASCADE_RISK";
    tradeRiskLabel = bumpRisk(tradeRiskLabel);
    if (output.volState !== "EXHAUSTED") {
      expansionRisk = clamp(expansionRisk + 8, 0, 100);
    } else {
      lateChaseRisk = bumpRisk(lateChaseRisk);
      qualityReasons.push("Cascade risk with exhausted vol — avoid chasing");
    }
    reasons.push("Cascade risk can expand movement once trigger accepts.");
    if (cascade.direction === "UP") bias = bias === "UNKNOWN" ? "UPSIDE" : bias;
    if (cascade.direction === "DOWN") bias = bias === "UNKNOWN" ? "DOWNSIDE" : bias;
  }

  // F) Absorption
  if (ctx.absorption?.detected) {
    regime = "ABSORPTION_ACTIVE";
    impact = "REVERSAL_RISK";
    if (output.volState === "EXHAUSTED") {
      reversalWatch =
        reversalWatch === "INACTIVE" ? "ACTIVE" : reversalWatch === "ACTIVE" ? "HIGH" : reversalWatch;
      if (action === "TRAIL / DO NOT FADE" || action === "WAIT TRIGGER") {
        action = "WAIT ABSORPTION";
      }
    }
    reasons.push("Active absorption — continuation quality degraded");
  }

  // G) Heatmap pressure
  const hp = ctx.heatmapPressure ?? "UNKNOWN";
  if (hp === "UPSIDE") bias = bias === "UNKNOWN" ? "UPSIDE" : bias;
  if (hp === "DOWNSIDE") bias = bias === "UNKNOWN" ? "DOWNSIDE" : bias;
  if (hp === "TWO_SIDED") bias = "TWO_SIDED";
  if (
    hp === "UPSIDE" &&
    output.directionalPressure === "DOWNSIDE"
  ) {
    impact = impact === "UNKNOWN" ? "FAKEOUT_RISK" : impact;
    bias = "TWO_SIDED";
    reasons.push("Heatmap pressure conflicts with vol directional bias");
  }
  if (
    hp === "DOWNSIDE" &&
    output.directionalPressure === "UPSIDE"
  ) {
    impact = impact === "UNKNOWN" ? "FAKEOUT_RISK" : impact;
    bias = "TWO_SIDED";
  }

  const triggerConfirmation = computeTriggerConfirmation(ctx, output.directionalPressure);
  let orderflowConfirmation: OrderflowConfirmationLevel = "NONE";
  const upC = triggerConfirmation?.upside ?? "NONE";
  const downC = triggerConfirmation?.downside ?? "NONE";
  if (upC === "STRONG" || downC === "STRONG") orderflowConfirmation = "STRONG";
  else if (upC === "MODERATE" || downC === "MODERATE") orderflowConfirmation = "MODERATE";
  else if (upC === "WEAK" || downC === "WEAK") orderflowConfirmation = "WEAK";

  if (sweepActive && sweep?.direction === "UP") {
    triggerConfirmation!.upside = bumpConfirm(triggerConfirmation!.upside);
  }
  if (sweepActive && sweep?.direction === "DOWN") {
    triggerConfirmation!.downside = bumpConfirm(triggerConfirmation!.downside);
  }

  const nearestLiquidityLevel = resolveNearestLevel(ctx, spot);
  const { liquidityCompact, flowCompact } = buildCompactLines(ctx);

  const riskLabelFromScore = (score: number): VolExpansionRiskLevel => {
    if (score <= 25) return "LOW";
    if (score <= 50) return "MEDIUM";
    if (score <= 75) return "HIGH";
    return "EXTREME";
  };
  cleanExpansionRiskLabel = riskLabelFromScore(expansionRisk);

  const execLiq = executiveWithLiquidity(output, regime, impact, spot, gamma, ctx);
  const playbookLiq = playbookWithLiquidity(regime, impact, output, gamma, ctx);

  const heatmapDisplay =
    hp === "UNKNOWN" ? "UNKNOWN" : hp.replace(/_/g, " ");

  const stripParts: string[] = [];
  if (regime !== "NEUTRAL" && regime !== "UNKNOWN") stripParts.push(`LIQ: ${regime.replace(/_/g, " ")}`);
  if (orderflowConfirmation !== "NONE") stripParts.push(`FLOW: ${orderflowConfirmation}`);

  const bundle: LiquidityInterpretationBundle = {
    liquidityIntegrated: true,
    liquidityRegime: regime,
    liquidityBias: bias,
    liquidityVolImpact: impact,
    liquidityReasons: [...new Set(reasons)].slice(0, 4),
    heatmapPressure: heatmapDisplay,
    orderflowConfirmation,
    nearestLiquidityLevel,
    liquidityCompact,
    flowCompact,
    liquidityStripTag: stripParts.join(" · "),
  };

  return {
    output: {
      ...output,
      expansionRisk,
      cleanExpansionRiskLabel,
      tradeRiskLabel,
      riskLabel: riskLabelFromScore(expansionRisk),
      lateChaseRisk,
      reversalWatch,
      action,
      qualityReasons: [...new Set(qualityReasons)].slice(0, 4),
      liquidityIntegrated: true,
      liquidityRegime: regime,
      liquidityBias: bias,
      liquidityVolImpact: impact,
      liquidityReasons: bundle.liquidityReasons,
      nearestLiquidityLevel,
      orderflowConfirmation,
      triggerConfirmation,
      liquidityStripTag: bundle.liquidityStripTag,
      explanations: {
        ...output.explanations,
        executiveDecision: execLiq?.headline ?? output.explanations.executiveDecision,
        executiveSubtext: execLiq?.subtext ?? output.explanations.executiveSubtext,
        bestPlay: playbookLiq?.bestPlay ?? output.explanations.bestPlay,
        avoid: playbookLiq?.avoid
          ? `${playbookLiq.avoid} ${output.explanations.avoid}`.trim()
          : output.explanations.avoid,
      },
    },
    liquidity: bundle,
  };
}
