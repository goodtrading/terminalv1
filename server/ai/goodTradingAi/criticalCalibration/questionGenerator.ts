import type {
  CalibrationQuestion,
  CalibrationQuestionType,
  InfoGainScoreComponents,
  SyntheticScenario,
} from "@shared/goodTradingAiCriticalCalibration";
import { calibrationQuestionSchema } from "@shared/goodTradingAiCriticalCalibration";

type SeedQ = {
  id: string;
  prompt: string;
  questionType: CalibrationQuestionType;
  lenses: CalibrationQuestion["relatedLenses"];
  concepts: string[];
  templates: string[];
  base: Partial<InfoGainScoreComponents>;
};

const SEEDS: SeedQ[] = [
  {
    id: "cq_abs_delta_cond",
    prompt: "Si absorption y delta divergen, bajo que condiciones absorption pesa mas? (permitido: depende)",
    questionType: "CONDITIONAL_PRIORITY",
    lenses: ["ABSORPTION", "DELTA"],
    concepts: ["absorption_priority", "delta_confirmation"],
    templates: ["tpl_absorption_vs_delta"],
    base: { uncertaintyScore: 0.85, conflictResolutionValue: 0.8, ruleImpact: 0.75, safetyPriority: 0.7 },
  },
  {
    id: "cq_gamma_dealer_pri",
    prompt: "Entre gamma y dealer, cual invalida primero una lectura sintetica cuando ambos estan presentes?",
    questionType: "PRIORITY_CHOICE",
    lenses: ["GAMMA", "DEALER"],
    concepts: ["gamma_invalidation", "dealer_neutral"],
    templates: ["tpl_gamma_dealer"],
    base: { uncertaintyScore: 0.7, ruleImpact: 0.8, coverageGain: 0.6 },
  },
  {
    id: "cq_wall_accept_conf",
    prompt: "Que confirmacion minima exige wall removida vs aceptacion para no sobre-leer liquidez?",
    questionType: "CONFIRMATION_REQUIREMENT",
    lenses: ["LIQUIDITY", "ACCEPTANCE"],
    concepts: ["liquidity_wall", "acceptance"],
    templates: ["tpl_liquidity_acceptance"],
    base: { coverageGain: 0.75, ruleImpact: 0.7, templateImpact: 0.65 },
  },
  {
    id: "cq_cvd_fp_conf",
    prompt: "CVD invertido con footprint neutral: que confirmacion adicional haria falta, si alguna?",
    questionType: "CONFIRMATION_REQUIREMENT",
    lenses: ["CVD", "FOOTPRINT"],
    concepts: ["cvd", "footprint"],
    templates: ["tpl_cvd_footprint"],
    base: { uncertaintyScore: 0.65, coverageGain: 0.55 },
  },
  {
    id: "cq_stale_inv",
    prompt: "Con staleness presente, que invalidacion o guard debe activarse antes de una lectura definitiva?",
    questionType: "INVALIDATION_REQUIREMENT",
    lenses: ["STALENESS", "CONFIDENCE"],
    concepts: ["staleness_guard", "confidence_cap"],
    templates: ["tpl_staleness"],
    base: { safetyPriority: 0.95, ruleImpact: 0.8, uncertaintyScore: 0.6 },
  },
  {
    id: "cq_conflict_res",
    prompt: "Conflicto multi-lente vs invalidacion explicita: como resolver sin forzar una sola lectura?",
    questionType: "CONFLICT_RESOLUTION",
    lenses: ["CONFLICTS", "INVALIDATION"],
    concepts: ["conflict_resolution", "invalidation"],
    templates: ["tpl_conflict"],
    base: { conflictResolutionValue: 0.95, uncertaintyScore: 0.8, safetyPriority: 0.75 },
  },
  {
    id: "cq_spoof_abs_amb",
    prompt: "Cuando spoofing y absorcion co-ocurren, la lectura es ambigua o hay una regla condicional clara?",
    questionType: "AMBIGUITY_RESOLUTION",
    lenses: ["SPOOFING", "ABSORPTION"],
    concepts: ["spoofing", "absorption"],
    templates: ["tpl_spoof_absorption"],
    base: { uncertaintyScore: 0.9, conflictResolutionValue: 0.7 },
  },
  {
    id: "cq_oi_vol_scope",
    prompt: "Si OI desaparece con volatilidad alta, en que alcance de regla aplica (siempre / solo con dealer debil)?",
    questionType: "RULE_SCOPE",
    lenses: ["OI", "VOLATILITY"],
    concepts: ["oi_disappears", "volatility"],
    templates: ["tpl_oi_vol"],
    base: { ruleImpact: 0.7, novelty: 0.6, coverageGain: 0.5 },
  },
  {
    id: "cq_reject_flip_ce",
    prompt: "Hay un contraejemplo metodologico donde rechazo de nivel NO precede a flip estructural?",
    questionType: "COUNTEREXAMPLE",
    lenses: ["REJECTION", "FLIP"],
    concepts: ["rejection", "flip"],
    templates: ["tpl_reject_flip"],
    base: { novelty: 0.85, ruleImpact: 0.55, templateImpact: 0.5 },
  },
  {
    id: "cq_dq_conf_inv",
    prompt: "Con data quality debil, que invalidacion o bloqueo de confianza exige la metodologia?",
    questionType: "INVALIDATION_REQUIREMENT",
    lenses: ["DATA_QUALITY", "CONFIDENCE"],
    concepts: ["data_quality", "confidence"],
    templates: ["tpl_data_quality"],
    base: { safetyPriority: 0.9, ruleImpact: 0.65 },
  },
  {
    id: "cq_delta_cvd_pri",
    prompt: "Delta aislado vs CVD acumulado: prioridad condicional cuando solo uno es fuerte?",
    questionType: "CONDITIONAL_PRIORITY",
    lenses: ["DELTA", "CVD"],
    concepts: ["delta", "cvd"],
    templates: ["tpl_delta_cvd"],
    base: { uncertaintyScore: 0.7, ruleImpact: 0.6 },
  },
  {
    id: "cq_dealer_gamma_ce",
    prompt: "Contraejemplo: dealer neutral con gamma invertido — la metodologia debe abrir hipotesis o invalidar?",
    questionType: "COUNTEREXAMPLE",
    lenses: ["DEALER", "GAMMA"],
    concepts: ["dealer_neutral", "gamma_invert"],
    templates: ["tpl_dealer_gamma"],
    base: { novelty: 0.7, conflictResolutionValue: 0.55 },
  },
  {
    id: "cq_liq_spoof_amb",
    prompt: "Liquidez visible con spoofing potencial: como distinguir ambiguedad de senal operativa (sin trading)?",
    questionType: "AMBIGUITY_RESOLUTION",
    lenses: ["LIQUIDITY", "SPOOFING"],
    concepts: ["liquidity", "spoofing"],
    templates: ["tpl_liq_spoof"],
    base: { uncertaintyScore: 0.75, safetyPriority: 0.6 },
  },
  {
    id: "cq_accept_inv_conf",
    prompt: "Aceptacion parcial con invalidacion fuerte: que confirmacion adicional, si alguna, permitiria mantener hipotesis abierta?",
    questionType: "CONFIRMATION_REQUIREMENT",
    lenses: ["ACCEPTANCE", "INVALIDATION"],
    concepts: ["acceptance", "invalidation"],
    templates: ["tpl_accept_inv"],
    base: { coverageGain: 0.65, ruleImpact: 0.7, safetyPriority: 0.7 },
  },
  {
    id: "cq_fp_delta_scope",
    prompt: "Alcance de regla: footprint sintetico confirma delta debil — siempre, a veces, o nunca sin otra lente?",
    questionType: "RULE_SCOPE",
    lenses: ["FOOTPRINT", "DELTA"],
    concepts: ["footprint", "delta"],
    templates: ["tpl_fp_delta"],
    base: { ruleImpact: 0.55, templateImpact: 0.6 },
  },
  {
    id: "cq_vol_stale_cmp",
    prompt: "Comparando dos escenarios sinteticos: volatilidad alta vs stale — cual exige mas cautela metodologica y por que?",
    questionType: "SCENARIO_COMPARISON",
    lenses: ["VOLATILITY", "STALENESS"],
    concepts: ["volatility", "staleness"],
    templates: ["tpl_vol_stale"],
    base: { coverageGain: 0.6, novelty: 0.5, humanEffortPenalty: 0.35 },
  },
  {
    id: "cq_conflict_conf_pri",
    prompt: "Conflicto sin resolver: bajar confianza primero o pedir mas lentes primero?",
    questionType: "PRIORITY_CHOICE",
    lenses: ["CONFLICTS", "CONFIDENCE"],
    concepts: ["conflict", "confidence"],
    templates: ["tpl_conflict_conf"],
    base: { conflictResolutionValue: 0.8, uncertaintyScore: 0.7, safetyPriority: 0.65 },
  },
  {
    id: "cq_abs_rej_cmp",
    prompt: "Comparacion: absorcion vs rechazo en el mismo nivel sintetico — como decidir sin mandato binario?",
    questionType: "SCENARIO_COMPARISON",
    lenses: ["ABSORPTION", "REJECTION"],
    concepts: ["absorption", "rejection"],
    templates: ["tpl_abs_rej"],
    base: { novelty: 0.55, coverageGain: 0.5 },
  },
  {
    id: "cq_flip_inv",
    prompt: "Flip estructural: que invalidacion minima debe dispararse sobre una lectura previa?",
    questionType: "INVALIDATION_REQUIREMENT",
    lenses: ["FLIP", "INVALIDATION"],
    concepts: ["flip", "invalidation"],
    templates: ["tpl_flip_inv"],
    base: { safetyPriority: 0.85, ruleImpact: 0.75 },
  },
  {
    id: "cq_oi_dealer_cond",
    prompt: "Si OI desaparece, dealer pasa a neutral siempre o solo bajo condiciones? (depende permitido)",
    questionType: "CONDITIONAL_PRIORITY",
    lenses: ["OI", "DEALER"],
    concepts: ["oi", "dealer"],
    templates: ["tpl_oi_dealer"],
    base: { uncertaintyScore: 0.6, ruleImpact: 0.55, novelty: 0.45 },
  },
  {
    id: "cq_gamma_pri_2",
    prompt: "Prioridad: gamma invertido vs liquidez ausente — cual degrada primero la confianza?",
    questionType: "PRIORITY_CHOICE",
    lenses: ["GAMMA", "LIQUIDITY"],
    concepts: ["gamma", "liquidity"],
    templates: ["tpl_gamma_liq"],
    base: { uncertaintyScore: 0.55, coverageGain: 0.45 },
  },
  {
    id: "cq_conflict_res_2",
    prompt: "Como resolver CONFLICTS+DATA_QUALITY juntos sin inventar evidencia de mercado?",
    questionType: "CONFLICT_RESOLUTION",
    lenses: ["CONFLICTS", "DATA_QUALITY"],
    concepts: ["conflicts", "data_quality"],
    templates: ["tpl_conflict_dq"],
    base: { conflictResolutionValue: 0.85, safetyPriority: 0.8 },
  },
];

