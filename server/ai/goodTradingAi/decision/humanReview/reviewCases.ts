/**
 * AI-7.2 — ≥80 blind methodology review cases + 20 holdout.
 * Scenario wording must NOT leak expected/engine/golden answers.
 */
import { humanReviewCaseSchema, type HumanReviewCase } from "@shared/goodTradingAiHumanReview";
import type { DecisionPathOutcome } from "@shared/goodTradingAiDecisionGraph";
import { scenarioLeaksAnswer } from "./biasControls";

function c(partial: HumanReviewCase): HumanReviewCase {
  const parsed = humanReviewCaseSchema.parse(partial);
  if (scenarioLeaksAnswer(parsed.scenarioText)) {
    throw new Error(`Scenario leaks answer: ${parsed.id}`);
  }
  return parsed;
}

const OPEN_OK: DecisionPathOutcome[] = [
  "HYPOTHESIS_SUPPORTED",
  "HYPOTHESIS_OPEN",
  "EVIDENCE_INSUFFICIENT",
];
const INV_OK: DecisionPathOutcome[] = [
  "HYPOTHESIS_INVALIDATED",
  "READING_CONFLICTED",
  "EVIDENCE_INSUFFICIENT",
];
const UNTRUST: DecisionPathOutcome[] = [
  "CONTEXT_UNTRUSTED",
  "GUARD_BLOCKED",
  "EVIDENCE_INSUFFICIENT",
  "HYPOTHESIS_OPEN",
];
const CONFLICT: DecisionPathOutcome[] = [
  "READING_CONFLICTED",
  "HYPOTHESIS_OPEN",
  "EVIDENCE_INSUFFICIENT",
  "NEEDS_MORE_LENSES",
];
const INSUFF: DecisionPathOutcome[] = [
  "EVIDENCE_INSUFFICIENT",
  "HYPOTHESIS_OPEN",
  "NEEDS_MORE_LENSES",
];

/** 40 reworded golden — different wording, sealed golden ids. */
const REWORDED: HumanReviewCase[] = [
  c({
    id: "hr_rw_01",
    cohort: "REWORDED_GOLDEN",
    holdout: false,
    goldenCaseId: "gd_abs_confirm",
    goldenExpectOutcomes: OPEN_OK,
    scenarioText:
      "Un trader describe agresivo absorbido y pregunta qué confirmaciones metodológicas pedirías antes de tratar la lectura como sólida.",
    lensesHint: ["order_flow"],
  }),
  c({
    id: "hr_rw_02",
    cohort: "REWORDED_GOLDEN",
    holdout: false,
    goldenCaseId: "gd_abs_delta_alone",
    goldenExpectOutcomes: INV_OK,
    scenarioText:
      "Solo se menciona un cambio de delta positivo. ¿Cómo calificarías la solidez de una lectura de absorption basada únicamente en eso?",
  }),
  c({
    id: "hr_rw_03",
    cohort: "REWORDED_GOLDEN",
    holdout: false,
    goldenCaseId: "gd_gamma_regime",
    goldenExpectOutcomes: [...OPEN_OK, "NEEDS_MORE_LENSES"],
    scenarioText:
      "Alguien interpreta gamma positiva como régimen de mercado. ¿Qué rol metodológico le das a esa lectura?",
    lensesHint: ["gamma"],
  }),
  c({
    id: "hr_rw_04",
    cohort: "REWORDED_GOLDEN",
    holdout: false,
    goldenCaseId: "gd_gamma_binary",
    goldenExpectOutcomes: INV_OK,
    scenarioText:
      "Se afirma que gamma por sí sola indica dirección y confirma una tesis de compra. ¿Cómo la tratarías metodológicamente?",
  }),
  c({
    id: "hr_rw_05",
    cohort: "REWORDED_GOLDEN",
    holdout: false,
    goldenCaseId: "gd_wall_ref",
    goldenExpectOutcomes: OPEN_OK,
    scenarioText:
      "Hay una call wall visible. ¿La usás como referencia de liquidez o como señal automática de giro?",
    lensesHint: ["liquidity"],
  }),
  c({
    id: "hr_rw_06",
    cohort: "REWORDED_GOLDEN",
    holdout: false,
    goldenCaseId: "gd_wall_rev",
    goldenExpectOutcomes: ["HYPOTHESIS_INVALIDATED", "READING_CONFLICTED"],
    scenarioText:
      "Se dice que una wall confirma reversión automática sin más contexto. ¿Qué calidad de decisión asignarías?",
  }),
  c({
    id: "hr_rw_07",
    cohort: "REWORDED_GOLDEN",
    holdout: false,
    goldenCaseId: "gd_sweep",
    goldenExpectOutcomes: OPEN_OK,
    scenarioText:
      "Se describe un barrido de liquidez seguido de un reclaim. ¿Qué confirmaciones pedirías para sostener la lectura educativa?",
    lensesHint: ["liquidity", "order_flow"],
  }),
  c({
    id: "hr_rw_08",
    cohort: "REWORDED_GOLDEN",
    holdout: false,
    goldenCaseId: "gd_multi_conflict",
    goldenExpectOutcomes: CONFLICT,
    scenarioText:
      "Liquidez y order flow apuntan en sentidos distintos. ¿Cómo clasificás el estado de la lectura?",
  }),
  c({
    id: "hr_rw_09",
    cohort: "REWORDED_GOLDEN",
    holdout: false,
    goldenCaseId: "gd_untrusted",
    goldenExpectOutcomes: UNTRUST,
    forceUntrusted: true,
    scenarioText:
      "Escenario hipotético imaginado sin datos validados: ¿qué nivel de confianza metodológica corresponde?",
  }),
  c({
    id: "hr_rw_10",
    cohort: "REWORDED_GOLDEN",
    holdout: false,
    goldenCaseId: "gd_confirm_stack",
    goldenExpectOutcomes: OPEN_OK,
    scenarioText:
      "Se pide una lectura con varias confirmaciones alineadas, sin mandato operativo. ¿Qué outcome metodológico preferís?",
  }),
];

