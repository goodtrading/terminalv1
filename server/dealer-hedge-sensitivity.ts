import type { DealerHedgeSensitivity } from "@shared/schema";

export type DealerHedgeSensitivitySource = DealerHedgeSensitivity["source"];

export type DealerHedgeSensitivityInput = {
  source?: "LIVE_DERIBIT" | "BOOTSTRAP";
  totalGex?: number | null;
  liveVannaExposure?: number | null;
  liveVannaGrossAbsExposure?: number | null;
  liveVannaDirectionalRatio?: number | null;
  liveVannaValidRows?: number | null;
  liveVannaTotalEligibleRows?: number | null;
  liveCharmExposure?: number | null;
  liveCharmGrossAbsExposure?: number | null;
  liveCharmDirectionalRatio?: number | null;
  liveCharmValidRows?: number | null;
  liveCharmTotalEligibleRows?: number | null;
};

function finiteOrNull(value: number | null | undefined): number | null {
  return value != null && Number.isFinite(value) ? value : null;
}

function inferSource(input: DealerHedgeSensitivityInput, gammaUsdPerDollar: number | null): DealerHedgeSensitivitySource {
  if (input.source === "LIVE_DERIBIT") return "LIVE_DERIBIT";
  if (input.source === "BOOTSTRAP") return "BOOTSTRAP";

  if (gammaUsdPerDollar == null) return "NO_DATA";
  return "BOOTSTRAP";
}

export function buildDealerHedgeSensitivity(input: DealerHedgeSensitivityInput): DealerHedgeSensitivity {
  const gammaUsdPerDollar = finiteOrNull(input.totalGex);
  const source = inferSource(input, gammaUsdPerDollar);

  return {
    gammaUsdPerDollar,
    vannaUsdPerVolPoint: finiteOrNull(input.liveVannaExposure),
    vannaGrossAbsUsdPerVolPoint: finiteOrNull(input.liveVannaGrossAbsExposure),
    vannaDirectionalRatio: finiteOrNull(input.liveVannaDirectionalRatio),
    charmUsdPerDay: finiteOrNull(input.liveCharmExposure),
    charmGrossAbsUsdPerDay: finiteOrNull(input.liveCharmGrossAbsExposure),
    charmDirectionalRatio: finiteOrNull(input.liveCharmDirectionalRatio),
    vannaValidRows: finiteOrNull(input.liveVannaValidRows),
    vannaTotalEligibleRows: finiteOrNull(input.liveVannaTotalEligibleRows),
    charmValidRows: finiteOrNull(input.liveCharmValidRows),
    charmTotalEligibleRows: finiteOrNull(input.liveCharmTotalEligibleRows),
    source,
  };
}
