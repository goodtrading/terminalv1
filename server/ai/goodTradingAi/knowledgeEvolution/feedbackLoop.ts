/**
 * Active Learning Feedback Loop — after each session, update ONLY
 * history / stability / volatility / dependencies / health.
 * Never Brain. Never auto-apply.
 */
import type { DistilledObservation } from "@shared/goodTradingAiKnowledgeDistillation";
import type { KnowledgeHealth, KnowledgeEvolutionRunResult } from "@shared/goodTradingAiKnowledgeEvolution";
import { clusterRules } from "../knowledgeDistillation/ruleClustering";
import { upsertRegistryFromObservations } from "./ruleRegistry";
import { buildHistories } from "./ruleHistory";
import { computeStabilities } from "./stability";
import { computeVolatilities } from "./volatility";
import { buildDependencyGraph } from "./dependencyGraph";
import { detectKeystones } from "./keystone";
import { detectObsoleteRules } from "./obsoleteDetector";
import { buildStabilityReport } from "./stabilityReport";
import { appendTimelineEvents } from "./timeline";
import { buildAdaptivePriorityV2 } from "./adaptivePriorityV2";
import { computeKnowledgeHealth } from "./knowledgeHealth";
import { rankProposals } from "./proposalRanking";
import { getKnowledgeEvolutionMemory } from "./memoryStore";
import {
  knowledgeEvolutionRunResultSchema,
  KNOWLEDGE_EVOLUTION_SCHEMA_VERSION,
} from "@shared/goodTradingAiKnowledgeEvolution";

export function applySessionFeedback(input: {
  observations: DistilledObservation[];
  persist?: boolean;
}): {
  health: KnowledgeHealth;
  result: KnowledgeEvolutionRunResult;
  brainMutate: false;
  autoApply: false;
} {
  const mem = getKnowledgeEvolutionMemory();
  const clusters = clusterRules(input.observations);
  const rules = upsertRegistryFromObservations(input.observations, clusters, mem.loadRegistry());
  const histories = buildHistories(rules, input.observations, mem.loadHistories());
  const stabilities = computeStabilities(histories);
  const volatilities = computeVolatilities(histories);
  const dependencyGraph = buildDependencyGraph(rules);
  const keystones = detectKeystones(rules, dependencyGraph);
  const obsolete = detectObsoleteRules({ rules, histories, stabilities, graph: dependencyGraph });
  const stabilityReport = buildStabilityReport({ histories, stabilities, volatilities });
  const timeline = appendTimelineEvents({
    previous: mem.loadTimeline(),
    rules,
    histories,
    stabilities,
    volatilities,
    keystones,
    obsolete,
  });
  const adaptivePriority = buildAdaptivePriorityV2({ histories, stabilities, volatilities, keystones });
  const health = computeKnowledgeHealth({
    rules,
    histories,
    stabilities,
    volatilities,
    graph: dependencyGraph,
    timeline,
  });
  const rankedProposals = rankProposals({
    rules,
    histories,
    stabilities,
    volatilities,
    keystones,
    obsolete,
  });

  const result = knowledgeEvolutionRunResultSchema.parse({
    schemaVersion: KNOWLEDGE_EVOLUTION_SCHEMA_VERSION,
    generatedAtMs: Date.now(),
    rules,
    histories,
    stabilities,
    volatilities,
    dependencyGraph,
    keystones,
    obsolete,
    stabilityReport,
    timeline,
    adaptivePriority,
    health,
    rankedProposals,
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
    realMarketData: false,
    openAi: false,
  });

  if (input.persist !== false) {
    mem.saveRun(result);
  }

  return { health, result, brainMutate: false, autoApply: false };
}