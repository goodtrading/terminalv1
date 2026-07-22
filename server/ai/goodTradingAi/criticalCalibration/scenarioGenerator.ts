import {
  ALL_EVIDENCE_LENSES,
  type EvidenceLens,
  type LensPolarity,
  type LensState,
  type LensStrength,
  syntheticScenarioSchema,
  type SyntheticScenario,
} from "@shared/goodTradingAiCriticalCalibration";
import { ALL_LENSES, getLensMeta, lensNarrativeFragment } from "./lenses";
import { mulberry32, seedToInt } from "./prng";

const STRENGTHS: LensStrength[] = ["ABSENT", "WEAK", "MODERATE", "STRONG"];
const POLARITIES: LensPolarity[] = ["NEUTRAL", "SUPPORTIVE", "WEAKENING", "INVALIDATING", "CONFLICTING"];

export function estimateScenarioCapacity(): number {
  const n = ALL_EVIDENCE_LENSES.length;
  const perLens = STRENGTHS.length * POLARITIES.length;
  const combos = n * (n - 1) * (n - 2) * perLens * perLens * perLens;
  return Math.max(1000, combos);
}

function pick<T>(rng: () => number, arr: T[]): T {
  return arr[Math.floor(rng() * arr.length)]!;
}

function decodeIndex(index: number): { a: number; b: number; c: number; s: number; p: number; x: number } {
  const n = ALL_EVIDENCE_LENSES.length;
  const perLens = STRENGTHS.length * POLARITIES.length;
  const block = n * (n - 1) * (n - 2) * perLens * perLens * perLens;
  const rem = index % block;
  const x = Math.floor(rem / (n * (n - 1) * (n - 2) * perLens * perLens * perLens));
  let r = rem % (n * (n - 1) * (n - 2) * perLens * perLens * perLens);
  const c = r % n; r = Math.floor(r / n);
  const b = r % (n - 1); r = Math.floor(r / (n - 1));
  const a = r % (n - 1); r = Math.floor(r / (n - 1));
  const s = r % STRENGTHS.length;
  const p = Math.floor(r / STRENGTHS.length) % POLARITIES.length;
  return { a, b, c, s, p, x };
}

function buildLens(lens: EvidenceLens, strength: LensStrength, polarity: LensPolarity): LensState {
  return { lens, strength, polarity, note: lensNarrativeFragment(lens) };
}

function buildNarrative(lenses: LensState[], index: number): string {
  const parts = lenses.map((l) => {
    const meta = getLensMeta(l.lens);
    return `${meta.label}(${l.strength}/${l.polarity})`;
  });
  return `Escenario sintetico Brain #${index}: ${parts.join("; ")}. Metodologia educativa GoodTrading — sin datos de mercado real.`;
}

export function generateScenarios(input: { count: number; seed: string; nowMs?: number }): SyntheticScenario[] {
  const count = Math.max(1, Math.min(input.count, 5000));
  const baseSeed = seedToInt(input.seed);
  const nowMs = input.nowMs ?? Date.now();
  const seen = new Set<string>();
  const out: SyntheticScenario[] = [];
  const n = ALL_EVIDENCE_LENSES.length;
  for (let i = 0; i < count * 2 && out.length < count; i++) {
    const rng = mulberry32(baseSeed + i * 9973);
    const idx = Math.floor(rng() * estimateScenarioCapacity());
    const { a, b, c, s, p } = decodeIndex(idx);
    const lensA = ALL_EVIDENCE_LENSES[(a + 1) % n]!;
    const lensB = ALL_EVIDENCE_LENSES[(b + a + 2) % n]!;
    const lensC = ALL_EVIDENCE_LENSES[(c + b + 3) % n]!;
    const strength = STRENGTHS[s]!;
    const polarity = POLARITIES[p]!;
    const extraCount = 1 + Math.floor(rng() * 3);
    const lenses: LensState[] = [
      buildLens(lensA, strength, polarity),
      buildLens(lensB, pick(rng, STRENGTHS), pick(rng, POLARITIES)),
      buildLens(lensC, pick(rng, STRENGTHS), pick(rng, POLARITIES)),
    ];
    for (let e = 0; e < extraCount; e++) {
      const lens = ALL_EVIDENCE_LENSES[Math.floor(rng() * n)]!;
      if (!lenses.some((x) => x.lens === lens)) {
        lenses.push(buildLens(lens, pick(rng, STRENGTHS), pick(rng, POLARITIES)));
      }
    }
    const id = `cc_${input.seed}_${idx}_${i}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const scenario = syntheticScenarioSchema.parse({
      id,
      seed: input.seed,
      source: "SYNTHETIC_BRAIN_STRUCTURE",
      realMarketData: false,
      lenses,
      narrative: buildNarrative(lenses, idx),
      createdAtMs: nowMs,
      mentorEligible: false,
    });
    out.push(scenario);
  }
  return out;
}

export function scenarioToDecisionQuestion(scenario: SyntheticScenario): string {
  const lensText = scenario.lenses
    .map((l) => `${getLensMeta(l.lens).label}: ${l.strength} ${l.polarity}`)
    .join(". ");
  return `${scenario.narrative} Pregunta metodologica: como evaluarias este contexto sintetico? Lentes: ${lensText}`;
}
