import type { PaperFill } from "./paperTypes";

export type PaperExecutionProvenance = Readonly<{
  source: "PAPER_SIMULATOR";
  environment: "PAPER";
  authority: "SIMULATED";
}>;

type PaperExecutionEvidenceCommon = Readonly<{
  orderId: string;
  tradeId: string;
  price: number;
  quantity: number;
  feeUsdt: number;
  slippageUsdt: number;
  timestamp: string;
  liquidityRole: "UNKNOWN";
}>;

export type LegacyPaperFillEvidence =
  | (PaperExecutionEvidenceCommon & Readonly<{
      status: "AVAILABLE";
      executionId: string;
      provenance: PaperExecutionProvenance;
    }>)
  | Readonly<{
      status: "UNAVAILABLE";
      reason: "MISSING_PERSISTED_FILL_ID";
    }>;

function hasPersistedFillId(fill: PaperFill): fill is PaperFill & Readonly<{ id: string }> {
  return typeof fill.id === "string" && fill.id.trim().length > 0;
}

/**
 * Derive the canonical simulated execution evidence for one legacy PAPER fill.
 * This is intentionally not wired into LIVE or the active PAPER reporting path.
 */
export function adaptLegacyPaperFillEvidence(fill: PaperFill): LegacyPaperFillEvidence {
  if (!hasPersistedFillId(fill)) {
    return { status: "UNAVAILABLE", reason: "MISSING_PERSISTED_FILL_ID" };
  }

  return {
    status: "AVAILABLE",
    executionId: fill.id,
    orderId: fill.orderId,
    tradeId: fill.tradeId,
    price: fill.price,
    quantity: fill.quantity,
    feeUsdt: fill.feeUsdt,
    slippageUsdt: fill.slippageUsdt,
    timestamp: fill.timestamp,
    liquidityRole: "UNKNOWN",
    provenance: {
      source: "PAPER_SIMULATOR",
      environment: "PAPER",
      authority: "SIMULATED",
    },
  };
}
