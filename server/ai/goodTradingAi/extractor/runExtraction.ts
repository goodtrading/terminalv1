import { randomUUID } from "node:crypto";
import type {
  ExtractTranscriptRequest,
  KnowledgeAcquisitionProposal,
  ExtractorJobMemory,
} from "@shared/goodTradingAiExtractor";
import { parseTranscript } from "./transcriptParser";
import { extractKnowledgeCandidates } from "./knowledgeExtractor";
import { buildProposalsFromCandidates } from "./proposalBuilder";
import { validateProposalBatch } from "./extractorValidator";
import {
  appendJobMemory,
  upsertProposals,
} from "./store";

export type ExtractPipelineResult = {
  job: ExtractorJobMemory;
  proposals: KnowledgeAcquisitionProposal[];
  segmentCount: number;
  candidateCount: number;
};

/**
 * Full acquisition pipeline: parse → extract → score/dedup/relate → validate → persist proposals.
 * NEVER mutates the Knowledge Graph / registry.
 */
export function runKnowledgeExtraction(input: ExtractTranscriptRequest): ExtractPipelineResult {
  const sourceTranscriptId =
    input.classId?.trim() ||
    input.sourceLabel?.trim() ||
    `transcript_${randomUUID().slice(0, 10)}`;

  const segments = parseTranscript(input.transcript);
  const candidates = extractKnowledgeCandidates(segments);
  const built = buildProposalsFromCandidates({
    candidates,
    sourceTranscriptId,
  });
  const { proposals } = validateProposalBatch(built);

  upsertProposals(proposals);

  const job: ExtractorJobMemory = {
    id: `job_${randomUUID().slice(0, 12)}`,
    sourceTranscriptId,
    sourceLabel: input.sourceLabel,
    classId: input.classId,
    detectedCount: proposals.length,
    proposalIds: proposals.map((p) => p.id),
    createdAt: new Date().toISOString(),
    transcriptChars: input.transcript.length,
  };
  appendJobMemory(job);

  return {
    job,
    proposals,
    segmentCount: segments.length,
    candidateCount: candidates.length,
  };
}
