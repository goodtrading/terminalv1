/**
 * Curated typed graph links — only existing Brain IDs.
 * Seeds from methodology already encoded in relatedEntryIds/prerequisites;
 * expands carefully for multi-lens reasoning (AI-4). Does not invent new claims.
 */
import type { GoodTradingKnowledgeEntry } from "./types";
import { mergeKnowledgeRelations } from "./types";

export type RelationOverlay = Partial<
  Pick<
    GoodTradingKnowledgeEntry,
    | "supports"
    | "dependsOn"
    | "requires"
    | "invalidates"
    | "contradicts"
    | "relatedTo"
    | "parentConcept"
    | "childConcept"
  >
>;

/** Sparse overlays keyed by entry id. */
export const KNOWLEDGE_GRAPH_OVERLAYS: Readonly<Record<string, RelationOverlay>> = {
  // Gamma multi-scale
  gt_gamma_definition: {
    supports: ["gt_gamma_pos_neg_hypothesis", "gt_gamma_flip_zone"],
    childConcept: ["gt_gamma_pos_neg_hypothesis", "gt_gamma_flip_zone"],
  },
  gt_gamma_flip_zone: {
    dependsOn: ["gt_gamma_definition", "gt_gamma_global_vs_local"],
    requires: ["gt_const_levels_are_references", "gt_const_hypothesis_not_certainty"],
    relatedTo: ["gt_of_acceptance_rejection", "gt_setup_flip_transition"],
    supports: ["gt_setup_flip_transition"],
  },
  gt_gamma_global_vs_local: {
    childConcept: ["gt_gamma_dealer_pivot"],
    dependsOn: ["gt_gamma_definition"],
    relatedTo: ["gt_gamma_flip_zone", "gt_of_cross_with_gamma"],
    supports: ["gt_const_multi_lens"],
  },
  gt_gamma_pos_neg_hypothesis: {
    dependsOn: ["gt_gamma_definition"],
    requires: ["gt_const_hypothesis_not_certainty"],
    relatedTo: ["gt_of_cross_with_gamma", "gt_gamma_anti_binary"],
  },
  gt_gamma_anti_binary: {
    relatedTo: ["gt_gamma_pos_neg_hypothesis"],
    supports: ["gt_const_hypothesis_not_certainty"],
  },
  gt_gamma_walls_reference: {
    relatedTo: ["gt_liq_wall_not_reversal", "gt_setup_wall_rejection"],
    requires: ["gt_const_levels_are_references"],
  },

  // Order flow / absorption / delta
  gt_of_definition: {
    childConcept: ["gt_of_absorption_central", "gt_of_aggression_vs_passive"],
    supports: ["gt_of_absorption_central"],
  },
  gt_of_absorption_central: {
    dependsOn: ["gt_of_definition", "gt_of_aggression_vs_passive"],
    requires: ["gt_const_confirmation_is_evidence"],
    relatedTo: ["gt_of_delta_not_signal", "gt_of_acceptance_rejection", "gt_setup_absorption_fade"],
    supports: ["gt_setup_absorption_fade"],
  },
  gt_of_delta_not_signal: {
    relatedTo: ["gt_of_absorption_central", "gt_of_cvd_not_signal", "gt_of_trap_chase"],
    requires: ["gt_const_context_over_signal"],
  },
  gt_of_cvd_not_signal: {
    relatedTo: ["gt_of_delta_not_signal", "gt_oi_not_direction"],
    requires: ["gt_const_context_over_signal"],
  },
  gt_of_aggression_vs_passive: {
    relatedTo: ["gt_of_absorption_central", "gt_liq_consumed_vs_defended", "gt_of_definition"],
    supports: ["gt_of_initiative_vs_responsive"],
  },
  gt_of_acceptance_rejection: {
    dependsOn: ["gt_of_definition"],
    relatedTo: ["gt_gamma_flip_zone", "gt_liq_sweep_reclaim"],
    supports: ["gt_setup_sweep_reclaim"],
  },
  gt_of_cross_with_gamma: {
    dependsOn: ["gt_gamma_definition", "gt_of_definition"],
    relatedTo: ["gt_cross_gamma_orderflow", "gt_gamma_global_vs_local"],
    requires: ["gt_const_multi_lens"],
  },
  gt_of_trap_chase: {
    relatedTo: ["gt_of_delta_not_signal", "gt_teach_common_traps"],
  },

  // Liquidity / walls / spoofing
  gt_liq_wall_not_reversal: {
    relatedTo: ["gt_liq_spoofing_hypothesis", "gt_gamma_walls_reference", "gt_liq_persistence", "gt_liq_anti_size_only"],
    requires: ["gt_const_levels_are_references"],
  },
  gt_liq_spoofing_hypothesis: {
    relatedTo: ["gt_liq_wall_not_reversal", "gt_liq_pulling"],
    requires: ["gt_const_hypothesis_not_certainty"],
  },
  gt_liq_sweep_reclaim: {
    dependsOn: ["gt_liq_sweep"],
    relatedTo: ["gt_of_acceptance_rejection", "gt_setup_sweep_reclaim"],
    supports: ["gt_setup_sweep_reclaim"],
    requires: ["gt_const_invalidation_required"],
  },
  gt_liq_anti_size_only: {
    relatedTo: ["gt_liq_wall_not_reversal"],
    supports: ["gt_const_context_over_signal"],
  },

  // OI
  gt_oi_not_direction: {
    relatedTo: ["gt_of_cvd_not_signal", "gt_oi_definition", "gt_oi_anti_textbook"],
    requires: ["gt_const_context_over_signal"],
  },
  gt_oi_anti_textbook: {
    relatedTo: ["gt_oi_not_direction"],
    supports: ["gt_const_hypothesis_not_certainty"],
  },
  gt_oi_definition: {
    childConcept: ["gt_oi_not_direction", "gt_oi_vs_volume"],
    relatedTo: ["gt_of_cvd_not_signal"],
  },

  // Constitution hubs
  gt_const_multi_lens: {
    supports: ["gt_of_cross_with_gamma", "gt_cross_gamma_liquidity", "gt_cross_liquidity_orderflow"],
    relatedTo: ["gt_gamma_global_vs_local"],
  },
  gt_const_invalidation_required: {
    supports: ["gt_risk_invalidation_first"],
    relatedTo: ["gt_const_confirmation_is_evidence"],
  },
  gt_const_context_over_signal: {
    supports: ["gt_of_delta_not_signal", "gt_oi_not_direction", "gt_liq_wall_not_reversal"],
    relatedTo: ["gt_const_multi_lens"],
  },
  gt_const_hypothesis_not_certainty: {
    supports: ["gt_gamma_pos_neg_hypothesis", "gt_liq_spoofing_hypothesis"],
    relatedTo: ["gt_const_invalidation_required"],
  },

  // Cross + setups
  gt_cross_gamma_orderflow: {
    dependsOn: ["gt_gamma_definition", "gt_of_definition"],
    relatedTo: ["gt_of_cross_with_gamma"],
    requires: ["gt_const_multi_lens"],
  },
  gt_cross_gamma_liquidity: {
    dependsOn: ["gt_gamma_definition", "gt_liq_definition"],
    requires: ["gt_const_multi_lens"],
  },
  gt_cross_liquidity_orderflow: {
    dependsOn: ["gt_liq_definition", "gt_of_definition"],
    requires: ["gt_const_multi_lens"],
  },
  gt_setup_flip_transition: {
    dependsOn: ["gt_gamma_flip_zone", "gt_gamma_global_vs_local"],
    requires: ["gt_const_invalidation_required", "gt_of_acceptance_rejection"],
    relatedTo: ["gt_of_cross_with_gamma"],
  },
  gt_setup_absorption_fade: {
    dependsOn: ["gt_of_absorption_central"],
    requires: ["gt_const_invalidation_required"],
    relatedTo: ["gt_of_delta_not_signal"],
  },
  gt_setup_sweep_reclaim: {
    dependsOn: ["gt_liq_sweep_reclaim"],
    requires: ["gt_const_invalidation_required", "gt_of_acceptance_rejection"],
  },
  gt_setup_wall_rejection: {
    dependsOn: ["gt_liq_wall_not_reversal", "gt_gamma_walls_reference"],
    requires: ["gt_liq_persistence"],
    relatedTo: ["gt_liq_spoofing_hypothesis"],
  },
};

export function applyKnowledgeGraphOverlays(
  entries: readonly GoodTradingKnowledgeEntry[],
): GoodTradingKnowledgeEntry[] {
  return entries.map((e) => {
    const overlay = KNOWLEDGE_GRAPH_OVERLAYS[e.id];
    return overlay ? mergeKnowledgeRelations(e, overlay) : e;
  });
}
