import { ke, type GoodTradingKnowledgeEntry } from "./types";

export const RISK_ENTRIES: readonly GoodTradingKnowledgeEntry[] = [
  ke({
    id: "gt_risk_invalidation_first",
    title: "Invalidación antes que R:R",
    category: "risk",
    kind: "RULE",
    concepts: ["invalidación", "invalidation", "riesgo", "risk"],
    aliases: ["invalidation before rr"],
    statement: "Primero se define dónde la tesis muere; después se discute asimetría y tamaño.",
    explanation:
      "Calcular R:R sin invalidación es ficción. Esta regla tiene prioridad constitucional sobre heurísticas de entry.",
    prohibitedInterpretations: ["Primero el target, después el stop"],
    relatedEntryIds: ["gt_const_invalidation_required", "gt_exec_no_fixed_rr"],
  }),
  ke({
    id: "gt_risk_position_sizing_context",
    title: "Tamaño contextual",
    category: "risk",
    kind: "RULE",
    concepts: ["position sizing", "tamaño", "sizing"],
    aliases: ["size by context"],
    statement: "El tamaño depende de volatilidad, liquidez, confianza relativa y límites de sesión — no de un % fijo universal.",
    explanation:
      "AI-2 rechaza recetas universales de porcentaje. Enseña framework, no número mágico.",
    prohibitedInterpretations: ["Siempre 1% o 2%"],
    relatedEntryIds: ["gt_const_no_universal_percent", "gt_risk_session_limits"],
  }),
  ke({
    id: "gt_risk_session_limits",
    title: "Límites de sesión",
    category: "risk",
    kind: "RULE",
    concepts: ["daily loss", "límite diario", "session limit"],
    aliases: ["max loss day"],
    statement: "Límites de pérdida/número de trades por sesión protegen el proceso.",
    explanation:
      "Sin límites, un buen método se rompe por varianza y tilt.",
    relatedEntryIds: ["gt_exec_anti_revenge", "gt_const_process_over_outcome"],
  }),
  ke({
    id: "gt_risk_slippage_concept",
    title: "Slippage conceptual",
    category: "risk",
    kind: "DEFINITION",
    concepts: ["slippage", "deslizamiento"],
    aliases: ["execution cost"],
    statement: "El slippage es costo real de ejecución; debe entrar en la expectativa del plan.",
    explanation:
      "En thin books y spikes, el 'stop teórico' no es el stop real.",
    relatedEntryIds: ["gt_liq_thin_book", "gt_risk_position_sizing_context"],
  }),
  ke({
    id: "gt_risk_correlation",
    title: "Correlación y riesgo agregado",
    category: "risk",
    kind: "HEURISTIC",
    concepts: ["correlación", "correlation", "portfolio risk"],
    aliases: ["correlated risk"],
    statement: "Varias posiciones correlacionadas pueden ser un solo riesgo disfrazado.",
    explanation:
      "Especialmente en crypto majors. El sizing debe mirar exposición neta.",
    relatedEntryIds: ["gt_risk_position_sizing_context", "gt_const_risk_over_prediction"],
  }),
  ke({
    id: "gt_risk_no_average_down_blind",
    title: "Anti-patrón: promediar a ciegas",
    category: "risk",
    kind: "ANTI_PATTERN",
    concepts: ["average down", "promediar", "martingale"],
    aliases: ["blind averaging"],
    statement: "Promediar perdedoras sin tesis e invalidación nuevas es anti-patrón de riesgo.",
    explanation:
      "Convierte un error pequeño en uno existencial.",
    relatedEntryIds: ["gt_exec_scale_logic", "gt_risk_invalidation_first"],
  }),
  ke({
    id: "gt_risk_define_r",
    title: "Definir la R",
    category: "risk",
    kind: "DEFINITION",
    concepts: ["r multiple", "definir r", "1R"],
    aliases: ["unit risk"],
    statement: "1R es la pérdida planificada hasta invalidación, no un número arbitrario del broker.",
    explanation:
      "Hablar en R alinea gestión y evaluación de proceso.",
    relatedEntryIds: ["gt_risk_invalidation_first", "gt_exec_no_fixed_rr"],
  }),
  ke({
    id: "gt_risk_asymmetric_payoff",
    title: "Payoff asimétrico realista",
    category: "risk",
    kind: "HEURISTIC",
    concepts: ["asimetría", "asymmetric payoff"],
    aliases: ["skewed payoff"],
    statement: "Buscar asimetría realista tras costos e invalidación, no fantasía de targets lejanos.",
    explanation:
      "Targets deben ser coherentes con estructura, no con deseo.",
    relatedEntryIds: ["gt_exec_no_fixed_rr", "gt_const_levels_are_references"],
  }),
];
