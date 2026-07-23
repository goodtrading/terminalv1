/**
 * Obsolete Rule Detector — report only; never delete.
 */
import type {
  ObsoleteRule,
  RegisteredRule,
  RuleHistory,
  RuleStability,
  DependencyGraph,
} from "@shared/goodTradingAiKnowledgeEvolution";
import { obsoleteRuleSchema } from "@shared/goodTradingAiKnowledgeEvolution";

export function detectObsoleteRules(input: {
  rules: RegisteredRule[];
  histories: RuleHistory[];
  stabilities: RuleStability[];
  graph: DependencyGraph;
}): ObsoleteRule[] {
  const hist = new Map(input.histories.map((h) => [h.ruleId, h]));
  const stab = new Map(input.stabilities.map((s) => [s.ruleId, s]));
  const invalidated = new Set(
    input.graph.edges.filter((e) => e.relation === "invalidates").map((e) => e.toRuleId),
  );
  const out: ObsoleteRule[] = [];

  for (const r of input.rules) {
    const h = hist.get(r.id);
    const s = stab.get(r.id);
    if (!h || h.reviewCount === 0) {
      out.push(
        obsoleteRuleSchema.parse({
          ruleId: r.id,
          kind: "NEVER_USED",
          detail: "Rule registered but never reviewed in human sessions.",
          severity: "MEDIUM",
          mentorEligible: false,
          neverDelete: true,
        }),
      );
      continue;
    }
    if (h.reviewCount <= 1 && (s?.stabilityScore ?? 0) < 0.25) {
      out.push(
        obsoleteRuleSchema.parse({
          ruleId: r.id,
          kind: "NO_COVERAGE",
          detail: "Very low review coverage and low stability.",
          severity: "LOW",
          mentorEligible: false,
          neverDelete: true,
        }),
      );
    }
    if (h.disagreementCount >= 3 && h.agreementCount === 0) {
      out.push(
        obsoleteRuleSchema.parse({
          ruleId: r.id,
          kind: "ALWAYS_DEFEATED",
          detail: "Repeated disagreements with zero agreements.",
          severity: "HIGH",
          mentorEligible: false,
          neverDelete: true,
        }),
      );
    }
    if (invalidated.has(r.id) && h.disagreementCount > h.agreementCount) {
      out.push(
        obsoleteRuleSchema.parse({
          ruleId: r.id,
          kind: "REPLACED",
          detail: "Invalidated by dependency edge and more disagreements than agreements.",
          severity: "MEDIUM",
          mentorEligible: false,
          neverDelete: true,
        }),
      );
    }
    if (r.kind === "GENERAL" && h.reviewCount >= 2 && (s?.stabilityScore ?? 1) < 0.35) {
      out.push(
        obsoleteRuleSchema.parse({
          ruleId: r.id,
          kind: "REDUNDANT",
          detail: "General rule with weak stability — may be redundant vs specific priority rules.",
          severity: "LOW",
          mentorEligible: false,
          neverDelete: true,
        }),
      );
    }
  }
  return out.slice(0, 200);
}