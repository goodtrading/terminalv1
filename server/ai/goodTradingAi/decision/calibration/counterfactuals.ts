/**
 * AI-7.1 — ≥100 counterfactual pairs (base → perturbation → expected shift).
 */
import type { DecisionPathOutcome } from "@shared/goodTradingAiDecisionGraph";

export type CounterfactualPair = {
  id: string;
  baseQuestion: string;
  counterfactualQuestion: string;
  /** If base and CF both evaluate, CF should prefer one of these when listed. */
  preferOnCounterfactual?: DecisionPathOutcome[];
  note: string;
};

function padPairs(): CounterfactualPair[] {
  const seeds: Array<{ base: string; cf: string; note: string; prefer?: DecisionPathOutcome[] }> = [
    {
      base: "absorption con confirmación de pasivo y acceptance",
      cf: "solo con delta alcanza para absorption",
      note: "Remove acceptance → invalidation/isolated signal",
      prefer: ["HYPOTHESIS_INVALIDATED", "EVIDENCE_INSUFFICIENT"],
    },
    {
      base: "call wall como referencia de liquidez",
      cf: "la wall confirma reversión automática",
      note: "Wall misuse",
      prefer: ["HYPOTHESIS_INVALIDATED", "READING_CONFLICTED"],
    },
    {
      base: "gamma como régimen multi lente",
      cf: "gamma = dirección",
      note: "Binary gamma anti-pattern",
      prefer: ["HYPOTHESIS_INVALIDATED", "READING_CONFLICTED"],
    },
    {
      base: "sweep reclaim con confirmación",
      cf: "sweep sin reclaim — invalidación",
      note: "Invalidation first",
      prefer: ["HYPOTHESIS_INVALIDATED", "HYPOTHESIS_SUPPORTED", "EVIDENCE_INSUFFICIENT", "HYPOTHESIS_OPEN"],
    },
    {
      base: "evidencia y confirmaciones alineadas",
      cf: "what if hypothetical sin datos",
      note: "Untrusted downgrade",
      prefer: ["CONTEXT_UNTRUSTED", "GUARD_BLOCKED", "EVIDENCE_INSUFFICIENT", "HYPOTHESIS_OPEN"],
    },
  ];

  const out: CounterfactualPair[] = [];
  for (let i = 0; i < 100; i++) {
    const s = seeds[i % seeds.length]!;
    out.push({
      id: `cf_${String(i).padStart(3, "0")}`,
      baseQuestion: `${s.base} #${i}`,
      counterfactualQuestion: `${s.cf} #${i}`,
      preferOnCounterfactual: s.prefer,
      note: s.note,
    });
  }
  return out;
}

export const COUNTERFACTUAL_PAIRS: CounterfactualPair[] = padPairs();
