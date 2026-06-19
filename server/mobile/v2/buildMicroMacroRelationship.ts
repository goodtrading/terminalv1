import type { TerminalState } from "../../terminal-state";
import type { RelationshipBlock } from "./mobileMarketStateV2.types";
import type { MarketContext } from "./mobileMarketStateV2.types";
import { valueAvailable } from "./mobileMarketStateQuality";

function regimesAlign(microRegime: string | null, macroRegime: string | null): string {
  if (!microRegime || !macroRegime) return "unavailable";
  if (microRegime === macroRegime) return "aligned";
  if (
    (microRegime.includes("LONG") && macroRegime.includes("LONG")) ||
    (microRegime.includes("SHORT") && macroRegime.includes("SHORT"))
  ) {
    return "partially_aligned";
  }
  return "divergent";
}

function flipOrdering(
  localFlip: number | null,
  globalFlip: number | null,
): string {
  if (localFlip == null || globalFlip == null) return "unavailable";
  const diff = Math.abs(localFlip - globalFlip);
  const avg = (localFlip + globalFlip) / 2;
  if (avg > 0 && diff / avg < 0.002) return "overlapping";
  return localFlip < globalFlip ? "local_below_global" : "local_above_global";
}

function conflictLevel(regimeAlignment: string, flipOrder: string): string {
  if (regimeAlignment === "unavailable" || flipOrder === "unavailable") return "unavailable";
  if (regimeAlignment === "divergent") return "high";
  if (regimeAlignment === "partially_aligned" && flipOrder !== "overlapping") return "medium";
  if (flipOrder === "overlapping") return "low";
  return "none";
}

function biasAlignment(microBias: string | null, macroBias: string | null): string {
  if (!microBias || !macroBias) return "unavailable";
  if (microBias === macroBias) return "aligned";
  if (
    (microBias === "bullish" && macroBias === "bearish") ||
    (microBias === "bearish" && macroBias === "bullish")
  ) {
    return "divergent";
  }
  return "partially_aligned";
}

function tradeImplicationCode(
  regimeAlignment: string,
  conflict: string,
): string {
  if (regimeAlignment === "aligned" && conflict === "none") return "TREND_CONTINUATION_LIKELY";
  if (regimeAlignment === "divergent" || conflict === "high") return "CONTEXT_CONFLICT_WAIT";
  if (conflict === "medium") return "SELECTIVE_EXECUTION";
  return "MONITOR_BOTH_CONTEXTS";
}

export function buildMicroMacroRelationship(
  micro: MarketContext,
  macro: MarketContext,
): RelationshipBlock {
  const microRegime = micro.gamma.regime.value;
  const macroRegime = macro.gamma.regime.value;
  const regimeAlignment = regimesAlign(microRegime, macroRegime);
  const localFlip = micro.gamma.flip.price.value;
  const globalFlip = macro.gamma.flip.price.value;
  const flipOrder = flipOrdering(localFlip, globalFlip);
  const conflict = conflictLevel(regimeAlignment, flipOrder);
  const biasAlign = biasAlignment(micro.bias.direction.value, macro.bias.direction.value);

  return {
    status: "available",
    regimeAlignment: valueAvailable(regimeAlignment),
    microRegime: micro.gamma.regime,
    macroRegime: macro.gamma.regime,
    biasAlignment: valueAvailable(biasAlign),
    flipOrdering: valueAvailable(flipOrder),
    conflictLevel: valueAvailable(conflict),
    tradeImplication: valueAvailable(tradeImplicationCode(regimeAlignment, conflict)),
    descriptionCode: valueAvailable(
      `REGIME_${regimeAlignment.toUpperCase()}_FLIP_${flipOrder.toUpperCase()}`,
    ),
  };
}

export function notRequestedRelationship(): RelationshipBlock {
  return {
    status: "not_requested",
    regimeAlignment: { value: null, status: "not_applicable" },
    microRegime: { value: null, status: "not_applicable" },
    macroRegime: { value: null, status: "not_applicable" },
    biasAlignment: { value: null, status: "not_applicable" },
    flipOrdering: { value: null, status: "not_applicable" },
    conflictLevel: { value: null, status: "not_applicable" },
    tradeImplication: { value: null, status: "not_applicable" },
    descriptionCode: { value: null, status: "not_applicable" },
  };
}
