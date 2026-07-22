/**
 * AI-7.2 — Sanitized Decision Methodology Review packet export.
 */
import {
  HUMAN_REVIEW_OWNER,
  HUMAN_REVIEW_SCHEMA_VERSION,
  type HumanDecisionAnswer,
  type HumanDecisionComparison,
  type HumanDecisionReviewReport,
  type MethodologyChangeProposal,
} from "@shared/goodTradingAiHumanReview";
import { HUMAN_REVIEW_CASES } from "./reviewCases";
import type { HoldoutSnapshot } from "./holdout";

const SECRET_RE =
  /(api[_-]?key|secret|password|token|authorization|bearer\s+[a-z0-9._-]+)/gi;

function stripSecrets(text: string): string {
  return text.replace(SECRET_RE, "[REDACTED]");
}

function sanitizeAnswer(a: HumanDecisionAnswer): Partial<HumanDecisionAnswer> {
  return {
    reviewCaseId: a.reviewCaseId,
    owner: a.owner,
    primaryOutcome: a.primaryOutcome,
    quality: a.quality,
    requiredConfirmations: a.requiredConfirmations,
    triggeredInvalidations: a.triggeredInvalidations,
    confidence: a.confidence,
    notes: a.notes ? stripSecrets(a.notes).slice(0, 400) : undefined,
    insufficientEvidence: a.insufficientEvidence,
    ambiguousReading: a.ambiguousReading,
    revision: a.revision,
    submittedAtMs: a.submittedAtMs,
    answerHash: a.answerHash,
    mentorEligible: false,
  };
}

export type DecisionMethodologyReviewPacket = {
  schemaVersion: typeof HUMAN_REVIEW_SCHEMA_VERSION;
  owner: typeof HUMAN_REVIEW_OWNER;
  mentorEligible: false;
  generatedAtMs: number;
  caseCount: number;
  holdoutFingerprint: string | null;
  report: HumanDecisionReviewReport | null;
  comparisons: HumanDecisionComparison[];
  proposals: MethodologyChangeProposal[];
  /** Included only when includeAnswers=true; notes stripped of secrets. */
  answers?: Array<Partial<HumanDecisionAnswer>>;
  notes: string[];
};

export function buildDecisionMethodologyReviewPacket(params: {
  report?: HumanDecisionReviewReport | null;
  comparisons?: HumanDecisionComparison[];
  proposals?: MethodologyChangeProposal[];
  answers?: HumanDecisionAnswer[];
  holdout?: HoldoutSnapshot | null;
  includeAnswers?: boolean;
  nowMs?: number;
}): DecisionMethodologyReviewPacket {
  const includeAnswers = params.includeAnswers === true;
  return {
    schemaVersion: HUMAN_REVIEW_SCHEMA_VERSION,
    owner: HUMAN_REVIEW_OWNER,
    mentorEligible: false,
    generatedAtMs: params.nowMs ?? Date.now(),
    caseCount: HUMAN_REVIEW_CASES.length,
    holdoutFingerprint: params.holdout?.fingerprint ?? null,
    report: params.report ?? null,
    comparisons: params.comparisons ?? [],
    proposals: (params.proposals ?? []).map((p) => ({
      ...p,
      autoApply: false,
      brainMutate: false,
      rationale: stripSecrets(p.rationale),
    })),
    ...(includeAnswers
      ? { answers: (params.answers ?? []).map(sanitizeAnswer) }
      : {}),
    notes: [
      "Sanitized export — no raw private notes dump unless includeAnswers.",
      "mentorEligible=false; educational methodology review only.",
    ],
  };
}
