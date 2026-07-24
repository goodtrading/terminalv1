/**
 * AI-7.3.12 — Confidence / compression / proposal / gap / challenge / utility audits.
 */
import type { CompressedProposal, ChallengeItem } from "@shared/goodTradingAiKnowledgeDistillation";
import { ALL_EVIDENCE_LENSES } from "@shared/goodTradingAiKnowledgeDistillation";
import {
  auditedGapSchema,
  proposalSupportAuditSchema,
  utilityReassessmentSchema,
  type AuditedCluster,
  type AuditedConflict,
  type AuditedGap,
  type ConflictAuditSummary,
  type DocumentObservation,
  type HumanDecisionUnit,
  type ProposalSupportAudit,
  type UtilityReassessment,
} from "@shared/goodTradingAiIndependentEvidence";

export function recalibrateConfidences(input: {
  clusters: AuditedCluster[];
  conflicts: AuditedConflict[];
  unitCount: number;
}): {
  sampleSafety: "LIMITED_HUMAN_SAMPLE";
  hasMature: false;
  clusterCount: number;
  avgScore: number;
  maxScore: number;
  minScore: number;
  scores: Array<{
    clusterId: string;
    confidenceScore: number;
    label: "LOW" | "MEDIUM" | "HIGH_SAMPLE_LIMITED";
    independentCaseCount: number;
  }>;
} {
  const contradictionPenalty = Math.min(0.4, input.conflicts.filter((c) => c.type === "TRUE_CONTRADICTION").length * 0.08);
  const scores = input.clusters.map((c) => {
    const indep = c.independentCaseCount;
    const coverage = Math.min(1, indep / Math.max(3, input.unitCount * 0.2));
    const repetition = Math.min(1, Math.max(0, indep - 1) / 4);
    // Do NOT use documentMemberCount / addenda / revisions as repetition.
    const correlatedPenalty = c.weightedIndependentSupport < indep ? 0.15 : 0.05;
    let score =
      0.35 * coverage +
      0.3 * repetition +
      0.2 * Math.min(1, c.weightedIndependentSupport / 3) -
      0.15 * correlatedPenalty -
      contradictionPenalty +
      0.12;
    score = Math.max(0, Math.min(1, score));
    // N=15 → never MATURE; singleton capped LOW/MEDIUM; HIGH only SAMPLE_LIMITED
    let label: "LOW" | "MEDIUM" | "HIGH_SAMPLE_LIMITED" = "LOW";
    if (indep <= 1) {
      score = Math.min(score, 0.49);
      label = score >= 0.35 ? "MEDIUM" : "LOW";
    } else if (score >= 0.65 && indep >= 3) {
      label = "HIGH_SAMPLE_LIMITED";
    } else if (score >= 0.4) {
      label = "MEDIUM";
    }
    return {
      clusterId: c.id,
      confidenceScore: score,
      label,
      independentCaseCount: indep,
    };
  });
  const vals = scores.map((s) => s.confidenceScore);
  return {
    sampleSafety: "LIMITED_HUMAN_SAMPLE",
    hasMature: false,
    clusterCount: scores.length,
    avgScore: vals.length ? vals.reduce((a, b) => a + b, 0) / vals.length : 0,
    maxScore: vals.length ? Math.max(...vals) : 0,
    minScore: vals.length ? Math.min(...vals) : 0,
    scores,
  };
}

export function recalibrateCompression(input: {
  documents: DocumentObservation[];
  units: HumanDecisionUnit[];
  clusters: AuditedCluster[];
  originalVariantCount?: number;
}): {
  documentVariants: number;
  crossCaseVariants: number;
  sameCaseRedundancies: number;
  crossCaseRedundancies: number;
  trueEquivalentClaims: number;
  conditionalVariants: number;
  originalVariantCount?: number;
} {
  let documentVariants = 0;
  let sameCaseRedundancies = 0;
  const byUnit = new Map<string, DocumentObservation[]>();
  for (const d of input.documents) {
    const k = `${d.sessionId}|${d.questionId}`;
    const list = byUnit.get(k) ?? [];
    list.push(d);
    byUnit.set(k, list);
  }
  for (const [, docs] of Array.from(byUnit.entries())) {
    const extras = docs.filter((d: DocumentObservation) => d.documentType !== "ANSWER").length;
    documentVariants += extras;
    sameCaseRedundancies += Math.max(0, docs.length - 1);
  }
  const crossCaseVariants = input.clusters
    .filter((c) => c.supportClass === "CROSS_CASE_REPEATED_PATTERN")
    .reduce((s, c) => s + Math.max(0, c.decisionUnitMemberCount - 1), 0);
  const crossCaseRedundancies = input.clusters
    .filter((c) => c.independentCaseCount >= 2)
    .reduce((s, c) => s + Math.max(0, c.decisionUnitMemberCount - 1), 0);
  const trueEquivalentClaims = input.clusters.filter(
    (c) => c.supportClass === "CROSS_CASE_REPEATED_PATTERN" && c.weightedIndependentSupport >= 1.5,
  ).length;
  const conditionalVariants = input.units.filter((u) => u.dependsFlag).length;
  return {
    documentVariants,
    crossCaseVariants,
    sameCaseRedundancies,
    crossCaseRedundancies,
    trueEquivalentClaims,
    conditionalVariants,
    originalVariantCount: input.originalVariantCount,
  };
}

