import type {
  DealerHedgeSensitivity,
  DealerHedgeState,
  DealerHedgeStressScenario,
  DealerHedgeStructuralPressure,
} from "@shared/schema";

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function normalizeIntensity(
  intensity: DealerHedgeStructuralPressure["intensity"] | "EXTREME" | null | undefined,
): DealerHedgeStructuralPressure["intensity"] {
  if (intensity === "LOW" || intensity === "MEDIUM" || intensity === "HIGH") return intensity;
  if (intensity === "EXTREME") return "HIGH";
  return null;
}

export function buildDealerHedgeState(input: {
  source?: DealerHedgeState["source"];
  sensitivity: DealerHedgeSensitivity;
  standardizedStress: DealerHedgeStressScenario[];
  structuralPressure?: DealerHedgeStructuralPressure | null;
}): DealerHedgeState {
  const sensitivity = input.sensitivity;
  const source = input.source ?? sensitivity.source;

  return {
    source,
    sensitivity,
    standardizedStress: input.standardizedStress,
    structuralPressure: input.structuralPressure
      ? {
          score: finiteOrNull(input.structuralPressure.score),
          bias: input.structuralPressure.bias ?? null,
          intensity: normalizeIntensity(input.structuralPressure.intensity),
          accelerationRisk: input.structuralPressure.accelerationRisk ?? null,
          triggerZone: input.structuralPressure.triggerZone ?? null,
          stressScore: finiteOrNull(input.structuralPressure.stressScore),
        }
      : null,
    metadata: {
      structuralPositioningProxy: true,
      observedDealerFlow: false,
      expectedFlowForecast: false,
    },
  };
}
