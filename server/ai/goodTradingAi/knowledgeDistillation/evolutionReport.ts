/**
 * Knowledge Evolution Report.
 */
import type {
  AdaptiveQuestion,
  CompressionReport,
  ConflictHeatmap,
  CoverageHeatmap,
  KnowledgeEvolutionReport,
  KnowledgeGap,
  RuleCluster,
  RuleConfidence,
} from "@shared/goodTradingAiKnowledgeDistillation";
import {
  KNOWLEDGE_DISTILLATION_SCHEMA_VERSION,
  knowledgeEvolutionReportSchema,
  ALL_EVIDENCE_LENSES,
} from "@shared/goodTradingAiKnowledgeDistillation";

export function buildEvolutionReport(input: {
  totalSessions: number;
  clusters: RuleCluster[];
  compression: CompressionReport;
  conflicts: ConflictHeatmap;
  coverage: CoverageHeatmap;
  confidences: RuleConfidence[];
  gaps: KnowledgeGap[];
  nextQuestions: AdaptiveQuestion[];
}): KnowledgeEvolutionReport {
  const unusedConcepts = ALL_EVIDENCE_LENSES.filter((lens) => {
    const cell = input.coverage.cells.find((c) => c.kind === "LENS" && c.key === lens);
    return !cell || cell.count === 0;
  }).slice(0, 40);

  const topOpportunities = [
    ...input.gaps
      .filter((g) => g.severity === "HIGH")
      .slice(0, 8)
      .map((g) => `${g.kind}: ${g.subject}`),
    ...input.conflicts.cells.slice(0, 5).map((c) => `Conflict ${c.lensA}<->${c.lensB} n=${c.count}`),
  ].slice(0, 20);

  return knowledgeEvolutionReportSchema.parse({
    schemaVersion: KNOWLEDGE_DISTILLATION_SCHEMA_VERSION,
    generatedAtMs: Date.now(),
    totalSessions: input.totalSessions,
    rulesCovered: input.clusters.length,
    repeatedCompressed: input.compression.compressedCount,
    highConflictCount: input.conflicts.cells.filter((c) => c.count >= 2).length,
    highConfidenceCount: input.confidences.filter((c) => c.confidenceScore >= 0.65).length,
    lowConfidenceCount: input.confidences.filter((c) => c.confidenceScore < 0.4).length,
    unusedConcepts,
    nextQuestions: input.nextQuestions.slice(0, 20),
    topOpportunities,
    mentorEligible: false,
    brainMutated: false,
    openAi: false,
  });
}