import {
  knowledgeAcquisitionProposalSchema,
  type KnowledgeAcquisitionProposal,
} from "@shared/goodTradingAiExtractor";

export type ExtractorValidationIssue = { code: string; message: string };

/**
 * Validate proposal shape + safety (no auto-apply, no buy/sell mandates as accepted truth).
 */
export function validateExtractorProposal(
  proposal: KnowledgeAcquisitionProposal,
): { ok: boolean; proposal: KnowledgeAcquisitionProposal; issues: ExtractorValidationIssue[] } {
  const issues: ExtractorValidationIssue[] = [];
  const parsed = knowledgeAcquisitionProposalSchema.safeParse(proposal);
  if (!parsed.success) {
    return {
      ok: false,
      proposal,
      issues: [{ code: "SCHEMA", message: parsed.error.issues[0]?.message ?? "invalid proposal" }],
    };
  }

  let p = parsed.data;
  if (!p.statement.trim()) {
    issues.push({ code: "EMPTY_STATEMENT", message: "statement empty" });
  }
  if (p.status !== "PENDING" && p.status !== "ACCEPTED" && p.status !== "EDITED" && p.status !== "MERGED" && p.status !== "REJECTED") {
    issues.push({ code: "BAD_STATUS", message: "invalid status" });
  }

  // Soft-flag trading mandates in statements (do not auto-reject — human reviews)
  if (/\b(compra ahora|vende ahora|buy now|sell now)\b/i.test(p.statement)) {
    issues.push({ code: "DIRECT_ADVICE_LANGUAGE", message: "statement has direct advice language" });
    p = {
      ...p,
      scores: { ...p.scores, risk: Math.min(1, p.scores.risk + 0.2) },
    };
  }

  // Relations must look like ids
  for (const rel of p.suggestedRelations) {
    if (!/^gt_[a-z0-9_]+$/i.test(rel.targetId)) {
      issues.push({ code: "BAD_RELATION_ID", message: rel.targetId });
    }
  }

  return { ok: issues.filter((i) => i.code === "SCHEMA" || i.code === "EMPTY_STATEMENT").length === 0, proposal: p, issues };
}

export function validateProposalBatch(
  proposals: KnowledgeAcquisitionProposal[],
): { ok: boolean; proposals: KnowledgeAcquisitionProposal[]; issues: ExtractorValidationIssue[] } {
  const allIssues: ExtractorValidationIssue[] = [];
  const out: KnowledgeAcquisitionProposal[] = [];
  for (const p of proposals) {
    const v = validateExtractorProposal(p);
    allIssues.push(...v.issues);
    if (v.ok) out.push(v.proposal);
  }
  return { ok: allIssues.filter((i) => i.code === "SCHEMA").length === 0, proposals: out, issues: allIssues };
}
