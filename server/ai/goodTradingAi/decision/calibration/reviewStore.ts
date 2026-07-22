/**
 * AI-7.1 — Manual golden review store (no auto Brain mutate).
 */
export type GoldenReviewStatus = "pending" | "approved" | "rejected" | "needs_template_change";

export type GoldenReviewRecord = {
  caseId: string;
  status: GoldenReviewStatus;
  reviewerNote?: string;
  updatedAtMs: number;
  /** Explicit: never mutates knowledge registry automatically */
  brainMutate: false;
};

const store = new Map<string, GoldenReviewRecord>();

export function upsertGoldenReview(
  caseId: string,
  status: GoldenReviewStatus,
  reviewerNote?: string,
): GoldenReviewRecord {
  const rec: GoldenReviewRecord = {
    caseId,
    status,
    reviewerNote: reviewerNote?.slice(0, 400),
    updatedAtMs: Date.now(),
    brainMutate: false,
  };
  store.set(caseId, rec);
  return rec;
}

export function getGoldenReview(caseId: string): GoldenReviewRecord | null {
  return store.get(caseId) ?? null;
}

export function listGoldenReviews(): GoldenReviewRecord[] {
  return [...store.values()];
}

export function resetGoldenReviewsForTests(): void {
  store.clear();
}
