import type { TerminalState } from "@/hooks/useTerminalState";
import type { GammaInterpretationBundle } from "@/lib/volatilityGammaInterpretation";
import type { LiquidityInterpretationBundle } from "@/lib/volatilityLiquidityInterpretation";
import { buildGammaInterpretation, hasValidGammaTerminalData } from "@/lib/volatilityGammaInterpretation";

export type VolContextPanelState = {
  sectionTitle: string;
  gammaIntegrated: boolean;
  liquidityIntegrated: boolean;
  volRegime: string;
  candleStructure: string;
  expectedBehavior: string;
  interpretation: string;
  gammaRegime: string;
  localGamma: string;
  globalGamma: string;
  dealerBehavior: string;
  gammaImpact: string;
  nearestGammaLevel: {
    display: string;
    detail: string;
  } | null;
  levelsCompact: string;
  magnetsCompact: string;
  liquidityRegime: string;
  heatmapPressure: string;
  nearestLiquidityLevel: string;
  orderflowConfirmation: string;
  liquidityVolImpact: string;
  liquidityCompact: string;
  flowCompact: string;
};

type CandleVolSlice = {
  volRegime: string;
  candleStructure: string;
  expectedBehavior: string;
  interpretation: string;
};

function formatNearestLevel(
  nearest: GammaInterpretationBundle["nearestLevel"],
): VolContextPanelState["nearestGammaLevel"] {
  if (!nearest) return null;
  const display = `${nearest.type} · ${Math.round(nearest.price).toLocaleString("en-US")} · ${nearest.distancePct.toFixed(2)}% · ${nearest.status}`;
  return {
    display,
    detail: nearest.description,
  };
}

function regimeDisplay(g: GammaInterpretationBundle): string {
  if (g.gammaRegime === "MIXED") return "MIXED / TRANSITION";
  if (g.gammaRegime === "NEAR_FLIP") return "NEAR FLIP";
  return g.gammaRegime.replace(/_/g, " ");
}

function buildSectionTitle(gammaLive: boolean, liquidityLive: boolean): string {
  if (gammaLive && liquidityLive) return "GAMMA / LIQUIDITY / VOL CONTEXT";
  if (gammaLive) return "GAMMA / VOL CONTEXT";
  if (liquidityLive) return "LIQUIDITY / VOL CONTEXT";
  return "VOL CONTEXT";
}

const EMPTY_LIQ = {
  liquidityRegime: "—",
  heatmapPressure: "—",
  nearestLiquidityLevel: "—",
  orderflowConfirmation: "—",
  liquidityVolImpact: "—",
  liquidityCompact: "—",
  flowCompact: "—",
} as const;

