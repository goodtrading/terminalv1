/**
 * Market Snapshot Engine public surface (AI-6).
 */
export {
  buildMarketSnapshot,
  buildStubSnapshot,
  buildSimulatedSnapshot,
  buildFromProviders,
} from "./snapshotBuilder";
export { validateMarketSnapshot } from "./snapshotValidator";
export { renderMarketSnapshot, toAdminPayload } from "./snapshotRenderer";
export { buildEvidence, evidenceDirectionBias } from "./snapshotEvidence";
export { computeConfluence } from "./confluenceEngine";
export { computeRisks, riskScore } from "./riskEngine";
export { computeSnapshotScores } from "./snapshotScoring";
export {
  createStubProviders,
  simulateToBundle,
  collectStubBundle,
  StubGammaProvider,
  StubOrderFlowProvider,
  StubDOMProvider,
  StubLiquidityProvider,
  StubFootprintProvider,
  StubOpenInterestProvider,
  StubMarketStructureProvider,
} from "./providers";
export type {
  GammaProvider,
  OrderFlowProvider,
  DOMProvider,
  LiquidityProvider,
  FootprintProvider,
  OpenInterestProvider,
  MarketStructureProvider,
  MarketProviders,
} from "./providers";
export type { MarketProviderBundle, ProviderLensInput } from "./snapshotContracts";
export {
  isGoodTradingAiMarketSnapshotEnabled,
  isGoodTradingAiMarketLiveEnabled,
  isGoodTradingAiMarketTelemetryEnabled,
} from "./features";
export {
  getMarketSourceCapabilities,
  buildLiveInternalSnapshot,
  buildLiveInternalSnapshotFromModel,
  fixtureRichLiveModel,
  fixtureEmptyLiveModel,
  fixtureStaleLiveModel,
  normalizeSymbolWithProvenance,
} from "./live";
export {
  buildCompactMarketTelemetry,
  getMarketTelemetryStore,
  resetMarketTelemetryStoreForTests,
  applyClientTelemetryToBundle,
} from "./telemetry";
