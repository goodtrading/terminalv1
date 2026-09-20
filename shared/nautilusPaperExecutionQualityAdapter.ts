import type { AccountIdentity } from "./portfolioState";
import { createEconomicFill, type EconomicFillRecord } from "./economicFill";
import type { NautilusPaperExecutionEvidence } from "../server/services/nautilusPaperExecutionEvidence";

export type NautilusPaperExecutionQualityAdapterInput = Readonly<{
  evidence: NautilusPaperExecutionEvidence;
  accountIdentity: AccountIdentity;
  fillCompleteness: "COMPLETE" | "PARTIAL" | "UNAVAILABLE" | "CONFLICT";
}>;

export type NautilusPaperExecutionQualityFill = Readonly<{
  environment: "PAPER";
  source: "NAUTILUS_PAPER";
  fill: EconomicFillRecord;
  feeQuality: "SIMULATED_CONFIGURED_FEE";
  fillCompleteness: NautilusPaperExecutionQualityAdapterInput["fillCompleteness"];
}>;

function requiredText(value: unknown, field: string): string {
  if (typeof value !== "string" || value.trim() === "") throw new Error(`${field} is required`);
  return value;
}

export function adaptNautilusPaperExecutionForQuality(
  input: NautilusPaperExecutionQualityAdapterInput,
): NautilusPaperExecutionQualityFill {
  const evidence = input.evidence;
  if (evidence.environment !== "PAPER" || evidence.source !== "NAUTILUS_PAPER") {
    throw new Error("PROVENANCE_NOT_NAUTILUS_PAPER");
  }
  if (input.accountIdentity.environment !== "PAPER") throw new Error("PAPER_ACCOUNT_REQUIRED");
  if (input.accountIdentity.broker !== "NAUTILUS_PAPER") throw new Error("NAUTILUS_PAPER_ACCOUNT_REQUIRED");
  if (evidence.fee.quality !== "SIMULATED_CONFIGURED_FEE") throw new Error("INVALID_FEE_QUALITY");
  if (!["COMPLETE", "PARTIAL", "UNAVAILABLE", "CONFLICT"].includes(input.fillCompleteness)) {
    throw new Error("INVALID_FILL_COMPLETENESS");
  }
  requiredText(evidence.executionId, "executionId");
  requiredText(evidence.instrument.venue, "instrument.venue");
  requiredText(evidence.instrument.marketType, "instrument.marketType");
  requiredText(evidence.instrument.symbol, "instrument.symbol");
  if (evidence.instrument.marketType !== "Spot" && evidence.instrument.marketType !== "Perpetual") {
    throw new Error("UNSUPPORTED_MARKET_TYPE");
  }

  const fill = createEconomicFill({
    executionId: evidence.executionId,
    accountIdentity: input.accountIdentity,
    marketIdentity: {
      instrument: evidence.instrument.symbol,
      venue: evidence.instrument.venue,
      marketType: evidence.instrument.marketType,
    },
    side: evidence.side,
    quantity: evidence.quantity,
    price: evidence.price,
    eventTime: evidence.eventTime,
    liquidityRole: evidence.liquidityRole,
    fee: {
      value: evidence.fee.value,
      currency: evidence.fee.asset,
      quality: evidence.fee.value === null ? "UNAVAILABLE" : evidence.fee.asset === null ? "PARTIAL" : "VALID",
      provenance: {
        source: evidence.source,
      },
    },
    orderReferences: {
      clientOrderId: evidence.orderReferences.clientOrderId,
      ...(evidence.orderReferences.venueOrderId === undefined ? {} : { venueOrderId: evidence.orderReferences.venueOrderId }),
    },
    provenance: {
      source: evidence.source,
      executionId: evidence.executionId,
      clientOrderId: evidence.orderReferences.clientOrderId,
      ...(evidence.orderReferences.venueOrderId === undefined ? {} : { venueOrderId: evidence.orderReferences.venueOrderId }),
      upstreamEventType: "OrderFilled",
      upstreamTimestamp: evidence.eventTime,
    },
  });

  return {
    environment: "PAPER",
    source: "NAUTILUS_PAPER",
    fill,
    feeQuality: "SIMULATED_CONFIGURED_FEE",
    fillCompleteness: input.fillCompleteness,
  };
}