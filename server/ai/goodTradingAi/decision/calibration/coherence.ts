/**
 * AI-7.1 — Reasoning ↔ Decision coherence matrix (labels only, no live chat).
 */
export type CoherenceCell = {
  reasoningSignal: string;
  decisionExpect: string;
  aligned: boolean;
};

/** Static matrix: AI-4 reasoning roles vs Decision Graph outcomes. */
export const REASONING_DECISION_COHERENCE_MATRIX: CoherenceCell[] = [
  { reasoningSignal: "hypothesis", decisionExpect: "HYPOTHESIS_OPEN|SUPPORTED", aligned: true },
  { reasoningSignal: "confirmation", decisionExpect: "confirmations present or INSUFFICIENT", aligned: true },
  { reasoningSignal: "invalidates", decisionExpect: "HYPOTHESIS_INVALIDATED when fired", aligned: true },
  { reasoningSignal: "contradicts", decisionExpect: "READING_CONFLICTED or conflictCodes", aligned: true },
  { reasoningSignal: "conclusion", decisionExpect: "CONCLUSION node / path outcome", aligned: true },
  { reasoningSignal: "no_buy_sell_in_reasoning", decisionExpect: "no trading outcomes in graph", aligned: true },
  { reasoningSignal: "mentorEligible_false", decisionExpect: "mentorEligible false", aligned: true },
  { reasoningSignal: "scenario_analysis", decisionExpect: "UNTRUSTED or SYNTHETIC trust possible", aligned: true },
  { reasoningSignal: "typed_contradiction", decisionExpect: "conflict engine reuse", aligned: true },
  { reasoningSignal: "wall_not_reversal", decisionExpect: "WALL template invalidation", aligned: true },
  { reasoningSignal: "gamma_anti_binary", decisionExpect: "GAMMA invalidation", aligned: true },
  { reasoningSignal: "absorption_central", decisionExpect: "ABSORPTION template", aligned: true },
];

export function coherenceMatrixAllAligned(): boolean {
  return REASONING_DECISION_COHERENCE_MATRIX.every((c) => c.aligned);
}
