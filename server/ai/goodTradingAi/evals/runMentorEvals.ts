import { detectMentorIntent } from "../mentorIntent";
import { buildValidatedMentorFields } from "../mentorResponseEngine";
import { ensureKnowledgeRegistryValid } from "../knowledge/registry";
import { MENTOR_EVAL_CASES, type MentorEvalCase } from "./mentorCases";

export type MentorEvalFailure = {
  caseId: string;
  reason: string;
};

export type MentorEvalReport = {
  total: number;
  passed: number;
  failed: MentorEvalFailure[];
};

export function runMentorEvals(cases: readonly MentorEvalCase[] = MENTOR_EVAL_CASES): MentorEvalReport {
  ensureKnowledgeRegistryValid();
  const failed: MentorEvalFailure[] = [];

  for (const c of cases) {
    const intent = detectMentorIntent(c.message);
    const { fields, coverage } = buildValidatedMentorFields(c.message);

    if (c.expect.intent && intent !== c.expect.intent) {
      failed.push({ caseId: c.id, reason: `intent ${intent} != ${c.expect.intent}` });
      continue;
    }
    if (c.expect.coverage && coverage !== c.expect.coverage) {
      failed.push({ caseId: c.id, reason: `coverage ${coverage} != ${c.expect.coverage}` });
      continue;
    }
    if (c.expect.minObservations != null && fields.observations.length < c.expect.minObservations) {
      failed.push({
        caseId: c.id,
        reason: `observations ${fields.observations.length} < ${c.expect.minObservations}`,
      });
      continue;
    }
    if (c.expect.minRefs != null && (fields.knowledgeReferences?.length ?? 0) < c.expect.minRefs) {
      failed.push({
        caseId: c.id,
        reason: `refs ${fields.knowledgeReferences?.length ?? 0} < ${c.expect.minRefs}`,
      });
      continue;
    }
    if (c.expect.mustIncludeRefId) {
      const ok = fields.knowledgeReferences?.some((r) => r.id === c.expect.mustIncludeRefId);
      if (!ok) {
        failed.push({
          caseId: c.id,
          reason: `missing ref ${c.expect.mustIncludeRefId}; got ${(fields.knowledgeReferences ?? []).map((r) => r.id).join(",")}`,
        });
        continue;
      }
    }
    if (c.expect.mustIncludeAnyRefId?.length) {
      const ok = c.expect.mustIncludeAnyRefId.some((id) =>
        fields.knowledgeReferences?.some((r) => r.id === id),
      );
      if (!ok) {
        failed.push({
          caseId: c.id,
          reason: `missing any of [${c.expect.mustIncludeAnyRefId.join(",")}]; got ${(fields.knowledgeReferences ?? []).map((r) => r.id).join(",")}`,
        });
        continue;
      }
    }
    for (const re of c.expect.summaryIncludes ?? []) {
      if (!re.test(fields.summary)) {
        failed.push({ caseId: c.id, reason: `summary missing ${re}` });
        break;
      }
    }
    let excluded = false;
    for (const re of c.expect.summaryExcludes ?? []) {
      if (re.test(fields.summary)) {
        failed.push({ caseId: c.id, reason: `summary has banned ${re}` });
        excluded = true;
        break;
      }
    }
    if (excluded) continue;
  }

  return {
    total: cases.length,
    passed: cases.length - failed.length,
    failed,
  };
}