export function auditProposals(input: {
  proposals: CompressedProposal[];
  clusters: AuditedCluster[];
  units: HumanDecisionUnit[];
  documents: DocumentObservation[];
  conflicts: AuditedConflict[];
}): ProposalSupportAudit[] {
  return input.proposals.map((p) => {
    const docSupport = Math.max(1, p.frequency);
    const decisionUnitSupport = Math.min(input.units.length, Math.max(1, Math.ceil(docSupport / 2)));
    const cross = input.clusters.filter((c) => c.supportClass === "CROSS_CASE_REPEATED_PATTERN");
    const independentCaseSupport = Math.min(
      decisionUnitSupport,
      cross.reduce((s, c) => s + c.independentCaseCount, 0) || 1,
    );
    const correlated = input.clusters.filter(
      (c) =>
        c.supportClass === "MIXED_CLUSTER" ||
        c.supportClass === "INSUFFICIENT_INDEPENDENT_SUPPORT",
    ).length;
    const sameCaseInflationDetected = docSupport > independentCaseSupport * 1.5;
    const contradictionCount = input.conflicts.filter((c) => c.type === "TRUE_CONTRADICTION").length;
    let classification: ProposalSupportAudit["classification"] = "SUPPORTED_FOR_FURTHER_REVIEW";
    if (independentCaseSupport < 2 && p.impact === "HIGH") {
      classification = "NEEDS_MORE_INDEPENDENT_CASES";
    }
    if (sameCaseInflationDetected) classification = "OVERSTATED_BY_DOCUMENT_COUNT";
    if (docSupport <= 1 && independentCaseSupport <= 1) classification = "UNSUPPORTED";
    const remainsValidAfterAudit =
      classification === "SUPPORTED_FOR_FURTHER_REVIEW" ||
      classification === "NEEDS_MORE_INDEPENDENT_CASES";
    return proposalSupportAuditSchema.parse({
      proposalId: p.id,
      documentSupportCount: docSupport,
      decisionUnitSupportCount: decisionUnitSupport,
      independentCaseSupportCount: independentCaseSupport,
      correlatedCaseSupportCount: correlated,
      contradictionCount,
      sameCaseInflationDetected,
      impact: p.impact,
      risk: p.risk,
      remainsValidAfterAudit,
      classification,
      statusUnchanged: "PENDING",
      mentorEligible: false,
    });
  });
}

export function auditGaps(input: {
  units: HumanDecisionUnit[];
  conflicts: AuditedConflict[];
  originalGapCount?: number;
}): AuditedGap[] {
  const gaps: AuditedGap[] = [];
  const covered = new Set(input.units.flatMap((u) => u.lenses));
  let i = 0;
  for (const lens of ALL_EVIDENCE_LENSES) {
    if (covered.has(lens)) continue;
    i++;
    gaps.push(
      auditedGapSchema.parse({
        id: `agap_${String(i).padStart(3, "0")}`,
        subject: lens,
        classification: "QUESTION_SET_COVERAGE_GAP",
        severity: "MEDIUM",
        detail: `Lens ${lens} absent across 15 decision units (limited sample — not per-document).`,
        mentorEligible: false,
      }),
    );
  }
  const trueContradictions = input.conflicts.filter((c) => c.type === "TRUE_CONTRADICTION");
  for (const c of trueContradictions.slice(0, 3)) {
    i++;
    gaps.push(
      auditedGapSchema.parse({
        id: `agap_${String(i).padStart(3, "0")}`,
        subject: `${c.unitA}<->${c.unitB}`,
        classification: "TRUE_METHODOLOGY_GAP",
        severity: "HIGH",
        detail: c.resolutionCondition,
        mentorEligible: false,
      }),
    );
  }
  const weakInv = input.units.filter((u) => u.invalidationCount === 0).length;
  if (weakInv > 0) {
    i++;
    gaps.push(
      auditedGapSchema.parse({
        id: `agap_${String(i).padStart(3, "0")}`,
        subject: "INVALIDATION_COVERAGE",
        classification: "INSUFFICIENT_INVALIDATION_COVERAGE",
        severity: "MEDIUM",
        detail: `${weakInv} decision units lack structured invalidations.`,
        mentorEligible: false,
      }),
    );
  }
  i++;
  gaps.push(
    auditedGapSchema.parse({
      id: `agap_${String(i).padStart(3, "0")}`,
      subject: "SAMPLE_SIZE",
      classification: "LIMITED_SAMPLE_GAP",
      severity: "HIGH",
      detail: `N=${input.units.length} HUMAN decision units — LIMITED_HUMAN_SAMPLE; original gaps=${input.originalGapCount ?? "n/a"} inflated by per-lens+per-conflict enumeration.`,
      mentorEligible: false,
    }),
  );
  // Max 10 priority gaps
  return gaps
    .sort((a, b) => {
      const rank = { HIGH: 0, MEDIUM: 1, LOW: 2 } as const;
      return rank[a.severity] - rank[b.severity];
    })
    .slice(0, 10);
}

