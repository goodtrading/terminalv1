/**
 * AI-7.2 — Three-way comparison Human vs Engine vs Golden.
 * Detects circular calibration (engine≈golden while human differs systematically).
 */
import type { DecisionPathOutcome } from "@shared/goodTradingAiDecisionGraph";
import type {
  DisagreementTaxonomyCode,
  HumanDecisionComparison,
  ThreeWayComparisonClass,
} from "@shared/goodTradingAiHumanReview";

const DEFINITE: DecisionPathOutcome[] = [
  "HYPOTHESIS_SUPPORTED",
  "HYPOTHESIS_INVALIDATED",
  "READING_CONFLICTED",
];

const INSUFFICIENT_LIKE: DecisionPathOutcome[] = [
  "EVIDENCE_INSUFFICIENT",
  "HYPOTHESIS_OPEN",
  "NEEDS_MORE_LENSES",
  "CONTEXT_UNTRUSTED",
  "CONTEXT_STALE",
  "GUARD_BLOCKED",
];

function inGolden(
  outcome: DecisionPathOutcome | null | undefined,
  golden: DecisionPathOutcome[],
): boolean {
  if (!outcome) return false;
  return golden.includes(outcome);
}

export function classifyThreeWay(params: {
  reviewCaseId: string;
  humanOutcome: DecisionPathOutcome | null;
  engineOutcome: DecisionPathOutcome | null;
  goldenOutcomes: DecisionPathOutcome[];
}): HumanDecisionComparison {
  const { reviewCaseId, humanOutcome, engineOutcome, goldenOutcomes } = params;

  if (!humanOutcome) {
    return {
      reviewCaseId,
      humanOutcome: null,
      engineOutcome,
      goldenOutcomes,
      comparisonClass: "PENDING_HUMAN",
      taxonomyCodes: ["DIS_NONE"],
      circularCalibrationRisk: false,
    };
  }

  const hE = !!engineOutcome && humanOutcome === engineOutcome;
  const hG = inGolden(humanOutcome, goldenOutcomes);
  const eG = inGolden(engineOutcome, goldenOutcomes);

  let comparisonClass: ThreeWayComparisonClass;
  if (hE && hG) comparisonClass = "HUMAN_ENGINE_GOLDEN_AGREE";
  else if (hE && !hG) comparisonClass = "HUMAN_ENGINE_AGREE_GOLDEN_DIFF";
  else if (hG && !hE) comparisonClass = "HUMAN_GOLDEN_AGREE_ENGINE_DIFF";
  else if (eG && !hE && !hG) comparisonClass = "ENGINE_GOLDEN_AGREE_HUMAN_DIFF";
  else comparisonClass = "THREE_WAY_SPLIT";

  if (
    INSUFFICIENT_LIKE.includes(humanOutcome) &&
    engineOutcome &&
    DEFINITE.includes(engineOutcome)
  ) {
    comparisonClass = "HUMAN_INSUFFICIENT_ENGINE_DEFINITE";
  }

  // Circular calibration: engine locked to golden while human systematically differs
  let circularCalibrationRisk = false;
  if (eG && !hG && !hE) {
    circularCalibrationRisk = true;
    comparisonClass = "CIRCULAR_CALIBRATION_SIGNAL";
  }

  return {
    reviewCaseId,
    humanOutcome,
    engineOutcome,
    goldenOutcomes,
    comparisonClass,
    taxonomyCodes: suggestTaxonomy({
      humanOutcome,
      engineOutcome,
      goldenOutcomes,
      comparisonClass,
    }),
    circularCalibrationRisk,
  };
}

export function suggestTaxonomy(params: {
  humanOutcome: DecisionPathOutcome;
  engineOutcome: DecisionPathOutcome | null;
  goldenOutcomes: DecisionPathOutcome[];
  comparisonClass: ThreeWayComparisonClass;
}): DisagreementTaxonomyCode[] {
  const codes = new Set<DisagreementTaxonomyCode>();
  const { humanOutcome, engineOutcome, comparisonClass } = params;

  if (comparisonClass === "HUMAN_ENGINE_GOLDEN_AGREE") {
    codes.add("DIS_NONE");
    return [...codes];
  }

  if (comparisonClass === "CIRCULAR_CALIBRATION_SIGNAL") {
    codes.add("DIS_GOLDEN_STALE");
    codes.add("DIS_ENGINE_BUG_SUSPECT");
  }
  if (comparisonClass === "HUMAN_INSUFFICIENT_ENGINE_DEFINITE") {
    codes.add("DIS_INSUFFICIENT_VS_DEFINITE");
    codes.add("DIS_OVERREACT_ISOLATED");
  }
  if (humanOutcome === "HYPOTHESIS_INVALIDATED" || engineOutcome === "HYPOTHESIS_INVALIDATED") {
    codes.add("DIS_INVALIDATION_PRIORITY");
  }
  if (
    humanOutcome === "CONTEXT_UNTRUSTED" ||
    humanOutcome === "CONTEXT_STALE" ||
    engineOutcome === "CONTEXT_UNTRUSTED" ||
    engineOutcome === "CONTEXT_STALE"
  ) {
    codes.add("DIS_CONTEXT_TRUST");
  }
  if (humanOutcome === "READING_CONFLICTED" || engineOutcome === "READING_CONFLICTED") {
    codes.add("DIS_MULTI_LENS_CONFLICT");
  }
  if (humanOutcome === "EVIDENCE_INSUFFICIENT" || humanOutcome === "NEEDS_MORE_LENSES") {
    codes.add("DIS_AMBIGUITY_TOLERANCE");
  }
  if (comparisonClass === "HUMAN_GOLDEN_AGREE_ENGINE_DIFF") {
    codes.add("DIS_TEMPLATE_MISMATCH");
  }
  if (comparisonClass === "HUMAN_ENGINE_AGREE_GOLDEN_DIFF") {
    codes.add("DIS_GOLDEN_STALE");
  }
  if (codes.size === 0) codes.add("DIS_HUMAN_NOTES_ONLY");
  return [...codes].slice(0, 8);
}
