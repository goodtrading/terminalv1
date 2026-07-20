import { knowledgeRegistry } from "../knowledge/registry";
import type { GoodTradingKnowledgeEntry } from "../knowledge/types";
import type { SuggestedRelationCompact } from "@shared/goodTradingAiCuration";
import { allRelationIds, normalizeCurationText } from "./textUtils";

export type OrphanFinding = {
  entryId: string;
  title: string;
  concept: string;
  reason: string;
};

export type MissingRelationFinding = {
  entryId: string;
  title: string;
  suggestedRelations: SuggestedRelationCompact[];
  reason: string;
};

const HINTS: Array<{
  concepts: string[];
  preferIds: string[];
  relation: SuggestedRelationCompact["relation"];
  reason: string;
}> = [
  {
    concepts: ["absorption"],
    preferIds: ["gt_of_delta_not_signal", "gt_of_absorption_central", "gt_of_aggression_vs_passive"],
    relation: "relatedTo",
    reason: "Absorption se cruza con delta/pasivo.",
  },
  {
    concepts: ["delta", "cvd"],
    preferIds: ["gt_of_delta_not_signal", "gt_of_cvd_not_signal"],
    relation: "relatedTo",
    reason: "Delta/CVD no son señal aislada.",
  },
  {
    concepts: ["liquidity", "wall", "spoofing"],
    preferIds: ["gt_liq_wall_not_reversal", "gt_liq_spoofing_hypothesis"],
    relation: "relatedTo",
    reason: "Cluster liquidez/walls/spoofing.",
  },
  {
    concepts: ["gamma", "flip"],
    preferIds: ["gt_gamma_flip_zone", "gt_gamma_global_vs_local"],
    relation: "dependsOn",
    reason: "Lecturas de flip dependen del marco gamma.",
  },
  {
    concepts: ["risk", "invalidacion"],
    preferIds: ["gt_const_invalidation_required", "gt_risk_invalidation_first"],
    relation: "requires",
    reason: "Invalidación es requisito metodológico.",
  },
];

function suggestFor(entry: GoodTradingKnowledgeEntry): SuggestedRelationCompact[] {
  const n = normalizeCurationText(
    `${entry.statement} ${entry.concepts.join(" ")} ${entry.aliases.join(" ")}`,
  );
  const existing = new Set(allRelationIds(entry));
  const out: SuggestedRelationCompact[] = [];
  const seen = new Set<string>();

  for (const hint of HINTS) {
    if (!hint.concepts.some((c) => n.includes(normalizeCurationText(c)))) continue;
    for (const id of hint.preferIds) {
      if (id === entry.id || existing.has(id) || seen.has(id)) continue;
      const e = knowledgeRegistry.getById(id);
      if (!e) continue;
      seen.add(id);
      out.push({
        targetId: e.id,
        targetTitle: e.title,
        relation: hint.relation,
        reason: hint.reason,
      });
      if (out.length >= 6) return out;
    }
  }

  for (const concept of entry.concepts.slice(0, 4)) {
    for (const e of knowledgeRegistry.getByConcept(concept).slice(0, 2)) {
      if (e.id === entry.id || existing.has(e.id) || seen.has(e.id)) continue;
      seen.add(e.id);
      out.push({
        targetId: e.id,
        targetTitle: e.title,
        relation: "relatedTo",
        reason: `Concepto compartido: ${concept}`,
      });
      if (out.length >= 6) return out;
    }
  }
  return out;
}

/**
 * Orphans (no graph relations) + missing relation suggestions.
 * Never auto-adds edges to the Brain.
 */
export function analyzeRelations(params?: {
  entries?: readonly GoodTradingKnowledgeEntry[];
  maxFindings?: number;
}): { orphans: OrphanFinding[]; missing: MissingRelationFinding[] } {
  const entries = params?.entries ?? knowledgeRegistry.getAll();
  const max = params?.maxFindings ?? 120;
  const orphans: OrphanFinding[] = [];
  const missing: MissingRelationFinding[] = [];

  for (const e of entries) {
    const rels = allRelationIds(e);
    if (rels.length === 0) {
      orphans.push({
        entryId: e.id,
        title: e.title,
        concept: e.concepts[0] ?? e.category,
        reason: "Entrada sin relaciones tipadas ni prerequisites/relatedEntryIds.",
      });
      const suggested = suggestFor(e);
      if (suggested.length) {
        missing.push({
          entryId: e.id,
          title: e.title,
          suggestedRelations: suggested,
          reason: "Huérfana con sugerencias de relación (metadata only).",
        });
      }
    } else {
      const suggested = suggestFor(e);
      // Only flag if there are high-value suggestions not already linked
      if (suggested.length >= 2 && rels.length < 2) {
        missing.push({
          entryId: e.id,
          title: e.title,
          suggestedRelations: suggested,
          reason: "Pocas relaciones; hay candidatos claros para enriquecer el grafo.",
        });
      }
    }
    if (orphans.length + missing.length >= max) break;
  }

  return { orphans, missing };
}
