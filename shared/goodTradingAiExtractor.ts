/**
 * GoodTrading AI Knowledge Acquisition — shared contracts (AI-5).
 * Client-safe compact proposal fields only. No full Brain corpus.
 */
import { z } from "zod";

export const knowledgeProposalKindSchema = z.enum([
  "PRINCIPLE",
  "RULE",
  "HEURISTIC",
  "DEFINITION",
  "SETUP",
  "ANTI_PATTERN",
  "EXAMPLE",
]);
export type KnowledgeProposalKind = z.infer<typeof knowledgeProposalKindSchema>;

export const dedupVerdictSchema = z.enum(["duplicate", "possible_merge", "new_concept"]);
export type DedupVerdict = z.infer<typeof dedupVerdictSchema>;

export const proposalReviewDecisionSchema = z.enum(["ACCEPT", "EDIT", "MERGE", "REJECT"]);
export type ProposalReviewDecision = z.infer<typeof proposalReviewDecisionSchema>;

export const proposalStatusSchema = z.enum([
  "PENDING",
  "ACCEPTED",
  "EDITED",
  "MERGED",
  "REJECTED",
]);
export type ProposalStatus = z.infer<typeof proposalStatusSchema>;

export const knowledgeProposalScoreSchema = z.object({
  confidence: z.number().min(0).max(1),
  novelty: z.number().min(0).max(1),
  importance: z.number().min(0).max(1),
  risk: z.number().min(0).max(1),
});
export type KnowledgeProposalScore = z.infer<typeof knowledgeProposalScoreSchema>;

export const suggestedRelationSchema = z.object({
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
export type SuggestedRelation = z.infer<typeof suggestedRelationSchema>;

/** Compact proposal — never includes full registry dumps. */
export const knowledgeAcquisitionProposalSchema = z.object({
  id: z.string().min(1).max(80),
  status: proposalStatusSchema,
  kind: knowledgeProposalKindSchema,
  title: z.string().min(1).max(160),
  statement: z.string().min(1).max(800),
  explanation: z.string().min(1).max(1200),
  concepts: z.array(z.string().min(1).max(80)).max(12),
  aliases: z.array(z.string().min(1).max(80)).max(12),
  categoryHint: z.string().min(1).max(40).optional(),
  sourceTranscriptId: z.string().min(1).max(120),
  sourceExcerpt: z.string().min(1).max(500),
  scores: knowledgeProposalScoreSchema,
  dedup: z.object({
    verdict: dedupVerdictSchema,
    matchedEntryId: z.string().max(80).optional(),
    matchedTitle: z.string().max(160).optional(),
    similarity: z.number().min(0).max(1),
    reason: z.string().max(300),
  }),
  suggestedRelations: z.array(suggestedRelationSchema).max(12),
  goldenCaseCandidate: z
    .object({
      isCandidate: z.boolean(),
      reason: z.string().max(300),
      errorSnippet: z.string().max(300).optional(),
      correctionSnippet: z.string().max(300).optional(),
    })
    .optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
});
export type KnowledgeAcquisitionProposal = z.infer<typeof knowledgeAcquisitionProposalSchema>;

export const extractTranscriptRequestSchema = z
  .object({
    transcript: z.string().trim().min(20).max(50_000),
    sourceLabel: z.string().trim().min(1).max(120).optional(),
    classId: z.string().trim().min(1).max(120).optional(),
  })
  .strict();
export type ExtractTranscriptRequest = z.infer<typeof extractTranscriptRequestSchema>;

export const proposalReviewInputSchema = z
  .object({
    proposalId: z.string().min(1).max(80),
    decision: proposalReviewDecisionSchema,
    editedTitle: z.string().trim().max(160).optional(),
    editedStatement: z.string().trim().max(800).optional(),
    editedExplanation: z.string().trim().max(1200).optional(),
    mergeTargetId: z.string().trim().max(80).optional(),
    notes: z.string().trim().max(2000).optional(),
  })
  .strict();
export type ProposalReviewInput = z.infer<typeof proposalReviewInputSchema>;

export const proposalReviewRecordSchema = proposalReviewInputSchema.extend({
  id: z.string().min(1).max(80),
  reviewedByUserId: z.number().int().positive(),
  reviewedByEmail: z.string().email().max(200).optional(),
  createdAt: z.string().datetime(),
  /** Snapshot of proposal status after decision — never auto-writes Brain. */
  resultingStatus: proposalStatusSchema,
});
export type ProposalReviewRecord = z.infer<typeof proposalReviewRecordSchema>;

export const extractorJobMemorySchema = z.object({
  id: z.string().min(1).max(80),
  sourceTranscriptId: z.string().min(1).max(120),
  sourceLabel: z.string().max(120).optional(),
  classId: z.string().max(120).optional(),
  detectedCount: z.number().int().nonnegative(),
  proposalIds: z.array(z.string().max(80)).max(200),
  createdAt: z.string().datetime(),
  transcriptChars: z.number().int().nonnegative(),
});
export type ExtractorJobMemory = z.infer<typeof extractorJobMemorySchema>;
