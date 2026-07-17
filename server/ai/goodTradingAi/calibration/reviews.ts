import { randomUUID } from "node:crypto";
import {
  calibrationReviewInputSchema,
  type CalibrationReview,
  type CalibrationReviewInput,
} from "@shared/goodTradingAiCalibration";
import { getCalibrationCaseById } from "./cases";
import { buildCurrentAiResponseForCase } from "./responseSnapshot";
import { sanitizeEditorialText } from "./sanitize";
import { getReviewByCaseId, upsertReview } from "./store";
import { getKnowledgeRegistryVersion } from "./registryVersion";
import { generateProposalsForReview } from "./proposals";

export function createOrUpdateReview(params: {
  input: unknown;
  userId: number;
  userEmail?: string;
}): CalibrationReview {
  const parsed = calibrationReviewInputSchema.safeParse(params.input);
  if (!parsed.success) {
    throw Object.assign(new Error("INVALID_REVIEW"), { code: "INVALID_REQUEST" });
  }
  const input: CalibrationReviewInput = parsed.data;
  const caseItem = getCalibrationCaseById(input.caseId);
  if (!caseItem) {
    throw Object.assign(new Error("CASE_NOT_FOUND"), { code: "INVALID_REQUEST" });
  }

  const aiSnapshot = buildCurrentAiResponseForCase(caseItem);
  const existing = getReviewByCaseId(input.caseId);
  const now = new Date().toISOString();
  const review: CalibrationReview = {
    id: existing?.id ?? `rev_${randomUUID().slice(0, 12)}`,
    caseId: input.caseId,
    decision: input.decision,
    ignacioAnswer: sanitizeEditorialText(input.ignacioAnswer ?? "", 8000),
    corrections: sanitizeEditorialText(input.corrections ?? "", 4000),
    missingContext: sanitizeEditorialText(input.missingContext ?? "", 2000),
    notes: sanitizeEditorialText(input.notes ?? "", 2000),
    reviewedByUserId: params.userId,
    reviewedByEmail: params.userEmail,
    createdAt: existing?.createdAt ?? now,
    updatedAt: now,
    version: (existing?.version ?? 0) + 1,
    registryVersion: getKnowledgeRegistryVersion(),
    aiSnapshot,
    proposalIds: [],
  };

  // NEVER mutate knowledge registry here — only generate proposals when changes requested.
  if (input.decision === "APPROVED_WITH_CHANGES" || input.decision === "REJECTED") {
    const proposals = generateProposalsForReview(review, caseItem);
    review.proposalIds = proposals.map((p) => p.id);
  }

  // Golden cases only from APPROVED — never invent; create scaffold only when approved with answer.
  // Actual golden promotion is explicit via separate endpoint/helper (empty by default).

  upsertReview(review);
  return review;
}
