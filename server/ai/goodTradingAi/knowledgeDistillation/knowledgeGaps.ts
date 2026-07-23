/**
 * Knowledge Gaps — never discussed, low coverage, unresolved conflicts, ambiguity.
 */
import type {
  ConflictHeatmap,
  CoverageHeatmap,
  KnowledgeGap,
  RuleConfidence,
} from "@shared/goodTradingAiKnowledgeDistillation";
import { knowledgeGapSchema, ALL_EVIDENCE_LENSES } from "@shared/goodTradingAiKnowledgeDistillation";

export function findKnowledgeGaps(input: {
  coverage: CoverageHeatmap;
  conflicts: ConflictHeatmap;
  confidences: RuleConfidence[];
}): KnowledgeGap[] {
  const gaps: KnowledgeGap[] = [];
  let i = 0;
  const lensCells = input.coverage.cells.filter((c) => c.kind === "LENS");
  for (const lens of ALL_EVIDENCE_LENSES) {
    const cell = lensCells.find((c) => c.key === lens);
    const count = cell?.count ?? 0;
    if (count === 0) {
      i++;
      gaps.push(
        knowledgeGapSchema.parse({
          id: `gap_${String(i).padStart(3, "0")}`,
          kind: "NEVER_DISCUSSED",
          subject: lens,
          detail: `Lens ${lens} never appeared in human answers.`,
          severity: "HIGH",
          mentorEligible: false,
        }),
      );
    } else if (count <= 1) {
      i++;
      gaps.push(
        knowledgeGapSchema.parse({
          id: `gap_${String(i).padStart(3, "0")}`,
          kind: "LOW_COVERAGE",
          subject: lens,
          detail: `Lens ${lens} covered only ${count} time(s).`,
          severity: "MEDIUM",
          mentorEligible: false,
        }),
      );
    }
  }
  for (const cell of input.conflicts.cells.filter((c) => c.count >= 2).slice(0, 20)) {
    i++;
    gaps.push(
      knowledgeGapSchema.parse({
        id: `gap_${String(i).padStart(3, "0")}`,
        kind: "UNRESOLVED_CONFLICT",
        subject: `${cell.lensA}<->${cell.lensB}`,
        detail: `Repeated conflict count=${cell.count} frequency=${cell.frequency.toFixed(2)}.`,
        severity: cell.count >= 4 ? "HIGH" : "MEDIUM",
        mentorEligible: false,
      }),
    );
  }
  for (const conf of input.confidences.filter((c) => c.uncertainty >= 0.5 || c.confidenceScore < 0.35).slice(0, 20)) {
    i++;
    gaps.push(
      knowledgeGapSchema.parse({
        id: `gap_${String(i).padStart(3, "0")}`,
        kind: conf.uncertainty >= 0.5 ? "AMBIGUOUS_RULE" : "CONTRADICTORY_RULE",
        subject: conf.conceptKey.slice(0, 160),
        detail: `confidence=${conf.confidenceScore.toFixed(2)} uncertainty=${conf.uncertainty.toFixed(2)}.`,
        severity: conf.confidenceScore < 0.25 ? "HIGH" : "MEDIUM",
        mentorEligible: false,
      }),
    );
  }
  return gaps.slice(0, 200);
}