function clamp01(n: number): number {
  return Math.max(0, Math.min(1, n));
}

function composeScore(c: InfoGainScoreComponents): number {
  const raw =
    0.18 * c.uncertaintyScore +
    0.14 * c.coverageGain +
    0.14 * c.ruleImpact +
    0.1 * c.templateImpact +
    0.14 * c.conflictResolutionValue +
    0.1 * c.novelty +
    0.12 * c.safetyPriority -
    0.08 * c.redundancyPenalty -
    0.06 * c.humanEffortPenalty;
  return clamp01(raw);
}

function band(score: number): CalibrationQuestion["expectedInformationGainBand"] {
  if (score >= 0.72) return "HIGH";
  if (score >= 0.45) return "MEDIUM";
  return "LOW";
}

function semanticKey(q: { questionType: string; lenses: string[]; concepts: string[] }): string {
  return [q.questionType, ...q.lenses.slice().sort(), ...q.concepts.slice().sort()].join("|");
}

function buildComponents(
  seed: SeedQ,
  scenarioLenses: Set<string>,
  seenKeys: Set<string>,
): InfoGainScoreComponents {
  const hit = seed.lenses.filter((l) => scenarioLenses.has(l)).length;
  const key = semanticKey({ questionType: seed.questionType, lenses: seed.lenses, concepts: seed.concepts });
  const redundant = seenKeys.has(key);
  return {
    uncertaintyScore: clamp01(seed.base.uncertaintyScore ?? 0.5),
    coverageGain: clamp01((seed.base.coverageGain ?? 0.4) + hit * 0.12),
    ruleImpact: clamp01(seed.base.ruleImpact ?? 0.45),
    templateImpact: clamp01(seed.base.templateImpact ?? 0.4),
    conflictResolutionValue: clamp01(seed.base.conflictResolutionValue ?? 0.35),
    novelty: clamp01((seed.base.novelty ?? 0.5) - (redundant ? 0.4 : 0)),
    redundancyPenalty: clamp01(redundant ? 0.85 : (seed.base.redundancyPenalty ?? 0.1)),
    humanEffortPenalty: clamp01(seed.base.humanEffortPenalty ?? 0.2),
    safetyPriority: clamp01(seed.base.safetyPriority ?? 0.5),
  };
}

