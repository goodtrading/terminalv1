/**
 * AI-7.2 — Bias controls for blind human review.
 */
import { createHash, randomInt } from "node:crypto";
import type { HumanBlindCaseView, HumanReviewCase } from "@shared/goodTradingAiHumanReview";

export function toBlindCaseView(
  c: HumanReviewCase,
  orderIndex: number,
): HumanBlindCaseView {
  let displayCohort: HumanBlindCaseView["displayCohort"] = "STANDARD";
  if (c.cohort === "AMBIGUOUS") displayCohort = "AMBIGUOUS";
  else if (c.cohort === "INSUFFICIENT") displayCohort = "INSUFFICIENT";
  // HOLDOUT / REWORDED / NEW → STANDARD (no leak)
  return {
    id: c.id,
    displayCohort,
    scenarioText: c.scenarioText,
    scenarioContext: c.scenarioContext,
    lensesHint: c.lensesHint,
    orderIndex,
  };
}

/** Fisher–Yates with crypto randomness. */
export function randomizeCaseOrder<T>(items: T[]): T[] {
  const arr = [...items];
  for (let i = arr.length - 1; i > 0; i--) {
    const j = randomInt(0, i + 1);
    [arr[i], arr[j]] = [arr[j]!, arr[i]!];
  }
  return arr;
}

export function hashAnswerBody(body: {
  reviewCaseId: string;
  primaryOutcome: string;
  quality?: string;
  requiredConfirmations: string[];
  triggeredInvalidations: string[];
  confidence: string;
  notes?: string;
  insufficientEvidence: boolean;
  ambiguousReading: boolean;
}): string {
  const payload = JSON.stringify({
    reviewCaseId: body.reviewCaseId,
    primaryOutcome: body.primaryOutcome,
    quality: body.quality ?? null,
    requiredConfirmations: body.requiredConfirmations,
    triggeredInvalidations: body.triggeredInvalidations,
    confidence: body.confidence,
    notes: body.notes ?? "",
    insufficientEvidence: body.insufficientEvidence,
    ambiguousReading: body.ambiguousReading,
  });
  return createHash("sha256").update(payload).digest("hex");
}

/** Assert scenario text does not leak obvious expected outcome tokens. */
export function scenarioLeaksAnswer(text: string): boolean {
  const leak =
    /\b(PASS|FAIL|EXPECTED|GOLDEN|ENGINE_OUTCOME|HYPOTHESIS_SUPPORTED|HYPOTHESIS_INVALIDATED|must conclude|respuesta correcta)\b/i;
  return leak.test(text);
}
