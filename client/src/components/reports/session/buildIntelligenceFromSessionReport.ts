import { formatPriceShort } from "./sessionReportLevelUtils";
import type { SessionReportResult } from "./sessionReportTypes";
import { FAR_MAGNET_WARNING } from "./sessionMagnetRules";

export function buildIntelligenceFromSessionReport(
  report: SessionReportResult,
): SessionReportResult["intelligence"] {
  const { spot, regime, structure, risks, snapshot } = report;
  const h = regime.levelHierarchy;
  const decision = h.intradayDecision;
  const active = h.activeTrading;
  const macro = h.macroGravity;
  const usesLiveData = report.dataMode !== "mock" && spot != null;

  const spotStr = spot != null ? formatPriceShort(spot) : "an unknown level";
  const gamma = regime.gammaState !== "Unknown" ? regime.gammaState.toLowerCase() : "unknown gamma";
  const decisionStr =
    decision.price != null ? formatPriceShort(decision.price) : "N/A";
  const activeStr = active.valid && active.price != null ? formatPriceShort(active.price) : "N/A";
  const macroStr = macro.price != null ? formatPriceShort(macro.price) : "N/A";

  const whatHappened = buildWhatHappened(spotStr, gamma, structure.currentLocation, h);
  const whyHappened = buildWhyHappened(report, decisionStr, activeStr, macroStr);
  const bestOpportunity = buildBestOpportunity(snapshot);
  const mainRisk = risks.secondaryRisk
    ? `${risks.primaryRisk} (secondary: ${risks.secondaryRisk})`
    : risks.primaryRisk;
  const tomorrowFocus = buildTomorrowFocus(h, decisionStr, activeStr, macroStr);
  const institutionalTakeaway = buildTakeaway(spotStr, gamma, structure, h, risks);

  return {
    whatHappened,
    whyHappened,
    bestOpportunity,
    mainRisk,
    tomorrowFocus,
    institutionalTakeaway,
    usesLiveData,
  };
}

function buildWhatHappened(
  spotStr: string,
  gamma: string,
  location: string,
  h: SessionReportResult["regime"]["levelHierarchy"],
): string {
  const decision = h.intradayDecision;
  const active = h.activeTrading;
  const macro = h.macroGravity;

  if (spotStr === "an unknown level") {
    return `BTC session structure is in a ${gamma} regime. ${location}. Key levels update as terminal state refreshes.`;
  }

  const parts: string[] = [
    `BTC is trading around ${spotStr} in a ${gamma} regime, currently ${location.toLowerCase()}.`,
  ];

  if (decision.price != null) {
    parts.push(
      `The primary intraday decision level is the ${decision.type.toLowerCase()} near ${formatPriceShort(decision.price)} (${decision.relation}, ${decision.distanceLabel}).`,
    );
  }

  if (active.valid && active.price != null) {
    parts.push(
      `A ${active.direction.toLowerCase()} magnet near ${formatPriceShort(active.price)} (${active.distanceLabel}) may become relevant only if flip rejection confirms.`,
    );
  } else {
    parts.push("No valid active trading magnet is detected inside the intraday range.");
  }

  if (macro.price != null) {
    parts.push(
      `The ${formatPriceShort(macro.price)} gravity level remains macro context only and is ${FAR_MAGNET_WARNING.toLowerCase()}`,
    );
  }

  return parts.join(" ");
}

