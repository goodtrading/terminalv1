import { knowledgeRegistry } from "../knowledge/registry";
import type { GoodTradingKnowledgeEntry } from "../knowledge/types";
import { fingerprintBuckets, jaccard, round01, tokenSet } from "./textUtils";

export type DuplicateFinding = {
  kind: "DUPLICATE" | "POSSIBLE_MERGE" | "NEAR_DUPLICATE";
  aId: string;
  bId: string;
  aTitle: string;
  bTitle: string;
  similarity: number;
  reason: string;
};

type Indexed = {
  entry: GoodTradingKnowledgeEntry;
  stmtToks: Set<string>;
  conceptToks: Set<string>;
};

/**
 * Pairwise duplicate scan using fingerprint buckets (avoids naive full O(n²)).
 * Suggest only — never mutates registry.
 */
export function analyzeDuplicates(params?: {
  entries?: readonly GoodTradingKnowledgeEntry[];
  maxPairs?: number;
}): DuplicateFinding[] {
  const entries = params?.entries ?? knowledgeRegistry.getAll();
  const maxPairs = params?.maxPairs ?? 200;
  const indexed: Indexed[] = entries.map((entry) => ({
    entry,
    stmtToks: tokenSet(`${entry.title} ${entry.statement}`),
    conceptToks: tokenSet([...entry.concepts, ...entry.aliases].join(" ")),
  }));

  const buckets = new Map<string, number[]>();
  for (let i = 0; i < indexed.length; i++) {
    const fps = fingerprintBuckets(indexed[i]!.stmtToks);
    for (const fp of fps) {
      const arr = buckets.get(fp) ?? [];
      arr.push(i);
      buckets.set(fp, arr);
    }
  }

  const seen = new Set<string>();
  const findings: DuplicateFinding[] = [];

  for (const idxs of Array.from(buckets.values())) {
    if (idxs.length < 2) continue;
    // Cap bucket fan-out
    const list = idxs.length > 40 ? idxs.slice(0, 40) : idxs;
    for (let i = 0; i < list.length; i++) {
      for (let j = i + 1; j < list.length; j++) {
        const ia = list[i]!;
        const ib = list[j]!;
        const a = indexed[ia]!;
        const b = indexed[ib]!;
        if (a.entry.id === b.entry.id) continue;
        const key = a.entry.id < b.entry.id ? `${a.entry.id}|${b.entry.id}` : `${b.entry.id}|${a.entry.id}`;
        if (seen.has(key)) continue;
        seen.add(key);

        const s1 = jaccard(a.stmtToks, b.stmtToks);
        const s2 = jaccard(a.conceptToks, b.conceptToks);
        const sameKind = a.entry.kind === b.entry.kind ? 0.05 : 0;
        const sameCat = a.entry.category === b.entry.category ? 0.03 : 0;
        const similarity = round01(Math.min(1, Math.max(s1, s2 * 0.8 + s1 * 0.2) + sameKind + sameCat));

        if (similarity < 0.38) continue;

        let kind: DuplicateFinding["kind"] = "NEAR_DUPLICATE";
        if (similarity >= 0.78) kind = "DUPLICATE";
        else if (similarity >= 0.55) kind = "POSSIBLE_MERGE";

        findings.push({
          kind,
          aId: a.entry.id,
          bId: b.entry.id,
          aTitle: a.entry.title,
          bTitle: b.entry.title,
          similarity,
          reason:
            kind === "DUPLICATE"
              ? `Alta similitud léxica (${similarity}) entre «${a.entry.title}» y «${b.entry.title}».`
              : kind === "POSSIBLE_MERGE"
                ? `Solapamiento sustancial (${similarity}) — evaluar merge editorial.`
                : `Cercanía conceptual (${similarity}) — revisar si conviene relacionar o fusionar.`,
        });

        if (findings.length >= maxPairs) {
          return findings.sort((x, y) => y.similarity - x.similarity);
        }
      }
    }
  }

  return findings.sort((x, y) => y.similarity - x.similarity);
}
