/**
 * Market data provider interfaces — stubs/mocks only (AI-6).
 * NOT wired to live terminal/Bookmap/DOM/WebSockets (AI-8 later).
 */
import type { MarketProviderBundle, ProviderLensInput } from "./snapshotContracts";
import type { SimulateMarketInput, SignalDirection } from "@shared/goodTradingAiMarket";

export interface GammaProvider {
  readonly id: "gamma";
  fetch(symbol: string): Promise<ProviderLensInput | null> | ProviderLensInput | null;
}

export interface OrderFlowProvider {
  readonly id: "orderFlow";
  fetch(symbol: string): Promise<ProviderLensInput | null> | ProviderLensInput | null;
}

export interface DOMProvider {
  readonly id: "dom";
  fetch(symbol: string): Promise<ProviderLensInput | null> | ProviderLensInput | null;
}

export interface LiquidityProvider {
  readonly id: "liquidity";
  fetch(symbol: string): Promise<ProviderLensInput | null> | ProviderLensInput | null;
}

export interface FootprintProvider {
  readonly id: "footprint";
  fetch(symbol: string): Promise<ProviderLensInput | null> | ProviderLensInput | null;
}

export interface OpenInterestProvider {
  readonly id: "openInterest";
  fetch(symbol: string): Promise<ProviderLensInput | null> | ProviderLensInput | null;
}

export interface MarketStructureProvider {
  readonly id: "marketStructure";
  fetch(symbol: string): Promise<ProviderLensInput | null> | ProviderLensInput | null;
}

export type MarketProviders = {
  gamma?: GammaProvider;
  orderFlow?: OrderFlowProvider;
  dom?: DOMProvider;
  liquidity?: LiquidityProvider;
  footprint?: FootprintProvider;
  openInterest?: OpenInterestProvider;
  marketStructure?: MarketStructureProvider;
};

function lens(
  provider: ProviderLensInput["provider"],
  direction: SignalDirection,
  strength: ProviderLensInput["strength"],
  quality: ProviderLensInput["quality"],
  confidence: number,
  summary: string,
  tags?: Record<string, string>,
): ProviderLensInput {
  return { provider, direction, strength, quality, confidence, summary, tags };
}

/** Deterministic stub providers — fixed educational lenses, no live feeds. */
export class StubGammaProvider implements GammaProvider {
  readonly id = "gamma" as const;
  fetch(_symbol: string): ProviderLensInput {
    return lens(
      "gamma",
      "neutral",
      "moderate",
      "medium",
      0.55,
      "Stub gamma: régimen no direccional; flip como marco, no entrada.",
      { globalFlipBias: "at", localFlipBias: "unknown", wallContext: "balanced" },
    );
  }
}

export class StubOrderFlowProvider implements OrderFlowProvider {
  readonly id = "orderFlow" as const;
  fetch(_symbol: string): ProviderLensInput {
    return lens(
      "orderFlow",
      "neutral",
      "weak",
      "medium",
      0.5,
      "Stub OF: sin absorption clara; acceptance pendiente.",
      { absorption: "unknown", aggression: "balanced", acceptance: "pending" },
    );
  }
}

export class StubDOMProvider implements DOMProvider {
  readonly id = "dom" as const;
  fetch(_symbol: string): ProviderLensInput {
    return lens("dom", "unknown", "none", "low", 0.3, "Stub DOM: no conectado (AI-8).");
  }
}

export class StubLiquidityProvider implements LiquidityProvider {
  readonly id = "liquidity" as const;
  fetch(_symbol: string): ProviderLensInput {
    return lens(
      "liquidity",
      "neutral",
      "weak",
      "medium",
      0.48,
      "Stub liquidez: walls como referencia, no reversión automática.",
      { wallIntegrity: "unknown", spoofingHypothesis: "unknown", sweepContext: "none" },
    );
  }
}

export class StubFootprintProvider implements FootprintProvider {
  readonly id = "footprint" as const;
  fetch(_symbol: string): ProviderLensInput {
    return lens(
      "footprint",
      "neutral",
      "none",
      "low",
      0.35,
      "Stub footprint: sin imbalance dominante.",
      { imbalance: "none", exhaustionHint: "none" },
    );
  }
}

export class StubOpenInterestProvider implements OpenInterestProvider {
  readonly id = "openInterest" as const;
  fetch(_symbol: string): ProviderLensInput {
    return lens(
      "openInterest",
      "neutral",
      "weak",
      "medium",
      0.45,
      "Stub OI: flat; no implica dirección sola.",
      { oiTrend: "flat", withPrice: "unclear" },
    );
  }
}

export class StubMarketStructureProvider implements MarketStructureProvider {
  readonly id = "marketStructure" as const;
  fetch(_symbol: string): ProviderLensInput {
    return lens(
      "marketStructure",
      "neutral",
      "moderate",
      "medium",
      0.5,
      "Stub structure: rango / unclear.",
      { structure: "range", keyLevelRelation: "unknown" },
    );
  }
}

export function createStubProviders(): MarketProviders {
  return {
    gamma: new StubGammaProvider(),
    orderFlow: new StubOrderFlowProvider(),
    dom: new StubDOMProvider(),
    liquidity: new StubLiquidityProvider(),
    footprint: new StubFootprintProvider(),
    openInterest: new StubOpenInterestProvider(),
    marketStructure: new StubMarketStructureProvider(),
  };
}

