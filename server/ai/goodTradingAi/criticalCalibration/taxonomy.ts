import type { DecisionPathOutcome } from "@shared/goodTradingAiDecisionGraph";
import {
  TAXONOMY_IDS,
  type DisagreementTaxonomy,
  type SyntheticScenario,
} from "@shared/goodTradingAiCriticalCalibration";

const DEFINITE: DecisionPathOutcome[] = ["HYPOTHESIS_SUPPORTED", "HYPOTHESIS_INVALIDATED", "READING_CONFLICTED"];
const CAUTIOUS: DecisionPathOutcome[] = ["HYPOTHESIS_OPEN", "HYPOTHESIS_WEAKENED", "EVIDENCE_INSUFFICIENT", "NEEDS_MORE_LENSES"];

function hasStrongLens(scenario: SyntheticScenario, lens: string): boolean {
  return scenario.lenses.some((l) => l.lens === lens && l.strength === "STRONG");
}

function hasStale(scenario: SyntheticScenario): boolean {
  return scenario.lenses.some((l) => l.lens === "STALENESS" && l.strength !== "ABSENT");
}

function hasConflict(scenario: SyntheticScenario): boolean {
  return scenario.lenses.some((l) => l.lens === "CONFLICTS" || l.polarity === "CONFLICTING");
}

function isDefinite(outcome: DecisionPathOutcome | null | undefined): boolean {
  return outcome != null && DEFINITE.includes(outcome);
}

function isCautious(outcome: DecisionPathOutcome | null | undefined): boolean {
  return outcome == null || CAUTIOUS.includes(outcome);
}

export { TAXONOMY_IDS };

export function classifyDisagreement(
  engine: DecisionPathOutcome | null | undefined,
  human: DecisionPathOutcome | null | undefined,
  scenario: SyntheticScenario,
): DisagreementTaxonomy {
  if (engine != null && human != null && engine === human) return "LIKELY_CORRECT";
  if (engine == null && human == null) return "INSUFFICIENT_EVIDENCE";
  if (hasStrongLens(scenario, "DELTA") && isDefinite(engine) && isCautious(human)) return "LIKELY_TOO_AGGRESSIVE";
  if (hasStale(scenario) && isDefinite(engine)) return "LIKELY_TOO_AGGRESSIVE";
  if (hasStale(scenario) && isCautious(engine) && isDefinite(human)) return "LIKELY_TOO_CONSERVATIVE";
  if (hasConflict(scenario) && engine != null && human != null && engine !== human) return "MULTIPLE_VALID_INTERPRETATIONS";
  if (engine != null && human != null && isDefinite(engine) && isDefinite(human)) return "METHODOLOGY_DIFFERENCE";
  if (hasStrongLens(scenario, "ABSORPTION") && human === "HYPOTHESIS_SUPPORTED" && engine === "EVIDENCE_INSUFFICIENT") return "POTENTIAL_EDGE";
  if (hasStrongLens(scenario, "SPOOFING") && engine === "HYPOTHESIS_SUPPORTED") return "POTENTIAL_BIAS";
  if (isCautious(engine) && isCautious(human)) return "INSUFFICIENT_EVIDENCE";
  if (engine != null && human != null) return "MULTIPLE_VALID_INTERPRETATIONS";
  return "UNKNOWN";
}
