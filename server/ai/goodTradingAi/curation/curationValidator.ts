import {
  curationIssueSchema,
  knowledgeHealthMetricsSchema,
  type CurationIssue,
  type KnowledgeHealthMetrics,
} from "@shared/goodTradingAiCuration";

export type CurationValidationIssue = { code: string; message: string };

export function validateCurationIssue(
  issue: CurationIssue,
): { ok: boolean; issue: CurationIssue; issues: CurationValidationIssue[] } {
  const parsed = curationIssueSchema.safeParse(issue);
  if (!parsed.success) {
    return {
      ok: false,
      issue,
      issues: [{ code: "SCHEMA", message: parsed.error.issues[0]?.message ?? "invalid issue" }],
    };
  }
  const flags: CurationValidationIssue[] = [];
  if (parsed.data.entryIds.length === 0) {
    flags.push({ code: "NO_ENTRIES", message: "issue sin entryIds" });
  }
  return { ok: flags.length === 0, issue: parsed.data, issues: flags };
}

export function validateHealthMetrics(
  metrics: KnowledgeHealthMetrics,
): { ok: boolean; metrics: KnowledgeHealthMetrics; issues: CurationValidationIssue[] } {
  const parsed = knowledgeHealthMetricsSchema.safeParse(metrics);
  if (!parsed.success) {
    return {
      ok: false,
      metrics,
      issues: [{ code: "SCHEMA", message: parsed.error.issues[0]?.message ?? "invalid metrics" }],
    };
  }
  return { ok: true, metrics: parsed.data, issues: [] };
}

export function validateIssueBatch(issues: CurationIssue[]): {
  ok: boolean;
  issues: CurationIssue[];
  problems: CurationValidationIssue[];
} {
  const out: CurationIssue[] = [];
  const problems: CurationValidationIssue[] = [];
  for (const i of issues) {
    const v = validateCurationIssue(i);
    problems.push(...v.issues);
    if (v.ok) out.push(v.issue);
  }
  return {
    ok: problems.filter((p) => p.code === "SCHEMA").length === 0,
    issues: out,
    problems,
  };
}