// Expand reworded to 40 with thematic variants (no answer leak)
const REWORDED_EXTRA_STEMS: Array<{
  id: string;
  goldenCaseId: string;
  outcomes: DecisionPathOutcome[];
  text: string;
  forceUntrusted?: boolean;
  lensesHint?: string[];
}> = [
  { id: "hr_rw_11", goldenCaseId: "gd_abs_confirm", outcomes: OPEN_OK, text: "Pasivo sostenido tras agresivo: ¿qué invalidaciones vigilarías antes de cerrar la hipótesis?" },
  { id: "hr_rw_12", goldenCaseId: "gd_abs_delta_alone", outcomes: INV_OK, text: "Un tick de delta aislado se usa como prueba completa. ¿Es aceptable metodológicamente?" },
  { id: "hr_rw_13", goldenCaseId: "gd_acceptance_lens", outcomes: OPEN_OK, text: "Sin acceptance en precio, ¿puede sostenerse una tesis de absorption solo con footprint?" },
  { id: "hr_rw_14", goldenCaseId: "gd_wall_ref", outcomes: OPEN_OK, text: "Put wall lejana: ¿referencia de liquidez o tesis de destino automático?" },
  { id: "hr_rw_15", goldenCaseId: "gd_sweep", outcomes: OPEN_OK, text: "Sweep sin reclaim: ¿qué estado de hipótesis corresponde?" },
  { id: "hr_rw_16", goldenCaseId: "gd_gamma_regime", outcomes: [...OPEN_OK, "NEEDS_MORE_LENSES"], text: "Régimen de gamma vs señal táctica: ¿cómo separás ambos roles?" },
  { id: "hr_rw_17", goldenCaseId: "gd_multi_conflict", outcomes: CONFLICT, text: "Dos lentes válidas pero incompatibles en el mismo momento. ¿Qué hacés con la lectura?" },
  { id: "hr_rw_18", goldenCaseId: "gd_untrusted", outcomes: UNTRUST, forceUntrusted: true, text: "What-if de mesa sin snapshot: ¿puede elevarse a lectura operativa educativa?" },
  { id: "hr_rw_19", goldenCaseId: "gd_confirm_stack", outcomes: OPEN_OK, text: "Confirmaciones parciales sin stack completo: ¿cómo calificás la solidez?" },
  { id: "hr_rw_20", goldenCaseId: "gd_wall_rev", outcomes: INV_OK, text: "Wall que desaparece se interpreta como confirmación de giro. ¿Lo validás?" },
  { id: "hr_rw_21", goldenCaseId: "gd_abs_confirm", outcomes: OPEN_OK, text: "Absorption con absorption label pero sin pasivo: ¿qué falta?" },
  { id: "hr_rw_22", goldenCaseId: "gd_gamma_binary", outcomes: INV_OK, text: "Gamma flip se traduce literalmente a lado de mercado. ¿Es metodología correcta?" },
  { id: "hr_rw_23", goldenCaseId: "gd_sweep", outcomes: OPEN_OK, text: "Reclaim educativo: ¿qué evidencia mínima pedirías además del barrido?" },
  { id: "hr_rw_24", goldenCaseId: "gd_abs_delta_alone", outcomes: INV_OK, text: "Se prioriza un print aislado sobre acceptance. ¿Hay overreaction?" },
  { id: "hr_rw_25", goldenCaseId: "gd_multi_conflict", outcomes: CONFLICT, text: "Order flow limpio pero wall contradictoria: estado de la hipótesis." },
  { id: "hr_rw_26", goldenCaseId: "gd_wall_ref", outcomes: OPEN_OK, text: "Wall como ancla de narrativa vs ancla de liquidez: diferencia metodológica." },
  { id: "hr_rw_27", goldenCaseId: "gd_acceptance_lens", outcomes: OPEN_OK, text: "Acceptance lenta tras absorción: ¿refuerza o aún es insuficiente?" },
  { id: "hr_rw_28", goldenCaseId: "gd_confirm_stack", outcomes: OPEN_OK, text: "Stack de confirmaciones incompleto con una sola lente fuerte." },
  { id: "hr_rw_29", goldenCaseId: "gd_untrusted", outcomes: UNTRUST, forceUntrusted: true, text: "Escenario sintético de debug presentado como lectura de sesión." },
  { id: "hr_rw_30", goldenCaseId: "gd_gamma_regime", outcomes: [...OPEN_OK, "NEEDS_MORE_LENSES"], text: "Gamma como clima, no como click: ¿cómo lo formularías al alumno?" },
  { id: "hr_rw_31", goldenCaseId: "gd_abs_confirm", outcomes: OPEN_OK, text: "Agresivo absorbido + pasivo + acceptance: jerarquía de evidencia." },
  { id: "hr_rw_32", goldenCaseId: "gd_wall_rev", outcomes: INV_OK, text: "Afirmación: 'si hay wall, hay giro'. Evaluación metodológica." },
  { id: "hr_rw_33", goldenCaseId: "gd_sweep", outcomes: OPEN_OK, text: "Barrido en stop run educativo: qué invalidaría la lectura." },
  { id: "hr_rw_34", goldenCaseId: "gd_multi_conflict", outcomes: CONFLICT, text: "Conflicto temporal entre lentes: ¿forzar síntesis o marcar conflicto?" },
  { id: "hr_rw_35", goldenCaseId: "gd_abs_delta_alone", outcomes: INV_OK, text: "Delta como única métrica de absorption: riesgo metodológico." },
  { id: "hr_rw_36", goldenCaseId: "gd_confirm_stack", outcomes: OPEN_OK, text: "Lista de confirmaciones requeridas vs opcionales en una lectura." },
  { id: "hr_rw_37", goldenCaseId: "gd_acceptance_lens", outcomes: OPEN_OK, text: "Sin acceptance, ¿abrís hipótesis o la dejás insuficiente?" },
  { id: "hr_rw_38", goldenCaseId: "gd_gamma_binary", outcomes: INV_OK, text: "Mapear gamma a mandato direccional: ¿dónde falla la metodología?" },
  { id: "hr_rw_39", goldenCaseId: "gd_wall_ref", outcomes: OPEN_OK, text: "Wall cercana con poco volumen: ¿referencia útil o ruido?" },
  { id: "hr_rw_40", goldenCaseId: "gd_untrusted", outcomes: UNTRUST, forceUntrusted: true, text: "Pregunta counterfactual sin datos: confianza del contexto." },
];

