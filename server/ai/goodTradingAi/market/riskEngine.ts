import type { ConfluenceSnapshot, RiskItem } from "@shared/goodTradingAiMarket";
import type { MarketProviderBundle } from "./snapshotContracts";

/**
 * Risk engine — methodological risks only (never position sizing advice).
 */
export function computeRisks(
  bundle: MarketProviderBundle,
  confluence: ConfluenceSnapshot,
): RiskItem[] {
  const risks: RiskItem[] = [];

  if (confluence.conflictingProviders.length >= 2) {
    risks.push({
      code: "LENS_CONFLICT",
      severity: confluence.conflictingProviders.length >= 3 ? "high" : "medium",
      message:
        "Hay tensión entre lentes (p.ej. gamma vs order flow). No forzar lectura direccional única.",
      relatedProviders: confluence.conflictingProviders.slice(0, 8),
    });
  }

  if (bundle.liquidity?.tags?.spoofingHypothesis === "possible" || bundle.liquidity?.tags?.spoofingHypothesis === "likely") {
    risks.push({
      code: "SPOOFING_HYPOTHESIS",
      severity: bundle.liquidity.tags.spoofingHypothesis === "likely" ? "high" : "medium",
      message: "Hipótesis de spoofing/pulling: walls no son confirmación de reversión.",
      relatedProviders: ["liquidity"],
    });
  }

  if (bundle.liquidity?.tags?.wallIntegrity === "pulling") {
    risks.push({
      code: "WALL_PULLING",
      severity: "medium",
      message: "Integridad de wall degradada (pulling) — baja confiabilidad de la referencia.",
      relatedProviders: ["liquidity"],
    });
  }

  if (bundle.gamma && bundle.orderFlow) {
    const g = bundle.gamma.direction;
    const o = bundle.orderFlow.direction;
    if ((g === "bullish" && o === "bearish") || (g === "bearish" && o === "bullish")) {
      risks.push({
        code: "GAMMA_OF_DIVERGENCE",
        severity: "high",
        message:
          "Divergencia régimen gamma vs order flow. El régimen no autoriza entrada; validar acceptance.",
        relatedProviders: ["gamma", "orderFlow"],
      });
    }
  }

  if (bundle.openInterest?.tags?.withPrice === "divergent") {
    risks.push({
      code: "OI_PRICE_DIVERGENCE",
      severity: "medium",
      message: "OI y precio no alineados — OI solo no implica dirección.",
      relatedProviders: ["openInterest"],
    });
  }

  const thin =
    [bundle.gamma, bundle.orderFlow, bundle.liquidity, bundle.marketStructure].filter(
      (l) => !l || l.quality === "low" || l.strength === "none" || l.direction === "unknown",
    ).length >= 3;
  if (thin) {
    risks.push({
      code: "THIN_EVIDENCE",
      severity: "high",
      message: "Evidencia delgada o unknown en varias lentes — snapshot de baja calidad educativa.",
      relatedProviders: ["gamma", "orderFlow", "liquidity", "marketStructure"],
    });
  }

  if (bundle.footprint?.tags?.exhaustionHint === "possible" || bundle.footprint?.tags?.exhaustionHint === "likely") {
    risks.push({
      code: "FOOTPRINT_EXHAUSTION",
      severity: "low",
      message: "Hint de exhaustion en footprint — hipótesis, no certeza.",
      relatedProviders: ["footprint"],
    });
  }

  if (confluence.score < 35) {
    risks.push({
      code: "LOW_CONFLUENCE",
      severity: "medium",
      message: "Confluencia baja: evitar narrativas fuertes hasta más acceptance/contexto.",
      relatedProviders: confluence.conflictingProviders.slice(0, 4),
    });
  }

  return risks.slice(0, 20);
}

/** Risk score 0–100 (higher = more risk). */
export function riskScore(risks: RiskItem[]): number {
  if (!risks.length) return 15;
  let s = 20;
  for (const r of risks) {
    if (r.severity === "high") s += 18;
    else if (r.severity === "medium") s += 10;
    else s += 4;
  }
  return Math.min(100, s);
}
