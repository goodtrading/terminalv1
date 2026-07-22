import {
  TAXONOMY_IDS,
  evidenceStatusSchema,
  calibrationMetricsSchema,
  type CalibrationMetrics,
  type CriticalReview,
  type EvidenceStatus,
  type ImprovementProposal,
  type SyntheticScenario,
} from "@shared/goodTradingAiCriticalCalibration";

export function computeCalibrationMetrics(input: {
  reviews: CriticalReview[];
  proposals: ImprovementProposal[];
  scenarios: SyntheticScenario[];
  unusedRuleCount?: number;
  conflictCount?: number;
}): CalibrationMetrics {
  const taxonomyDistribution = Object.fromEntries(TAXONOMY_IDS.map((t) => [t, 0])) as Record<
    (typeof TAXONOMY_IDS)[number],
    number
  >;
  for (const r of input.reviews) {
    taxonomyDistribution[r.taxonomy] = (taxonomyDistribution[r.taxonomy] ?? 0) + 1;
  }

  const evidenceStatusDistribution = Object.fromEntries(
    evidenceStatusSchema.options.map((s) => [s, 0]),
  ) as Record<EvidenceStatus, number>;
  for (const r of input.reviews) {
    for (const f of r.findings) {
      evidenceStatusDistribution[f.evidenceStatus] = (evidenceStatusDistribution[f.evidenceStatus] ?? 0) + 1;
    }
  }

  const pending = input.proposals.filter((p) => p.status === "PENDING").length;
  const accepted = input.proposals.filter((p) => p.status === "ACCEPTED").length;
  const rejected = input.proposals.filter((p) => p.status === "REJECTED").length;
  const findingTotal = input.reviews.reduce((s, r) => s + r.findings.length, 0);
  const highUncertainty = input.reviews.filter(
    (r) =>
      r.taxonomy === "UNKNOWN" ||
      r.taxonomy === "MULTIPLE_VALID_INTERPRETATIONS" ||
      r.taxonomy === "INSUFFICIENT_EVIDENCE",
  ).length;
  const conflictCount =
    input.conflictCount ??
    input.scenarios.filter((s) => s.lenses.some((l) => l.lens === "CONFLICTS" || l.polarity === "CONFLICTING")).length;

  return calibrationMetricsSchema.parse({
    scenarioCount: input.scenarios.length,
    reviewCount: input.reviews.length,
    proposalCount: input.proposals.length,
    pendingProposals: pending,
    acceptedProposals: accepted,
    rejectedProposals: rejected,
    taxonomyDistribution,
    avgFindingsPerReview: input.reviews.length ? findingTotal / input.reviews.length : 0,
    unusedRuleCount: input.unusedRuleCount ?? 0,
    conflictCount,
    highUncertaintyCount: highUncertainty,
    evidenceStatusDistribution,
    mentorEligible: false,
  });
}