for (const s of REWORDED_EXTRA_STEMS) {
  REWORDED.push(
    c({
      id: s.id,
      cohort: "REWORDED_GOLDEN",
      holdout: false,
      goldenCaseId: s.goldenCaseId,
      goldenExpectOutcomes: s.outcomes,
      forceUntrusted: s.forceUntrusted,
      scenarioText: s.text,
      lensesHint: s.lensesHint,
    }),
  );
}

const NEW_CASES: HumanReviewCase[] = Array.from({ length: 20 }, (_, i) => {
  const n = i + 1;
  const themes: Array<{
    text: string;
    outcomes: DecisionPathOutcome[];
    lensesHint?: string[];
  }> = [
    { text: "Iceberg aparente en bid sin reacción de precio. ¿Cómo lo leés metodológicamente?", outcomes: OPEN_OK, lensesHint: ["order_flow"] },
    { text: "Spoof sospechado que desaparece: ¿confirmación, invalidación o insuficiente?", outcomes: INV_OK },
    { text: "Imbalance de libro sin tape: ¿alcanza para hipótesis fuerte?", outcomes: INSUFF },
    { text: "Session open con gap y poca estructura: calidad de lectura inicial.", outcomes: INSUFF },
    { text: "Trader mezcla GEX y footprint en una sola frase conclusiva. ¿Cómo separás roles?", outcomes: CONFLICT, lensesHint: ["gamma", "order_flow"] },
    { text: "Pasivo que se retira justo en el touch: ¿qué invalida?", outcomes: INV_OK },
    { text: "Lectura de continuum vs evento único: riesgo de overfit narrativo.", outcomes: OPEN_OK },
    { text: "Dos sesiones distintas usadas como si fueran el mismo régimen.", outcomes: CONFLICT },
    { text: "Se pide una sola métrica 'mágica' para validar absorption.", outcomes: INV_OK },
    { text: "Alumno quiere cerrar hipótesis con un heatmap freeze frame.", outcomes: INSUFF },
    { text: "Liquidity void narrado como destino inevitable.", outcomes: INV_OK },
    { text: "Confirmación de pasivo aparece tarde: ¿soporta o debilita?", outcomes: OPEN_OK },
    { text: "Conflicto entre narrativa previa y evidencia nueva.", outcomes: CONFLICT },
    { text: "Solo labels de UI sin evidencia de mercado real.", outcomes: INSUFF },
    { text: "Sweep en timeframe menor vs estructura mayor: ¿cómo priorizás?", outcomes: CONFLICT },
    { text: "Gamma positiva + absorption label sin acceptance.", outcomes: INSUFF, lensesHint: ["gamma"] },
    { text: "Wall thin que se rellena: ¿cambia la lectura de referencia?", outcomes: OPEN_OK },
    { text: "Pregunta metodológica sobre qué NO contar como confirmación.", outcomes: OPEN_OK },
    { text: "Se fuerza una conclusión porque 'hay que decir algo'.", outcomes: INSUFF },
    { text: "Lectura educativa cuando faltan dos lentes clave.", outcomes: [...INSUFF, "NEEDS_MORE_LENSES"] },
  ];
  const t = themes[i]!;
  return c({
    id: `hr_new_${String(n).padStart(2, "0")}`,
    cohort: "NEW",
    holdout: false,
    goldenExpectOutcomes: t.outcomes,
    scenarioText: t.text,
    lensesHint: t.lensesHint,
  });
});

