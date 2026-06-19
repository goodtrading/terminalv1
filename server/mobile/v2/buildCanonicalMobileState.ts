import { randomUUID } from "node:crypto";
import type { TerminalState } from "../../terminal-state";
import type {
  AssetBlock,
  CanonicalMobileSnapshot,
  DataStatus,
  MarketMode,
  ProjectedMobileMarketState,
  SupportedAsset,
} from "./mobileMarketStateV2.types";
import {
  MOBILE_V2_MODEL_VERSION,
  MOBILE_V2_SCHEMA_VERSION,
} from "./mobileMarketStateV2.types";
import { buildMacroContext } from "./buildMacroContext";
import { buildMicroContext, buildStructuredAlerts } from "./buildMicroContext";
import { countUnclassifiedScenarios } from "./buildScenarios";
import {
  buildMicroMacroRelationship,
  notRequestedRelationship,
} from "./buildMicroMacroRelationship";
import {
  latestScenarioTimestampMs,
  optionsFreshness,
  scenariosFreshness,
  sumScenarioProbabilities,
  tickerFreshness,
  valueAvailable,
} from "./mobileMarketStateQuality";

function buildAsset(ts: TerminalState, asset: SupportedAsset): AssetBlock {
  const spot = ts.ticker?.price ?? (ts.options as { spot?: number } | undefined)?.spot ?? null;
  const tickerTs = ts.ticker?.timestamp ?? null;
  const tickerAge =
    tickerTs != null && Number.isFinite(tickerTs) ? Math.max(0, Date.now() - tickerTs) : null;

  return {
    symbol: asset,
    pair: `${asset}-USD`,
    spot: valueAvailable(
      spot != null && Number.isFinite(spot) && spot > 0 ? spot : null,
    ),
    spotSource: valueAvailable(ts.ticker?.exchange ?? ts.ticker?.source ?? null),
    tickerTimestamp: valueAvailable(tickerTs),
    tickerAgeMs: valueAvailable(tickerAge),
  };
}

function collectWarnings(
  ts: TerminalState,
  microFlipUnavailable: boolean,
  globalFlipUnavailable: boolean,
  scenarioStatus: DataStatus,
  tickerStatus: DataStatus,
  optionsStatus: DataStatus,
  probSum: number | null,
): string[] {
  const warnings: string[] = [];
  if (tickerStatus === "stale") warnings.push("SPOT_STALE");
  if (tickerStatus === "unavailable") warnings.push("SPOT_STALE");
  if (optionsStatus === "stale") warnings.push("OPTIONS_STALE");
  if (microFlipUnavailable) warnings.push("LOCAL_FLIP_UNAVAILABLE");
  if (globalFlipUnavailable) warnings.push("GLOBAL_FLIP_UNAVAILABLE");
  if (scenarioStatus === "unavailable") warnings.push("SCENARIOS_UNAVAILABLE");
  if (scenarioStatus === "stale") warnings.push("SCENARIOS_STALE");
  if (ts.coherence?.score == null) warnings.push("COHERENCE_UNAVAILABLE");

  const storageCall = ts.positioning?.callWall;
  const deribitCall = (ts.options as { callWallUsd?: number } | undefined)?.callWallUsd;
  if (
    storageCall != null &&
    deribitCall != null &&
    Number.isFinite(storageCall) &&
    Number.isFinite(deribitCall) &&
    Math.abs(storageCall - deribitCall) / Math.max(storageCall, 1) > 0.02
  ) {
    warnings.push("WALL_SOURCE_DIVERGENCE");
    warnings.push("SOURCE_DIVERGENCE");
  }

  if (probSum != null && Math.abs(probSum - 1) > 0.05) {
    warnings.push("SCENARIO_PROBABILITY_MISMATCH");
  }
  if (countUnclassifiedScenarios(ts) > 0) {
    warnings.push("SCENARIO_HORIZON_UNCLASSIFIED");
  }

  return warnings;
}

