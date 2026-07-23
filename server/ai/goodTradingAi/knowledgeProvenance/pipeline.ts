/**
 * Knowledge Provenance pipeline — append-only, deterministic, no Brain mutation.
 * Ingests Evolution/Distillation references only; does not mutate those stores.
 */
import {
  provenanceRunResultSchema,
  KNOWLEDGE_PROVENANCE_SCHEMA_VERSION,
  type ProvenanceRunResult,
} from "@shared/goodTradingAiKnowledgeProvenance";
import { HumanDecisionReviewRepository } from "../decision/humanReview/repository";
import { analyzeAllSessions } from "../knowledgeDistillation/sessionAnalyzer";
import { getKnowledgeDistillationMemory } from "../knowledgeDistillation/memoryStore";
import { getKnowledgeEvolutionMemory } from "../knowledgeEvolution/memoryStore";
import { upsertProvenanceRegistry } from "./provenanceRegistry";
import { appendJustificationEvents } from "./justificationHistory";
import { buildLineageGraph } from "./ruleLineage";
import { buildPerRuleTimelines } from "./knowledgeTimeline";
import { buildImpactTraces } from "./impactTrace";
import {
  buildProposalContexts,
  fromDistillationProposals,
  fromEvolutionProposals,
} from "./proposalContext";
import { getKnowledgeProvenanceMemory } from "./memoryStore";

export function runKnowledgeProvenance(input?: {
  humanRepo?: HumanDecisionReviewRepository;
  persist?: boolean;
}): ProvenanceRunResult {
  const mem = getKnowledgeProvenanceMemory();
  const humanRepo = input?.humanRepo ?? new HumanDecisionReviewRepository();
  const observations = analyzeAllSessions({ humanRepo });
  const evolutionRules = getKnowledgeEvolutionMemory().loadRegistry();
  const registry = upsertProvenanceRegistry({
    evolutionRules,
    observations,
    existing: mem.loadRegistry(),
  });
  const events = appendJustificationEvents({
    previous: mem.loadEvents(),
    registry,
    observations,
  });
  const lineage = buildLineageGraph({ registry, events });
  const timelines = buildPerRuleTimelines(events);

  const evoProposals = getKnowledgeEvolutionMemory().listProposals();
  const kdProposals = getKnowledgeDistillationMemory().listProposals();
  const proposalIdsByRule: Record<string, string[]> = {};
  for (const p of evoProposals) {
    for (const rid of p.affectedRuleIds) {
      proposalIdsByRule[rid] = [...(proposalIdsByRule[rid] ?? []), p.id];
    }
  }

  const impactTraces = buildImpactTraces({
    registry,
    events,
    lineage,
    proposalIdsByRule,
  });
  const proposalContexts = buildProposalContexts({
    proposals: [...fromEvolutionProposals(evoProposals), ...fromDistillationProposals(kdProposals)],
    registry,
    events,
    lineage,
  });

  const result = provenanceRunResultSchema.parse({
    schemaVersion: KNOWLEDGE_PROVENANCE_SCHEMA_VERSION,
    generatedAtMs: Date.now(),
    registry,
    events,
    lineage,
    timelines,
    impactTraces,
    proposalContexts,
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
    realMarketData: false,
    openAi: false,
  });

  if (input?.persist !== false) {
    mem.saveRun(result);
  }
  return result;
}