/**
 * AI-7.2 — Blind human review session service (lightweight path).
 */
import {
  HUMAN_REVIEW_OWNER,
  humanDecisionAnswerSchema,
  type HumanBlindCaseView,
  type HumanDecisionAnswer,
  type HumanDecisionComparison,
  type HumanDecisionReviewReport,
  type MethodologyChangeProposal,
} from "@shared/goodTradingAiHumanReview";
import type { DecisionPathOutcome } from "@shared/goodTradingAiDecisionGraph";
import { evaluateDecisionGraph } from "../decisionGraphEngine";
import { retrieveKnowledge } from "../../knowledge/retrieve";
import { hashAnswerBody, randomizeCaseOrder, toBlindCaseView } from "./biasControls";
import { classifyThreeWay } from "./comparison";
import { createMethodologyProposalFromComparison } from "./approval";
import { buildHumanDecisionReviewReport } from "./report";
import {
  HUMAN_REVIEW_CASES,
  getHumanReviewCase,
} from "./reviewCases";
import {
  getHumanDecisionReviewRepository,
  type HumanDecisionReviewRepository,
  type HumanReviewSessionRecord,
} from "./repository";
import { createHoldoutSnapshot } from "./holdout";

export type BlindSessionStartResult = {
  session: HumanReviewSessionRecord;
  cases: HumanBlindCaseView[];
  mentorEligible: false;
};

export type SubmitAnswerInput = {
  reviewCaseId: string;
  primaryOutcome: DecisionPathOutcome;
  quality?: HumanDecisionAnswer["quality"];
  requiredConfirmations?: string[];
  triggeredInvalidations?: string[];
  confidence: HumanDecisionAnswer["confidence"];
  notes?: string;
  insufficientEvidence: boolean;
  ambiguousReading: boolean;
};

export type RevealResult = {
  comparison: HumanDecisionComparison;
  engineOutcome: DecisionPathOutcome | null;
  goldenExpectOutcomes: DecisionPathOutcome[];
  proposal: MethodologyChangeProposal | null;
  mentorEligible: false;
};

function repo(): HumanDecisionReviewRepository {
  return getHumanDecisionReviewRepository();
}

export function startBlindSession(options?: {
  seed?: string;
  /** Exclude HOLDOUT cohort from the session (first Ignacio lab). */
  excludeHoldout?: boolean;
  /** Cap cases after shuffle (e.g. 10 for first review lab). */
  maxCases?: number;
}): BlindSessionStartResult {
  const seed = options?.seed;
  const excludeHoldout = !!options?.excludeHoldout;
  const maxCases =
    typeof options?.maxCases === "number"
      ? Math.max(1, Math.min(options.maxCases, HUMAN_REVIEW_CASES.length))
      : undefined;

  const r = repo();
  r.ensureDirs();
  if (!r.loadHoldoutSnapshot()) {
    r.saveHoldoutSnapshot(createHoldoutSnapshot());
  }
  const pool = excludeHoldout
    ? HUMAN_REVIEW_CASES.filter((c) => !c.holdout)
    : HUMAN_REVIEW_CASES;
  let ordered = randomizeCaseOrder(pool);
  if (maxCases != null) ordered = ordered.slice(0, maxCases);
  const caseOrder = ordered.map((c) => c.id);
  const session = r.createSession({ caseOrder, seed: seed ?? null });
  const cases = ordered.map((c, i) => toBlindCaseView(c, i));
  return { session, cases, mentorEligible: false };
}

/**
 * Validate + hash + append revision. Does NOT reveal engine/golden.
 */
