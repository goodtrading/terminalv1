/**
 * AI-7 — Versioned decision graph templates (no OpenAI; no trading outcomes).
 */
import type { DecisionPriorityTier } from "./priority";

export type TemplateNodeDef = {
  id: string;
  kind:
    | "HYPOTHESIS"
    | "CONFIRMATION"
    | "INVALIDATION"
    | "EVIDENCE"
    | "CONFLICT"
    | "GUARD"
    | "CONCLUSION"
    | "CONTEXT";
  label: string;
  priority: DecisionPriorityTier;
  knowledgeId?: string;
  /** Evaluator key */
  evalKey: string;
};

export type TemplateEdgeDef = {
  id: string;
  from: string;
  to: string;
  relation: "SUPPORTS" | "WEAKENS" | "INVALIDATES" | "NEUTRAL" | "INSUFFICIENT" | "CONFLICTS";
};

export type DecisionGraphTemplate = {
  id: string;
  version: string;
  title: string;
  description: string;
  matchKeywords: string[];
  nodes: TemplateNodeDef[];
  edges: TemplateEdgeDef[];
  maxDepth: number;
};

const ABSORPTION: DecisionGraphTemplate = {
  id: "absorption_reclaim_v1",
  version: "1.0.0",
  title: "Absorption + reclaim (educational)",
  description: "Hypothesis of absorption with confirmation/invalidation guards — no trade side.",
  matchKeywords: ["absorption", "absorción", "pasivo"],
  maxDepth: 5,
  nodes: [
    { id: "ctx", kind: "CONTEXT", label: "Contexto de lectura", priority: "HIGH", evalKey: "context_trust" },
    {
      id: "hyp",
      kind: "HYPOTHESIS",
      label: "Hipótesis: absorption en nivel",
      priority: "CRITICAL",
      knowledgeId: "gt_of_absorption_central",
      evalKey: "hypothesis_open",
    },
    {
      id: "conf_passive",
      kind: "CONFIRMATION",
      label: "Confirmación: pasivo vs agresivo",
      priority: "HIGH",
      evalKey: "confirmation_keywords",
    },
    {
      id: "conf_accept",
      kind: "CONFIRMATION",
      label: "Confirmación: acceptance",
      priority: "MEDIUM",
      evalKey: "confirmation_keywords",
    },
    {
      id: "inv_delta_only",
      kind: "INVALIDATION",
      label: "Invalidación: solo delta",
      priority: "CRITICAL",
      knowledgeId: "gt_of_delta_not_signal",
      evalKey: "invalidation_delta_alone",
    },
    { id: "guard_stale", kind: "GUARD", label: "Guard: evidencia stale", priority: "CRITICAL", evalKey: "guard_stale" },
    {
      id: "conc",
      kind: "CONCLUSION",
      label: "Conclusión educativa",
      priority: "HIGH",
      evalKey: "conclusion_from_path",
    },
  ],
  edges: [
    { id: "e1", from: "ctx", to: "hyp", relation: "SUPPORTS" },
    { id: "e2", from: "conf_passive", to: "hyp", relation: "SUPPORTS" },
    { id: "e3", from: "conf_accept", to: "hyp", relation: "SUPPORTS" },
    { id: "e4", from: "inv_delta_only", to: "hyp", relation: "INVALIDATES" },
    { id: "e5", from: "guard_stale", to: "hyp", relation: "WEAKENS" },
    { id: "e6", from: "hyp", to: "conc", relation: "SUPPORTS" },
  ],
};

