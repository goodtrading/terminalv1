import type { SessionReportRisks, SessionLevelHierarchy } from "./sessionReportTypes";
import { formatPriceShort } from "./sessionReportLevelUtils";
import { isLongGamma, isShortGamma } from "./sessionReportGammaUtils";

export function buildSessionResolution(input: {
  spot: number | null;
  gammaLabel: string;
  currentLocation: string;
  hierarchy: SessionLevelHierarchy;
  risks: SessionReportRisks;
  vacuumActive: boolean;
}): string {
  const { spot, gammaLabel, currentLocation, hierarchy, risks, vacuumActive } = input;
  const decision = hierarchy.intradayDecision;
  const active = hierarchy.activeTrading;
  const macro = hierarchy.macroGravity;

  const parts: string[] = [];

  if (spot != null) {
    parts.push(`BTC is trading near ${formatPriceShort(spot)}`);
  } else {
    parts.push("BTC session structure is updating");
  }

  if (gammaLabel !== "Unknown") {
    parts.push(`in a ${gammaLabel.toLowerCase()} regime`);
  }

  if (decision.price != null) {
    parts.push(
      `with intraday decision at ${formatPriceShort(decision.price)} (${decision.type}, ${decision.levelStatus.toLowerCase()})`,
    );
  }

  if (active.valid && active.price != null) {
    parts.push(
      `Active trading magnet at ${formatPriceShort(active.price)} (${active.direction}, ${active.distanceLabel}) — ${active.condition}`,
    );
  }

  if (macro.price != null) {
    parts.push(
      `Macro gravity at ${formatPriceShort(macro.price)} (${macro.distanceLabel}) is context only, not an intraday target`,
    );
  }

  if (currentLocation !== "Unknown location") {
    parts.push(`Current structure: ${currentLocation.toLowerCase()}`);
  }

  if (isShortGamma(gammaLabel)) {
    parts.push("Directional sensitivity remains elevated around liquidity pockets");
  } else if (isLongGamma(gammaLabel)) {
    parts.push("Mean reversion and compression dynamics dominate");
  }

  const primary = risks.primaryRisk.toLowerCase();
  if (risks.secondaryRisk) {
    const secondary = risks.secondaryRisk.toLowerCase();
    const flipNote =
      hierarchy.localFlip != null ? ` near ${formatPriceShort(hierarchy.localFlip)}` : "";
    parts.push(
      `Primary risk is ${primary}${vacuumActive ? " due to vacuum conditions" : ""}, while ${secondary} remains the key secondary risk${flipNote}`,
    );
  } else {
    parts.push(`Primary risk is ${primary}`);
  }

  if (decision.price != null && decision.type === "Local Flip") {
    parts.push(
      "Acceptance above the flip shifts risk toward upside repricing; rejection keeps rotation toward downside magnets in play",
    );
  }

  return parts.join(". ").replace(/\.\s*\./g, ".").replace(/\s+/g, " ").trim() + ".";
}