export function submitHumanAnswer(
  sessionId: string,
  input: SubmitAnswerInput,
  nowMs = Date.now(),
): HumanDecisionAnswer {
  const r = repo();
  const session = r.getSession(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  if (!session.caseOrder.includes(input.reviewCaseId)) {
    throw new Error("CASE_NOT_IN_SESSION");
  }
  const prior = r.getLatestAnswer(sessionId, input.reviewCaseId);
  const revision = (prior?.revision ?? 0) + 1;
  const body = {
    reviewCaseId: input.reviewCaseId,
    primaryOutcome: input.primaryOutcome,
    quality: input.quality,
    requiredConfirmations: input.requiredConfirmations ?? [],
    triggeredInvalidations: input.triggeredInvalidations ?? [],
    confidence: input.confidence,
    notes: input.notes,
    insufficientEvidence: input.insufficientEvidence,
    ambiguousReading: input.ambiguousReading,
  };
  const answerHash = hashAnswerBody(body);
  const candidate = {
    ...body,
    owner: HUMAN_REVIEW_OWNER,
    revision,
    submittedAtMs: nowMs,
    answerHash,
    mentorEligible: false as const,
  };
  const parsed = humanDecisionAnswerSchema.parse(candidate);
  return r.appendAnswer(sessionId, parsed);
}

function runEngineOutcome(scenarioText: string, forceUntrusted?: boolean): DecisionPathOutcome | null {
  const retrieved = retrieveKnowledge({ query: scenarioText, maxResults: 6 });
  const entries = retrieved.matches.map((m) => m.entry).slice(0, 12);
  const result = evaluateDecisionGraph({
    question: scenarioText,
    knowledgeEntries: entries,
    forceUntrusted,
  });
  return result.clientSafe?.primaryOutcome ?? null;
}

/**
 * Reveal only after an answer exists for the case.
 */
export function revealAfterSubmit(sessionId: string, caseId: string): RevealResult {
  const r = repo();
  const session = r.getSession(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  const answer = r.getLatestAnswer(sessionId, caseId);
  if (!answer) throw new Error("ANSWER_REQUIRED_BEFORE_REVEAL");
  const reviewCase = getHumanReviewCase(caseId);
  if (!reviewCase) throw new Error("CASE_NOT_FOUND");

  const engineOutcome = runEngineOutcome(reviewCase.scenarioText, reviewCase.forceUntrusted);
  const comparison = classifyThreeWay({
    reviewCaseId: caseId,
    humanOutcome: answer.primaryOutcome,
    engineOutcome,
    goldenOutcomes: reviewCase.goldenExpectOutcomes,
  });

  let proposal: MethodologyChangeProposal | null = null;
  if (comparison.comparisonClass !== "HUMAN_ENGINE_GOLDEN_AGREE") {
    proposal = createMethodologyProposalFromComparison(comparison);
    r.appendProposal(proposal);
  }

  return {
    comparison,
    engineOutcome,
    goldenExpectOutcomes: reviewCase.goldenExpectOutcomes,
    proposal,
    mentorEligible: false,
  };
}

export function buildSessionReport(sessionId: string): {
  report: HumanDecisionReviewReport;
  comparisons: HumanDecisionComparison[];
  mentorEligible: false;
} {
  const r = repo();
  const session = r.getSession(sessionId);
  if (!session) throw new Error("SESSION_NOT_FOUND");
  const answers = r.getAnswersForSession(sessionId);
  const comparisons: HumanDecisionComparison[] = [];
  let holdoutAnswered = 0;

  for (const a of answers) {
    const c = getHumanReviewCase(a.reviewCaseId);
    if (!c) continue;
    if (c.holdout) holdoutAnswered += 1;
    // Lightweight: classify without re-running engine if costly; still run for accuracy
    const engineOutcome = runEngineOutcome(c.scenarioText, c.forceUntrusted);
    comparisons.push(
      classifyThreeWay({
        reviewCaseId: a.reviewCaseId,
        humanOutcome: a.primaryOutcome,
        engineOutcome,
        goldenOutcomes: c.goldenExpectOutcomes,
      }),
    );
  }

  const proposalsPending = r.listProposals().filter((p) => p.status === "PENDING").length;
  const report = buildHumanDecisionReviewReport({
    comparisons,
    answeredCount: answers.length,
    holdoutAnswered,
    proposalsPending,
    infrastructureReady: true,
    humanReviewComplete: answers.length >= HUMAN_REVIEW_CASES.length,
  });

  return { report, comparisons, mentorEligible: false };
}
