/**
 * AI-7.2 — Human decision review report builder.
 */
import {
  HUMAN_REVIEW_SCHEMA_VERSION,
  type HumanDecisionComparison,
  type HumanDecisionReviewReport,
} from "@shared/goodTradingAiHumanReview";
import { HUMAN_REVIEW_CASES } from "./reviewCases";

export function buildHumanDecisionReviewReport(params: {
  comparisons: HumanDecisionComparison[];
  answeredCount: number;
  holdoutAnswered?: number;
  proposalsPending?: number;
  infrastructureReady?: boolean;
  humanReviewComplete?: boolean;
  nowMs?: number;
}): HumanDecisionReviewReport {
  const totalCases = HUMAN_REVIEW_CASES.length;
  const answeredCount = params.answeredCount;
  const pendingHumanCount = Math.max(0, totalCases - answeredCount);
  const holdoutTotal = HUMAN_REVIEW_CASES.filter((c) => c.holdout).length;
  const holdoutAnswered = params.holdoutAnswered ?? 0;
  const holdoutPending = Math.max(0, holdoutTotal - holdoutAnswered);

  const comps = params.comparisons.filter((c) => c.comparisonClass !== "PENDING_HUMAN");
  let he = 0;
  let hg = 0;
  let eg = 0;
  let three = 0;
  let circular = 0;
  const taxonomyCounts: Record<string, number> = {};

  for (const c of comps) {
    if (c.humanOutcome && c.engineOutcome && c.humanOutcome === c.engineOutcome) he += 1;
    if (c.humanOutcome && c.goldenOutcomes.includes(c.humanOutcome)) hg += 1;
    if (c.engineOutcome && c.goldenOutcomes.includes(c.engineOutcome)) eg += 1;
    if (c.comparisonClass === "HUMAN_ENGINE_GOLDEN_AGREE") three += 1;
    if (c.circularCalibrationRisk || c.comparisonClass === "CIRCULAR_CALIBRATION_SIGNAL") {
      circular += 1;
    }
    for (const code of c.taxonomyCodes) {
      taxonomyCounts[code] = (taxonomyCounts[code] ?? 0) + 1;
    }
  }

  const denom = Math.max(1, comps.length);
  const infrastructureReady = params.infrastructureReady ?? true;
  const humanReviewComplete = params.humanReviewComplete ?? false;

  let overall: HumanDecisionReviewReport["gatesStatus"]["overall"] = "NO_GO";
  if (infrastructureReady && humanReviewComplete) overall = "GO";
  else if (infrastructureReady && !humanReviewComplete) {
    overall = "GO_PARCIAL_INFRASTRUCTURE_READY";
  }

  return {
    schemaVersion: HUMAN_REVIEW_SCHEMA_VERSION,
    generatedAtMs: params.nowMs ?? Date.now(),
    mentorEligible: false,
    totalCases,
    answeredCount,
    pendingHumanCount,
    holdoutAnswered,
    holdoutPending,
    agreementRates: {
      humanEngine: he / denom,
      humanGolden: hg / denom,
      engineGolden: eg / denom,
      threeWay: three / denom,
    },
    circularCalibrationSignals: circular,
    taxonomyCounts,
    proposalsPending: params.proposalsPending ?? 0,
    proposedGates: {
      minHumanCoverage: 0.95,
      maxCircularSignals: 3,
      holdoutRequiredBeforeCalibrationAdjust: true,
      autoApproveGolden: false,
      autoAdjustExpectations: false,
    },
    gatesStatus: {
      infrastructureReady,
      humanReviewComplete,
      overall,
    },
    notes: [
      "Blind human methodology review — no Mentor live.",
      "Holdout isolated from calibration adjustments.",
      "Proposals stay PENDING; never auto-approve golden.",
    ],
  };
}
