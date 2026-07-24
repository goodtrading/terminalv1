/**
 * AI-7.3.12 — Conflict audit between resolved decision units only.
 */
import {
  auditedConflictSchema,
  conflictAuditSummarySchema,
  type AuditedConflict,
  type ConflictAuditSummary,
  type DocumentObservation,
  type HumanDecisionUnit,
} from "@shared/goodTradingAiIndependentEvidence";
import { classifyScenarioSimilarity } from "./correlatedSupport";
import { tokenOverlap } from "../normalize";

function lensPairCount(lenses: string[]): number {
  const n = lenses.length;
  return n < 2 ? 0 : (n * (n - 1)) / 2;
}

/**
 * Original document conflict total (e.g. 135) =
 * sum over conflictish documents of C(|lenses|, 2).
 * That formula co-counts every multi-lens document (incl. addenda/revisions),
 * not pairwise contradictions between independent human decisions.
 */
export function explainDocumentConflictTotal(input: {
  documents: DocumentObservation[];
  conflictishPredicate?: (d: DocumentObservation) => boolean;
}): number {
  const pred =
    input.conflictishPredicate ??
    ((d: DocumentObservation) =>
      d.lensHints.length >= 2 ||
      Boolean(d.postRevealAction) ||
      d.documentType === "ADDENDUM");
  let total = 0;
  for (const d of input.documents) {
    if (!pred(d) && d.lensHints.length < 2) continue;
    if (d.lensHints.length < 2) continue;
    // Match production conflictHeatmap: conflictish if multi-lens AND (signal-like or text markers).
    // Documents often have multi-lens from extractLensesFromText → counted.
    total += lensPairCount(d.lensHints);
  }
  return total;
}

