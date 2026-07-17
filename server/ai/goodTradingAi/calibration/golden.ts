import { randomUUID } from "node:crypto";
import type { CalibrationReview, GoodTradingGoldenCase } from "@shared/goodTradingAiCalibration";
import { addGoldenCase, listGoldenCases } from "./store";

/**
 * Golden cases only from APPROVED reviews.
 * Start empty — do NOT invent Ignacio approvals.
 */
export function listApprovedGoldenCases(): GoodTradingGoldenCase[] {
  return listGoldenCases();
}

export function tryCreateGoldenFromReview(review: CalibrationReview): GoodTradingGoldenCase | null {
  if (review.decision !== "APPROVED") return null;
  if (!review.ignacioAnswer.trim()) return null;

  // Avoid duplicates for same review
  if (listGoldenCases().some((g) => g.sourceReviewId === review.id)) return null;

  const g: GoodTradingGoldenCase = {
    id: `golden_${randomUUID().slice(0, 10)}`,
    sourceReviewId: review.id,
    sourceCaseId: review.caseId,
    reasoningPoints: review.ignacioAnswer
      .split(/\n+/)
      .map((s) => s.trim())
      .filter(Boolean)
      .slice(0, 8),
    requiredConcepts: review.aiSnapshot.knowledgeReferences.map((r) => r.id).slice(0, 8),
    requiredPrinciples: review.aiSnapshot.knowledgeReferences
      .filter((r) => r.category === "constitution")
      .map((r) => r.id)
      .slice(0, 8),
    forbiddenClaims: [
      "compra ahora",
      "vende ahora",
      "análisis del mercado en vivo",
      "wall confirma reversión",
    ],
    createdAt: new Date().toISOString(),
  };
  return addGoldenCase(g);
}