const AMBIGUOUS: HumanReviewCase[] = Array.from({ length: 10 }, (_, i) =>
  c({
    id: `hr_amb_${String(i + 1).padStart(2, "0")}`,
    cohort: "AMBIGUOUS",
    holdout: false,
    goldenExpectOutcomes: CONFLICT,
    scenarioText: `Señales mixtas #${i + 1}: footprint sugiere absorción leve, wall sugiere pin, gamma neutra. Sin más datos, ¿cómo clasificás la lectura?`,
    lensesHint: ["order_flow", "liquidity", "gamma"],
  }),
);

const INSUFFICIENT: HumanReviewCase[] = Array.from({ length: 10 }, (_, i) =>
  c({
    id: `hr_ins_${String(i + 1).padStart(2, "0")}`,
    cohort: "INSUFFICIENT",
    holdout: false,
    goldenExpectOutcomes: INSUFF,
    scenarioText: `Información incompleta #${i + 1}: solo un comentario verbal sin estructura, sin tape y sin contexto de sesión. ¿Qué outcome metodológico corresponde?`,
  }),
);

/** 20 holdout — isolated from calibration adjustments. */
const HOLDOUT: HumanReviewCase[] = Array.from({ length: 20 }, (_, i) => {
  const stems = [
    { text: "Holdout A: absorption narrada sin acceptance ni pasivo claro.", outcomes: INSUFF },
    { text: "Holdout B: wall usada como destino de precio sin más lentes.", outcomes: INV_OK },
    { text: "Holdout C: gamma como clima vs click — pregunta abierta.", outcomes: [...OPEN_OK, "NEEDS_MORE_LENSES"] },
    { text: "Holdout D: sweep sin reclaim en contexto educativo.", outcomes: INSUFF },
    { text: "Holdout E: conflicto liquidez vs tape en el mismo instante.", outcomes: CONFLICT },
    { text: "Holdout F: escenario what-if sin datos validados.", outcomes: UNTRUST, forceUntrusted: true },
    { text: "Holdout G: un solo print de delta como prueba total.", outcomes: INV_OK },
    { text: "Holdout H: stack de confirmaciones a medias.", outcomes: OPEN_OK },
    { text: "Holdout I: spoof vs iceberg — ambigüedad de intención.", outcomes: CONFLICT },
    { text: "Holdout J: sesión stale presentada como live.", outcomes: ["CONTEXT_STALE", "EVIDENCE_INSUFFICIENT", "GUARD_BLOCKED"] as DecisionPathOutcome[] },
    { text: "Holdout K: alumno pide lado de mercado; responder metodológicamente.", outcomes: INSUFF },
    { text: "Holdout L: reclaim limpio con pasivo — solidez relativa.", outcomes: OPEN_OK },
    { text: "Holdout M: dos lentes alineadas pero sin acceptance.", outcomes: INSUFF },
    { text: "Holdout N: narrativa previa contradice evidencia nueva.", outcomes: CONFLICT },
    { text: "Holdout O: heatmap freeze como única fuente.", outcomes: INSUFF },
    { text: "Holdout P: wall thin rellenándose — referencia vs señal.", outcomes: OPEN_OK },
    { text: "Holdout Q: gamma flip mapeado a mandato.", outcomes: INV_OK },
    { text: "Holdout R: falta de lentes clave admitida por el trader.", outcomes: [...INSUFF, "NEEDS_MORE_LENSES"] },
    { text: "Holdout S: overreaction a un evento aislado de book.", outcomes: INV_OK },
    { text: "Holdout T: lectura educativa con evidencia parcial coherente.", outcomes: OPEN_OK },
  ];
  const s = stems[i]!;
  return c({
    id: `hr_hold_${String(i + 1).padStart(2, "0")}`,
    cohort: "HOLDOUT",
    holdout: true,
    goldenExpectOutcomes: s.outcomes,
    forceUntrusted: (s as { forceUntrusted?: boolean }).forceUntrusted,
    scenarioText: s.text,
  });
});

