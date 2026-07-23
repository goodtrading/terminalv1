/**
 * Knowledge Distillation pipeline — deterministic, no OpenAI, no Brain mutation.
 */
import { distillationRunResultSchema, type DistillationRunResult } from "@shared/goodTradingAiKnowledgeDistillation";
import { HumanDecisionReviewRepository } from "../decision/humanReview/repository";
import { getCriticalCalibrationMemory } from "../criticalCalibration/memoryStore";
import { analyzeAllSessions } from "./sessionAnalyzer";
import { clusterRules } from "./ruleClustering";
import { compressClusters } from "./compression";
import { buildConflictHeatmap } from "./conflictHeatmap";
import { buildCoverageHeatmap } from "./coverageHeatmap";
import { computeRuleConfidences } from "./confidenceModel";
import { findKnowledgeGaps } from "./knowledgeGaps";
import { generateAdaptiveQuestions } from "./adaptiveQuestions";
import { buildAdaptiveQueue } from "./adaptiveQueue";
import { buildChallenges } from "./challengeEngine";
import { scoreChallenges } from "./challengeScore";
import { compressProposals } from "./proposalCompression";
import { buildEvolutionReport } from "./evolutionReport";
import { getKnowledgeDistillationMemory } from "./memoryStore";

export function runKnowledgeDistillation(input?: {
  humanRepo?: HumanDecisionReviewRepository;
  persist?: boolean;
}): DistillationRunResult {
  const humanRepo = input?.humanRepo ?? new HumanDecisionReviewRepository();
  const observations = analyzeAllSessions({ humanRepo });
  const clusters = clusterRules(observations);
  const compression = compressClusters(observations, clusters);
  const conflictHeatmap = buildConflictHeatmap(observations);
  const coverageHeatmap = buildCoverageHeatmap(observations, clusters);
  const confidences = computeRuleConfidences({ observations, clusters, conflictHeatmap });
  const gaps = findKnowledgeGaps({ coverage: coverageHeatmap, conflicts: conflictHeatmap, confidences });
  const adaptiveQuestions = generateAdaptiveQuestions({ gaps, conflicts: conflictHeatmap, confidences, clusters });
  const adaptiveQueue = buildAdaptiveQueue(adaptiveQuestions);
  const challenges = buildChallenges({ clusters, confidences, conflicts: conflictHeatmap });
  const challengeScores = scoreChallenges({ clusters, observations });
  const compressedProposals = compressProposals({ clusters, gaps, conflicts: conflictHeatmap, confidences });
  const totalSessions =
    humanRepo.listSessions().length + getCriticalCalibrationMemory().listSessions().length;
  const evolution = buildEvolutionReport({
    totalSessions,
    clusters,
    compression,
    conflicts: conflictHeatmap,
    coverage: coverageHeatmap,
    confidences,
    gaps,
    nextQuestions: adaptiveQueue,
  });

  const result = distillationRunResultSchema.parse({
    observations,
    clusters,
    compression,
    conflictHeatmap,
    coverageHeatmap,
    confidences,
    gaps,
    adaptiveQuestions,
    adaptiveQueue,
    challenges,
    challengeScores,
    compressedProposals,
    evolution,
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
    realMarketData: false,
  });

  if (input?.persist !== false) {
    getKnowledgeDistillationMemory().saveRun(result);
  }
  return result;
}