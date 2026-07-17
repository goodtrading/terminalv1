import { randomUUID } from "node:crypto";
import type {
  CalibrationCase,
  CalibrationReview,
  KnowledgeChangeProposal,
} from "@shared/goodTradingAiCalibration";
import { knowledgeRegistry } from "../knowledge/registry";
import { upsertProposal } from "./store";

/**
 * Deterministic editorial proposal generator — NO external AI.
 * Conservative: prefers MANUAL_EDITORIAL_REVIEW_REQUIRED or CREATE_EVAL.
 * Never silently applies. Never invents Ignacio approvals.
 */
export function generateProposalsForReview(
  review: CalibrationReview,
  caseItem: CalibrationCase,
): KnowledgeChangeProposal[] {
  const now = new Date().toISOString();
  const out: KnowledgeChangeProposal[] = [];
  const evalId = `eval_from_${review.id}`;

  const topRef = review.aiSnapshot.knowledgeReferences[0];
  const related =
    topRef && knowledgeRegistry.getById(topRef.id)
      ? knowledgeRegistry.getById(topRef.id)!
      : undefined;

  const isConstitution = related?.category === "constitution";
  const corrections = review.corrections.trim();
  const answer = review.ignacioAnswer.trim();

  if (review.decision === "REJECTED") {
    const p: KnowledgeChangeProposal = {
      id: `prop_${randomUUID().slice(0, 10)}`,
      caseId: caseItem.id,
      reviewId: review.id,
      changeType: "CREATE_EVAL",
      targetEntryId: related?.id,
      risk: "LOW",
      status: "PENDING",
      reason:
        "Caso rechazado: crear eval de regresión para evitar la afirmación problemática del Mentor.",
      fieldChanges: [
        {
          field: "eval.message",
          before: null,
          after: caseItem.question.slice(0, 500),
        },
        {
          field: "eval.forbiddenSnippet",
          before: null,
          after: (corrections || review.aiSnapshot.summary).slice(0, 400),
        },
      ],
      associatedEvalIds: [evalId],
      createdAt: now,
      reviewed: false,
    };
    upsertProposal(p);
    out.push(p);
    return out;
  }

  // APPROVED_WITH_CHANGES
  if (!corrections && !answer) {
    const p: KnowledgeChangeProposal = {
      id: `prop_${randomUUID().slice(0, 10)}`,
      caseId: caseItem.id,
      reviewId: review.id,
      changeType: "MANUAL_EDITORIAL_REVIEW_REQUIRED",
      targetEntryId: related?.id,
      risk: isConstitution ? "HIGH_RISK" : "MEDIUM",
      status: "PENDING",
      reason:
        "Se solicitaron cambios pero no hay correcciones textuales suficientes; requiere revisión editorial manual.",
      fieldChanges: [],
      associatedEvalIds: [evalId],
      createdAt: now,
      reviewed: false,
    };
    upsertProposal(p);
    out.push(p);
    return out;
  }

  if (related) {
    const p: KnowledgeChangeProposal = {
      id: `prop_${randomUUID().slice(0, 10)}`,
      caseId: caseItem.id,
      reviewId: review.id,
      changeType: related.kind === "SETUP" ? "UPDATE_SETUP" : "UPDATE_ENTRY",
      targetEntryId: related.id,
      risk: isConstitution ? "HIGH_RISK" : "MEDIUM",
      status: "PENDING",
      reason: `Ajuste propuesto a partir de revisión ${review.id} (dominio ${caseItem.domain}).`,
      fieldChanges: [
        {
          field: "explanation",
          before: related.explanation.slice(0, 500),
          after: `${related.explanation}\n\n[Propuesta editorial — NO aplicada]\n${(corrections || answer).slice(0, 1500)}`,
        },
        ...(corrections
          ? [
              {
                field: "prohibitedInterpretations[+]",
                before: null as string | null,
                after: corrections.slice(0, 400),
              },
            ]
          : []),
      ],
      associatedEvalIds: [evalId],
      createdAt: now,
      reviewed: false,
    };
    upsertProposal(p);
    out.push(p);
  }

  const evalProp: KnowledgeChangeProposal = {
    id: `prop_${randomUUID().slice(0, 10)}`,
    caseId: caseItem.id,
    reviewId: review.id,
    changeType: "CREATE_EVAL",
    risk: "LOW",
    status: "PENDING",
    reason: "Toda propuesta debe asociar al menos un eval de regresión.",
    fieldChanges: [
      {
        field: "eval.message",
        before: null,
        after: caseItem.question.slice(0, 500),
      },
      {
        field: "eval.expect.summaryIncludesHint",
        before: null,
        after: (answer || corrections).slice(0, 300),
      },
    ],
    associatedEvalIds: [evalId],
    createdAt: now,
    reviewed: false,
  };
  upsertProposal(evalProp);
  out.push(evalProp);

  return out;
}
