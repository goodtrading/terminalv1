/**
 * Session Analyzer — reads ONLY Human Review + Critical Calibration answers.
 * Never treats Brain as source of truth.
 */
import type { DistilledObservation, DistilledSignal } from "@shared/goodTradingAiKnowledgeDistillation";
import { distilledObservationSchema } from "@shared/goodTradingAiKnowledgeDistillation";
import type { EvidenceLens } from "@shared/goodTradingAiCriticalCalibration";
import { HumanDecisionReviewRepository } from "../decision/humanReview/repository";
import { getCriticalCalibrationMemory } from "../criticalCalibration/memoryStore";
import { extractLensesFromText } from "./normalize";

function uniqLenses(list: EvidenceLens[]): EvidenceLens[] {
  return [...new Set(list)].slice(0, 12);
}

export function analyzeHumanReviewSessions(
  repo = new HumanDecisionReviewRepository(),
): DistilledObservation[] {
  const out: DistilledObservation[] = [];
  for (const session of repo.listSessions()) {
    const answers = repo.getAnswersForSession(session.id);
    for (const a of answers) {
      const parts = [
        a.notes ?? "",
        ...a.requiredConfirmations.map((c) => `confirm:${c}`),
        ...a.triggeredInvalidations.map((i) => `invalidate:${i}`),
        a.insufficientEvidence ? "insufficient_evidence" : "",
        a.ambiguousReading ? "ambiguous_reading" : "",
        `outcome:${a.primaryOutcome}`,
      ].filter(Boolean);
      const text = parts.join(" | ").slice(0, 4000) || `outcome:${a.primaryOutcome}`;
      const signals: DistilledSignal[] = ["ANSWER"];
      if (a.insufficientEvidence) signals.push("NEEDS_MORE_EVIDENCE");
      if (a.ambiguousReading) signals.push("NEEDS_CONDITIONS");
      const lenses = uniqLenses([
        ...extractLensesFromText(text),
        ...extractLensesFromText(a.requiredConfirmations.join(" ")),
      ]);
      out.push(
        distilledObservationSchema.parse({
          id: `hr_${session.id.slice(0, 8)}_${a.reviewCaseId}`.slice(0, 96),
          sourceKind: "HUMAN_REVIEW",
          sessionId: session.id,
          itemId: a.reviewCaseId,
          text,
          lenses,
          signals,
          confidence: a.confidence,
          createdAtMs: a.submittedAtMs,
          mentorEligible: false,
        }),
      );
    }
  }
  return out;
}

export function analyzeCriticalCalibrationSessions(): DistilledObservation[] {
  const store = getCriticalCalibrationMemory();
  const out: DistilledObservation[] = [];
  for (const session of store.listSessions()) {
    const obs = store.listObservations(session.id);
    for (const o of obs) {
      const signals: DistilledSignal[] = [];
      if (o.postRevealAction) signals.push(o.postRevealAction as DistilledSignal);
      else if (o.observationKind === "REVISION") signals.push("REVISION");
      else if (o.observationKind === "ADDENDUM") signals.push("ADD_NOTE");
      else signals.push("ANSWER");
      const extra = [
        ...(o.conditions ?? []).map((c) => `cond:${c}`),
        ...(o.minimumConfirmations ?? []).map((c) => `confirm:${c}`),
        ...(o.invalidations ?? []).map((i) => `invalidate:${i}`),
        o.answerType ? `type:${o.answerType}` : "",
      ]
        .filter(Boolean)
        .join(" | ");
      const text = [o.humanNote, extra].filter(Boolean).join(" | ").slice(0, 4000);
      out.push(
        distilledObservationSchema.parse({
          id: `cc_${o.id}`.slice(0, 96),
          sourceKind: "CRITICAL_CALIBRATION",
          sessionId: o.sessionId,
          itemId: o.questionId,
          text,
          lenses: uniqLenses(extractLensesFromText(text)),
          signals,
          confidence: o.confidence,
          createdAtMs: o.createdAtMs,
          mentorEligible: false,
        }),
      );
    }
  }
  return out;
}

export function analyzeAllSessions(input?: {
  humanRepo?: HumanDecisionReviewRepository;
}): DistilledObservation[] {
  const human = analyzeHumanReviewSessions(input?.humanRepo);
  const cc = analyzeCriticalCalibrationSessions();
  return [...human, ...cc].sort((a, b) => a.createdAtMs - b.createdAtMs);
}