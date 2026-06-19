/**
 * Normalizes legacy mobile adapter output for deep contract snapshots.
 * Strips volatile timestamps while preserving structural shape.
 */
export function normalizeLegacyMobileContract(state: Record<string, unknown>): Record<string, unknown> {
  const copy = structuredClone(state) as Record<string, unknown>;

  const meta = copy.meta as Record<string, unknown> | undefined;
  if (meta) {
    if (typeof meta.timestamp === "number") meta.timestamp = 0;
    if (typeof meta.lastUpdated === "number") meta.lastUpdated = 0;
  }

  const alerts = copy.alerts as Array<Record<string, unknown>> | undefined;
  if (Array.isArray(alerts)) {
    for (const alert of alerts) {
      if (typeof alert.timestamp === "number") alert.timestamp = 0;
    }
  }

  return copy;
}

export function legacyContractShape(state: Record<string, unknown>): Record<string, unknown> {
  const market = state.market as Record<string, unknown>;
  const bias = state.bias as Record<string, unknown>;
  const risk = state.risk as Record<string, unknown>;
  const levels = state.levels as Record<string, unknown>;
  const meta = state.meta as Record<string, unknown>;
  const scenarios = state.scenarios as unknown[];
  const alerts = state.alerts as unknown[];

  return {
    topLevelKeys: Object.keys(state).sort(),
    marketKeys: Object.keys(market).sort(),
    marketModeKeys: Object.keys(market.marketMode as Record<string, unknown>).sort(),
    transitionZoneKeys: Object.keys(market.transitionZone as Record<string, unknown>).sort(),
    biasKeys: Object.keys(bias).sort(),
    riskKeys: Object.keys(risk).sort(),
    levelsKeys: Object.keys(levels).sort(),
    shortGammaPocketKeys: Object.keys(levels.shortGammaPocket as Record<string, unknown>).sort(),
    metaKeys: Object.keys(meta).sort(),
    scenarioItemKeys:
      scenarios.length > 0 ? Object.keys(scenarios[0] as Record<string, unknown>).sort() : [],
    alertItemKeys: alerts.length > 0 ? Object.keys(alerts[0] as Record<string, unknown>).sort() : [],
    scenarioCount: scenarios.length,
    alertCount: alerts.length,
    gammaRegime: market.gammaRegime,
    biasType: bias.type,
    riskCascade: risk.cascadeRisk,
    volatilityState: risk.volatilityState,
    dataSource: meta.dataSource,
    tickerStatus: meta.tickerStatus,
  };
}
