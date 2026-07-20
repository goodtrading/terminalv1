import { randomUUID } from "node:crypto";
import type {
  FootprintSnapshot,
  GammaSnapshot,
  LiquiditySnapshot,
  LiveCompleteness,
  MarketRegime,
  MarketSnapshot,
  MarketStructureSnapshot,
  ObservationOrigin,
  OpenInterestSnapshot,
  OrderFlowSnapshot,
  PriceContext,
  SignalDirection,
  SimulateMarketInput,
  SnapshotStaleness,
  SymbolProvenance,
} from "@shared/goodTradingAiMarket";
import type { MarketProviderBundle, ProviderLensInput } from "./snapshotContracts";
import {
  collectStubBundle,
  createStubProviders,
  simulateToBundle,
  type MarketProviders,
} from "./providers";
import { buildEvidence, providersInEvidence } from "./snapshotEvidence";
import { computeConfluence } from "./confluenceEngine";
import { computeRisks } from "./riskEngine";
import { computeSnapshotScores } from "./snapshotScoring";
import { validateMarketSnapshot } from "./snapshotValidator";

function tag<T extends string>(lens: ProviderLensInput | undefined, key: string, fallback: T): T {
  const v = lens?.tags?.[key];
  return (v as T) || fallback;
}

function baseLens(lens: ProviderLensInput | undefined, fallbackSummary: string) {
  return {
    direction: (lens?.direction ?? "unknown") as SignalDirection,
    strength: lens?.strength ?? ("none" as const),
    quality: lens?.quality ?? ("low" as const),
    confidence: Math.min(1, Math.max(0, lens?.confidence ?? 0)),
    summary: (lens?.summary || fallbackSummary).slice(0, 280),
  };
}

function buildGamma(lens?: ProviderLensInput): GammaSnapshot {
  return {
    ...baseLens(lens, "Gamma no disponible."),
    globalFlipBias: tag(lens, "globalFlipBias", "unknown"),
    localFlipBias: tag(lens, "localFlipBias", "unknown"),
    wallContext: tag(lens, "wallContext", "unknown"),
    hypothesisOnly: true,
  };
}

function buildOrderFlow(lens?: ProviderLensInput): OrderFlowSnapshot {
  return {
    ...baseLens(lens, "Order flow no disponible."),
    absorption: tag(lens, "absorption", "unknown"),
    aggression: tag(lens, "aggression", "unknown"),
    acceptance: tag(lens, "acceptance", "unknown"),
  };
}

function buildLiquidity(lens?: ProviderLensInput): LiquiditySnapshot {
  return {
    ...baseLens(lens, "Liquidez no disponible."),
    wallIntegrity: tag(lens, "wallIntegrity", "unknown"),
    spoofingHypothesis: tag(lens, "spoofingHypothesis", "unknown"),
    sweepContext: tag(lens, "sweepContext", "unknown"),
  };
}

function buildOI(lens?: ProviderLensInput): OpenInterestSnapshot {
  return {
    ...baseLens(lens, "Open interest no disponible."),
    oiTrend: tag(lens, "oiTrend", "unknown"),
    withPrice: tag(lens, "withPrice", "unknown"),
  };
}

function buildFootprint(lens?: ProviderLensInput): FootprintSnapshot {
  return {
    ...baseLens(lens, "Footprint no disponible."),
    imbalance: tag(lens, "imbalance", "unknown"),
    exhaustionHint: tag(lens, "exhaustionHint", "unknown"),
  };
}

function buildStructure(lens?: ProviderLensInput): MarketStructureSnapshot {
  return {
    ...baseLens(lens, "Estructura no disponible."),
    structure: tag(lens, "structure", "unclear"),
    keyLevelRelation: tag(lens, "keyLevelRelation", "unknown"),
  };
}

function buildRegime(
  gamma: GammaSnapshot,
  confluenceDir: SignalDirection,
): MarketRegime {
  let label: MarketRegime["label"] = "unclear";
  if (gamma.direction === "bullish" && gamma.strength !== "none") label = "positive_gamma";
  else if (gamma.direction === "bearish" && gamma.strength !== "none") label = "negative_gamma";
  else if (gamma.direction === "mixed" || confluenceDir === "mixed") label = "transition";
  else if (gamma.direction === "neutral") label = "range";
  else if (confluenceDir === "bullish" || confluenceDir === "bearish") label = "trend_attempt";

  return {
    label,
    direction: confluenceDir === "unknown" ? gamma.direction : confluenceDir,
    strength: gamma.strength,
    quality: gamma.quality,
    confidence: gamma.confidence,
    summary: `Régimen ${label}: marco educativo (hipótesis), no mandato de entrada.`.slice(0, 280),
  };
}

