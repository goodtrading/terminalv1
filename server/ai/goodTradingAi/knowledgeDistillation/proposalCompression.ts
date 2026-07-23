/**
 * Proposal Compression — group many findings into ~5 PENDING proposals.
 * Respects AI-7.3.3 proposal debt: title/reason/conditions.
 * NOT_SAFE_FOR_BRAIN_APPLICATION / never Apply.
 */
import type {
  CompressedProposal,
  ConflictHeatmap,
  KnowledgeGap,
  RuleCluster,
  RuleConfidence,
} from "@shared/goodTradingAiKnowledgeDistillation";
import { compressedProposalSchema } from "@shared/goodTradingAiKnowledgeDistillation";

export function compressProposals(input: {
  clusters: RuleCluster[];
  gaps: KnowledgeGap[];
  conflicts: ConflictHeatmap;
  confidences: RuleConfidence[];
  targetCount?: number;
}): CompressedProposal[] {
  const target = input.targetCount ?? 5;
  const now = Date.now();
  const drafts: Array<Omit<CompressedProposal, "id" | "createdAtMs"> & { score: number }> = [];

  const topConflict = input.conflicts.cells[0];
  if (topConflict) {
    drafts.push({
      status: "PENDING",
      title: `Clarify priority between ${topConflict.lensA} and ${topConflict.lensB}`,
      reason: `Repeated methodological conflict (count=${topConflict.count}). Needs explicit priority rule and invalidation path.`,
      conditions: [
        "Human review of conflict cases required",
        "No Brain mutation until support observations exist",
        "Statement/scope/counterexamples schema still incomplete",
      ],
      affectedSessions: [],
      affectedRules: [`${topConflict.lensA}<->${topConflict.lensB}`],
      frequency: Math.max(1, topConflict.count),
      confidence: topConflict.confidence,
      impact: "HIGH",
      risk: "MEDIUM",
      autoApply: false,
      brainMutate: false,
      schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
      safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
      mentorEligible: false,
      score: 100 + topConflict.count,
    });
  }

  const never = input.gaps.filter((g) => g.kind === "NEVER_DISCUSSED").slice(0, 3);
  if (never.length) {
    drafts.push({
      status: "PENDING",
      title: `Cover never-discussed lenses: ${never.map((g) => g.subject).join(", ")}`,
      reason: "Distillation found lenses with zero human discussion; adaptive coverage required.",
      conditions: [
        "Generate targeted blind questions only",
        "Do not invent empirical edge claims",
      ],
      affectedSessions: [],
      affectedRules: never.map((g) => g.subject),
      frequency: never.length,
      confidence: "MEDIUM",
      impact: "MEDIUM",
      risk: "LOW",
      autoApply: false,
      brainMutate: false,
      schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
      safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
      mentorEligible: false,
      score: 80,
    });
  }

  const lowConf = input.confidences.filter((c) => c.confidenceScore < 0.4).slice(0, 5);
  if (lowConf.length) {
    const rules = lowConf.map((c) => c.conceptKey.slice(0, 80));
    drafts.push({
      status: "PENDING",
      title: "Stress-test low-confidence methodological rules",
      reason: `${lowConf.length} clusters have low confidenceScore; challenge/discriminating questions required before any editorial change.`,
      conditions: [
        "Use Challenge Me / hypothesis discrimination prompts",
        "Keep proposals PENDING — no auto-apply",
      ],
      affectedSessions: [],
      affectedRules: rules,
      frequency: lowConf.length,
      confidence: "LOW",
      impact: "HIGH",
      risk: "HIGH",
      autoApply: false,
      brainMutate: false,
      schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
      safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
      mentorEligible: false,
      score: 90,
    });
  }

  const frequent = input.clusters.filter((c) => c.frequency >= 2).slice(0, 4);
  if (frequent.length) {
    drafts.push({
      status: "PENDING",
      title: "Compress repeated methodological statements",
      reason: "Multiple near-duplicate human statements can be merged into a canonical methodological note (editorial only).",
      conditions: [
        "Preserve append-only human answers",
        "Canonical text must remain HYPOTHETICAL/METHODOLOGICAL",
      ],
      affectedSessions: [],
      affectedRules: frequent.map((c) => c.conceptKey.slice(0, 80)),
      frequency: frequent.reduce((s, c) => s + c.frequency, 0),
      confidence: "MEDIUM",
      impact: "MEDIUM",
      risk: "LOW",
      autoApply: false,
      brainMutate: false,
      schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
      safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
      mentorEligible: false,
      score: 70,
    });
  }

  drafts.push({
    status: "PENDING",
    title: "Document full invalidation stacks for priority heuristics",
    reason: "Challenge engine highlights missing full-invalidation paths for high-frequency heuristics.",
    conditions: [
      "Collect invalidation lists from Ignacio without suggested answers",
      "No trading outcome tokens",
    ],
    affectedSessions: [],
    affectedRules: ["INVALIDATION", "PRIORITY"],
    frequency: 1,
    confidence: "MEDIUM",
    impact: "HIGH",
    risk: "MEDIUM",
    autoApply: false,
    brainMutate: false,
    schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
    safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
    mentorEligible: false,
    score: 65,
  });

  return drafts
    .sort((a, b) => b.score - a.score)
    .slice(0, target)
    .map((d, idx) => {
      const { score: _s, ...rest } = d;
      return compressedProposalSchema.parse({
        ...rest,
        id: `kd_prop_${String(idx + 1).padStart(2, "0")}`,
        createdAtMs: now + idx,
      });
    });
}