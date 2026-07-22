import {
  MUTATION_KINDS,
  type MutationKind,
  syntheticScenarioSchema,
  type SyntheticScenario,
} from "@shared/goodTradingAiCriticalCalibration";
import type { LensState } from "@shared/goodTradingAiCriticalCalibration";

function cloneLenses(lenses: LensState[]): LensState[] {
  return lenses.map((l) => ({ ...l }));
}

function findLens(lenses: LensState[], lens: LensState["lens"]): number {
  return lenses.findIndex((l) => l.lens === lens);
}

function suffix(kind: MutationKind): string {
  return kind.toLowerCase().replace(/_/g, "-");
}

export function applyMutation(scenario: SyntheticScenario, kind: MutationKind): SyntheticScenario {
  const lenses = cloneLenses(scenario.lenses);
  switch (kind) {
    case "INVERT_GAMMA": {
      const i = findLens(lenses, "GAMMA");
      if (i >= 0) lenses[i] = { ...lenses[i]!, polarity: lenses[i]!.polarity === "SUPPORTIVE" ? "INVALIDATING" : "SUPPORTIVE" };
      break;
    }
    case "REMOVE_ABSORPTION":
      lenses.splice(findLens(lenses, "ABSORPTION"), 1);
      break;
    case "FLIP_STALE": {
      const i = findLens(lenses, "STALENESS");
      if (i >= 0) lenses[i] = { ...lenses[i]!, strength: "STRONG", polarity: "WEAKENING" };
      else lenses.push({ lens: "STALENESS", strength: "STRONG", polarity: "WEAKENING" });
      break;
    }
    case "DEALER_NEUTRAL": {
      const i = findLens(lenses, "DEALER");
      if (i >= 0) lenses[i] = { ...lenses[i]!, polarity: "NEUTRAL", strength: "MODERATE" };
      break;
    }
    case "WALL_REMOVED": {
      const i = findLens(lenses, "LIQUIDITY");
      if (i >= 0) lenses[i] = { ...lenses[i]!, strength: "ABSENT", polarity: "NEUTRAL" };
      break;
    }
    case "WALL_ACCEPTED": {
      const i = findLens(lenses, "ACCEPTANCE");
      if (i >= 0) lenses[i] = { ...lenses[i]!, strength: "STRONG", polarity: "SUPPORTIVE" };
      else lenses.push({ lens: "ACCEPTANCE", strength: "STRONG", polarity: "SUPPORTIVE" });
      break;
    }
    case "OI_DISAPPEARS":
      lenses.splice(findLens(lenses, "OI"), 1);
      break;
    case "CVD_INVERTED": {
      const i = findLens(lenses, "CVD");
      if (i >= 0) lenses[i] = { ...lenses[i]!, polarity: lenses[i]!.polarity === "SUPPORTIVE" ? "CONFLICTING" : "SUPPORTIVE" };
      break;
    }
    case "INJECT_CONFLICT":
      lenses.push({ lens: "CONFLICTS", strength: "STRONG", polarity: "CONFLICTING" });
      break;
    case "ADD_NOISE":
      lenses.push({ lens: "DATA_QUALITY", strength: "WEAK", polarity: "NEUTRAL", note: "ruido sintetico" });
      break;
    case "MISSING_EVIDENCE":
      return syntheticScenarioSchema.parse({
        ...scenario,
        id: `${scenario.id}__${suffix(kind)}`,
        lenses: lenses.filter((l) => l.strength !== "STRONG"),
        mutationApplied: kind,
        parentScenarioId: scenario.id,
        narrative: scenario.narrative + " [evidencia fuerte removida]",
        createdAtMs: Date.now(),
      });
    case "PARTIAL_EVIDENCE":
      for (const l of lenses) if (l.strength === "STRONG") l.strength = "MODERATE";
      break;
    case "STRENGTHEN_INVALIDATION": {
      const i = findLens(lenses, "INVALIDATION");
      if (i >= 0) lenses[i] = { ...lenses[i]!, strength: "STRONG", polarity: "INVALIDATING" };
      else lenses.push({ lens: "INVALIDATION", strength: "STRONG", polarity: "INVALIDATING" });
      break;
    }
    case "WEAKEN_CONFIRMATION":
      for (const l of lenses) if (l.polarity === "SUPPORTIVE") l.strength = "WEAK";
      break;
  }
  return syntheticScenarioSchema.parse({
    ...scenario,
    id: `${scenario.id}__${suffix(kind)}`,
    lenses: lenses.length ? lenses : [{ lens: "DATA_QUALITY", strength: "WEAK", polarity: "NEUTRAL" }],
    mutationApplied: kind,
    parentScenarioId: scenario.id,
    narrative: scenario.narrative + ` [mutacion ${kind}]`,
    createdAtMs: Date.now(),
  });
}

export function mutateAll(scenario: SyntheticScenario): SyntheticScenario[] {
  return MUTATION_KINDS.map((kind) => applyMutation(scenario, kind));
}