function buildPrice(input?: { displayRef?: number; structure?: MarketStructureSnapshot }): PriceContext {
  const rel = input?.structure?.keyLevelRelation ?? "unknown";
  let context: PriceContext["context"] = "unclear";
  if (rel === "at") context = "near_level";
  else if (rel === "above" || rel === "below") context = "mid_range";
  return {
    displayRef: input?.displayRef,
    context,
    relativeToKeyLevels: rel,
    quality: input?.structure?.quality ?? "low",
    confidence: input?.structure?.confidence ?? 0.3,
    summary: `Precio en contexto ${context} vs niveles clave (${rel}).`.slice(0, 200),
  };
}

/**
 * Build a validated Market Snapshot from a provider bundle.
 * Deterministic, <100ms target, no OpenAI / no live feeds in stub path.
 */
export function buildMarketSnapshot(params: {
  symbol: string;
  bundle: MarketProviderBundle;
  source: MarketSnapshot["source"];
  timestamp?: string;
  displayRef?: number;
  /** Default INFERRED for stub/simulate; live path uses OBSERVED/DERIVED per lens. */
  evidenceOrigin?: ObservationOrigin;
  liveMeta?: {
    live: boolean;
    completeness: LiveCompleteness;
    staleness?: SnapshotStaleness[];
    symbolProvenance?: SymbolProvenance;
  };
}): { snapshot: MarketSnapshot; issues: ReturnType<typeof validateMarketSnapshot>["issues"] } {
  const started = Date.now();
  const evidenceOrigin =
    params.evidenceOrigin ??
    (params.source === "live_internal" ? "OBSERVED" : "INFERRED");
  const evidence = buildEvidence(params.bundle, evidenceOrigin);
  const confluence = computeConfluence(params.bundle, evidence);
  const risks = computeRisks(params.bundle, confluence);
  const scores = computeSnapshotScores({
    bundle: params.bundle,
    evidence,
    confluence,
    risks,
  });

  const gamma = buildGamma(params.bundle.gamma);
  const orderFlow = buildOrderFlow(params.bundle.orderFlow);
  const liquidity = buildLiquidity(params.bundle.liquidity);
  const openInterest = buildOI(params.bundle.openInterest);
  const footprint = buildFootprint(params.bundle.footprint);
  const marketStructure = buildStructure(params.bundle.marketStructure);
  const marketRegime = buildRegime(gamma, confluence.direction);
  const price = buildPrice({ displayRef: params.displayRef, structure: marketStructure });

  const providersUsed = providersInEvidence(evidence);
  const uniqueProviders = Array.from(new Set(providersUsed));

  const snapshot: MarketSnapshot = {
    id: `ms_${randomUUID().slice(0, 12)}`,
    timestamp: params.timestamp ?? new Date().toISOString(),
    symbol: params.symbol.slice(0, 32),
    price,
    marketRegime,
    gamma,
    orderFlow,
    liquidity,
    openInterest,
    footprint,
    marketStructure,
    risks,
    confluence,
    confidence: Math.min(1, Math.max(0, scores.marketConfidence / 100)),
    evidence,
    scores,
    providersUsed: uniqueProviders,
    source: params.source,
    buildMs: Date.now() - started,
    live: params.liveMeta?.live,
    completeness: params.liveMeta?.completeness,
    staleness: params.liveMeta?.staleness,
    symbolProvenance: params.liveMeta?.symbolProvenance,
  };

  const v = validateMarketSnapshot(snapshot);
  return { snapshot: v.snapshot, issues: v.issues };
}

/** Stub snapshot from mock providers (GET default). */
export function buildStubSnapshot(symbol = "BTCUSDT"): {
  snapshot: MarketSnapshot;
  issues: ReturnType<typeof validateMarketSnapshot>["issues"];
} {
  const bundle = collectStubBundle(symbol, createStubProviders());
  return buildMarketSnapshot({ symbol, bundle, source: "stub" });
}

/** Simulate from admin/manual input. */
export function buildSimulatedSnapshot(input: SimulateMarketInput): {
  snapshot: MarketSnapshot;
  issues: ReturnType<typeof validateMarketSnapshot>["issues"];
} {
  const symbol = input.symbol?.trim() || "BTCUSDT";
  const bundle = simulateToBundle(input);
  return buildMarketSnapshot({
    symbol,
    bundle,
    source: "simulate",
    timestamp: input.timestamp,
    displayRef: input.displayRef,
  });
}

/** Optional: assemble from injected providers (still not live-wired). */
export function buildFromProviders(symbol: string, providers: MarketProviders): {
  snapshot: MarketSnapshot;
  issues: ReturnType<typeof validateMarketSnapshot>["issues"];
} {
  const bundle = collectStubBundle(symbol, providers);
  const hasAny = Object.values(bundle).some(Boolean);
  return buildMarketSnapshot({
    symbol,
    bundle,
    source: hasAny ? "partial" : "stub",
  });
}
