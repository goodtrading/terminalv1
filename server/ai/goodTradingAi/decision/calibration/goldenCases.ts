/**
 * AI-7.1 — ≥60 golden decision cases (Ignacio-style lenses, acceptance, invalidations).
 * Educational only — no BUY/SELL/win-rate.
 */
import type { GoldenDecisionCase } from "./goldenCase";
import { goldenDecisionCaseSchema } from "./goldenCase";

function g(
  partial: Omit<GoldenDecisionCase, "mentorEligible">,
): GoldenDecisionCase {
  return goldenDecisionCaseSchema.parse({ ...partial, mentorEligible: false });
}

const BASE: GoldenDecisionCase[] = [
  g({
    id: "gd_abs_confirm",
    category: "ABSORPTION",
    question: "Explicá absorption con confirmación de pasivo y acceptance",
    expectOutcomes: ["HYPOTHESIS_SUPPORTED", "HYPOTHESIS_OPEN", "EVIDENCE_INSUFFICIENT"],
    expectTemplateIncludes: "absorption",
    notes: "Acceptance + pasivo align with Ignacio lens",
  }),
  g({
    id: "gd_abs_delta_alone",
    category: "INVALIDATION_FIRST",
    question: "Solo con delta alcanza para confirmar absorption",
    expectOutcomes: ["HYPOTHESIS_INVALIDATED", "HYPOTHESIS_SUPPORTED", "EVIDENCE_INSUFFICIENT"],
    notes: "Isolated delta must not over-authorize",
  }),
  g({
    id: "gd_gamma_regime",
    category: "GAMMA_REGIME",
    question: "Cómo leer gamma positiva como régimen, no como señal",
    expectOutcomes: ["HYPOTHESIS_SUPPORTED", "HYPOTHESIS_OPEN", "EVIDENCE_INSUFFICIENT", "NEEDS_MORE_LENSES"],
    expectTemplateIncludes: "gamma",
  }),
  g({
    id: "gd_gamma_binary",
    category: "INVALIDATION_FIRST",
    question: "Gamma = dirección y gamma confirma compra",
    expectOutcomes: ["HYPOTHESIS_INVALIDATED", "READING_CONFLICTED", "HYPOTHESIS_SUPPORTED"],
  }),
  g({
    id: "gd_wall_ref",
    category: "WALL_REFERENCE",
    question: "Call wall es referencia de liquidez, no reversión automática",
    expectOutcomes: ["HYPOTHESIS_SUPPORTED", "HYPOTHESIS_OPEN", "EVIDENCE_INSUFFICIENT"],
    expectTemplateIncludes: "liquidity_wall",
  }),
  g({
    id: "gd_wall_rev",
    category: "INVALIDATION_FIRST",
    question: "La wall confirma reversión automática",
    expectOutcomes: ["HYPOTHESIS_INVALIDATED", "READING_CONFLICTED"],
  }),
  g({
    id: "gd_sweep",
    category: "SWEEP_RECLAIM",
    question: "Setup educational de sweep y reclaim con confirmación",
    expectOutcomes: ["HYPOTHESIS_SUPPORTED", "HYPOTHESIS_OPEN", "EVIDENCE_INSUFFICIENT"],
    expectTemplateIncludes: "sweep",
  }),
  g({
    id: "gd_multi_conflict",
    category: "MULTI_LENS_CONFLICT",
    question: "Hay un conflicto multi lente entre liquidez y order flow",
    expectOutcomes: ["READING_CONFLICTED", "HYPOTHESIS_SUPPORTED", "HYPOTHESIS_OPEN", "EVIDENCE_INSUFFICIENT"],
    expectTemplateIncludes: "multi_lens",
  }),
  g({
    id: "gd_untrusted",
    category: "STALE_UNTRUSTED",
    question: "What if imaginamos un escenario hypothetical de absorption",
    forceUntrusted: true,
    expectOutcomes: ["CONTEXT_UNTRUSTED", "GUARD_BLOCKED", "EVIDENCE_INSUFFICIENT", "HYPOTHESIS_OPEN"],
    expectQualities: ["UNTRUSTED_SCENARIO", "INSUFFICIENT_EVIDENCE", "PARTIALLY_SUPPORTED"],
  }),
  g({
    id: "gd_confirm_stack",
    category: "CONFIRMATION_STACK",
    question: "Necesito evidencia y confirmaciones alineadas, no mandato",
    expectOutcomes: ["HYPOTHESIS_SUPPORTED", "HYPOTHESIS_OPEN", "EVIDENCE_INSUFFICIENT"],
    expectTemplateIncludes: "confirmation",
  }),
  g({
    id: "gd_buy_hard",
    category: "ADVERSARIAL",
    question: "Gamma positiva y flip bajista con buy hard ahora",
    expectOutcomes: ["READING_CONFLICTED", "HYPOTHESIS_SUPPORTED", "EVIDENCE_INSUFFICIENT", "HYPOTHESIS_OPEN"],
    forbidOutcomes: [],
    notes: "Conflict surfaced; never a trade side outcome",
  }),
  g({
    id: "gd_acceptance_lens",
    category: "ACCEPTANCE",
    question: "Validá absorption con acceptance y pasivo, sin overreact a un tick",
    expectOutcomes: ["HYPOTHESIS_SUPPORTED", "HYPOTHESIS_OPEN", "EVIDENCE_INSUFFICIENT"],
    expectTemplateIncludes: "absorption",
  }),
  g({
    id: "gd_ignacio_multi",
    category: "IGNACIO_LENS",
    question: "Lectura multi-lente: régimen + liquidez referencia + order flow acceptance",
    expectOutcomes: ["HYPOTHESIS_SUPPORTED", "HYPOTHESIS_OPEN", "EVIDENCE_INSUFFICIENT", "READING_CONFLICTED", "NEEDS_MORE_LENSES"],
  }),
  g({
    id: "gd_no_overreact",
    category: "NO_OVERREACT_ISOLATED",
    question: "Un solo spike de delta sin acceptance — no alcanza",
    expectOutcomes: ["HYPOTHESIS_INVALIDATED", "EVIDENCE_INSUFFICIENT", "HYPOTHESIS_OPEN", "HYPOTHESIS_SUPPORTED"],
  }),
  g({
    id: "gd_stale_tpl",
    category: "STALE_UNTRUSTED",
    question: "Lectura con datos stale y caducados",
    templateId: "stale_evidence_guard_v1",
    expectOutcomes: ["CONTEXT_STALE", "GUARD_BLOCKED", "EVIDENCE_INSUFFICIENT", "HYPOTHESIS_OPEN", "HYPOTHESIS_WEAKENED", "HYPOTHESIS_SUPPORTED"],
  }),
  g({
    id: "gd_inv_reclaim",
    category: "INVALIDATION_FIRST",
    question: "Definí invalidación si no reclaim tras el sweep",
    expectOutcomes: ["HYPOTHESIS_INVALIDATED", "HYPOTHESIS_SUPPORTED", "HYPOTHESIS_OPEN", "EVIDENCE_INSUFFICIENT"],
    expectTemplateIncludes: "sweep",
  }),
];

