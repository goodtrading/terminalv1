import { knowledgeRegistry } from "../knowledge/registry";
import { normalizeQuery } from "../knowledge/retrieve";
import type { SuggestedRelation } from "@shared/goodTradingAiExtractor";
import type { ExtractedCandidate } from "./knowledgeExtractor";

const RELATION_HINTS: Array<{
  concepts: string[];
  preferIds: string[];
  relation: SuggestedRelation["relation"];
  reason: string;
}> = [
  {
    concepts: ["absorption"],
    preferIds: ["gt_of_delta_not_signal", "gt_of_absorption_central", "gt_of_aggression_vs_passive"],
    relation: "relatedTo",
    reason: "Absorption se cruza con delta/pasivo-agresivo.",
  },
  {
    concepts: ["delta", "cvd"],
    preferIds: ["gt_of_delta_not_signal", "gt_of_cvd_not_signal", "gt_of_absorption_central"],
    relation: "relatedTo",
    reason: "Delta/CVD no son señal aislada; relacionar con absorption.",
  },
  {
    concepts: ["liquidity", "wall", "spoofing"],
    preferIds: ["gt_liq_wall_not_reversal", "gt_liq_spoofing_hypothesis", "gt_liq_persistence"],
    relation: "relatedTo",
    reason: "Liquidez/walls/spoofing forman un clúster metodológico.",
  },
  {
    concepts: ["gamma", "flip"],
    preferIds: ["gt_gamma_flip_zone", "gt_gamma_global_vs_local", "gt_gamma_pos_neg_hypothesis"],
    relation: "dependsOn",
    reason: "Lecturas de flip dependen del marco gamma.",
  },
  {
    concepts: ["order_flow"],
    preferIds: ["gt_of_definition", "gt_of_acceptance_rejection", "gt_of_cross_with_gamma"],
    relation: "supports",
    reason: "Order flow soporta confirmación/acceptance.",
  },
  {
    concepts: ["risk"],
    preferIds: ["gt_const_invalidation_required", "gt_risk_invalidation_first"],
    relation: "requires",
    reason: "Riesgo/invalidación es requisito metodológico.",
  },
];

const STATEMENT_CONCEPT_FALLBACK: Array<{ re: RegExp; concept: string }> = [
  { re: /\b(absorption|absorcion)\b/, concept: "absorption" },
  { re: /\b(delta|cvd)\b/, concept: "delta" },
  { re: /\b(wall|spoof|liquidez|liquidity|sweep|reclaim)\b/, concept: "liquidity" },
  { re: /\b(gamma|flip)\b/, concept: "gamma" },
  { re: /\b(order flow|acceptance|rejection|agresivo|pasivo)\b/, concept: "order_flow" },
  { re: /\b(invalid|riesgo|sizing)\b/, concept: "risk" },
  { re: /\b(open interest|\boi\b)\b/, concept: "open_interest" },
];

/**
 * Suggest relations to existing Brain IDs — metadata only; never writes registry.
 */
export function suggestRelationsForCandidate(candidate: ExtractedCandidate): SuggestedRelation[] {
  const n = normalizeQuery(
    `${candidate.statement} ${candidate.concepts.join(" ")} ${candidate.aliases.join(" ")}`,
  );
  const out: SuggestedRelation[] = [];
  const seen = new Set<string>();

  for (const hint of RELATION_HINTS) {
    if (!hint.concepts.some((c) => n.includes(normalizeQuery(c)))) continue;
    for (const id of hint.preferIds) {
      const e = knowledgeRegistry.getById(id);
      if (!e || seen.has(id)) continue;
      seen.add(id);
      out.push({
        targetId: e.id,
        targetTitle: e.title,
        relation: hint.relation,
        reason: hint.reason,
      });
      if (out.length >= 8) return out;
    }
  }

  const concepts = new Set(candidate.concepts);
  for (const row of STATEMENT_CONCEPT_FALLBACK) {
    if (row.re.test(n)) concepts.add(row.concept);
  }

  // Fallback: top concept hits from registry
  for (const concept of Array.from(concepts)) {
    for (const e of knowledgeRegistry.getByConcept(concept).slice(0, 2)) {
      if (seen.has(e.id)) continue;
      seen.add(e.id);
      out.push({
        targetId: e.id,
        targetTitle: e.title,
        relation: "relatedTo",
        reason: `Concepto compartido: ${concept}`,
      });
      if (out.length >= 8) return out;
    }
  }
  return out;
}
