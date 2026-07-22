import { randomUUID } from "node:crypto";
import type {
  CalibrationObservation,
  CriticalReview,
  ImprovementProposal,
  ProposalPriority,
  SyntheticScenario,
} from "@shared/goodTradingAiCriticalCalibration";
import { improvementProposalSchema } from "@shared/goodTradingAiCriticalCalibration";

const KIND_MAP: Record<string, ImprovementProposal["kind"]> = {
  OVERWEIGHT_LENS: "PRIORITY_WEIGHT_CHANGE",
  UNDERWEIGHT_LENS: "PRIORITY_WEIGHT_CHANGE",
  INSUFFICIENT_CONFIRMATION: "NEW_CONFIRMATION",
  IGNORED_INVALIDATION: "NEW_INVALIDATION",
  UNRESOLVED_CONFLICT: "RULE_SPLIT",
  UNNECESSARY_PATH: "REMOVE_DEAD_RULE",
  POTENTIAL_BIAS: "RULE_REFINEMENT",
  POTENTIAL_EDGE: "TEMPLATE_IMPROVEMENT",
  STALE_DEFINITE: "RULE_REFINEMENT",
  MISSING_EVIDENCE: "NEW_CONFIRMATION",
  PARTIAL_EVIDENCE: "RULE_MERGE",
};

const HIGH_SUPPORT_KINDS = new Set<ImprovementProposal["kind"]>([
  "REMOVE_DEAD_RULE",
  "NEW_INVALIDATION",
  "RULE_MERGE",
  "PRIORITY_WEIGHT_CHANGE",
]);

function priorityFor(kind: ImprovementProposal["kind"], severity: "LOW" | "MEDIUM" | "HIGH"): ProposalPriority {
  if (kind === "REMOVE_DEAD_RULE" || kind === "NEW_INVALIDATION") return "CRITICAL";
  if (severity === "HIGH") return "HIGH";
  if (severity === "MEDIUM") return "MEDIUM";
  return "LOW";
}

function minSupportFor(kind: ImprovementProposal["kind"], priority: ProposalPriority): number {
  if (priority === "CRITICAL" || HIGH_SUPPORT_KINDS.has(kind)) return 3;
  if (priority === "HIGH") return 2;
  return 1;
}

function conditionsFor(kind: ImprovementProposal["kind"], lens?: string): string[] {
  const lensLabel = lens ?? "lente afectada";
  return [
    `Solo aplica cuando ${lensLabel} esta presente con fuerza al menos MODERATE`,
    `No generalizar fuera de escenarios sinteticos calibrados con la misma familia de conflicto`,
    kind === "REMOVE_DEAD_RULE"
      ? "Requiere minimo 3 observaciones humanas independientes antes de promover"
      : "Permitir respuesta 'depende' / condiciones parciales del revisor",
  ];
}

/**
 * Creates PENDING proposal *candidates* from a review.
 * High-impact kinds are still PENDING and require observation support before accept.
 * Never autoApply / brainMutate.
 */
export function createProposalsFromReview(review: CriticalReview, scenario: SyntheticScenario): ImprovementProposal[] {
  const nowMs = Date.now();
  return review.findings.map((f) => {
    const kind = KIND_MAP[f.kind] ?? "RULE_REFINEMENT";
    const priority = priorityFor(kind, f.severity);
    const proposal = {
      id: `prop_${randomUUID().slice(0, 8)}`,
      scenarioId: scenario.id,
      kind,
      status: "PENDING" as const,
      title: `Ajuste condicional por ${f.kind}`,
      reason: `${f.message} (taxonomia ${review.taxonomy}; clase ${f.findingClass})`,
      confidence: f.severity === "HIGH" ? ("HIGH" as const) : f.severity === "MEDIUM" ? ("MEDIUM" as const) : ("LOW" as const),
      impact: f.severity === "HIGH" ? ("HIGH" as const) : ("MEDIUM" as const),
      risk: f.kind.includes("BIAS") || kind === "REMOVE_DEAD_RULE" ? ("HIGH" as const) : ("MEDIUM" as const),
      priority,
      conditions: conditionsFor(kind, f.lens),
      relatedLenses: f.lens ? [f.lens] : scenario.lenses.slice(0, 2).map((l) => l.lens),
      relatedFindingIds: [f.id],
      supportObservationIds: [] as string[],
      minSupportRequired: minSupportFor(kind, priority),
      evidenceStatus: f.evidenceStatus === "HYPOTHETICAL" ? ("HYPOTHETICAL" as const) : ("METHODOLOGICAL" as const),
      autoApply: false as const,
      brainMutate: false as const,
      createdAtMs: nowMs,
      mentorEligible: false as const,
    };
    return improvementProposalSchema.parse(proposal);
  });
}

/**
 * Human answer → CalibrationObservation first.
 * ImprovementProposal promote/accept only when support threshold met.
 */
export function canAcceptProposal(
  proposal: ImprovementProposal,
  observations: CalibrationObservation[],
): { ok: boolean; reason: string } {
  const support = observations.filter((o) => proposal.supportObservationIds.includes(o.id));
  if (proposal.priority === "CRITICAL" && support.length < proposal.minSupportRequired) {
    return {
      ok: false,
      reason: `CRITICAL proposal needs >=${proposal.minSupportRequired} supporting observations (have ${support.length})`,
    };
  }
  if (HIGH_SUPPORT_KINDS.has(proposal.kind) && support.length < proposal.minSupportRequired) {
    return {
      ok: false,
      reason: `${proposal.kind} needs >=${proposal.minSupportRequired} supporting observations`,
    };
  }
  if (support.length < proposal.minSupportRequired) {
    return {
      ok: false,
      reason: `Insufficient support: need ${proposal.minSupportRequired}, have ${support.length}`,
    };
  }
  return { ok: true, reason: "Support threshold met; human may ACCEPT (still no Brain mutation)" };
}

export function attachObservationSupport(
  proposal: ImprovementProposal,
  observationId: string,
): ImprovementProposal {
  if (proposal.supportObservationIds.includes(observationId)) return proposal;
  return improvementProposalSchema.parse({
    ...proposal,
    supportObservationIds: [...proposal.supportObservationIds, observationId].slice(0, 32),
    autoApply: false,
    brainMutate: false,
    mentorEligible: false,
  });
}
