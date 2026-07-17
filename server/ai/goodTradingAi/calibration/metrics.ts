import type { CalibrationMetrics } from "@shared/goodTradingAiCalibration";
import { CALIBRATION_CASES, calibrationCaseDistribution } from "./cases";
import { listGoldenCases, listProposals, listReviews } from "./store";

export function computeCalibrationMetrics(): CalibrationMetrics {
  const reviews = listReviews();
  const latestByCase = new Map<string, (typeof reviews)[0]>();
  for (const r of reviews) {
    const prev = latestByCase.get(r.caseId);
    if (!prev || r.version > prev.version) latestByCase.set(r.caseId, r);
  }
  const latest = [...latestByCase.values()];

  const count = (d: string) => latest.filter((r) => r.decision === d).length;
  const principleCounts = new Map<string, number>();
  const corrected = new Map<string, number>();

  for (const r of latest) {
    for (const ref of r.aiSnapshot.knowledgeReferences) {
      if (ref.category === "constitution" || ref.kind === "PRINCIPLE" || ref.kind === "RULE") {
        principleCounts.set(ref.id, (principleCounts.get(ref.id) ?? 0) + 1);
      }
    }
    if (r.decision === "APPROVED_WITH_CHANGES" || r.decision === "REJECTED") {
      for (const ref of r.aiSnapshot.knowledgeReferences) {
        corrected.set(ref.id, (corrected.get(ref.id) ?? 0) + 1);
      }
    }
  }

  const sortTop = (m: Map<string, number>) =>
    [...m.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0])).slice(0, 10).map(([k]) => k);

  const limitedCoverageCases = latest.filter((r) => r.aiSnapshot.coverage === "limited").length;
  const pendingProposals = listProposals().filter((p) => p.status === "PENDING").length;

  return {
    totalCases: CALIBRATION_CASES.length,
    reviewed: latest.length,
    pending: CALIBRATION_CASES.length - latest.length,
    approved: count("APPROVED"),
    approvedWithChanges: count("APPROVED_WITH_CHANGES"),
    rejected: count("REJECTED"),
    needsContext: count("NEEDS_MORE_CONTEXT"),
    skipped: count("SKIPPED"),
    pendingProposals,
    goldenCount: listGoldenCases().length,
    limitedCoverageCases,
    domainCoverage: calibrationCaseDistribution() as unknown as Record<string, number>,
    mostCorrectedEntryIds: sortTop(corrected),
    mostUsedPrincipleIds: sortTop(principleCounts),
    generatedAt: new Date().toISOString(),
  };
}
