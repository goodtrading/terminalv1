/**
 * AI-7.3.12 — Build DocumentObservations + resolve HumanDecisionUnits.
 * Pure. No answer text retained in audit artifacts (hashes/summaries only).
 */
import { createHash } from "node:crypto";
import type { CalibrationObservation } from "@shared/goodTradingAiCriticalCalibration";
import {
  documentObservationSchema,
  humanDecisionUnitSchema,
  observationLineageSchema,
  revisionResolutionSchema,
  type DocumentObservation,
  type HumanDecisionUnit,
  type ObservationLineage,
  type RevisionResolution,
} from "@shared/goodTradingAiIndependentEvidence";
import type { EvidenceLens } from "@shared/goodTradingAiCriticalCalibration";
import { extractLensesFromText } from "../normalize";
import { conceptKeyFromText, normalizeText } from "../normalize";

function textHash(text: string): string {
  return createHash("sha256").update(text).digest("hex").slice(0, 16);
}

function claimSummary(text: string): string {
  const n = normalizeText(text).slice(0, 120);
  return n.length >= 4 ? n : `${n || "claim"}_method`;
}

function uniqLenses(list: EvidenceLens[]): EvidenceLens[] {
  return Array.from(new Set(list)).slice(0, 12);
}

function classifyDocumentType(o: CalibrationObservation): DocumentObservation["documentType"] {
  if (o.observationKind === "REVISION") return "REVISION";
  if (o.observationKind === "ADDENDUM") return "ADDENDUM";
  if (o.postRevealAction) return "POST_REVEAL_NOTE";
  return "ANSWER";
}

/**
 * Map raw CC observations → DocumentObservation (lineage-aware).
 * Does not treat addenda/revisions as independent human sources.
 */
export function buildDocumentObservations(
  observations: CalibrationObservation[],
): DocumentObservation[] {
  const byQuestion = new Map<string, CalibrationObservation[]>();
  for (const o of observations) {
    const k = `${o.sessionId}|${o.questionId}`;
    const list = byQuestion.get(k) ?? [];
    list.push(o);
    byQuestion.set(k, list);
  }

  const out: DocumentObservation[] = [];
  for (const [, list] of Array.from(byQuestion.entries())) {
    const sorted = [...list].sort((a, b) => a.createdAtMs - b.createdAtMs);
    const answers = sorted.filter((o) => classifyDocumentType(o) === "ANSWER");
    const root = answers[0] ?? sorted.find((o) => classifyDocumentType(o) === "REVISION") ?? sorted[0]!;
    const revisions = sorted.filter((o) => classifyDocumentType(o) === "REVISION");
    const latestRevision = [...revisions].sort((a, b) => b.createdAtMs - a.createdAtMs)[0];
    const authorityId = latestRevision?.id ?? root.id;

    let revNum = 0;
    for (const o of sorted) {
      const documentType = classifyDocumentType(o);
      if (documentType === "REVISION") revNum++;
      const text = o.humanNote ?? "";
      out.push(
        documentObservationSchema.parse({
          observationId: o.id,
          documentType,
          sessionId: o.sessionId,
          questionId: o.questionId,
          rootAnswerId: root.id,
          revisionNumber: documentType === "REVISION" ? revNum : 0,
          createdAtMs: o.createdAtMs,
          humanConfidence: o.confidence,
          supersedesObservationId:
            documentType === "REVISION" ? o.revisionOf ?? root.id : undefined,
          supplementsObservationId:
            documentType === "ADDENDUM" || documentType === "POST_REVEAL_NOTE"
              ? authorityId
              : undefined,
          activeForCurrentPosition:
            o.id === authorityId || documentType === "ADDENDUM",
          contributesIndependentSupport: documentType === "ANSWER" && o.id === root.id,
          hasStructuredConditions: (o.conditions?.length ?? 0) > 0,
          hasConfirmations: (o.minimumConfirmations?.length ?? 0) > 0,
          hasInvalidations: (o.invalidations?.length ?? 0) > 0,
          answerType: o.answerType,
          postRevealAction: o.postRevealAction,
          lensHints: uniqLenses(extractLensesFromText(text)),
          textHash: textHash(text),
          textLength: text.length,
          mentorEligible: false,
        }),
      );
    }
  }
  return out.sort((a, b) => a.createdAtMs - b.createdAtMs);
}

export function resolveRevisionForUnit(
  docs: DocumentObservation[],
): RevisionResolution {
  const answers = docs.filter((d) => d.documentType === "ANSWER");
  const revisions = docs
    .filter((d) => d.documentType === "REVISION")
    .sort((a, b) => a.createdAtMs - b.createdAtMs);
  const addenda = docs.filter((d) => d.documentType === "ADDENDUM");
  const postReveal = docs.filter((d) => d.documentType === "POST_REVEAL_NOTE");
  const original = answers[0] ?? docs[0]!;
  const current = revisions.length ? revisions[revisions.length - 1]! : original;
  const superseded = [
    ...answers.filter((a) => a.observationId !== current.observationId).map((a) => a.observationId),
    ...revisions
      .filter((r) => r.observationId !== current.observationId)
      .map((r) => r.observationId),
  ];
  const unitId = `${original.sessionId}|${original.questionId}`;
  return revisionResolutionSchema.parse({
    unitId,
    originalAnswerId: original.observationId,
    currentAuthorityId: current.observationId,
    supersededObservationIds: superseded.slice(0, 40),
    activeAddendumIds: addenda.map((a) => a.observationId).slice(0, 40),
    postRevealMetaIds: postReveal.map((p) => p.observationId).slice(0, 40),
    revisionChainLength: revisions.length,
    mentorEligible: false,
  });
}

