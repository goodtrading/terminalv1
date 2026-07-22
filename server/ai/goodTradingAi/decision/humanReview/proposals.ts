/**
 * AI-7.2 — Proposal grouping helpers.
 *
 * NOTE: No auto-apply from UI. Proposals remain PENDING until a separate
 * human approval workflow (outside this module) explicitly acts.
 * autoApply is always false on MethodologyChangeProposal.
 */
import type {
  DisagreementTaxonomyCode,
  MethodologyChangeProposal,
} from "@shared/goodTradingAiHumanReview";

export function groupProposalsByTaxonomy(
  proposals: MethodologyChangeProposal[],
): Record<string, MethodologyChangeProposal[]> {
  const out: Record<string, MethodologyChangeProposal[]> = {};
  for (const p of proposals) {
    const codes: DisagreementTaxonomyCode[] =
      p.taxonomyCodes.length > 0 ? p.taxonomyCodes : (["DIS_NONE"] as DisagreementTaxonomyCode[]);
    for (const code of codes) {
      if (!out[code]) out[code] = [];
      out[code]!.push(p);
    }
  }
  return out;
}

export function groupProposalsBySuggestedAction(
  proposals: MethodologyChangeProposal[],
): Record<MethodologyChangeProposal["suggestedAction"], MethodologyChangeProposal[]> {
  const out = {
    REVIEW_GOLDEN: [] as MethodologyChangeProposal[],
    REVIEW_TEMPLATE: [] as MethodologyChangeProposal[],
    REVIEW_ENGINE: [] as MethodologyChangeProposal[],
    KEEP_AS_IS: [] as MethodologyChangeProposal[],
    EXPAND_CASE: [] as MethodologyChangeProposal[],
  };
  for (const p of proposals) {
    out[p.suggestedAction].push(p);
  }
  return out;
}
