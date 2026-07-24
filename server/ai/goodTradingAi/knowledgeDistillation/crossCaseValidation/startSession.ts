/**
 * AI-7.3.13 — Start a durable HUMAN cross-case validation session (exactly 5 questions).
 * Never answers for Ignacio. Blind until submit.
 */
import { randomUUID } from "node:crypto";
import type { ChallengeItem } from "@shared/goodTradingAiKnowledgeDistillation";
import type { IndependentEvidenceAudit } from "@shared/goodTradingAiIndependentEvidence";
import { CRITICAL_CALIBRATION_SCHEMA_VERSION } from "@shared/goodTradingAiCriticalCalibration";
import { CROSS_CASE_QUESTION_CAP } from "@shared/goodTradingAiCrossCaseValidation";
import {
  getCriticalCalibrationMemory,
  type CriticalCalibrationSessionRecord,
} from "../../criticalCalibration/memoryStore";
import {
  assertNoForbiddenBlindFields,
  generateCrossCaseQuestions,
  toBlindSafePacket,
} from "./generateQuestions";

export const CROSS_CASE_SESSION_LABEL = "Ignacio Cross-Case Validation 5 — AI-7.3.13" as const;

export function startCrossCaseValidationSession(input: {
  audit: IndependentEvidenceAudit;
  challenges: ChallengeItem[];
  sourceRunId: string;
  priorPrompts?: string[];
  label?: string;
  repositoryDurable?: boolean;
}): {
  session: CriticalCalibrationSessionRecord;
  blindQuestions: ReturnType<typeof toBlindSafePacket>[];
  drafts: ReturnType<typeof generateCrossCaseQuestions>["drafts"];
  hypotheses: ReturnType<typeof generateCrossCaseQuestions>["hypotheses"];
  mentorEligible: false;
  brainMutate: false;
  autoApply: false;
  autoReveal: false;
  realMarketData: false;
  excludeTechnical: true;
  excludeHoldout: true;
  questionCount: 5;
  answeredCount: 0;
} {
  const generated = generateCrossCaseQuestions({
    audit: input.audit,
    challenges: input.challenges,
    priorPrompts: input.priorPrompts,
  });
  if (generated.calibrationQuestions.length !== CROSS_CASE_QUESTION_CAP) {
    throw new Error("CROSS_CASE_QUESTION_CAP");
  }

  const store = getCriticalCalibrationMemory();
  const existing = store.listQuestions();
  const merged = [
    ...existing.filter((q) => !generated.calibrationQuestions.some((n) => n.id === q.id)),
    ...generated.calibrationQuestions,
  ];
  store.saveQuestionQueue(merged);

  const session: CriticalCalibrationSessionRecord = {
    id: randomUUID(),
    seed: `cc13_${Date.now()}`,
    questionIds: generated.calibrationQuestions.map((q) => q.id),
    createdAtMs: Date.now(),
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
    appendOnly: true,
    version: CRITICAL_CALIBRATION_SCHEMA_VERSION,
    kind: "HUMAN",
    revealedQuestionIds: [],
    deferredQuestionIds: [],
    archived: false,
    label: (input.label ?? CROSS_CASE_SESSION_LABEL).slice(0, 80),
    sourceAuditId: input.audit.id,
    sourceRunId: input.sourceRunId,
    excludeTechnical: true,
    excludeHoldout: true,
    realMarketData: false,
    autoReveal: false,
    repositoryDurable: input.repositoryDurable !== false,
    roundKind: "CROSS_CASE_VALIDATION",
  };
  store.saveSession(session);

  const blindQuestions = generated.calibrationQuestions.map((q) => {
    const packet = toBlindSafePacket(q, session.id);
    assertNoForbiddenBlindFields(packet as unknown as Record<string, unknown>);
    return packet;
  });

  return {
    session,
    blindQuestions,
    drafts: generated.drafts,
    hypotheses: generated.hypotheses,
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
    autoReveal: false,
    realMarketData: false,
    excludeTechnical: true,
    excludeHoldout: true,
    questionCount: 5,
    answeredCount: 0,
  };
}