export function dedupeQuestionsSemantic(questions: CalibrationQuestion[]): CalibrationQuestion[] {
  const seen = new Set<string>();
  const out: CalibrationQuestion[] = [];
  for (const q of questions) {
    const key = semanticKey({
      questionType: q.questionType,
      lenses: q.relatedLenses,
      concepts: q.affectedConcepts,
    });
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(q);
  }
  return out;
}

export function selectHighInfoQuestions(input: {
  scenarios?: SyntheticScenario[];
  limit?: number;
  targetMin?: number;
  targetMax?: number;
}): CalibrationQuestion[] {
  const limit = input.limit ?? 20;
  const targetMin = input.targetMin ?? 15;
  const targetMax = input.targetMax ?? 20;
  const scenarioLenses = new Set((input.scenarios ?? []).flatMap((s) => s.lenses.map((l) => l.lens)));
  const seenKeys = new Set<string>();

  const scored = SEEDS.map((seed) => {
    const components = buildComponents(seed, scenarioLenses, seenKeys);
    const infoGainScore = composeScore(components);
    const q = calibrationQuestionSchema.parse({
      id: seed.id,
      prompt: seed.prompt,
      questionType: seed.questionType,
      relatedLenses: seed.lenses,
      infoGainScore,
      scoreComponents: components,
      expectedInformationGainBand: band(infoGainScore),
      whyThisQuestion: `Maximiza info-gain vía ${seed.questionType}: incertidumbre=${components.uncertaintyScore.toFixed(2)}, conflicto=${components.conflictResolutionValue.toFixed(2)}, cobertura=${components.coverageGain.toFixed(2)}.`,
      affectedConcepts: seed.concepts,
      affectedTemplates: seed.templates,
      rationale: `Active learning explicable sobre ${seed.lenses.join(" vs ")} — sin respuesta sugerida ni mandato operativo.`,
      allowsDepends: true as const,
      mentorEligible: false as const,
    });
    seenKeys.add(semanticKey({ questionType: seed.questionType, lenses: seed.lenses, concepts: seed.concepts }));
    return q;
  });

  scored.sort((a, b) => b.infoGainScore - a.infoGainScore);
  let selected = dedupeQuestionsSemantic(scored).slice(0, Math.min(limit, targetMax));

  // Enforce minimum type distribution when pool allows
  const need: Array<{ type: CalibrationQuestionType; n: number }> = [
    { type: "PRIORITY_CHOICE", n: 3 },
    { type: "CONFIRMATION_REQUIREMENT", n: 3 },
    { type: "INVALIDATION_REQUIREMENT", n: 3 },
    { type: "AMBIGUITY_RESOLUTION", n: 2 },
    { type: "COUNTEREXAMPLE", n: 1 },
    { type: "RULE_SCOPE", n: 1 },
    { type: "CONFLICT_RESOLUTION", n: 2 },
  ];
  const byType = (t: CalibrationQuestionType) => selected.filter((q) => q.questionType === t);
  for (const req of need) {
    const have = byType(req.type).length;
    if (have >= req.n) continue;
    const extras = scored.filter((q) => q.questionType === req.type && !selected.some((s) => s.id === q.id));
    for (const e of extras) {
      if (byType(req.type).length >= req.n) break;
      if (selected.length >= targetMax) break;
      selected.push(e);
    }
  }

  selected = dedupeQuestionsSemantic(selected)
    .sort((a, b) => b.infoGainScore - a.infoGainScore)
    .slice(0, Math.max(targetMin, Math.min(targetMax, selected.length)));

  return selected.slice(0, Math.min(limit, targetMax));
}

export function countDuplicatesRemoved(before: CalibrationQuestion[], after: CalibrationQuestion[]): number {
  return Math.max(0, before.length - after.length);
}
