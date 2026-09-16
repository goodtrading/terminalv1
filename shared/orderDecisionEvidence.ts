export type OrderDecisionMarketEvidenceQuality = "EXACT_OBSERVED" | "UNAVAILABLE";

export type OrderDecisionEvidence = Readonly<{
  decisionAt: Date;
  marketSource: string;
  marketSourceTimestamp: Date | null;
  bestBid: string | null;
  bestAsk: string | null;
  marketEvidenceQuality: OrderDecisionMarketEvidenceQuality;
}>;

export type OrderDecisionEvidenceInput = OrderDecisionEvidence;

function positiveDecimal(value: string, field: string): string {
  if (typeof value !== "string" || !/^(?:0|[1-9]\d*)(?:\.\d+)?$/.test(value) || /^0(?:\.0+)?$/.test(value)) {
    throw new Error(`${field} must be a positive decimal string`);
  }
  return value;
}

function validDate(value: Date | null, field: string): Date | null {
  if (value === null) return null;
  if (!(value instanceof Date) || !Number.isFinite(value.getTime()) || value.getTime() < 0) throw new Error(`${field} must be a valid UTC date`);
  return new Date(value.getTime());
}

export function createOrderDecisionEvidence(input: OrderDecisionEvidenceInput): OrderDecisionEvidence {
  const decisionAt = validDate(input.decisionAt, "decisionAt");
  if (!decisionAt) throw new Error("decisionAt is required");
  if (typeof input.marketSource !== "string" || input.marketSource.trim() === "") throw new Error("marketSource is required");
  const sourceTimestamp = validDate(input.marketSourceTimestamp, "marketSourceTimestamp");
  if (input.marketEvidenceQuality !== "EXACT_OBSERVED" && input.marketEvidenceQuality !== "UNAVAILABLE") throw new Error("marketEvidenceQuality is invalid");
  if (input.marketEvidenceQuality === "EXACT_OBSERVED") {
    if (input.bestBid === null || input.bestAsk === null || sourceTimestamp === null) throw new Error("exact market evidence requires BBO and source timestamp");
    positiveDecimal(input.bestBid, "bestBid");
    positiveDecimal(input.bestAsk, "bestAsk");
  } else if (input.bestBid !== null || input.bestAsk !== null || sourceTimestamp !== null) {
    throw new Error("unavailable market evidence cannot contain factual BBO");
  }
  return Object.freeze({ decisionAt, marketSource: input.marketSource, marketSourceTimestamp: sourceTimestamp, bestBid: input.bestBid, bestAsk: input.bestAsk, marketEvidenceQuality: input.marketEvidenceQuality });
}

export function unavailableDecisionMarketContext(): Omit<OrderDecisionEvidence, "decisionAt"> {
  return { marketSource: "UNAVAILABLE", marketSourceTimestamp: null, bestBid: null, bestAsk: null, marketEvidenceQuality: "UNAVAILABLE" };
}
