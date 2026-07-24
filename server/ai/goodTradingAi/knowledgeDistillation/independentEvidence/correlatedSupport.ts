/**
 * AI-7.3.12 — Correlated support + scenario similarity (no embeddings).
 */
import { createHash } from "node:crypto";
import {
  SCENARIO_SUPPORT_WEIGHT,
  type HumanDecisionUnit,
  type ScenarioSimilarityClass,
} from "@shared/goodTradingAiIndependentEvidence";
import { tokenOverlap } from "../normalize";

function lensJaccard(a: string[], b: string[]): number {
  const A = new Set(a);
  const B = new Set(b);
  if (!A.size && !B.size) return 1;
  let inter = 0;
  for (const x of Array.from(A)) if (B.has(x)) inter++;
  const union = A.size + B.size - inter;
  return union === 0 ? 0 : inter / union;
}

/**
 * Deterministic scenario similarity without embeddings.
 * Weights: DISTINCT=1.0, RELATED=0.55, METAMORPHIC_VARIANT=0.25, DUPLICATE=0.
 */
export function classifyScenarioSimilarity(
  a: HumanDecisionUnit,
  b: HumanDecisionUnit,
): ScenarioSimilarityClass {
  if (a.unitId === b.unitId) return "DUPLICATE";
  if (a.scenarioFingerprint === b.scenarioFingerprint) return "DUPLICATE";
  if (a.questionId === b.questionId && a.sessionId === b.sessionId) return "DUPLICATE";

  const claimOv = tokenOverlap(a.claimSummary, b.claimSummary);
  const lensOv = lensJaccard(a.lenses, b.lenses);
  const sameSession = a.sessionId === b.sessionId;

  // Near-identical claim fingerprints across different questions → metamorphic/duplicate support
  if (a.claimFingerprint === b.claimFingerprint && a.questionId !== b.questionId) {
    return claimOv >= 0.85 ? "DUPLICATE" : "METAMORPHIC_VARIANT";
  }
  if (claimOv >= 0.9 && lensOv >= 0.8) return "DUPLICATE";
  if (claimOv >= 0.7 && lensOv >= 0.6) return "METAMORPHIC_VARIANT";
  if (sameSession && claimOv >= 0.45 && lensOv >= 0.4) return "RELATED";
  if (claimOv >= 0.4 && lensOv >= 0.35) return "RELATED";
  return "DISTINCT";
}

export function supportWeightBetween(a: HumanDecisionUnit, b: HumanDecisionUnit): number {
  return SCENARIO_SUPPORT_WEIGHT[classifyScenarioSimilarity(a, b)];
}

/**
 * Effective independent support for a set of units that share a claim cluster.
 * First unit = 1.0; each additional contributes its max similarity weight vs prior members.
 */
export function weightedIndependentSupport(units: HumanDecisionUnit[]): number {
  if (!units.length) return 0;
  const sorted = [...units].sort((a, b) => a.unitId.localeCompare(b.unitId));
  let total = 1;
  const accepted = [sorted[0]!];
  for (let i = 1; i < sorted.length; i++) {
    const u = sorted[i]!;
    let best = 0;
    for (const prev of accepted) {
      best = Math.max(best, supportWeightBetween(prev, u));
    }
    // best is similarity to closest prior; contribution is that class weight if DISTINCT-like,
    // but if DUPLICATE vs any prior, contribute 0; if METAMORPHIC contribute 0.25, etc.
    // Use minimum weight vs all priors (most correlated prior caps contribution).
    let minW = 1;
    for (const prev of accepted) {
      minW = Math.min(minW, supportWeightBetween(prev, u));
    }
    total += minW;
    accepted.push(u);
  }
  return total;
}

export function claimBucketKey(unit: HumanDecisionUnit): string {
  const lenses = [...unit.lenses].sort().join("+");
  const stem = unit.claimSummary.split(/\s+/).slice(0, 8).join("_");
  return createHash("sha256").update(`${lenses}|${stem}`).digest("hex").slice(0, 24);
}