export function buildCanonicalMobileState(
  ts: TerminalState,
  asset: SupportedAsset,
  cacheHit: boolean,
  buildTimeMs: number,
): CanonicalMobileSnapshot {
  const generatedAt = new Date().toISOString();
  const snapshotId = randomUUID();
  const assetBlock = buildAsset(ts, asset);
  const spot = assetBlock.spot.value;

  const scenarioStatus = scenariosFreshness(
    ts.scenarios,
    latestScenarioTimestampMs(ts.scenarios),
  );
  const tickerStatus = tickerFreshness(ts.tickerStatus);
  const optionsStatus = optionsFreshness(ts.optionsLastUpdated);

  const micro = buildMicroContext(ts, spot, scenarioStatus);
  const macro = buildMacroContext(ts, spot, scenarioStatus);
  const relationship = buildMicroMacroRelationship(micro, macro);
  const alertItems = buildStructuredAlerts(ts, spot);

  const probSum = sumScenarioProbabilities(ts.scenarios ?? []);
  const warnings = collectWarnings(
    ts,
    micro.gamma.flip.price.status === "unavailable",
    macro.gamma.flip.price.status === "unavailable",
    scenarioStatus,
    tickerStatus,
    optionsStatus,
    probSum,
  );

  micro.quality.warnings = warnings.filter((w) =>
    ["LOCAL_FLIP_UNAVAILABLE", "SCENARIOS_UNAVAILABLE", "SCENARIOS_STALE", "SPOT_STALE", "OPTIONS_STALE"].includes(w),
  );
  macro.quality.warnings = warnings.filter((w) =>
    ["GLOBAL_FLIP_UNAVAILABLE", "SCENARIOS_UNAVAILABLE", "SCENARIOS_STALE", "WALL_SOURCE_DIVERGENCE", "SOURCE_DIVERGENCE"].includes(w),
  );

  const coherenceScore =
    ts.coherence?.score != null && Number.isFinite(ts.coherence.score)
      ? valueAvailable(ts.coherence.score)
      : { value: null, status: "unavailable" as const };

  const optionsSource =
    (ts.positioning as { optionsSource?: string } | undefined)?.optionsSource ??
    ((ts.options as { source?: string } | undefined)?.source ?? null);

  return {
    asset: assetBlock,
    micro,
    macro,
    relationship,
    alerts: {
      items: alertItems,
      status: alertItems.length ? "available" : "unavailable",
    },
    metadata: {
      schemaVersion: MOBILE_V2_SCHEMA_VERSION,
      modelVersion: MOBILE_V2_MODEL_VERSION,
      generatedAt,
      snapshotId,
      asset,
      dataSources: {
        ticker: ts.ticker?.exchange ?? ts.ticker?.source ?? "market_gateway",
        options: optionsSource,
        market: "storage",
        scenarios: "storage",
        alerts: "engine_rules",
      },
      scenarioSource: "storage",
      alertSource: "engine_rules",
      accessModel: "terminal_subscription_inherited",
      freshness: {
        ticker: tickerStatus,
        options: optionsStatus,
        scenarios: scenarioStatus,
      },
      coherence: {
        status: coherenceScore.status === "available" ? "available" : "unavailable",
        score: coherenceScore,
        warnings: ts.coherence?.warnings ?? [],
      },
      warnings,
      buildTimeMs,
      cacheHit,
      approximateResponseBytes: null,
    },
  };
}

export function projectCanonicalSnapshot(
  snapshot: CanonicalMobileSnapshot,
  mode: MarketMode,
  requestedMode: MarketMode,
): ProjectedMobileMarketState {
  const metadata = {
    ...snapshot.metadata,
    requestedMode,
  };

  if (mode === "micro") {
    return {
      asset: snapshot.asset,
      micro: snapshot.micro,
      relationship: notRequestedRelationship(),
      alerts: snapshot.alerts,
      metadata,
    };
  }

  if (mode === "macro") {
    return {
      asset: snapshot.asset,
      macro: snapshot.macro,
      relationship: notRequestedRelationship(),
      alerts: snapshot.alerts,
      metadata,
    };
  }

  return {
    asset: snapshot.asset,
    micro: snapshot.micro,
    macro: snapshot.macro,
    relationship: snapshot.relationship,
    alerts: snapshot.alerts,
    metadata,
  };
}

export function attachResponseMetrics(
  projected: ProjectedMobileMarketState,
  serializeStart?: number,
): ProjectedMobileMarketState {
  const json = JSON.stringify(projected);
  return {
    ...projected,
    metadata: {
      ...projected.metadata,
      approximateResponseBytes: json.length,
      buildTimeMs:
        projected.metadata.buildTimeMs +
        (serializeStart != null ? Date.now() - serializeStart : 0),
    },
  };
}