/** Map simulate scenarios → provider bundle (deterministic). */
export function simulateToBundle(input: SimulateMarketInput): MarketProviderBundle {
  const scenario = input.scenario ?? "neutral";

  const dir = (fallback: SignalDirection, override?: SignalDirection): SignalDirection =>
    override ?? fallback;

  let g: SignalDirection = "neutral";
  let of: SignalDirection = "neutral";
  let liq: SignalDirection = "neutral";
  let oi: SignalDirection = "neutral";
  let st: SignalDirection = "neutral";
  let fp: SignalDirection = "neutral";
  let strength: ProviderLensInput["strength"] = "moderate";
  let quality: ProviderLensInput["quality"] = "medium";
  let conf = 0.55;

  if (scenario === "bullish_confluence") {
    g = of = liq = oi = st = fp = "bullish";
    strength = "strong";
    conf = 0.72;
  } else if (scenario === "bearish_confluence") {
    g = of = liq = oi = st = fp = "bearish";
    strength = "strong";
    conf = 0.7;
  } else if (scenario === "conflicted") {
    g = "bullish";
    of = "bearish";
    liq = "mixed";
    oi = "neutral";
    st = "mixed";
    fp = "bearish";
    strength = "moderate";
    conf = 0.4;
  } else if (scenario === "high_risk") {
    g = "bullish";
    of = "bullish";
    liq = "bearish";
    oi = "mixed";
    st = "bullish";
    fp = "mixed";
    strength = "moderate";
    quality = "low";
    conf = 0.35;
  } else if (scenario === "thin_data") {
    g = of = liq = oi = st = fp = "unknown";
    strength = "none";
    quality = "low";
    conf = 0.2;
  }

  g = dir(g, input.gammaDirection);
  of = dir(of, input.orderFlowDirection);
  liq = dir(liq, input.liquidityDirection);
  oi = dir(oi, input.oiDirection);
  st = dir(st, input.structureDirection);
  fp = dir(fp, input.footprintDirection);

  return {
    gamma: lens(
      "gamma",
      g,
      strength,
      quality,
      conf,
      input.notes?.slice(0, 200) || `Simulate gamma (${scenario}).`,
      {
        globalFlipBias: g === "bullish" ? "above" : g === "bearish" ? "below" : "at",
        localFlipBias: g === "unknown" ? "unknown" : "at",
        wallContext: "balanced",
      },
    ),
    orderFlow: lens(
      "orderFlow",
      of,
      strength,
      quality,
      conf,
      `Simulate order flow (${scenario}).`,
      {
        absorption: of === "bullish" ? "buy_side" : of === "bearish" ? "sell_side" : "unknown",
        aggression: of === "unknown" ? "unknown" : "balanced",
        acceptance: of === "unknown" ? "unknown" : "pending",
      },
    ),
    liquidity: lens(
      "liquidity",
      liq,
      strength,
      quality,
      conf * 0.95,
      `Simulate liquidity (${scenario}).`,
      {
        wallIntegrity: scenario === "high_risk" ? "pulling" : "persistent",
        spoofingHypothesis: scenario === "high_risk" ? "possible" : "unlikely",
        sweepContext: scenario === "bullish_confluence" ? "sweep_reclaim" : "none",
      },
    ),
    openInterest: lens(
      "openInterest",
      oi,
      strength === "none" ? "none" : "weak",
      quality,
      conf * 0.9,
      `Simulate OI (${scenario}).`,
      {
        oiTrend: oi === "bullish" || oi === "bearish" ? "rising" : "flat",
        withPrice: scenario === "conflicted" ? "divergent" : "unclear",
      },
    ),
    footprint: lens(
      "footprint",
      fp,
      strength === "strong" ? "moderate" : strength,
      quality,
      conf * 0.85,
      `Simulate footprint (${scenario}).`,
      {
        imbalance:
          fp === "bullish" ? "buy_imbalance" : fp === "bearish" ? "sell_imbalance" : "none",
        exhaustionHint: scenario === "high_risk" ? "possible" : "none",
      },
    ),
    marketStructure: lens(
      "marketStructure",
      st,
      strength,
      quality,
      conf,
      `Simulate structure (${scenario}).`,
      {
        structure:
          st === "bullish" ? "higher_highs" : st === "bearish" ? "lower_lows" : "range",
        keyLevelRelation: st === "unknown" ? "unknown" : "at",
      },
    ),
    // DOM intentionally omitted from simulate primary path (not live)
  };
}

/** Collect lenses from stub providers synchronously. */
export function collectStubBundle(symbol: string, providers: MarketProviders = createStubProviders()): MarketProviderBundle {
  const out: MarketProviderBundle = {};
  if (providers.gamma) out.gamma = providers.gamma.fetch(symbol) as ProviderLensInput;
  if (providers.orderFlow) out.orderFlow = providers.orderFlow.fetch(symbol) as ProviderLensInput;
  if (providers.dom) out.dom = providers.dom.fetch(symbol) as ProviderLensInput;
  if (providers.liquidity) out.liquidity = providers.liquidity.fetch(symbol) as ProviderLensInput;
  if (providers.footprint) out.footprint = providers.footprint.fetch(symbol) as ProviderLensInput;
  if (providers.openInterest) {
    out.openInterest = providers.openInterest.fetch(symbol) as ProviderLensInput;
  }
  if (providers.marketStructure) {
    out.marketStructure = providers.marketStructure.fetch(symbol) as ProviderLensInput;
  }
  return out;
}