const GAMMA: DecisionGraphTemplate = {
  id: "gamma_regime_read_v1",
  version: "1.0.0",
  title: "Gamma regime reading",
  description: "Regime as reference — never binary trade direction.",
  matchKeywords: ["gamma", "flip", "régimen", "regime"],
  maxDepth: 5,
  nodes: [
    { id: "ctx", kind: "CONTEXT", label: "Contexto", priority: "HIGH", evalKey: "context_trust" },
    {
      id: "hyp",
      kind: "HYPOTHESIS",
      label: "Hipótesis de régimen gamma",
      priority: "CRITICAL",
      knowledgeId: "gt_gamma_pos_neg_hypothesis",
      evalKey: "hypothesis_open",
    },
    {
      id: "conf_multi",
      kind: "CONFIRMATION",
      label: "Confirmación multi-lente",
      priority: "HIGH",
      knowledgeId: "gt_const_multi_lens",
      evalKey: "confirmation_keywords",
    },
    {
      id: "inv_binary",
      kind: "INVALIDATION",
      label: "Anti-patrón: gamma = dirección",
      priority: "CRITICAL",
      knowledgeId: "gt_gamma_anti_binary",
      evalKey: "invalidation_gamma_binary",
    },
    { id: "conflict", kind: "CONFLICT", label: "Conflicto tipado", priority: "HIGH", evalKey: "conflict_scan" },
    { id: "conc", kind: "CONCLUSION", label: "Conclusión educativa", priority: "HIGH", evalKey: "conclusion_from_path" },
  ],
  edges: [
    { id: "e1", from: "ctx", to: "hyp", relation: "SUPPORTS" },
    { id: "e2", from: "conf_multi", to: "hyp", relation: "SUPPORTS" },
    { id: "e3", from: "inv_binary", to: "hyp", relation: "INVALIDATES" },
    { id: "e4", from: "conflict", to: "hyp", relation: "CONFLICTS" },
    { id: "e5", from: "hyp", to: "conc", relation: "SUPPORTS" },
  ],
};

const WALL: DecisionGraphTemplate = {
  id: "liquidity_wall_reference_v1",
  version: "1.0.0",
  title: "Liquidity wall as reference",
  description: "Wall orients — never confirms reversal alone.",
  matchKeywords: ["wall", "call wall", "put wall", "liquidez"],
  maxDepth: 4,
  nodes: [
    { id: "ctx", kind: "CONTEXT", label: "Contexto", priority: "MEDIUM", evalKey: "context_trust" },
    {
      id: "hyp",
      kind: "HYPOTHESIS",
      label: "Wall como referencia",
      priority: "HIGH",
      knowledgeId: "gt_liq_wall_not_reversal",
      evalKey: "hypothesis_open",
    },
    {
      id: "inv_rev",
      kind: "INVALIDATION",
      label: "Invalidación: wall=reversión",
      priority: "CRITICAL",
      evalKey: "invalidation_wall_reversal",
    },
    { id: "conc", kind: "CONCLUSION", label: "Conclusión educativa", priority: "MEDIUM", evalKey: "conclusion_from_path" },
  ],
  edges: [
    { id: "e1", from: "ctx", to: "hyp", relation: "SUPPORTS" },
    { id: "e2", from: "inv_rev", to: "hyp", relation: "INVALIDATES" },
    { id: "e3", from: "hyp", to: "conc", relation: "SUPPORTS" },
  ],
};

const SWEEP: DecisionGraphTemplate = {
  id: "sweep_reclaim_setup_v1",
  version: "1.0.0",
  title: "Sweep + reclaim setup (educational)",
  description: "SETUP-shaped path with explicit invalidations.",
  matchKeywords: ["sweep", "reclaim", "barrido"],
  maxDepth: 5,
  nodes: [
    { id: "ctx", kind: "CONTEXT", label: "Contexto", priority: "HIGH", evalKey: "context_trust" },
    { id: "hyp", kind: "HYPOTHESIS", label: "Hipótesis sweep+reclaim", priority: "CRITICAL", evalKey: "hypothesis_open" },
    { id: "conf1", kind: "CONFIRMATION", label: "Confirmación reclaim", priority: "HIGH", evalKey: "confirmation_keywords" },
    { id: "inv1", kind: "INVALIDATION", label: "Invalidación: no reclaim", priority: "CRITICAL", evalKey: "invalidation_keywords" },
    { id: "guard", kind: "GUARD", label: "Guard untrusted", priority: "CRITICAL", evalKey: "guard_untrusted" },
    { id: "conc", kind: "CONCLUSION", label: "Conclusión educativa", priority: "HIGH", evalKey: "conclusion_from_path" },
  ],
  edges: [
    { id: "e1", from: "ctx", to: "hyp", relation: "SUPPORTS" },
    { id: "e2", from: "conf1", to: "hyp", relation: "SUPPORTS" },
    { id: "e3", from: "inv1", to: "hyp", relation: "INVALIDATES" },
    { id: "e4", from: "guard", to: "hyp", relation: "WEAKENS" },
    { id: "e5", from: "hyp", to: "conc", relation: "SUPPORTS" },
  ],
};

