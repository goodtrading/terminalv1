/**
 * AI-7.3.13 — Classify hypotheses after combining prior + cross-case decision units.
 * Addenda/revisions never inflate caseCount. Correlated/metamorphic ≠ full independent support.
 */
import {
  hypothesisResultSchema,
  type CrossCaseHypothesis,
  type HypothesisResult,
  type HypothesisSupportClass,
} from "@shared/goodTradingAiCrossCaseValidation";
import type { HumanDecisionUnit } from "@shared/goodTradingAiIndependentEvidence";
import {
  SCENARIO_SUPPORT_WEIGHT,
  type ScenarioSimilarityClass,
} from "@shared/goodTradingAiIndependentEvidence";

export type UnitHypothesisLink = {
  unitId: string;
  hypothesisId: string;
  relationToOriginal: ScenarioSimilarityClass;
  supports: boolean;
  withConditions: boolean;
  counterexample: boolean;
  contradicts: boolean;
};

function classifyOne(input: {
  hypothesis: CrossCaseHypothesis;
  links: UnitHypothesisLink[];
}): HypothesisResult {
  const links = input.links.filter((l) => l.hypothesisId === input.hypothesis.id);
  const independent = links.filter(
    (l) => l.relationToOriginal === "DISTINCT" || l.relationToOriginal === "RELATED",
  );
  const distinct = independent.filter((l) => l.relationToOriginal === "DISTINCT");
  const related = independent.filter((l) => l.relationToOriginal === "RELATED");
  const weighted = independent.reduce(
    (s, l) => s + (l.supports || l.withConditions ? SCENARIO_SUPPORT_WEIGHT[l.relationToOriginal] : 0),
    0,
  );
  const counter = links.some((l) => l.counterexample);
  const contradicted = links.some((l) => l.contradicts);
  const conditioned = links.some((l) => l.withConditions);
  const supportingDistinct = distinct.filter((l) => l.supports || l.withConditions).length;

  let classification: HypothesisSupportClass = "STILL_UNRESOLVED";
  let detail = "Insufficient independent cross-case evidence.";
  if (contradicted && !conditioned) {
    classification = "CONTRADICTED";
    detail = "Independent unit contradicts prior claim without resolving condition.";
  } else if (counter) {
    classification = "COUNTEREXAMPLE_FOUND";
    detail = "Counterexample found; scope rewrite may be required.";
  } else if (supportingDistinct >= 2 && weighted >= 2) {
    classification = conditioned ? "SUPPORTED_WITH_CONDITIONS" : "CROSS_CASE_SUPPORTED";
    detail = conditioned
      ? "≥2 distinct cases support claim with explicit conditions."
      : "≥2 distinct independent cases support claim.";
  } else if (supportingDistinct >= 1 && conditioned) {
    classification = "SUPPORTED_WITH_CONDITIONS";
    detail = "Support present but conditioned; needs more distinct cases for CROSS_CASE_SUPPORTED.";
  } else if (links.length >= 1 && supportingDistinct === 0 && related.length > 0) {
    classification = "SCENARIO_SPECIFIC";
    detail = "Only related/correlated support; treats as scenario-specific.";
  } else if (links.length >= 1 && supportingDistinct === 1) {
    classification = "SCENARIO_SPECIFIC";
    detail = "Single distinct case only — not cross-case supported.";
  }

  return hypothesisResultSchema.parse({
    hypothesisId: input.hypothesis.id,
    classification,
    independentCaseCount: independent.length,
    distinctScenarioCount: distinct.length,
    relatedScenarioCount: related.length,
    conditionsPreserved: conditioned || classification === "CROSS_CASE_SUPPORTED",
    counterexampleFound: counter,
    detail,
    mentorEligible: false,
  });
}

export function classifyHypothesisResults(input: {
  hypotheses: CrossCaseHypothesis[];
  links: UnitHypothesisLink[];
  /** Decision units involved — used only for counts; never store answer text. */
  decisionUnits: Array<Pick<HumanDecisionUnit, "unitId" | "independentSupportWeight">>;
}): HypothesisResult[] {
  void input.decisionUnits;
  return input.hypotheses.map((h) => classifyOne({ hypothesis: h, links: input.links }));
}

/** Correlated / metamorphic support is penalized (not full 1.0). */
export function correlatedSupportPenalty(relation: ScenarioSimilarityClass): number {
  return SCENARIO_SUPPORT_WEIGHT[relation];
}
