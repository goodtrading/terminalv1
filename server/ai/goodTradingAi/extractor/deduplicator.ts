import { knowledgeRegistry } from "../knowledge/registry";
import { normalizeQuery } from "../knowledge/retrieve";
import type { DedupVerdict } from "@shared/goodTradingAiExtractor";
import type { ExtractedCandidate } from "./knowledgeExtractor";

export type DedupResult = {
  verdict: DedupVerdict;
  matchedEntryId?: string;
  matchedTitle?: string;
  similarity: number;
  reason: string;
};

function tokenSet(text: string): Set<string> {
  return new Set(
    normalizeQuery(text)
      .split(" ")
      .filter((t) => t.length >= 3),
  );
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of Array.from(a)) if (b.has(t)) inter += 1;
  const union = a.size + b.size - inter;
  return union ? inter / union : 0;
}

/**
 * Compare candidate against existing Brain entries (deterministic lexical overlap).
 */
export function deduplicateAgainstRegistry(candidate: ExtractedCandidate): DedupResult {
  const stmtToks = tokenSet(candidate.statement);
  const conceptToks = tokenSet(candidate.concepts.join(" ") + " " + candidate.aliases.join(" "));
  let best = {
    id: "",
    title: "",
    score: 0,
    via: "none" as string,
  };

  for (const entry of knowledgeRegistry.getAll()) {
    const entryStmt = tokenSet(entry.statement + " " + entry.title);
    const entryConcepts = tokenSet([...entry.concepts, ...entry.aliases].join(" "));
    const s1 = jaccard(stmtToks, entryStmt);
    const s2 = jaccard(conceptToks, entryConcepts);
    const score = Math.max(s1, s2 * 0.85 + s1 * 0.15);
    if (score > best.score) {
      best = {
        id: entry.id,
        title: entry.title,
        score,
        via: s1 >= s2 ? "statement" : "concepts",
      };
    }
  }

  if (best.score >= 0.72) {
    return {
      verdict: "duplicate",
      matchedEntryId: best.id,
      matchedTitle: best.title,
      similarity: round01(best.score),
      reason: `Alta similitud (${best.via}) con «${best.title}».`,
    };
  }
  if (best.score >= 0.42) {
    return {
      verdict: "possible_merge",
      matchedEntryId: best.id,
      matchedTitle: best.title,
      similarity: round01(best.score),
      reason: `Solapamiento parcial con «${best.title}» — evaluar merge editorial.`,
    };
  }
  return {
    verdict: "new_concept",
    similarity: round01(best.score),
    reason: best.id
      ? `Sin match fuerte (mejor: ${best.title} @ ${best.score.toFixed(2)}).`
      : "Sin entradas comparables en el registry.",
  };
}

function round01(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
}