const MULTI_CONFLICT: DecisionGraphTemplate = {
  id: "multi_lens_conflict_v1",
  version: "1.0.0",
  title: "Multi-lens conflict detector",
  description: "Surfaces methodological conflicts without choosing a side.",
  matchKeywords: ["conflicto", "conflict", "multi", "lente"],
  maxDepth: 4,
  nodes: [
    { id: "ctx", kind: "CONTEXT", label: "Contexto", priority: "HIGH", evalKey: "context_trust" },
    { id: "hyp", kind: "HYPOTHESIS", label: "Lectura multi-lente", priority: "HIGH", evalKey: "hypothesis_open" },
    { id: "conflict", kind: "CONFLICT", label: "Motor de conflictos", priority: "CRITICAL", evalKey: "conflict_scan" },
    { id: "conc", kind: "CONCLUSION", label: "Conclusión educativa", priority: "HIGH", evalKey: "conclusion_from_path" },
  ],
  edges: [
    { id: "e1", from: "ctx", to: "hyp", relation: "SUPPORTS" },
    { id: "e2", from: "conflict", to: "hyp", relation: "CONFLICTS" },
    { id: "e3", from: "hyp", to: "conc", relation: "SUPPORTS" },
  ],
};

const STALE_GUARD: DecisionGraphTemplate = {
  id: "stale_evidence_guard_v1",
  version: "1.0.0",
  title: "Stale evidence guard",
  description: "STALE evidence cannot SUPPORTS.",
  matchKeywords: ["stale", "atrasado", "caduc"],
  maxDepth: 3,
  nodes: [
    { id: "ctx", kind: "CONTEXT", label: "Contexto", priority: "CRITICAL", evalKey: "context_trust" },
    { id: "guard", kind: "GUARD", label: "Guard stale", priority: "CRITICAL", evalKey: "guard_stale" },
    { id: "hyp", kind: "HYPOTHESIS", label: "Hipótesis bloqueada si stale", priority: "HIGH", evalKey: "hypothesis_open" },
    { id: "conc", kind: "CONCLUSION", label: "Conclusión", priority: "MEDIUM", evalKey: "conclusion_from_path" },
  ],
  edges: [
    { id: "e1", from: "ctx", to: "hyp", relation: "SUPPORTS" },
    { id: "e2", from: "guard", to: "hyp", relation: "WEAKENS" },
    { id: "e3", from: "hyp", to: "conc", relation: "SUPPORTS" },
  ],
};

const UNTRUSTED: DecisionGraphTemplate = {
  id: "untrusted_scenario_v1",
  version: "1.0.0",
  title: "Untrusted scenario path",
  description: "Hypothetical/untrusted never claims live validation.",
  matchKeywords: ["supongamos", "what if", "hypothetical", "imagin"],
  maxDepth: 3,
  nodes: [
    { id: "ctx", kind: "CONTEXT", label: "Escenario no confiable", priority: "CRITICAL", evalKey: "context_trust" },
    { id: "guard", kind: "GUARD", label: "Guard untrusted", priority: "CRITICAL", evalKey: "guard_untrusted" },
    { id: "hyp", kind: "HYPOTHESIS", label: "Hipótesis de escenario", priority: "MEDIUM", evalKey: "hypothesis_open" },
    { id: "conc", kind: "CONCLUSION", label: "Conclusión condicionada", priority: "MEDIUM", evalKey: "conclusion_from_path" },
  ],
  edges: [
    { id: "e1", from: "ctx", to: "hyp", relation: "INSUFFICIENT" },
    { id: "e2", from: "guard", to: "hyp", relation: "WEAKENS" },
    { id: "e3", from: "hyp", to: "conc", relation: "SUPPORTS" },
  ],
};