/** Merge candle vol context with gamma and liquidity interpretation. */
export function buildVolContextPanelState(
  terminal: TerminalState | undefined,
  candle: CandleVolSlice,
  gammaInput?: GammaInterpretationBundle,
  liquidityInput?: LiquidityInterpretationBundle,
): VolContextPanelState {
  const gamma =
    gammaInput ??
    (hasValidGammaTerminalData(terminal)
      ? buildGammaInterpretation(terminal, undefined)
      : null);

  const gammaLive = gamma?.gammaIntegrated === true;
  const liquidityLive = liquidityInput?.liquidityIntegrated === true;
  const sectionTitle = buildSectionTitle(gammaLive, liquidityLive);

  const baseExpected = candle.expectedBehavior;

  if (!gammaLive && !liquidityLive) {
    return {
      sectionTitle,
      gammaIntegrated: false,
      liquidityIntegrated: false,
      volRegime: candle.volRegime,
      candleStructure: candle.candleStructure,
      expectedBehavior: baseExpected,
      interpretation: candle.interpretation,
      gammaRegime: "—",
      localGamma: "—",
      globalGamma: "—",
      dealerBehavior: "—",
      gammaImpact: "—",
      nearestGammaLevel: null,
      levelsCompact: "—",
      magnetsCompact: "—",
      ...EMPTY_LIQ,
    };
  }

  let expectedBehavior = baseExpected;
  if (gammaLive && gamma) {
    expectedBehavior =
      gamma.gammaRegime === "MIXED" || gamma.gammaRegime === "NEAR_FLIP"
        ? "Accepted moves can accelerate locally; extremes may reject or mean-revert globally."
        : gamma.gammaRegime === "SHORT_GAMMA"
          ? "Expansion and continuation favored on acceptance; fades need absorption."
          : gamma.gammaRegime === "LONG_GAMMA"
            ? "Mean-reversion and damping favored at extremes unless acceptance is strong."
            : baseExpected;
  }
  if (liquidityLive && liquidityInput) {
    if (liquidityInput.liquidityRegime === "ABSORPTION_ACTIVE") {
      expectedBehavior =
        "Absorption can stall continuation; wait for reclaim or failed follow-through.";
    } else if (
      liquidityInput.liquidityRegime === "THIN_LIQUIDITY" ||
      liquidityInput.liquidityVolImpact === "EXPANSION_PATH"
    ) {
      expectedBehavior =
        "Accepted breaks through thin zones can accelerate; manage late-entry risk.";
    } else if (liquidityInput.liquidityRegime === "PINNED") {
      expectedBehavior =
        "Price may compress near magnets/walls until displacement or sweep resolution.";
    }
  }

  const interpretation = [
    gammaLive && gamma ? gamma.gammaInterpretation : "",
    liquidityLive && liquidityInput?.liquidityReasons.length
      ? liquidityInput.liquidityReasons.join(" ")
      : "",
  ]
    .filter(Boolean)
    .join(" ")
    .trim() || candle.interpretation;

  const nearestLiq = liquidityInput?.nearestLiquidityLevel;
  const nearestLiquidityDisplay = nearestLiq
    ? nearestLiq.type === "NONE"
      ? nearestLiq.description
      : `${nearestLiq.type.replace(/_/g, " ")} · ${nearestLiq.description}`
    : "—";

  return {
    sectionTitle,
    gammaIntegrated: gammaLive,
    liquidityIntegrated: liquidityLive,
    volRegime: candle.volRegime,
    candleStructure: candle.candleStructure,
    expectedBehavior,
    interpretation,
    gammaRegime: gammaLive && gamma ? regimeDisplay(gamma) : "—",
    localGamma: gammaLive && gamma ? gamma.localGammaRaw : "—",
    globalGamma: gammaLive && gamma ? gamma.globalGammaRaw : "—",
    dealerBehavior: gammaLive && gamma ? gamma.dealerBehavior : "—",
    gammaImpact: gammaLive && gamma ? gamma.gammaVolImpact : "—",
    nearestGammaLevel: gammaLive && gamma ? formatNearestLevel(gamma.nearestLevel) : null,
    levelsCompact: gammaLive && gamma ? gamma.levelsCompact : "—",
    magnetsCompact: gammaLive && gamma ? gamma.magnetsCompact : "—",
    liquidityRegime:
      liquidityLive && liquidityInput
        ? liquidityInput.liquidityRegime.replace(/_/g, " ")
        : "—",
    heatmapPressure: liquidityLive && liquidityInput ? liquidityInput.heatmapPressure : "—",
    nearestLiquidityLevel: nearestLiquidityDisplay,
    orderflowConfirmation:
      liquidityLive && liquidityInput ? liquidityInput.orderflowConfirmation : "—",
    liquidityVolImpact:
      liquidityLive && liquidityInput
        ? liquidityInput.liquidityVolImpact.replace(/_/g, " ")
        : "—",
    liquidityCompact:
      liquidityLive && liquidityInput ? liquidityInput.liquidityCompact : "—",
    flowCompact: liquidityLive && liquidityInput ? liquidityInput.flowCompact : "—",
  };
}
