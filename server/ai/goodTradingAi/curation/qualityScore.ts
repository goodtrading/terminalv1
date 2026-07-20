import type { EntryQualityScore } from "@shared/goodTradingAiCuration";
import type { GoodTradingKnowledgeEntry } from "../knowledge/types";
import { knowledgeRegistry } from "../knowledge/registry";
import { allRelationIds, clamp01 } from "./textUtils";

export type UsageSignals = {
  /** entryId → counts (stub 0 when missing) */
  timesReferenced?: Record<string, number>;
  timesUsedInReasoning?: Record<string, number>;
  timesAccepted?: Record<string, number>;
  timesEdited?: Record<string, number>;
  timesMerged?: Record<string, number>;
  goldenCaseCount?: Record<string, number>;
  manualValidation?: Record<string, number>;
};

const CONF_MAP = { high: 0.9, medium: 0.65, low: 0.4 } as const;

/**
 * Deterministic quality score. Missing telemetry → zeros (documented stubs).
 */
export function scoreEntryQuality(
  entry: GoodTradingKnowledgeEntry,
  signals: UsageSignals = {},
): EntryQualityScore {
  const confidence = CONF_MAP[entry.confidence] ?? 0.5;
  const relCount = allRelationIds(entry).length;
  const importance = clamp01(
    0.35 +
      (entry.kind === "PRINCIPLE" || entry.kind === "RULE" ? 0.25 : 0.1) +
      Math.min(0.2, relCount * 0.03) +
      (entry.prohibitedInterpretations.length ? 0.05 : 0),
  );

  const timesReferenced = signals.timesReferenced?.[entry.id] ?? 0;
  const timesUsedInReasoning = signals.timesUsedInReasoning?.[entry.id] ?? 0;
  const timesAccepted = signals.timesAccepted?.[entry.id] ?? 0;
  const timesEdited = signals.timesEdited?.[entry.id] ?? 0;
  const timesMerged = signals.timesMerged?.[entry.id] ?? 0;
  const goldenCaseCount = signals.goldenCaseCount?.[entry.id] ?? 0;
  const manualValidation = clamp01(signals.manualValidation?.[entry.id] ?? 0);

  // Novelty: richer unique aliases / examples → slightly higher; stubs keep mid
  const novelty = clamp01(
    0.4 +
      Math.min(0.25, entry.aliases.length * 0.04) +
      Math.min(0.2, entry.examples.length * 0.05) -
      Math.min(0.15, timesMerged * 0.05),
  );

  const usageBoost = clamp01(
    timesReferenced * 0.02 + timesUsedInReasoning * 0.03 + timesAccepted * 0.04,
  );
  const editPenalty = Math.min(0.15, timesEdited * 0.03);
  const qualityScore = clamp01(
    confidence * 0.28 +
      importance * 0.22 +
      novelty * 0.12 +
      usageBoost * 0.2 +
      manualValidation * 0.12 +
      Math.min(0.1, goldenCaseCount * 0.05) -
      editPenalty,
  );

  return {
    entryId: entry.id,
    title: entry.title.slice(0, 160),
    confidence,
    importance,
    novelty,
    timesReferenced,
    timesUsedInReasoning,
    timesAccepted,
    timesEdited,
    timesMerged,
    goldenCaseCount,
    manualValidation,
    qualityScore,
  };
}

export function scoreAllEntries(signals: UsageSignals = {}): EntryQualityScore[] {
  return knowledgeRegistry.getAll().map((e) => scoreEntryQuality(e, signals));
}
