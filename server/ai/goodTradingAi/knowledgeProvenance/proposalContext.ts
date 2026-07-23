/**
 * Proposal Context — auto-show origin/history/reasons/deps for PENDING proposals.
 * Never apply.
 */
import type { CompressedProposal } from "@shared/goodTradingAiKnowledgeDistillation";
import type { RankedProposal } from "@shared/goodTradingAiKnowledgeEvolution";
import type {
  JustificationEvent,
  LineageGraph,
  ProposalContext,
  ProvenanceRecord,
} from "@shared/goodTradingAiKnowledgeProvenance";
import { proposalContextSchema } from "@shared/goodTradingAiKnowledgeProvenance";

type AnyPending = {
  id: string;
  title?: string;
  reason?: string;
  affectedRuleIds?: string[];
  affectedRules?: string[];
};

export function buildProposalContexts(input: {
  proposals: AnyPending[];
  registry: ProvenanceRecord[];
  events: JustificationEvent[];
  lineage: LineageGraph;
}): ProposalContext[] {
  const out: ProposalContext[] = [];
  for (const p of input.proposals.slice(0, 80)) {
    const relatedRuleIds = [
      ...(p.affectedRuleIds ?? []),
      ...((p.affectedRules ?? [])
        .map((x) => input.registry.find((r) => r.stableRuleId === x || r.stableRuleId.includes(x.replace(/[^A-Z0-9_]/g, "").slice(0, 24)))?.stableRuleId)
        .filter(Boolean) as string[]),
    ];
    // Fallback: match RULE_ tokens in reason/title
    const blob = `${p.title ?? ""} ${p.reason ?? ""}`;
    const fromText = blob.match(/RULE_[A-Z0-9_]+/g) ?? [];
    const ids = [...new Set([...relatedRuleIds, ...fromText])].filter((id) =>
      /^RULE_[A-Z0-9_]+$/.test(id),
    ) as ProvenanceRecord["stableRuleId"][];

    const origins = input.registry.filter((r) => ids.includes(r.stableRuleId)).slice(0, 40);
    const historyEvents = input.events
      .filter((e) => ids.includes(e.stableRuleId))
      .sort((a, b) => a.atMs - b.atMs)
      .slice(0, 200);
    const originalReasons = historyEvents
      .filter((e) => e.kind === "CREATED" || e.kind === "REVIEWED")
      .map((e) => e.rationale.rationale)
      .slice(0, 20);
    const relevantEvents = historyEvents
      .map((e) => `${e.kind}@${e.atMs}:${e.rationale.rationale.slice(0, 80)}`)
      .slice(0, 40);
    const dependencies = input.lineage.edges
      .filter((e) => ids.includes(e.fromRuleId) || ids.includes(e.toRuleId))
      .map((e) => `${e.relation}:${e.fromRuleId}->${e.toRuleId}`)
      .slice(0, 40);

    // If no rule ids found, still emit context with empty relations
    out.push(
      proposalContextSchema.parse({
        proposalId: p.id,
        status: "PENDING",
        relatedRuleIds: ids.slice(0, 40),
        origins,
        historyEvents,
        originalReasons:
          originalReasons.length > 0
            ? originalReasons
            : p.reason
              ? [p.reason.slice(0, 400)]
              : ["No prior provenance reasons recorded"],
        relevantEvents:
          relevantEvents.length > 0
            ? relevantEvents
            : ["No provenance events linked yet"],
        dependencies,
        autoApply: false,
        brainMutate: false,
        safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
        mentorEligible: false,
      }),
    );
  }
  return out;
}

export function fromDistillationProposals(proposals: CompressedProposal[]): AnyPending[] {
  return proposals.map((p) => ({
    id: p.id,
    title: p.title,
    reason: p.reason,
    affectedRules: p.affectedRules,
  }));
}

export function fromEvolutionProposals(proposals: RankedProposal[]): AnyPending[] {
  return proposals.map((p) => ({
    id: p.id,
    title: p.title,
    reason: p.reason,
    affectedRuleIds: p.affectedRuleIds,
  }));
}