function buildWhyHappened(
  report: SessionReportResult,
  decisionStr: string,
  activeStr: string,
  macroStr: string,
): string[] {
  const items: string[] = [];
  const gamma = report.regime.gammaState;
  const h = report.regime.levelHierarchy;

  if (gamma !== "Unknown") {
    items.push(
      isShortGammaLabel(gamma)
        ? "Short gamma increases directional sensitivity around liquidity pockets."
        : isLongGammaLabel(gamma)
          ? "Long gamma favors mean reversion and compressed ranges."
          : "Gamma regime shapes dealer hedging behavior.",
    );
  }

  if (h.intradayDecision.price != null) {
    items.push(
      `Intraday decision at ${decisionStr} (${h.intradayDecision.type}) anchors session bias and location.`,
    );
  }

  if (h.activeTrading.valid) {
    items.push(
      `Active trading magnet at ${activeStr} (${h.activeTrading.direction}) — ${h.activeTrading.condition}`,
    );
  }

  if (h.macroGravity.price != null) {
    items.push(
      `Macro gravity at ${macroStr} (${h.macroGravity.distanceLabel}) — ${FAR_MAGNET_WARNING}`,
    );
  }

  const hasVacuum = report.liquidityEvents.some((e) => e.type === "vacuum");
  if (hasVacuum) {
    if (
      report.snapshot.bestEdge === "Vacuum Repricing" &&
      report.snapshot.bestEdgeCondition?.toLowerCase().includes("acceptance above local flip")
    ) {
      items.push(
        "Vacuum repricing is only valid after acceptance above the local flip.",
      );
    } else {
      items.push("Vacuum / thin liquidity increases fast repricing risk.");
    }
  }

  const hasSweep = report.liquidityEvents.some((e) => e.type === "sweep");
  if (hasSweep) {
    items.push("Active sweep signal indicates liquidity probe in progress.");
  }

  if (items.length === 0) {
    items.push("Insufficient live structure to infer detailed drivers — monitoring.");
  }

  return items.slice(0, 5);
}

function buildBestOpportunity(
  snapshot: SessionReportResult["snapshot"],
): string {
  if (snapshot.bestEdge === "No Clear Edge") {
    return "Wait for clearer edge alignment with gamma regime and liquidity structure.";
  }

  if (
    snapshot.bestEdge === "Vacuum Repricing" &&
    snapshot.bestEdgeCondition?.toLowerCase().includes("acceptance above local flip")
  ) {
    const alt = snapshot.alternativeEdge
      ? ` Alternative: ${snapshot.alternativeEdge} if flip rejects.`
      : "";
    return `Vacuum repricing is only valid after acceptance above the local flip.${alt}`;
  }

  const condition = snapshot.bestEdgeCondition
    ? ` Condition: ${snapshot.bestEdgeCondition}`
    : "";
  const alt = snapshot.alternativeEdge
    ? ` Alternative: ${snapshot.alternativeEdge}.`
    : "";
  return `${snapshot.bestEdge}.${condition}${alt}`;
}

function buildTomorrowFocus(
  h: SessionReportResult["regime"]["levelHierarchy"],
  decisionStr: string,
  activeStr: string,
  macroStr: string,
): string[] {
  const items: string[] = [
    "Do not chase first displacement without confirmation.",
  ];

  if (h.intradayDecision.price != null) {
    items.push(
      `Monitor local flip acceptance/rejection near ${decisionStr} (${h.intradayDecision.relation}).`,
    );
  }

  if (h.activeTrading.valid && h.activeTrading.price != null) {
    items.push(
      `Treat ${activeStr} as ${h.activeTrading.direction.toLowerCase()} magnet only if rejection confirms.`,
    );
  }

  if (h.macroGravity.price != null) {
    items.push(`Do not use ${macroStr} as intraday target.`);
  }

  items.push("Reduce size while price remains inside transition zone.");

  return items;
}

function isShortGammaLabel(g: string): boolean {
  return g.toLowerCase().includes("short");
}

function isLongGammaLabel(g: string): boolean {
  return g.toLowerCase().includes("long");
}

function buildTakeaway(
  spotStr: string,
  gamma: string,
  structure: SessionReportResult["structure"],
  h: SessionReportResult["regime"]["levelHierarchy"],
  risks: SessionReportResult["risks"],
): string {
  const riskLine = risks.secondaryRisk
    ? `Primary risk is ${risks.primaryRisk.toLowerCase()}, while ${risks.secondaryRisk.toLowerCase()} remains the key secondary risk.`
    : `Primary risk is ${risks.primaryRisk.toLowerCase()}.`;

  const decisionStr =
    h.intradayDecision.price != null ? formatPriceShort(h.intradayDecision.price) : "N/A";

  if (spotStr !== "an unknown level" && decisionStr !== "N/A") {
    return `Market structure around ${spotStr} favors reactive behavior in a ${gamma} regime centered on intraday decision ${decisionStr}. ${structure.marketBehavior}. ${riskLine}`;
  }

  return `Session reflects a ${gamma} environment. ${structure.marketBehavior}. ${riskLine}`;
}
