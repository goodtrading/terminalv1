import { randomUUID } from "node:crypto";
import type { KnowledgeAcquisitionProposal } from "@shared/goodTradingAiExtractor";
import type { ExtractedCandidate } from "./knowledgeExtractor";
import { deduplicateAgainstRegistry } from "./deduplicator";
import { scoreCandidate } from "./candidateScorer";
import { suggestRelationsForCandidate } from "./relationSuggester";
import { detectGoldenCaseCandidate } from "./goldenCaseDetector";

/**
 * Build compact, reviewable proposals from extracted candidates.
 * NEVER writes to the Brain/registry.
 */
export function buildProposalsFromCandidates(params: {
  candidates: ExtractedCandidate[];
  sourceTranscriptId: string;
  now?: string;
}): KnowledgeAcquisitionProposal[] {
  const now = params.now ?? new Date().toISOString();
  const proposals: KnowledgeAcquisitionProposal[] = [];

  for (const c of params.candidates) {
    const dedup = deduplicateAgainstRegistry(c);
    const scores = scoreCandidate(c, dedup);
    const suggestedRelations = suggestRelationsForCandidate(c);
    const golden = detectGoldenCaseCandidate(c);

    proposals.push({
      id: `prop_${randomUUID().slice(0, 12)}`,
      status: "PENDING",
      kind: c.kind,
      title: c.title.slice(0, 160),
      statement: c.statement.slice(0, 800),
      explanation: c.explanation.slice(0, 1200),
      concepts: c.concepts.slice(0, 12),
      aliases: c.aliases.slice(0, 12),
      categoryHint: c.categoryHint,
      sourceTranscriptId: params.sourceTranscriptId,
      sourceExcerpt: c.sourceExcerpt.slice(0, 500),
      scores,
      dedup: {
        verdict: dedup.verdict,
        matchedEntryId: dedup.matchedEntryId,
        matchedTitle: dedup.matchedTitle,
        similarity: dedup.similarity,
        reason: dedup.reason,
      },
      suggestedRelations,
      goldenCaseCandidate: golden.isCandidate
        ? {
            isCandidate: true,
            reason: golden.reason,
            errorSnippet: golden.errorSnippet,
            correctionSnippet: golden.correctionSnippet,
          }
        : { isCandidate: false, reason: golden.reason },
      createdAt: now,
      updatedAt: now,
    });
  }

  return proposals;
}
