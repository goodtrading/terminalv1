/**
 * Proposal Ranking — sort PENDING by impact/stability/dependency/coverage/volatility.
 * Never auto-apply.
 */
import type {
  KeystoneScore,
  RankedProposal,
  RegisteredRule,
  RuleStability,
  RuleVolatility,
  RuleHistory,
  ObsoleteRule,
} from "@shared/goodTradingAiKnowledgeEvolution";
import { rankedProposalSchema } from "@shared/goodTradingAiKnowledgeEvolution";
import type { CompressedProposal } from "@shared/goodTradingAiKnowledgeDistillation";

function impactRank(i: "LOW" | "MEDIUM" | "HIGH"): number {
  return i === "HIGH" ? 1 : i === "MEDIUM" ? 0.6 : 0.3;
}

export function rankProposals(input: {
  distillationProposals?: CompressedProposal[];
  rules: RegisteredRule[];
  histories: RuleHistory[];
  stabilities: RuleStability[];
  volatilities: RuleVolatility[];
  keystones: KeystoneScore[];
  obsolete: ObsoleteRule[];
  limit?: number;
}): RankedProposal[] {
  const limit = input.limit ?? 20;
  const now = Date.now();
  const stab = new Map(input.stabilities.map((s) => [s.ruleId, s]));
  const vol = new Map(input.volatilities.map((v) => [v.ruleId, v]));
  const key = new Map(input.keystones.map((k) => [k.ruleId, k]));
  const hist = new Map(input.histories.map((h) => [h.ruleId, h]));
  const drafts: RankedProposal[] = [];

  // From distillation compressed proposals
  for (const p of input.distillationProposals ?? []) {
    const related = input.rules.filter((r) =>
      p.affectedRules.some((ar) => r.id.includes(ar.replace(/[^A-Z0-9_]/g, "").slice(0, 24)) || r.label.includes(ar.slice(0, 20))),
    );
    const ruleIds = related.map((r) => r.id).slice(0, 40);
    const avgStab =
      ruleIds.length === 0
        ? 0.5
        : ruleIds.reduce((s, id) => s + (stab.get(id)?.stabilityScore ?? 0.5), 0) / ruleIds.length;
    const avgVol =
      ruleIds.length === 0
        ? 0.5
        : ruleIds.reduce((s, id) => s + (vol.get(id)?.volatilityScore ?? 0.5), 0) / ruleIds.length;
    const avgDep =
      ruleIds.length === 0
        ? 0.3
        : ruleIds.reduce((s, id) => s + (key.get(id)?.keystoneScore ?? 0.3), 0) / ruleIds.length;
    const coverage =
      ruleIds.length === 0
        ? 0.3
        : ruleIds.reduce((s, id) => s + Math.min(1, (hist.get(id)?.reviewCount ?? 0) / 5), 0) / ruleIds.length;
    const rankScore = Math.min(
      1,
      0.3 * impactRank(p.impact) + 0.2 * (1 - avgStab) + 0.2 * avgDep + 0.15 * (1 - coverage) + 0.15 * avgVol,
    );
    drafts.push(
      rankedProposalSchema.parse({
        id: `kev_${p.id}`.slice(0, 80),
        status: "PENDING",
        title: p.title,
        reason: p.reason,
        conditions: p.conditions,
        affectedRuleIds: ruleIds,
        impact: p.impact,
        stabilityHint: avgStab,
        dependencyHint: avgDep,
        coverageHint: coverage,
        volatilityHint: avgVol,
        rankScore,
        autoApply: false,
        brainMutate: false,
        schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
        safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
        mentorEligible: false,
        createdAtMs: now,
      }),
    );
  }

  // Evolution-native proposals from high volatility / obsolete / keystone
  const topVol = [...input.volatilities].sort((a, b) => b.volatilityScore - a.volatilityScore)[0];
  if (topVol && topVol.volatilityScore >= 0.5) {
    drafts.push(
      rankedProposalSchema.parse({
        id: "kev_prop_volatility_01",
        status: "PENDING",
        title: `Calibrate high-volatility rule ${topVol.ruleId}`,
        reason: "Volatility engine flags frequent changes/disagreements; Active Learning should prioritize discriminating questions.",
        conditions: [
          "Keep proposals PENDING — no Brain apply",
          "Use Challenge Me / hypothesis discrimination prompts",
        ],
        affectedRuleIds: [topVol.ruleId],
        impact: "HIGH",
        stabilityHint: stab.get(topVol.ruleId)?.stabilityScore ?? 0.3,
        dependencyHint: key.get(topVol.ruleId)?.keystoneScore ?? 0.3,
        coverageHint: Math.min(1, (hist.get(topVol.ruleId)?.reviewCount ?? 0) / 5),
        volatilityHint: topVol.volatilityScore,
        rankScore: Math.min(1, 0.55 + topVol.volatilityScore * 0.4),
        autoApply: false,
        brainMutate: false,
        schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
        safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
        mentorEligible: false,
        createdAtMs: now + 1,
      }),
    );
  }

  const topKey = input.keystones[0];
  if (topKey && topKey.keystoneScore >= 0.5) {
    drafts.push(
      rankedProposalSchema.parse({
        id: "kev_prop_keystone_01",
        status: "PENDING",
        title: `Protect keystone rule ${topKey.ruleId}`,
        reason: "High downstream/upstream dependency impact — calibrate carefully before any editorial change.",
        conditions: [
          "Document invalidation stack first",
          "No auto-apply; Brain remains immutable",
        ],
        affectedRuleIds: [topKey.ruleId],
        impact: "HIGH",
        stabilityHint: stab.get(topKey.ruleId)?.stabilityScore ?? 0.5,
        dependencyHint: topKey.keystoneScore,
        coverageHint: Math.min(1, (hist.get(topKey.ruleId)?.reviewCount ?? 0) / 5),
        volatilityHint: vol.get(topKey.ruleId)?.volatilityScore ?? 0.4,
        rankScore: Math.min(1, 0.5 + topKey.keystoneScore * 0.45),
        autoApply: false,
        brainMutate: false,
        schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
        safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
        mentorEligible: false,
        createdAtMs: now + 2,
      }),
    );
  }

  for (const o of input.obsolete.filter((x) => x.severity === "HIGH").slice(0, 3)) {
    drafts.push(
      rankedProposalSchema.parse({
        id: `kev_prop_obs_${o.ruleId}`.slice(0, 80),
        status: "PENDING",
        title: `Review obsolete candidate ${o.ruleId}`,
        reason: o.detail,
        conditions: [
          "Report only — never delete from registry",
          "Human confirmation required before editorial note",
        ],
        affectedRuleIds: [o.ruleId],
        impact: "MEDIUM",
        stabilityHint: stab.get(o.ruleId)?.stabilityScore ?? 0.2,
        dependencyHint: key.get(o.ruleId)?.keystoneScore ?? 0.2,
        coverageHint: Math.min(1, (hist.get(o.ruleId)?.reviewCount ?? 0) / 5),
        volatilityHint: vol.get(o.ruleId)?.volatilityScore ?? 0.5,
        rankScore: 0.55,
        autoApply: false,
        brainMutate: false,
        schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
        safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
        mentorEligible: false,
        createdAtMs: now + 3,
      }),
    );
  }

  if (!drafts.length && input.rules.length) {
    const r = input.rules[0]!;
    drafts.push(
      rankedProposalSchema.parse({
        id: "kev_prop_baseline_01",
        status: "PENDING",
        title: `Continue calibration for ${r.id}`,
        reason: "Evolution run produced measurement updates; keep Active Learning focused on registry coverage without Brain mutation.",
        conditions: [
          "PENDING only — no auto-apply",
          "Update history/stability/volatility via feedback loop after sessions",
        ],
        affectedRuleIds: [r.id],
        impact: "MEDIUM",
        stabilityHint: stab.get(r.id)?.stabilityScore ?? 0.5,
        dependencyHint: key.get(r.id)?.keystoneScore ?? 0.3,
        coverageHint: Math.min(1, (hist.get(r.id)?.reviewCount ?? 0) / 5),
        volatilityHint: vol.get(r.id)?.volatilityScore ?? 0.3,
        rankScore: 0.4,
        autoApply: false,
        brainMutate: false,
        schemaWarning: "PROPOSAL_SCHEMA_NOT_READY_FOR_BRAIN_APPLICATION",
        safety: "NOT_SAFE_FOR_BRAIN_APPLICATION",
        mentorEligible: false,
        createdAtMs: now + 9,
      }),
    );
  }

  return drafts.sort((a, b) => b.rankScore - a.rankScore).slice(0, limit);
}