const CONFIRM_STACK: DecisionGraphTemplate = {
  id: "confirmation_stack_v1",
  version: "1.0.0",
  title: "Confirmation stack (evidence only)",
  description: "Multiple confirmations never become a trade mandate.",
  matchKeywords: ["confirm", "confirmación", "evidencia"],
  maxDepth: 4,
  nodes: [
    { id: "ctx", kind: "CONTEXT", label: "Contexto", priority: "MEDIUM", evalKey: "context_trust" },
    { id: "hyp", kind: "HYPOTHESIS", label: "Hipótesis abierta", priority: "HIGH", evalKey: "hypothesis_open" },
    { id: "c1", kind: "CONFIRMATION", label: "Confirmación A", priority: "HIGH", evalKey: "confirmation_keywords" },
    { id: "c2", kind: "CONFIRMATION", label: "Confirmación B", priority: "MEDIUM", evalKey: "confirmation_keywords" },
    { id: "c3", kind: "CONFIRMATION", label: "Confirmación C", priority: "LOW", evalKey: "confirmation_keywords" },
    { id: "conc", kind: "CONCLUSION", label: "Conclusión educativa", priority: "HIGH", evalKey: "conclusion_from_path" },
  ],
  edges: [
    { id: "e1", from: "ctx", to: "hyp", relation: "SUPPORTS" },
    { id: "e2", from: "c1", to: "hyp", relation: "SUPPORTS" },
    { id: "e3", from: "c2", to: "hyp", relation: "SUPPORTS" },
    { id: "e4", from: "c3", to: "hyp", relation: "SUPPORTS" },
    { id: "e5", from: "hyp", to: "conc", relation: "SUPPORTS" },
  ],
};

const GENERIC: DecisionGraphTemplate = {
  id: "generic_hypothesis_v1",
  version: "1.0.0",
  title: "Generic hypothesis scaffold",
  description: "Default when no specialty template matches.",
  matchKeywords: [],
  maxDepth: 4,
  nodes: [
    { id: "ctx", kind: "CONTEXT", label: "Contexto", priority: "MEDIUM", evalKey: "context_trust" },
    { id: "hyp", kind: "HYPOTHESIS", label: "Hipótesis de lectura", priority: "HIGH", evalKey: "hypothesis_open" },
    { id: "conf", kind: "CONFIRMATION", label: "Buscar confirmaciones", priority: "MEDIUM", evalKey: "confirmation_keywords" },
    { id: "inv", kind: "INVALIDATION", label: "Definir invalidación", priority: "HIGH", evalKey: "invalidation_keywords" },
    { id: "conc", kind: "CONCLUSION", label: "Conclusión educativa", priority: "MEDIUM", evalKey: "conclusion_from_path" },
  ],
  edges: [
    { id: "e1", from: "ctx", to: "hyp", relation: "SUPPORTS" },
    { id: "e2", from: "conf", to: "hyp", relation: "SUPPORTS" },
    { id: "e3", from: "inv", to: "hyp", relation: "INVALIDATES" },
    { id: "e4", from: "hyp", to: "conc", relation: "SUPPORTS" },
  ],
};

export const DECISION_GRAPH_TEMPLATES: readonly DecisionGraphTemplate[] = [
  ABSORPTION,
  GAMMA,
  WALL,
  SWEEP,
  MULTI_CONFLICT,
  STALE_GUARD,
  UNTRUSTED,
  CONFIRM_STACK,
  GENERIC,
];

export function listDecisionGraphTemplates(): Array<{
  id: string;
  version: string;
  title: string;
  description: string;
}> {
  return DECISION_GRAPH_TEMPLATES.map((t) => ({
    id: t.id,
    version: t.version,
    title: t.title,
    description: t.description,
  }));
}

export function getDecisionGraphTemplate(id: string): DecisionGraphTemplate | null {
  return DECISION_GRAPH_TEMPLATES.find((t) => t.id === id) ?? null;
}

export function selectDecisionGraphTemplate(question: string): DecisionGraphTemplate {
  const q = question.toLowerCase();
  // Prefer specialty templates; scan conflict/sweep before gamma/absorption when overlapping terms.
  const ordered = [
    UNTRUSTED,
    MULTI_CONFLICT,
    STALE_GUARD,
    SWEEP,
    WALL,
    ABSORPTION,
    GAMMA,
    CONFIRM_STACK,
    GENERIC,
  ];
  for (const t of ordered) {
    if (t.id === "generic_hypothesis_v1") continue;
    if (t.matchKeywords.some((k) => q.includes(k.toLowerCase()))) return t;
  }
  return GENERIC;
}