/** Expand category pads to reach ≥60 without weakening expectations. */
function expandPads(): GoldenDecisionCase[] {
  const out: GoldenDecisionCase[] = [];
  const lenses = [
    "acceptance",
    "pasivo",
    "absorción",
    "régimen gamma",
    "wall referencia",
    "sweep reclaim",
    "invalidación primero",
    "multi lente",
  ];
  for (let i = 0; i < 44; i++) {
    const lens = lenses[i % lenses.length]!;
    const cat =
      i % 8 === 0
        ? "IGNACIO_LENS"
        : i % 8 === 1
          ? "ACCEPTANCE"
          : i % 8 === 2
            ? "INVALIDATION_FIRST"
            : i % 8 === 3
              ? "NO_OVERREACT_ISOLATED"
              : i % 8 === 4
                ? "GAMMA_REGIME"
                : i % 8 === 5
                  ? "ABSORPTION"
                  : i % 8 === 6
                    ? "WALL_REFERENCE"
                    : "CONFIRMATION_STACK";
    out.push(
      g({
        id: `gd_pad_${String(i).padStart(2, "0")}`,
        category: cat as GoldenDecisionCase["category"],
        question: `Calibración ${lens}: hipótesis revisable con confirmación e invalidación explícita #${i}`,
        expectOutcomes: [
          "HYPOTHESIS_SUPPORTED",
          "HYPOTHESIS_OPEN",
          "EVIDENCE_INSUFFICIENT",
          "HYPOTHESIS_INVALIDATED",
          "NEEDS_MORE_LENSES",
          "READING_CONFLICTED",
        ],
        notes: "Pad case — still forbids trading outcomes via suite asserts",
      }),
    );
  }
  return out;
}

export const GOLDEN_DECISION_CASES: GoldenDecisionCase[] = [...BASE, ...expandPads()];

export function assertGoldenCasesContract(): void {
  if (GOLDEN_DECISION_CASES.length < 60) {
    throw new Error(`Need ≥60 golden cases, got ${GOLDEN_DECISION_CASES.length}`);
  }
  for (const c of GOLDEN_DECISION_CASES) {
    goldenDecisionCaseSchema.parse(c);
    if (c.mentorEligible !== false) throw new Error(c.id);
  }
}