export function auditConflicts(input: {
  units: HumanDecisionUnit[];
  documents: DocumentObservation[];
  originalDocumentConflictTotal?: number;
}): { summary: ConflictAuditSummary; conflicts: AuditedConflict[] } {
  const units = input.units;
  let rawCandidatePairs = 0;
  let excludedSameUnitPairs = 0;
  let excludedRevisionPairs = 0;
  let conditionalRelations = 0;
  const conflicts: AuditedConflict[] = [];
  let i = 0;

  // Same-unit revision/addendum pairs never become conflicts
  for (const u of units) {
    const docs = input.documents.filter((d) => `${d.sessionId}|${d.questionId}` === u.unitId);
    const n = docs.length;
    const sameUnitPairs = (n * (n - 1)) / 2;
    rawCandidatePairs += sameUnitPairs;
    excludedSameUnitPairs += sameUnitPairs;
    excludedRevisionPairs += docs.filter((d) => d.documentType === "REVISION").length;
  }

  for (let a = 0; a < units.length; a++) {
    for (let b = a + 1; b < units.length; b++) {
      const ua = units[a]!;
      const ub = units[b]!;
      rawCandidatePairs += 1;
      const sim = classifyScenarioSimilarity(ua, ub);
      if (sim === "DUPLICATE" || sim === "METAMORPHIC_VARIANT") {
        i++;
        conflicts.push(
          auditedConflictSchema.parse({
            conflictId: `acf_${String(i).padStart(3, "0")}`,
            unitA: ua.unitId,
            unitB: ub.unitId,
            type: "SCENARIO_DEPENDENCY",
            independent: false,
            resolutionCondition: `scenarioSimilarity=${sim}; correlated support only`,
            humanConfidence: "LOW",
            requiresQuestion: false,
            mentorEligible: false,
          }),
        );
        continue;
      }

      const engA = input.documents.some(
        (d) =>
          `${d.sessionId}|${d.questionId}` === ua.unitId &&
          (d.postRevealAction === "DISAGREE" || d.documentType === "POST_REVEAL_NOTE"),
      );
      const engB = input.documents.some(
        (d) =>
          `${d.sessionId}|${d.questionId}` === ub.unitId &&
          (d.postRevealAction === "DISAGREE" || d.documentType === "POST_REVEAL_NOTE"),
      );
      if (engA || engB) {
        i++;
        conflicts.push(
          auditedConflictSchema.parse({
            conflictId: `acf_${String(i).padStart(3, "0")}`,
            unitA: ua.unitId,
            unitB: ub.unitId,
            type: "ENGINE_DISAGREEMENT",
            independent: false,
            resolutionCondition: "post-reveal engine disagreement is meta, not unit-vs-unit",
            humanConfidence: "LOW",
            requiresQuestion: false,
            mentorEligible: false,
          }),
        );
        continue;
      }

      if (ua.dependsFlag || ub.dependsFlag) {
        conditionalRelations += 1;
        i++;
        conflicts.push(
          auditedConflictSchema.parse({
            conflictId: `acf_${String(i).padStart(3, "0")}`,
            unitA: ua.unitId,
            unitB: ub.unitId,
            type: "CONDITIONAL_DIFFERENCE",
            independent: true,
            resolutionCondition: "depends/conditional framing — not automatic contradiction",
            humanConfidence: "MEDIUM",
            requiresQuestion: true,
            mentorEligible: false,
          }),
        );
        continue;
      }

      const shared = ua.lenses.filter((l) => ub.lenses.includes(l));
      const onlyA = ua.lenses.filter((l) => !ub.lenses.includes(l));
      const onlyB = ub.lenses.filter((l) => !ua.lenses.includes(l));
      const claimOv = tokenOverlap(ua.claimSummary, ub.claimSummary);

      // Scale / answer-type divergence without opposing claims
      if (
        ua.answerType &&
        ub.answerType &&
        ua.answerType !== ub.answerType &&
        claimOv < 0.35
      ) {
        i++;
        conflicts.push(
          auditedConflictSchema.parse({
            conflictId: `acf_${String(i).padStart(3, "0")}`,
            unitA: ua.unitId,
            unitB: ub.unitId,
            type: "SCALE_DIFFERENCE",
            independent: true,
            resolutionCondition: `answerType ${ua.answerType} vs ${ub.answerType}`,
            humanConfidence: "MEDIUM",
            requiresQuestion: false,
            mentorEligible: false,
          }),
        );
        continue;
      }

      const opposing =
        claimOv < 0.25 &&
        shared.length >= 1 &&
        onlyA.length >= 1 &&
        onlyB.length >= 1 &&
        ua.answerType &&
        ub.answerType &&
        ua.answerType !== ub.answerType;

      if (opposing) {
        i++;
        conflicts.push(
          auditedConflictSchema.parse({
            conflictId: `acf_${String(i).padStart(3, "0")}`,
            unitA: ua.unitId,
            unitB: ub.unitId,
            type: "TRUE_CONTRADICTION",
            independent: true,
            resolutionCondition: "distinct claims with overlapping lenses and divergent answer types",
            humanConfidence: "HIGH",
            requiresQuestion: true,
            mentorEligible: false,
          }),
        );
        continue;
      }

      i++;
      conflicts.push(
        auditedConflictSchema.parse({
          conflictId: `acf_${String(i).padStart(3, "0")}`,
          unitA: ua.unitId,
          unitB: ub.unitId,
          type: "NOT_A_CONFLICT",
          independent: true,
          resolutionCondition: "no contradiction detected under independent-evidence rules",
          humanConfidence: "LOW",
          requiresQuestion: false,
          mentorEligible: false,
        }),
      );
    }
  }

  const trueContradictions = conflicts.filter((c) => c.type === "TRUE_CONTRADICTION").length;
  const finalConflictCount = conflicts.filter(
    (c) => c.type === "TRUE_CONTRADICTION" || c.type === "CONDITIONAL_DIFFERENCE",
  ).length;

  const summary = conflictAuditSummarySchema.parse({
    rawCandidatePairs,
    excludedSameUnitPairs,
    excludedRevisionPairs,
    conditionalRelations,
    trueContradictions,
    finalConflictCount,
    originalDocumentConflictTotal: input.originalDocumentConflictTotal,
    originalConflictFormula:
      "sum over conflictish documents of C(lensCount,2) co-occurrence increments",
    mentorEligible: false,
  });

  return {
    summary,
    conflicts: conflicts
      .filter((c) => c.type !== "NOT_A_CONFLICT")
      .slice(0, 200),
  };
}
