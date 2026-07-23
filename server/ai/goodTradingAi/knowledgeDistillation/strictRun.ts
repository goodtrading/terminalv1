/**
 * AI-7.3.9 — Strict distillation by explicit HUMAN completed session IDs.
 */
import { createHash } from "node:crypto";
import {
  strictDistillationRunBodySchema,
  type StrictDistillationRunBody,
} from "@shared/goodTradingAiDurableCalibration";
import { runKnowledgeDistillation } from "./pipeline";
import { analyzeCriticalCalibrationSessions, analyzeHumanReviewSessions } from "./sessionAnalyzer";
import { getDurableRepos } from "../durableCalibration/factory";
import {
  assertDistillationAllowed,
  assessStorageHealth,
} from "../durableCalibration/health";
import { getCriticalCalibrationMemory } from "../criticalCalibration/memoryStore";
import { getSessionProgress } from "../criticalCalibration/sessionService";
import type { DistillationRunResult } from "@shared/goodTradingAiKnowledgeDistillation";
import { distillationRunResultSchema } from "@shared/goodTradingAiKnowledgeDistillation";
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
import type { DistilledObservation } from "@shared/goodTradingAiKnowledgeDistillation";

function fingerprintSessions(ids: string[]): string {
  return createHash("sha256").update(ids.slice().sort().join("|")).digest("hex").slice(0, 32);
}

export async function runStrictKnowledgeDistillation(
  body: unknown,
): Promise<{
  result: DistillationRunResult | null;
  dryRun: boolean;
  sourceSessionIds: string[];
  fingerprint: string;
  preview?: { observationCount: number; humanSessionCount: number };
  warning?: string;
  mentorEligible: false;
  brainMutate: false;
  autoApply: false;
}> {
  const parsed: StrictDistillationRunBody = strictDistillationRunBodySchema.parse(body);
  const health = await assessStorageHealth({ priorHumanLossSuspected: true });
  assertDistillationAllowed(health);
  await getDurableRepos();

  const store = getCriticalCalibrationMemory();
  const accepted: string[] = [];
  for (const id of parsed.sourceSessionIds) {
    const session = store.getSession(id);
    if (!session) throw new Error(`SESSION_NOT_FOUND:${id}`);
    if (session.kind !== "HUMAN") throw new Error(`SESSION_NOT_HUMAN:${id}`);
    if (session.archived) throw new Error(`SESSION_ARCHIVED:${id}`);
    const progress = getSessionProgress(id);
    if (progress.status !== "COMPLETED") throw new Error(`SESSION_NOT_COMPLETED:${id}`);
    // Holdout exclusion: sessions labeled holdout
    if ((session.label ?? "").toLowerCase().includes("holdout")) {
      throw new Error(`SESSION_HOLDOUT_EXCLUDED:${id}`);
    }
    accepted.push(id);
  }

  const fp = parsed.fingerprint ?? fingerprintSessions(accepted);
  if (parsed.fingerprint && parsed.fingerprint !== fingerprintSessions(accepted)) {
    throw new Error("FINGERPRINT_MISMATCH");
  }

  const repos = await getDurableRepos();
  if (parsed.duplicatePolicy === "REJECT") {
    const ids = await repos.knowledgeDistillation.listRunIds();
    for (const rid of ids) {
      const prev = await repos.knowledgeDistillation.getRun(rid);
      const prevFp = (prev as { sourceFingerprint?: string } | null)?.sourceFingerprint;
      if (prevFp === fp) throw new Error("DUPLICATE_DISTILLATION_RUN");
    }
  }

  // Filter CC observations to accepted HUMAN sessions only (no TECHNICAL mix).
  const allCc = analyzeCriticalCalibrationSessions().filter((o) => accepted.includes(o.sessionId));
  // Do not pull Human Review into CC-session-scoped runs unless session ids match HR (they won't).
  const observations: DistilledObservation[] = [...allCc];

  if (parsed.dryRun) {
    return {
      result: null,
      dryRun: true,
      sourceSessionIds: accepted,
      fingerprint: fp,
      preview: { observationCount: observations.length, humanSessionCount: accepted.length },
      mentorEligible: false,
      brainMutate: false,
      autoApply: false,
    };
  }

  if (observations.length === 0) {
    throw new Error("NO_OBSERVATIONS_FOR_SESSIONS");
  }

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
  const evolution = buildEvolutionReport({
    totalSessions: accepted.length,
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

  if (parsed.persist !== false) {
    const id = `run_strict_${Date.now()}`;
    await repos.knowledgeDistillation.saveRun(
      { ...result, sourceFingerprint: fp, sourceSessionIds: accepted } as never,
      id,
    );
  }

  return {
    result,
    dryRun: false,
    sourceSessionIds: accepted,
    fingerprint: fp,
    mentorEligible: false,
    brainMutate: false,
    autoApply: false,
  };
}

/** @deprecated empty-body /run — analyzes all available; warn in production */
export function runLegacyKnowledgeDistillationAllAvailable() {
  const result = runKnowledgeDistillation({ persist: true });
  return {
    result,
    deprecated: true as const,
    warning: "EMPTY_BODY_RUN_DEPRECATED_USE_POST_RUNS_WITH_SOURCE_SESSION_IDS",
    mentorEligible: false as const,
    brainMutate: false as const,
    autoApply: false as const,
  };
}

// silence unused import in typecheck if tree-shaken oddly
void analyzeHumanReviewSessions;
