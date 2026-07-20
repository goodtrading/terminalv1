import { knowledgeRegistry } from "../knowledge/registry";
import type { MergeSuggestionCompact } from "@shared/goodTradingAiCuration";
import type { DuplicateFinding } from "./duplicateAnalyzer";

/**
 * Build merge suggestions from duplicate findings.
 * Suggest only — never applies merge to registry.
 */
export function buildMergeSuggestions(
  duplicates: DuplicateFinding[],
  max = 40,
): MergeSuggestionCompact[] {
  const out: MergeSuggestionCompact[] = [];
  for (const d of duplicates) {
    if (d.kind === "NEAR_DUPLICATE" && d.similarity < 0.5) continue;
    const a = knowledgeRegistry.getById(d.aId);
    const b = knowledgeRegistry.getById(d.bId);
    if (!a || !b) continue;

    // Prefer higher confidence / longer explanation as keep
    const confRank = { high: 3, medium: 2, low: 1 } as const;
    const keepA =
      confRank[a.confidence] > confRank[b.confidence] ||
      (confRank[a.confidence] === confRank[b.confidence] &&
        a.explanation.length >= b.explanation.length);
    const keep = keepA ? a : b;
    const drop = keepA ? b : a;

    const risks: string[] = [];
    if (a.kind !== b.kind) risks.push(`Kinds distintos (${a.kind} vs ${b.kind}).`);
    if (a.category !== b.category) risks.push(`Categorías distintas (${a.category} vs ${b.category}).`);
    if (a.contradicts.includes(b.id) || b.contradicts.includes(a.id)) {
      risks.push("Hay arista contradicts — merge puede ocultar conflicto.");
    }
    if (drop.prohibitedInterpretations.length > keep.prohibitedInterpretations.length) {
      risks.push("La entrada descartada tiene prohibitions más ricas — conservar en explicación.");
    }
    if (!risks.length) risks.push("Revisar aliases y examples antes de fusionar.");

    out.push({
      keepId: keep.id,
      dropId: drop.id,
      similarity: d.similarity,
      reason: d.reason,
      suggestedTitle: keep.title.slice(0, 160),
      suggestedStatement: keep.statement.slice(0, 800),
      risks: risks.slice(0, 8),
    });
    if (out.length >= max) break;
  }
  return out;
}
