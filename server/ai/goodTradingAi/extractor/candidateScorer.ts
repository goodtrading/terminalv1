import type { KnowledgeProposalScore } from "@shared/goodTradingAiExtractor";
import type { ExtractedCandidate } from "./knowledgeExtractor";
import type { DedupResult } from "./deduplicator";

/**
 * Score proposals: confidence, novelty, importance, risk (0–1).
 */
export function scoreCandidate(
  candidate: ExtractedCandidate,
  dedup: DedupResult,
): KnowledgeProposalScore {
  let confidence = 0.45;
  if (candidate.signals.includes("rule") || candidate.signals.includes("principle")) confidence += 0.2;
  if (candidate.signals.includes("anti_pattern")) confidence += 0.15;
  if (candidate.concepts.length >= 2) confidence += 0.1;
  if (candidate.statement.length > 80) confidence += 0.05;
  if (dedup.verdict === "duplicate") confidence -= 0.15;

  let novelty = 0.7;
  if (dedup.verdict === "duplicate") novelty = 0.15;
  else if (dedup.verdict === "possible_merge") novelty = 0.4;
  else novelty = 0.55 + (1 - dedup.similarity) * 0.35;

  let importance = 0.4;
  if (candidate.kind === "PRINCIPLE" || candidate.kind === "RULE") importance += 0.25;
  if (candidate.kind === "ANTI_PATTERN") importance += 0.2;
  if (candidate.kind === "SETUP") importance += 0.15;
  if (/\b(invalid|riesgo|contexto|nunca)\b/i.test(candidate.statement)) importance += 0.1;

  let risk = 0.25;
  if (/\b(compra|vende|long|short|entrada ahora|garantiza)\b/i.test(candidate.statement)) risk += 0.35;
  if (candidate.kind === "SETUP") risk += 0.1;
  if (dedup.verdict === "duplicate") risk += 0.1;
  if (/\b(siempre|nunca)\b/i.test(candidate.statement) && candidate.kind !== "PRINCIPLE") risk += 0.1;

  return {
    confidence: clamp01(confidence),
    novelty: clamp01(novelty),
    importance: clamp01(importance),
    risk: clamp01(risk),
  };
}

function clamp01(n: number): number {
  return Math.round(Math.min(1, Math.max(0, n)) * 1000) / 1000;
}
