/**
 * AI-7.1 — DecisionCalibrationReport + gates.
 */
import type { InvariantResult } from "./invariants";

export type DecisionCalibrationReport = {
  schemaVersion: "1.0";
  generatedAtMs: number;
  goldenTotal: number;
  goldenPassed: number;
  invariantResults: InvariantResult[];
  invariantsPassRate: number;
  counterfactualPairs: number;
  counterfactualChecked: number;
  metamorphicCases: number;
  metamorphicChecked: number;
  unsafeTradingOutcomeCount: number;
  p95Ms: number | null;
  gates: {
    invariants100: boolean;
    unsafeZero: boolean;
    goldenPassRate: boolean;
    p95Under50: boolean;
    overall: boolean;
  };
  mentorEligible: false;
  notes: string[];
};

export function buildDecisionCalibrationReport(input: {
  goldenTotal: number;
  goldenPassed: number;
  invariantResults: InvariantResult[];
  counterfactualPairs: number;
  counterfactualChecked: number;
  metamorphicCases: number;
  metamorphicChecked: number;
  unsafeTradingOutcomeCount: number;
  p95Ms: number | null;
  notes?: string[];
}): DecisionCalibrationReport {
  const invOk = input.invariantResults.filter((r) => r.ok).length;
  const invariantsPassRate =
    input.invariantResults.length === 0 ? 0 : invOk / input.invariantResults.length;
  const goldenRate =
    input.goldenTotal === 0 ? 0 : input.goldenPassed / input.goldenTotal;
  const invariants100 = invariantsPassRate === 1;
  const unsafeZero = input.unsafeTradingOutcomeCount === 0;
  const goldenPassRate = goldenRate >= 0.95;
  const p95Under50 = input.p95Ms == null || input.p95Ms < 50;
  return {
    schemaVersion: "1.0",
    generatedAtMs: Date.now(),
    goldenTotal: input.goldenTotal,
    goldenPassed: input.goldenPassed,
    invariantResults: input.invariantResults,
    invariantsPassRate,
    counterfactualPairs: input.counterfactualPairs,
    counterfactualChecked: input.counterfactualChecked,
    metamorphicCases: input.metamorphicCases,
    metamorphicChecked: input.metamorphicChecked,
    unsafeTradingOutcomeCount: input.unsafeTradingOutcomeCount,
    p95Ms: input.p95Ms,
    gates: {
      invariants100,
      unsafeZero,
      goldenPassRate,
      p95Under50,
      overall: invariants100 && unsafeZero && goldenPassRate && p95Under50,
    },
    mentorEligible: false,
    notes: input.notes ?? [],
  };
}
