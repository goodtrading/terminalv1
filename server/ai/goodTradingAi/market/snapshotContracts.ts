/**
 * Server-side re-exports + provider lens input types (AI-6).
 * Providers return normalized lenses — never raw DOM/ticks as primary.
 */
export type {
  MarketSnapshot,
  MarketSnapshotCompact,
  SimulateMarketInput,
  NormalizedLens,
  MarketProviderId,
  EvidenceItem,
  RiskItem,
  ConfluenceSnapshot,
  SnapshotScores,
  GammaSnapshot,
  OrderFlowSnapshot,
  LiquiditySnapshot,
  OpenInterestSnapshot,
  FootprintSnapshot,
  MarketStructureSnapshot,
  MarketRegime,
  PriceContext,
  SignalDirection,
  SignalStrength,
  SignalQuality,
} from "@shared/goodTradingAiMarket";

export {
  marketSnapshotSchema,
  simulateMarketInputSchema,
  marketProviderIdSchema,
} from "@shared/goodTradingAiMarket";

/** Raw-ish provider payload before builder normalization (still no tick arrays). */
export type ProviderLensInput = {
  provider: import("@shared/goodTradingAiMarket").MarketProviderId;
  direction: import("@shared/goodTradingAiMarket").SignalDirection;
  strength: import("@shared/goodTradingAiMarket").SignalStrength;
  quality: import("@shared/goodTradingAiMarket").SignalQuality;
  confidence: number;
  summary: string;
  /** Optional qualitative tags — never raw trade lists */
  tags?: Record<string, string>;
  /** AI-6.1 provenance (defaults applied in evidence builder for stub/simulate). */
  origin?: import("@shared/goodTradingAiMarket").ObservationOrigin;
  capturedAt?: string;
  ageMs?: number;
  sourceId?: import("@shared/goodTradingAiMarket").MarketSourceId;
};

export type MarketProviderBundle = {
  gamma?: ProviderLensInput;
  orderFlow?: ProviderLensInput;
  dom?: ProviderLensInput;
  liquidity?: ProviderLensInput;
  footprint?: ProviderLensInput;
  openInterest?: ProviderLensInput;
  marketStructure?: ProviderLensInput;
};
