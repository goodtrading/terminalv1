import type { DecisionPathOutcome } from "@shared/goodTradingAiDecisionGraph";
import {
  criticalReviewSchema,
  type CriticalFinding,
  type CriticalReview,
  type EvidenceStatus,
  type FindingClass,
  type SyntheticScenario,
} from "@shared/goodTradingAiCriticalCalibration";
import { classifyDisagreement } from "./taxonomy";

export type ReviewScenarioInput = {
  scenario: SyntheticScenario;
  engineOutcome: DecisionPathOutcome | null;
  humanOutcome?: DecisionPathOutcome | null;
  confirmationLabels?: string[];
  invalidationLabels?: string[];
  nowMs?: number;
};

function classForKind(kind: CriticalFinding["kind"]): FindingClass {
  if (kind === "POTENTIAL_EDGE") return "RESEARCH_HYPOTHESIS";
  if (kind === "POTENTIAL_BIAS" || kind === "UNRESOLVED_CONFLICT" || kind === "UNNECESSARY_PATH") {
    return "INTERPRETIVE_DISAGREEMENT";
  }
  return "METHODOLOGY_CONSISTENCY";
}

function statusForKind(kind: CriticalFinding["kind"]): EvidenceStatus {
  if (kind === "POTENTIAL_EDGE") return "HYPOTHETICAL";
  return "METHODOLOGICAL";
}

function finding(
  id: string,
  kind: CriticalFinding["kind"],
  message: string,
  lens?: CriticalFinding["lens"],
  severity: CriticalFinding["severity"] = "MEDIUM",
): CriticalFinding {
  const warnings = kind === "POTENTIAL_EDGE" ? (["EDGE_NOT_EMPIRICALLY_VALIDATED"] as const) : [];
  const safeMessage =
    kind === "POTENTIAL_EDGE"
      ? `${message} [HYPOTHESIS_ONLY; EDGE_NOT_EMPIRICALLY_VALIDATED; never treat as empirically validated]`
      : message;
  return {
    id,
    kind,
    findingClass: classForKind(kind),
    evidenceStatus: statusForKind(kind),
    message: safeMessage,
    lens,
    severity,
    warnings: [...warnings],
  };
}

export function reviewScenario(input: ReviewScenarioInput): CriticalReview {
  const { scenario, engineOutcome, humanOutcome = null } = input;
  const findings: CriticalFinding[] = [];
  const deltaStrong = scenario.lenses.find((l) => l.lens === "DELTA" && l.strength === "STRONG");
  const stale = scenario.lenses.find((l) => l.lens === "STALENESS" && l.strength !== "ABSENT");
  const conflict = scenario.lenses.find((l) => l.lens === "CONFLICTS" || l.polarity === "CONFLICTING");
  const invalidation = scenario.lenses.find((l) => l.lens === "INVALIDATION" && l.polarity === "INVALIDATING");
  const absorption = scenario.lenses.find((l) => l.lens === "ABSORPTION");

  if (deltaStrong && engineOutcome === "HYPOTHESIS_SUPPORTED") {
    findings.push(finding("f_delta_aggr", "OVERWEIGHT_LENS", "Delta aislado con lectura demasiado definitiva", "DELTA", "HIGH"));
  }
  if (absorption && absorption.strength === "WEAK" && engineOutcome === "HYPOTHESIS_SUPPORTED") {
    findings.push(finding("f_abs_under", "UNDERWEIGHT_LENS", "Absorcion debil no ponderada", "ABSORPTION", "MEDIUM"));
  }
  if (stale && engineOutcome === "HYPOTHESIS_SUPPORTED") {
    findings.push(finding("f_stale_def", "STALE_DEFINITE", "Contexto stale con conclusion definitiva", "STALENESS", "HIGH"));
  }
  if (invalidation && engineOutcome === "HYPOTHESIS_SUPPORTED") {
    findings.push(finding("f_inv_ignored", "IGNORED_INVALIDATION", "Invalidacion presente pero outcome soportado", "INVALIDATION", "HIGH"));
  }
  if (conflict && engineOutcome !== "READING_CONFLICTED" && engineOutcome !== "NEEDS_MORE_LENSES") {
    findings.push(finding("f_conflict", "UNRESOLVED_CONFLICT", "Conflicto multi-lente no reflejado", "CONFLICTS", "HIGH"));
  }
  if (engineOutcome === "NEEDS_MORE_LENSES" && scenario.lenses.length <= 3) {
    findings.push(finding("f_unnec", "UNNECESSARY_PATH", "Pide mas lentes con pocas ya activas", undefined, "LOW"));
  }
  if (scenario.lenses.some((l) => l.lens === "SPOOFING" && l.strength === "STRONG") && engineOutcome === "HYPOTHESIS_SUPPORTED") {
    findings.push(finding("f_bias", "POTENTIAL_BIAS", "Spoofing fuerte tratado como confirmacion", "SPOOFING", "MEDIUM"));
  }
  if (absorption?.strength === "STRONG" && engineOutcome === "EVIDENCE_INSUFFICIENT") {
    findings.push(
      finding(
        "f_edge",
        "POTENTIAL_EDGE",
        "Absorcion fuerte sub-leida por el motor — hipotesis de investigacion, no edge empirico",
        "ABSORPTION",
        "MEDIUM",
      ),
    );
  }
  const weakCount = scenario.lenses.filter((l) => l.strength === "WEAK" || l.strength === "ABSENT").length;
  if (weakCount > scenario.lenses.length / 2 && engineOutcome === "HYPOTHESIS_SUPPORTED") {
    findings.push(finding("f_insuf", "INSUFFICIENT_CONFIRMATION", "Confirmacion insuficiente para outcome soportado", undefined, "HIGH"));
  }
  if (scenario.mutationApplied === "MISSING_EVIDENCE" || scenario.mutationApplied === "PARTIAL_EVIDENCE") {
    findings.push(finding("f_miss", "MISSING_EVIDENCE", "Escenario mutado con evidencia parcial/faltante", "DATA_QUALITY", "MEDIUM"));
  }
  if (input.confirmationLabels?.length === 0 && engineOutcome === "HYPOTHESIS_SUPPORTED") {
    findings.push(finding("f_conf", "INSUFFICIENT_CONFIRMATION", "Sin confirmaciones etiquetadas", undefined, "MEDIUM"));
  }
  if (input.invalidationLabels?.length && engineOutcome === "HYPOTHESIS_SUPPORTED") {
    findings.push(finding("f_invlab", "IGNORED_INVALIDATION", "Invalidaciones etiquetadas ignoradas", "INVALIDATION", "HIGH"));
  }

  const taxonomy = classifyDisagreement(engineOutcome, humanOutcome, scenario);
  const summary = findings.length
    ? `Revision critica: ${findings.length} hallazgos; taxonomia ${taxonomy}. POTENTIAL_EDGE nunca implica edge probado.`
    : `Revision critica: alineacion razonable; taxonomia ${taxonomy}.`;

  return criticalReviewSchema.parse({
    scenarioId: scenario.id,
    engineOutcome,
    humanOutcome,
    findings,
    taxonomy,
    summary,
    reviewedAtMs: input.nowMs ?? Date.now(),
    mentorEligible: false,
  });
}
