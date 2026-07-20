import type { KnowledgeHealthMetrics } from "@shared/goodTradingAiCuration";
import { knowledgeRegistry } from "../knowledge/registry";
import { analyzeDuplicates } from "./duplicateAnalyzer";
import { analyzeConflicts } from "./conflictAnalyzer";
import { analyzeRelations } from "./relationAnalyzer";
import { analyzeDeprecations } from "./deprecationAnalyzer";
import { scoreAllEntries, type UsageSignals } from "./qualityScore";
import { allRelationIds } from "./textUtils";

export type HealthScanResult = {
  metrics: KnowledgeHealthMetrics;
  qualities: ReturnType<typeof scoreAllEntries>;
  duplicates: ReturnType<typeof analyzeDuplicates>;
  conflicts: ReturnType<typeof analyzeConflicts>;
  relations: ReturnType<typeof analyzeRelations>;
  deprecations: ReturnType<typeof analyzeDeprecations>;
};

/**
 * Aggregate Knowledge Health metrics (suggest-only diagnostics).
 */
export function computeKnowledgeHealth(signals: UsageSignals = {}): HealthScanResult {
  const started = Date.now();
  const entries = knowledgeRegistry.getAll();
  const entryCount = entries.length;
  const qualities = scoreAllEntries(signals);
  const duplicates = analyzeDuplicates({ entries, maxPairs: 200 });
  const conflicts = analyzeConflicts({ entries, maxFindings: 100 });
  const relations = analyzeRelations({ entries, maxFindings: 150 });
  const deprecations = analyzeDeprecations({ entries, qualities, maxFindings: 80 });

  const dupCount = duplicates.filter((d) => d.kind === "DUPLICATE").length;
  const mergeCount = duplicates.filter((d) => d.kind === "POSSIBLE_MERGE").length;
  const nearCount = duplicates.filter((d) => d.kind === "NEAR_DUPLICATE").length;

  const noRelations = entries.filter((e) => allRelationIds(e).length === 0).length;
  const avgQuality =
    qualities.length === 0
      ? 0
      : qualities.reduce((s, q) => s + q.qualityScore, 0) / qualities.length;

  const neverUsed = qualities.filter(
    (q) => q.timesReferenced === 0 && q.timesUsedInReasoning === 0,
  ).length;
  const highlyUsed = qualities.filter(
    (q) => q.timesReferenced + q.timesUsedInReasoning >= 5,
  ).length;
  const lowQuality = qualities.filter((q) => q.qualityScore < 0.35).length;
  const goldenCases = qualities.reduce((s, q) => s + q.goldenCaseCount, 0);

  // Health: start 100, subtract weighted defects (clamped)
  let health =
    100 -
    dupCount * 3 -
    mergeCount * 1.5 -
    nearCount * 0.5 -
    conflicts.length * 4 -
    deprecations.length * 1.2 -
    Math.min(25, noRelations * 0.35) -
    Math.min(15, lowQuality * 0.25);

  // Reward connectivity & avg quality
  health += Math.min(8, avgQuality * 8);
  health = Math.max(0, Math.min(100, Math.round(health * 10) / 10));

  const metrics: KnowledgeHealthMetrics = {
    overallHealthPct: health,
    entryCount,
    duplicates: dupCount,
    possibleMerges: mergeCount,
    nearDuplicates: nearCount,
    conflicts: conflicts.length,
    deprecatedCandidates: deprecations.length,
    noRelations,
    orphanConcepts: relations.orphans.length,
    goldenCases,
    neverUsed,
    highlyUsed,
    lowQuality,
    averageQualityScore: Math.round(avgQuality * 1000) / 1000,
    scannedAt: new Date().toISOString(),
    durationMs: Date.now() - started,
  };

  return { metrics, qualities, duplicates, conflicts, relations, deprecations };
}
