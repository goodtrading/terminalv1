import { knowledgeRegistry } from "../knowledge/registry";
import type { GoodTradingKnowledgeEntry } from "../knowledge/types";
import { normalizeCurationText } from "./textUtils";

export type ConflictFinding = {
  aId: string;
  bId: string;
  aTitle: string;
  bTitle: string;
  code: string;
  explanation: string;
  severity: "low" | "medium" | "high";
};

const NORMATIVE_ALWAYS = /\b(siempre|never|nunca|debe|obligatorio|garantiza)\b/;
const NORMATIVE_NEVER = /\b(nunca|no debe|prohibido|evitar siempre)\b/;
const DIRECTIONAL = /\b(compra|vende|long|short|alcista|bajista|buy|sell)\b/;

/**
 * Detect contradictory rules / graph contradicts edges.
 * Explains and marks — never deletes.
 */
export function analyzeConflicts(params?: {
  entries?: readonly GoodTradingKnowledgeEntry[];
  maxFindings?: number;
}): ConflictFinding[] {
  const entries = params?.entries ?? knowledgeRegistry.getAll();
  const byId = new Map(entries.map((e) => [e.id, e]));
  const findings: ConflictFinding[] = [];
  const seen = new Set<string>();

  // 1) Explicit graph edges
  for (const e of entries) {
    for (const otherId of e.contradicts) {
      const other = byId.get(otherId);
      if (!other) continue;
      const key = e.id < otherId ? `${e.id}|${otherId}` : `${otherId}|${e.id}`;
      if (seen.has(key)) continue;
      seen.add(key);
      findings.push({
        aId: e.id,
        bId: otherId,
        aTitle: e.title,
        bTitle: other.title,
        code: "GRAPH_CONTRADICTS",
        explanation: `El grafo marca que «${e.title}» contradice «${other.title}». Revisar redacción; no eliminar automáticamente.`,
        severity: "high",
      });
      if (findings.length >= (params?.maxFindings ?? 100)) return findings;
    }
  }

  // 2) Heuristic: same concept cluster with opposite normative polarity
  const byConcept = new Map<string, GoodTradingKnowledgeEntry[]>();
  for (const e of entries) {
    for (const c of e.concepts.slice(0, 4)) {
      const k = normalizeCurationText(c);
      const arr = byConcept.get(k) ?? [];
      arr.push(e);
      byConcept.set(k, arr);
    }
  }

  for (const [concept, list] of Array.from(byConcept.entries())) {
    if (list.length < 2) continue;
    const always = list.filter((e: (typeof list)[number]) =>
      NORMATIVE_ALWAYS.test(normalizeCurationText(e.statement)),
    );
    const never = list.filter((e: (typeof list)[number]) =>
      NORMATIVE_NEVER.test(normalizeCurationText(e.statement)),
    );
    for (const a of always.slice(0, 3)) {
      for (const b of never.slice(0, 3)) {
        if (a.id === b.id) continue;
        // Skip if one is ANTI_PATTERN clarifying the other (often intentional)
        if (a.kind === "ANTI_PATTERN" || b.kind === "ANTI_PATTERN") continue;
        const key = a.id < b.id ? `${a.id}|${b.id}` : `${b.id}|${a.id}`;
        if (seen.has(key)) continue;
        const aDir = DIRECTIONAL.test(normalizeCurationText(a.statement));
        const bDir = DIRECTIONAL.test(normalizeCurationText(b.statement));
        if (!aDir && !bDir && a.kind !== "RULE" && b.kind !== "RULE") continue;
        seen.add(key);
        findings.push({
          aId: a.id,
          bId: b.id,
          aTitle: a.title,
          bTitle: b.title,
          code: "NORMATIVE_POLARITY",
          explanation: `Posible tensión normativa sobre «${concept}»: «${a.title}» vs «${b.title}». Marcar para revisión editorial; no borrar.`,
          severity: "medium",
        });
        if (findings.length >= (params?.maxFindings ?? 100)) return findings;
      }
    }
  }

  return findings;
}