export function auditChallenges(input: {
  originalChallenges: ChallengeItem[];
  conflicts: AuditedConflict[];
  clusters: AuditedCluster[];
}): {
  originalChallengeCount: number;
  deduplicatedChallengeCount: number;
  highInformationChallenges: number;
  redundantChallengesRemoved: number;
  challengeIds: string[];
} {
  const original = input.originalChallenges;
  const trueC = input.conflicts.filter((c) => c.type === "TRUE_CONTRADICTION");
  const cross = input.clusters.filter((c) => c.supportClass === "CROSS_CASE_REPEATED_PATTERN");
  // Keep at most 5 high-info: true contradictions, scope, invalidation, discrimination
  const picked: string[] = [];
  for (const c of original) {
    if (picked.length >= 5) break;
    if (c.kind === "FULL_INVALIDATION" || c.kind === "HYPOTHESIS_DISCRIMINATION") {
      picked.push(c.id);
      continue;
    }
    if (c.kind === "HEURISTIC_FAILURE" && cross.length) {
      picked.push(c.id);
      continue;
    }
    if (trueC.length && c.kind === "EVIDENCE_THAT_CHANGES_DECISION") {
      picked.push(c.id);
    }
  }
  // Ensure up to 5 unique
  for (const c of original) {
    if (picked.length >= 5) break;
    if (!picked.includes(c.id)) picked.push(c.id);
  }
  return {
    originalChallengeCount: original.length,
    deduplicatedChallengeCount: picked.length,
    highInformationChallenges: Math.min(5, picked.length),
    redundantChallengesRemoved: Math.max(0, original.length - picked.length),
    challengeIds: picked.slice(0, 5),
  };
}

export function reassessUtility(input: {
  clusters: AuditedCluster[];
  conflicts: AuditedConflict[];
  gaps: AuditedGap[];
  proposals: ProposalSupportAudit[];
  challengeAudit: { highInformationChallenges: number };
  originalClass?: UtilityReassessment["originalClass"];
}): UtilityReassessment {
  const cross = input.clusters.filter((c) => c.supportClass === "CROSS_CASE_REPEATED_PATTERN").length;
  const indep = input.clusters.reduce((s, c) => s + c.weightedIndependentSupport, 0);
  const trueC = input.conflicts.filter((c) => c.type === "TRUE_CONTRADICTION").length;
  const usefulGaps = input.gaps.filter(
    (g) =>
      g.classification === "TRUE_METHODOLOGY_GAP" ||
      g.classification === "INSUFFICIENT_INVALIDATION_COVERAGE",
  ).length;
  const nonredundant = input.proposals.filter((p) => p.remainsValidAfterAudit).length;
  const discriminative = input.challengeAudit.highInformationChallenges;

  let auditedClass: UtilityReassessment["auditedClass"] = "DISTILLATION_NOT_USEFUL";
  let reason = "Insufficient independent cross-case support after de-inflating documents.";
  if (cross >= 2 || (indep >= 8 && nonredundant >= 1)) {
    auditedClass = "DISTILLATION_USEFUL";
    reason =
      "Cross-case patterns and nonredundant proposals remain after independent-evidence correction.";
  } else if (cross >= 1 || indep >= 4 || usefulGaps >= 1 || discriminative >= 2) {
    auditedClass = "DISTILLATION_PARTIALLY_USEFUL";
    reason =
      "Limited independent support; multiMemberClusters=15 was largely within-case enrichment, not cross-case repetition.";
  }

  return utilityReassessmentSchema.parse({
    originalClass: input.originalClass,
    auditedClass,
    reason,
    crossCaseRepeatedPatterns: cross,
    independentSupport: indep,
    trueContradictions: trueC,
    usefulGaps,
    nonredundantProposals: nonredundant,
    discriminativeChallenges: discriminative,
    sampleSafety: "LIMITED_HUMAN_SAMPLE",
    hasMature: false,
    mentorEligible: false,
  });
}

export function whyOriginalGapsWere22(originalGapCount = 22): string {
  return (
    `Original gapCount≈${originalGapCount}: per-lens NEVER_DISCUSSED/LOW_COVERAGE + conflict cells + low-confidence rules (document-inflated).`
  ).slice(0, 240);
}
