/**
 * GoodTrading AI Knowledge Curation — shared contracts (AI-5.5).
 * Compact admin payloads only. Never dumps the full Brain.
 */
import { z } from "zod";

export const curationIssueKindSchema = z.enum([
  "DUPLICATE",
  "POSSIBLE_MERGE",
  "NEAR_DUPLICATE",
  "CONFLICT",
  "ORPHAN",
  "MISSING_RELATION",
  "DEPRECATION",
  "LOW_QUALITY",
  "VERSION_NOTE",
]);
export type CurationIssueKind = z.infer<typeof curationIssueKindSchema>;

export const curationDecisionSchema = z.enum(["ACCEPT", "EDIT", "MERGE", "IGNORE"]);
export type CurationDecision = z.infer<typeof curationDecisionSchema>;

export const curationIssueStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "EDITED",
  "MERGED",
  "IGNORED",
]);
export type CurationIssueStatus = z.infer<typeof curationIssueStatusSchema>;

export const knowledgeHealthMetricsSchema = z.object({
  overallHealthPct: z.number().min(0).max(100),
  entryCount: z.number().int().nonnegative(),
  duplicates: z.number().int().nonnegative(),
  possibleMerges: z.number().int().nonnegative(),
  nearDuplicates: z.number().int().nonnegative(),
  conflicts: z.number().int().nonnegative(),
  deprecatedCandidates: z.number().int().nonnegative(),
  noRelations: z.number().int().nonnegative(),
  orphanConcepts: z.number().int().nonnegative(),
  goldenCases: z.number().int().nonnegative(),
  neverUsed: z.number().int().nonnegative(),
  highlyUsed: z.number().int().nonnegative(),
  lowQuality: z.number().int().nonnegative(),
  averageQualityScore: z.number().min(0).max(1),
  scannedAt: z.string().datetime(),
  durationMs: z.number().nonnegative(),
});
export type KnowledgeHealthMetrics = z.infer<typeof knowledgeHealthMetricsSchema>;

export const entryQualityScoreSchema = z.object({
  entryId: z.string().min(1).max(80),
  title: z.string().min(1).max(160),
  confidence: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  timesReferenced: z.number().int().nonnegative(),
  timesUsedInReasoning: z.number().int().nonnegative(),
  timesAccepted: z.number().int().nonnegative(),
  timesEdited: z.number().int().nonnegative(),
  timesMerged: z.number().int().nonnegative(),
  goldenCaseCount: z.number().int().nonnegative(),
  manualValidation: z.number().min(0).max(1),
  qualityScore: z.number().min(0).max(1),
});
export type EntryQualityScore = z.infer<typeof entryQualityScoreSchema>;

export const suggestedRelationCompactSchema = z.object({
  targetId: z.string().min(1).max(80),
  targetTitle: z.string().min(1).max(160),
  relation: z.enum([
    "supports",
    "dependsOn",
    "requires",
    "relatedTo",
    "contradicts",
    "invalidates",
  ]),
  reason: z.string().min(1).max(240),
});
export type SuggestedRelationCompact = z.infer<typeof suggestedRelationCompactSchema>;

export const mergeSuggestionCompactSchema = z.object({
  keepId: z.string().min(1).max(80),
  dropId: z.string().min(1).max(80),
  similarity: z.number().min(0).max(1),
  reason: z.string().min(1).max(400),
  suggestedTitle: z.string().max(160).optional(),
  suggestedStatement: z.string().max(800).optional(),
  risks: z.array(z.string().max(200)).max(8),
});
export type MergeSuggestionCompact = z.infer<typeof mergeSuggestionCompactSchema>;

/** Compact curation issue — IDs + short fields only. */
export const curationIssueSchema = z.object({
  id: z.string().min(1).max(80),
  kind: curationIssueKindSchema,
  status: curationIssueStatusSchema,
  title: z.string().min(1).max(160),
  summary: z.string().min(1).max(500),
  entryIds: z.array(z.string().max(80)).min(1).max(12),
  entryTitles: z.array(z.string().max(160)).max(12),
  similarity: z.number().min(0).max(1).optional(),
  severity: z.enum(["low", "medium", "high"]),
  merge: mergeSuggestionCompactSchema.optional(),
  suggestedRelations: z.array(suggestedRelationCompactSchema).max(8).optional(),
  quality: entryQualityScoreSchema.optional(),
  versionNote: z
    .object({
      entryId: z.string().max(80),
      fromVersion: z.string().max(40),
      toVersion: z.string().max(40),
      reason: z.string().max(300),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type CurationIssue = z.infer<typeof curationIssueSchema>;

export const curationReviewInputSchema = z
  .object({
    issueId: z.string().min(1).max(80),
    decision: curationDecisionSchema,
    notes: z.string().trim().max(2000).optional(),
    editedSummary: z.string().trim().max(500).optional(),
    mergeKeepId: z.string().trim().max(80).optional(),
    mergeDropId: z.string().trim().max(80).optional(),
  })
  .strict();
export type CurationReviewInput = z.infer<typeof curationReviewInputSchema>;

export const curationReviewRecordSchema = curationReviewInputSchema.extend({
  id: z.string().min(1).max(80),
  reviewedByUserId: z.number().int().positive(),
  reviewedByEmail: z.string().email().max(200).optional(),
  createdAt: z.string().datetime(),
  resultingStatus: curationIssueStatusSchema,
});
export type CurationReviewRecord = z.infer<typeof curationReviewRecordSchema>;

export const versionHistoryEntrySchema = z.object({
  id: z.string().min(1).max(80),
  entryId: z.string().min(1).max(80),
  date: z.string().datetime(),
  editor: z.string().min(1).max(120),
  reason: z.string().min(1).max(400),
  fromVersion: z.string().max(40),
  toVersion: z.string().max(40),
  diffSummary: z.string().max(800),
});
export type VersionHistoryEntry = z.infer<typeof versionHistoryEntrySchema>;

export const runCurationScanRequestSchema = z
  .object({
    includeQuality: z.boolean().optional(),
    maxIssues: z.number().int().min(1).max(500).optional(),
  })
  .strict();
export type RunCurationScanRequest = z.infer<typeof runCurationScanRequestSchema>;
