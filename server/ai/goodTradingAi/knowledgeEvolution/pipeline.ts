/**
 * Knowledge Evolution pipeline — deterministic, no OpenAI, no Brain mutation.
 */
import {
  knowledgeEvolutionRunResultSchema,
  KNOWLEDGE_EVOLUTION_SCHEMA_VERSION,
  type KnowledgeEvolutionRunResult,
} from "@shared/goodTradingAiKnowledgeEvolution";
import { HumanDecisionReviewRepository } from "../decision/humanReview/repository";
import { analyzeAllSessions } from "../knowledgeDistillation/sessionAnalyzer";
import { clusterRules } from "../knowledgeDistillation/ruleClustering";
import { getKnowledgeDistillationMemory } from "../knowledgeDistillation/memoryStore";
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

export function runKnowledgeEvolution(input?: {
  humanRepo?: HumanDecisionReviewRepository;
  persist?: boolean;
}): KnowledgeEvolutionRunResult {
  const mem = getKnowledgeEvolutionMemory();
  const humanRepo = input?.humanRepo ?? new HumanDecisionReviewRepository();
  const observations = analyzeAllSessions({ humanRepo });
  const clusters = clusterRules(observations);
  const rules = upsertRegistryFromObservations(observations, clusters, mem.loadRegistry());
  const histories = buildHistories(rules, observations, mem.loadHistories());
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
  const distillationProposals = getKnowledgeDistillationMemory().listProposals();
  const rankedProposals = rankProposals({
    distillationProposals,
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

  if (input?.persist !== false) {
    mem.saveRun(result);
  }
  return result;
}