export const HUMAN_REVIEW_CASES: HumanReviewCase[] = [
  ...REWORDED,
  ...NEW_CASES,
  ...AMBIGUOUS,
  ...INSUFFICIENT,
  ...HOLDOUT,
];

export function assertHumanReviewCasesContract(): void {
  if (HUMAN_REVIEW_CASES.length < 80) {
    throw new Error(`Need ≥80 review cases, got ${HUMAN_REVIEW_CASES.length}`);
  }
  const holdout = HUMAN_REVIEW_CASES.filter((x) => x.holdout);
  if (holdout.length < 20) {
    throw new Error(`Need ≥20 holdout, got ${holdout.length}`);
  }
  const ids = new Set(HUMAN_REVIEW_CASES.map((x) => x.id));
  if (ids.size !== HUMAN_REVIEW_CASES.length) {
    throw new Error("Duplicate human review case ids");
  }
  const reworded = HUMAN_REVIEW_CASES.filter((x) => x.cohort === "REWORDED_GOLDEN").length;
  const neu = HUMAN_REVIEW_CASES.filter((x) => x.cohort === "NEW").length;
  const amb = HUMAN_REVIEW_CASES.filter((x) => x.cohort === "AMBIGUOUS").length;
  const ins = HUMAN_REVIEW_CASES.filter((x) => x.cohort === "INSUFFICIENT").length;
  if (reworded < 40 || neu < 20 || amb < 10 || ins < 10) {
    throw new Error(
      `Cohort mins failed: reworded=${reworded} new=${neu} amb=${amb} insuff=${ins}`,
    );
  }
}

export function getHumanReviewCase(id: string): HumanReviewCase | undefined {
  return HUMAN_REVIEW_CASES.find((x) => x.id === id);
}

export function listNonHoldoutCases(): HumanReviewCase[] {
  return HUMAN_REVIEW_CASES.filter((x) => !x.holdout);
}

export function listHoldoutCases(): HumanReviewCase[] {
  return HUMAN_REVIEW_CASES.filter((x) => x.holdout);
}
