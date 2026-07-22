/**
 * AI-7 — ≥18 fixtures with expected outcomes (educational Decision Graph).
 */
import type { DecisionPathOutcome, DecisionQualityCategory } from "@shared/goodTradingAiDecisionGraph";

export type DecisionFixture = {
  id: string;
  question: string;
  templateId?: string;
  forceUntrusted?: boolean;
  expectOutcome?: DecisionPathOutcome | DecisionPathOutcome[];
  expectQuality?: DecisionQualityCategory | DecisionQualityCategory[];
  expectTemplateIncludes?: string;
};

export const DECISION_GRAPH_FIXTURES: DecisionFixture[] = [
  {
    id: "fx_absorption_confirm",
    question: "Explicá absorption con confirmación de pasivo y acceptance",
    expectTemplateIncludes: "absorption",
    expectOutcome: ["HYPOTHESIS_SUPPORTED", "HYPOTHESIS_OPEN", "EVIDENCE_INSUFFICIENT"],
  },
  {
    id: "fx_delta_alone_invalid",
    question: "Solo con delta alcanza para confirmar absorption",
    expectOutcome: ["HYPOTHESIS_INVALIDATED", "HYPOTHESIS_SUPPORTED", "EVIDENCE_INSUFFICIENT"],
  },
  {
    id: "fx_gamma_regime",
    question: "Cómo leer gamma positiva como régimen, no como señal",
    expectTemplateIncludes: "gamma",
  },
  {
    id: "fx_gamma_binary_bad",
    question: "Gamma = dirección y gamma confirma compra",
    expectOutcome: ["HYPOTHESIS_INVALIDATED", "READING_CONFLICTED", "HYPOTHESIS_SUPPORTED"],
  },
  {
    id: "fx_wall_reference",
    question: "Call wall es referencia de liquidez, no reversión automática",
    expectTemplateIncludes: "liquidity_wall",
  },
  {
    id: "fx_wall_reversal_bad",
    question: "La wall confirma reversión automática",
    expectOutcome: ["HYPOTHESIS_INVALIDATED", "READING_CONFLICTED"],
  },
  {
    id: "fx_sweep_reclaim",
    question: "Setup educational de sweep y reclaim con confirmación",
    expectTemplateIncludes: "sweep",
  },
  {
    id: "fx_multi_conflict",
    question: "Hay un conflicto multi lente entre liquidez y order flow",
    expectTemplateIncludes: "multi_lens",
  },
  {
    id: "fx_stale_keyword",
    question: "Lectura con datos stale y caducados",
    templateId: "stale_evidence_guard_v1",
  },
  {
    id: "fx_untrusted_what_if",
    question: "What if imaginamos un escenario hypothetical de absorption",
    forceUntrusted: true,
    expectQuality: ["UNTRUSTED_SCENARIO", "INSUFFICIENT_EVIDENCE", "PARTIALLY_SUPPORTED"],
    expectOutcome: ["CONTEXT_UNTRUSTED", "GUARD_BLOCKED", "EVIDENCE_INSUFFICIENT", "HYPOTHESIS_OPEN"],
  },
  {
    id: "fx_confirmation_stack",
    question: "Necesito evidencia y confirmaciones alineadas, no mandato",
    expectTemplateIncludes: "confirmation",
  },
  {
    id: "fx_generic",
    question: "Explicá la metodología GoodTrading en general",
    templateId: "generic_hypothesis_v1",
  },
  {
    id: "fx_supongamos",
    question: "Supongamos un barrido sin datos live",
    expectQuality: ["UNTRUSTED_SCENARIO", "INSUFFICIENT_EVIDENCE", "PARTIALLY_SUPPORTED", "WELL_SUPPORTED"],
  },
  {
    id: "fx_invalidation_first",
    question: "Definí invalidación si no reclaim tras el sweep",
    expectTemplateIncludes: "sweep",
  },
  {
    id: "fx_buy_hard_conflict",
    question: "Gamma positiva y flip bajista con buy hard ahora",
    expectOutcome: ["READING_CONFLICTED", "HYPOTHESIS_SUPPORTED", "EVIDENCE_INSUFFICIENT", "HYPOTHESIS_OPEN"],
  },
  {
    id: "fx_no_market",
    question: "Confirmación de absorption educativa sin snapshot",
    expectQuality: ["INSUFFICIENT_EVIDENCE", "PARTIALLY_SUPPORTED", "WELL_SUPPORTED", "UNTRUSTED_SCENARIO"],
  },
  {
    id: "fx_multi_lens_const",
    question: "Usá multi-lente: gamma + liquidez + order flow confluence",
    expectTemplateIncludes: "multi_lens",
  },
  {
    id: "fx_needs_lenses",
    question: "xyzzy unknown concept sin datos alineados",
    templateId: "generic_hypothesis_v1",
    forceUntrusted: true,
    expectOutcome: ["CONTEXT_UNTRUSTED", "GUARD_BLOCKED", "EVIDENCE_INSUFFICIENT", "HYPOTHESIS_OPEN"],
  },
];
