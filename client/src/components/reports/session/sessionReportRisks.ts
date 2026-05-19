import { isLongGamma, isShortGamma } from "./sessionReportGammaUtils";
import { isNear } from "./sessionReportLevelUtils";

export type RiskInput = {
  gammaLabel: string;
  spot: number | null;
  localFlip: number | null;
  magnet: number | null;
  vacuumActive: boolean;
};

export function inferSessionRisks(input: RiskInput): {
  primaryRisk: string;
  secondaryRisk: string | null;
} {
  const { gammaLabel, spot, localFlip, magnet, vacuumActive } = input;

  let primaryRisk = "Signal Conflict";
  let secondaryRisk: string | null = null;

  const nearFlip =
    spot != null && localFlip != null && isNear(spot, localFlip, 0.4);
  const nearMagnet =
    spot != null && magnet != null && isNear(spot, magnet, 0.45);

  if (vacuumActive) {
    primaryRisk = "Fast Repricing";
    if (nearFlip) secondaryRisk = "Flip Acceptance";
    else if (nearMagnet) secondaryRisk = "Magnet Rotation";
    else if (isShortGamma(gammaLabel)) secondaryRisk = "Expansion Volatility";
  } else if (isShortGamma(gammaLabel)) {
    primaryRisk = "Expansion Volatility";
    if (nearFlip) secondaryRisk = "Flip Acceptance";
    else if (nearMagnet) secondaryRisk = "Magnet Rotation";
  } else if (isLongGamma(gammaLabel)) {
    primaryRisk = "Compression / Chop";
    if (nearFlip) secondaryRisk = "Flip Acceptance";
    else if (nearMagnet) secondaryRisk = "Magnet Rotation";
  } else if (nearFlip) {
    primaryRisk = "Flip Acceptance";
    if (nearMagnet) secondaryRisk = "Magnet Rotation";
  } else if (nearMagnet) {
    primaryRisk = "Magnet Rotation";
  }

  return { primaryRisk, secondaryRisk };
}
