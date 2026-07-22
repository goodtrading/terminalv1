import {
  CRITICAL_CALIBRATION_SCHEMA_VERSION,
  criticalCalibrationReportSchema,
  type CalibrationMetrics,
  type CalibrationQuestion,
  type CriticalCalibrationReport,
  type CriticalReview,
  type ImprovementProposal,
  type ReportLabel,
  type SyntheticScenario,
} from "@shared/goodTradingAiCriticalCalibration";

export function buildCriticalCalibrationReport(input: {
  reviews: CriticalReview[];
  proposals: ImprovementProposal[];
  scenarios: SyntheticScenario[];
  metrics: CalibrationMetrics;
  questions: CalibrationQuestion[];
  hasHumanAnswers?: boolean;
  nowMs?: number;
}): CriticalCalibrationReport {
  const weakRules = input.reviews
    .flatMap((r) => r.findings.filter((f) => f.severity === "HIGH").map((f) => f.kind))
    .slice(0, 16);
  const unusedRules = input.proposals.filter((p) => p.kind === "REMOVE_DEAD_RULE").map((p) => p.title);
  const hotspots = input.proposals
    .filter((p) => p.status === "PENDING" && p.impact === "HIGH")
    .map((p) => p.title)
    .slice(0, 12);
  const highUncertaintyScenarios = input.reviews
    .filter((r) => ["UNKNOWN", "MULTIPLE_VALID_INTERPRETATIONS", "INSUFFICIENT_EVIDENCE"].includes(r.taxonomy))
    .map((r) => r.scenarioId)
    .slice(0, 24);

  const hasHuman = input.hasHumanAnswers === true;
  const labels: ReportLabel[] = hasHuman
    ? ["LEARNED_FROM_IGNACIO", "OBSERVED_BY_ENGINE"]
    : ["OBSERVED_BY_ENGINE", "QUESTION_PENDING", "HYPOTHESIS_ONLY"];

  const learnedSummary = hasHuman
    ? [
        `${input.metrics.reviewCount} revisiones con respuestas humanas (LEARNED_FROM_IGNACIO).`,
        `${input.metrics.pendingProposals} propuestas pendientes — sin auto-aplicar al Brain.`,
      ]
    : [
        `[OBSERVED_BY_ENGINE] ${input.metrics.reviewCount} revisiones criticas sinteticas.`,
        `[QUESTION_PENDING] ${input.questions.length} preguntas en cola — sin respuestas de Ignacio.`,
        `[HYPOTHESIS_ONLY] POTENTIAL_EDGE nunca se trata como edge empirico validado.`,
        `${input.metrics.pendingProposals} propuestas candidatas PENDING — sin auto-aplicar.`,
        `Conflictos: ${input.metrics.conflictCount}; incertidumbre alta: ${input.metrics.highUncertaintyCount}.`,
      ];

  return criticalCalibrationReportSchema.parse({
    schemaVersion: CRITICAL_CALIBRATION_SCHEMA_VERSION,
    generatedAtMs: input.nowMs ?? Date.now(),
    labels,
    learnedSummary,
    weakRules,
    unusedRules,
    ignacioChangeHotspots: hasHuman ? hotspots : [],
    highUncertaintyScenarios,
    nextQuestions: input.questions.slice(0, 20),
    metrics: input.metrics,
    mentorEligible: false,
    brainMutated: false,
  });
}
