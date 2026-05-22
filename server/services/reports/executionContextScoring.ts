import type { ExecutionContextSnapshot } from "./executionContextTypes";

/** Adjust execution quality score using captured institutional context. */
export function applyContextToExecutionScore(
  baseScore: number,
  context: ExecutionContextSnapshot | undefined,
  side?: "long" | "short",
): number {
  if (!context) return baseScore;

  let score = baseScore;
  const { risk, diagnostics, market } = context;

  if (risk.stopLossDetected) score += 8;
  else score -= 18;

  const lossPct = risk.estimatedLossAccountPct;
  if (lossPct != null) {
    if (lossPct < 1) score += 6;
    else if (lossPct > 2) score -= 12;
  }

  if (risk.riskMirrorStatus === "aligned") score += 10;
  else if (risk.riskMirrorStatus === "neutral") score += 2;
  else if (risk.riskMirrorStatus === "conflicted") score -= 14;
  else if (risk.riskMirrorStatus === "danger") score -= 22;

  if (
    risk.distanceToLiquidationPct != null &&
    risk.distanceToLiquidationPct < 7
  ) {
    score -= 20;
  }

  if (market.marketDataHealth === "healthy") score += 4;
  else if (market.marketDataHealth === "degraded") score -= 8;
  else if (market.marketDataHealth === "error") score -= 12;

  if (diagnostics.contextAlignment === "aligned") score += 8;
  else if (diagnostics.contextAlignment === "conflicted") score -= 10;
  else if (diagnostics.contextAlignment === "danger") score -= 16;

  const tradeSide = side ?? "long";
  const nearPct = 1.2;
  const res = context.liquidity.nearestResistance;
  const sup = context.liquidity.nearestSupport;
  if (tradeSide === "long" && res && res.distancePct <= nearPct) score -= 10;
  if (tradeSide === "short" && sup && sup.distancePct <= nearPct) score -= 10;

  const gm = context.gamma.nearestMagnet;
  if (gm && gm.distancePct <= 0.8) {
    if (tradeSide === "long" && gm.type === "call_wall") score += 4;
    if (tradeSide === "short" && gm.type === "put_wall") score += 4;
  }

  return Math.max(0, Math.min(100, Math.round(score)));
}