/**
 * Current human methodological position per question.
 * Last valid revision is authority; addenda enrich; post-reveal is metadata only.
 * Never concatenates full answer texts into the unit.
 */
export function resolveHumanDecisionUnit(input: {
  sessionId: string;
  questionId: string;
  raw: CalibrationObservation[];
  documents?: DocumentObservation[];
}): HumanDecisionUnit {
  const docs =
    input.documents ??
    buildDocumentObservations(input.raw).filter(
      (d) => d.sessionId === input.sessionId && d.questionId === input.questionId,
    );
  const resolution = resolveRevisionForUnit(docs);
  const byId = new Map(input.raw.map((o) => [o.id, o]));
  const authority = byId.get(resolution.currentAuthorityId)!;
  const addenda = resolution.activeAddendumIds
    .map((id) => byId.get(id))
    .filter(Boolean) as CalibrationObservation[];

  const conditions = new Set<string>();
  const confirmations = new Set<string>();
  const invalidations = new Set<string>();
  for (const o of [authority, ...addenda]) {
    for (const c of o.conditions ?? []) conditions.add(c);
    for (const c of o.minimumConfirmations ?? []) confirmations.add(c);
    for (const i of o.invalidations ?? []) invalidations.add(i);
  }

  const lensText = [
    authority.humanNote,
    ...Array.from(conditions).map((c) => `cond:${c}`),
    ...Array.from(confirmations).map((c) => `confirm:${c}`),
    ...Array.from(invalidations).map((i) => `invalidate:${i}`),
  ].join(" | ");
  const lenses = uniqLenses(extractLensesFromText(lensText));
  const answerType = authority.answerType ?? addenda.find((a) => a.answerType)?.answerType;
  const dependsFlag =
    answerType === "DEPENDS" || /\bdepende\b/i.test(authority.humanNote ?? "");
  const claimFp = textHash(conceptKeyFromText(authority.humanNote ?? "claim", lenses));
  const scenarioFingerprint = textHash(`${input.sessionId}|${input.questionId}`);

  return humanDecisionUnitSchema.parse({
    unitId: resolution.unitId,
    sessionId: input.sessionId,
    questionId: input.questionId,
    originalAnswerId: resolution.originalAnswerId,
    currentResolvedAnswerId: resolution.currentAuthorityId,
    activeRevisionIds: docs
      .filter((d) => d.documentType === "REVISION" && d.observationId === resolution.currentAuthorityId)
      .map((d) => d.observationId),
    addendumIds: resolution.activeAddendumIds,
    conditionCount: conditions.size,
    confirmationCount: confirmations.size,
    invalidationCount: invalidations.size,
    confidence: authority.confidence,
    lenses,
    scenarioFingerprint,
    sourceCount: docs.length,
    independentSupportWeight: 1,
    answerType,
    dependsFlag,
    claimFingerprint: claimFp,
    claimSummary: claimSummary(authority.humanNote ?? "method"),
    mentorEligible: false,
  });
}

export function resolveAllHumanDecisionUnits(
  observations: CalibrationObservation[],
): { documents: DocumentObservation[]; units: HumanDecisionUnit[]; lineages: ObservationLineage[] } {
  const documents = buildDocumentObservations(observations);
  const groups = new Map<string, CalibrationObservation[]>();
  for (const o of observations) {
    const k = `${o.sessionId}|${o.questionId}`;
    const list = groups.get(k) ?? [];
    list.push(o);
    groups.set(k, list);
  }
  const units: HumanDecisionUnit[] = [];
  const lineages: ObservationLineage[] = [];
  for (const [key, raw] of Array.from(groups.entries())) {
    const [sessionId, questionId] = key.split("|") as [string, string];
    const docs = documents.filter((d) => d.sessionId === sessionId && d.questionId === questionId);
    const unit = resolveHumanDecisionUnit({ sessionId, questionId, raw, documents: docs });
    const resolution = resolveRevisionForUnit(docs);
    units.push(unit);
    lineages.push(
      observationLineageSchema.parse({
        unitId: unit.unitId,
        documentIds: docs.map((d) => d.observationId),
        rootAnswerId: resolution.originalAnswerId,
        revisionIds: docs.filter((d) => d.documentType === "REVISION").map((d) => d.observationId),
        addendumIds: resolution.activeAddendumIds,
        postRevealIds: resolution.postRevealMetaIds,
        resolution,
        mentorEligible: false,
      }),
    );
  }
  return {
    documents,
    units: units.sort((a, b) => a.unitId.localeCompare(b.unitId)),
    lineages,
  };
}

/** True iff superseded revisions do not contribute independent support. */
export function supersededDoNotVote(lineage: ObservationLineage, documents: DocumentObservation[]): boolean {
  for (const id of lineage.resolution.supersededObservationIds) {
    const d = documents.find((x) => x.observationId === id);
    if (d?.contributesIndependentSupport) return false;
  }
  return true;
}
