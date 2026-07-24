/**
 * AI-8.1 — Best-effort registry of last-known Market Snapshot / Decision Graph refs.
 * Passive: populated when MS/DG are produced elsewhere. Recorder never builds new ones.
 * AI-8.1.1: age/symbol/source eligibility — ineligible → null + reasonCode.
 */
import type {
  DecisionMarketSummaries,
  DecisionStateSummary,
  DecisionContextFreshness,
} from "@shared/goodTradingAiDecisionContext";
import type { MarketSnapshot } from "@shared/goodTradingAiMarket";
import type { DecisionGraphClientSafe } from "@shared/goodTradingAiDecisionGraph";
import {
  DECISION_CONTEXT_REF_MAX_AGE_MS,
  DECISION_CONTEXT_REF_REGISTRY_CAP,
} from "./flags";

export type KnownMarketRef = {
  marketSnapshotId: string;
  symbol: string;
  capturedAt: string;
  market: DecisionMarketSummaries;
  confidence: number | null;
  freshness: DecisionContextFreshness;
  source?: string;
};

export type KnownDecisionGraphRef = {
  decisionGraphId: string;
  symbol?: string;
  capturedAt: string;
  decisionState: Omit<DecisionStateSummary, "dataFreshness"> & {
    dataFreshness?: DecisionContextFreshness;
  };
  source?: string;
};

export type RefLookupResult<T> = {
  ref: T | null;
  reasonCode: string | null;
};

type RegistryState = {
  bySymbolMarket: Map<string, KnownMarketRef>;
  bySymbolGraph: Map<string, KnownDecisionGraphRef>;
  lastGraph: KnownDecisionGraphRef | null;
  orderMarket: string[];
  orderGraph: string[];
};

function empty(): RegistryState {
  return {
    bySymbolMarket: new Map(),
    bySymbolGraph: new Map(),
    lastGraph: null,
    orderMarket: [],
    orderGraph: [],
  };
}

let state: RegistryState = empty();

function normalizeSymbol(symbol: string): string {
  return symbol.trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
}

function trimCap(order: string[], map: Map<string, unknown>, cap: number): void {
  while (order.length > cap) {
    const oldest = order.shift();
    if (oldest) map.delete(oldest);
  }
}

function ageMs(capturedAt: string, nowMs: number): number | null {
  const t = Date.parse(capturedAt);
  if (!Number.isFinite(t)) return null;
  return Math.max(0, nowMs - t);
}

/** Summarize MarketSnapshot lenses — never store full payload. */
export function summarizeMarketSnapshot(
  snapshot: Pick<
    MarketSnapshot,
    | "id"
    | "symbol"
    | "timestamp"
    | "gamma"
    | "liquidity"
    | "orderFlow"
    | "openInterest"
    | "footprint"
    | "marketRegime"
    | "confidence"
    | "completeness"
    | "staleness"
  >,
): KnownMarketRef {
  const stale =
    snapshot.staleness?.some((s) => s.stale) === true ||
    snapshot.completeness === "DEGRADED" ||
    snapshot.completeness === "PARTIAL";
  const missing =
    snapshot.completeness === "UNAVAILABLE" || snapshot.completeness == null;
  let freshness: DecisionContextFreshness = "FRESH";
  if (missing) freshness = "MISSING";
  else if (snapshot.completeness === "DEGRADED") freshness = "DEGRADED";
  else if (stale) freshness = "STALE";
  else if (snapshot.completeness === "PARTIAL") freshness = "UNCERTAIN";

  return {
    marketSnapshotId: snapshot.id,
    symbol: snapshot.symbol,
    capturedAt: snapshot.timestamp,
    confidence:
      typeof snapshot.confidence === "number" ? snapshot.confidence : null,
    freshness,
    source: "MARKET_SNAPSHOT_PASSIVE",
    market: {
      gammaRegime: snapshot.marketRegime?.label
        ? `${snapshot.marketRegime.label}:${snapshot.gamma?.summary?.slice(0, 80) ?? ""}`
        : snapshot.gamma?.summary?.slice(0, 120) ?? null,
      dealerRegime: snapshot.gamma?.wallContext
        ? `wall:${snapshot.gamma.wallContext}`
        : null,
      liquidityRegime: snapshot.liquidity?.summary?.slice(0, 120) ?? null,
      absorption: snapshot.orderFlow?.absorption ?? null,
      spoof: snapshot.liquidity?.spoofingHypothesis ?? null,
      oi: snapshot.openInterest
        ? `${snapshot.openInterest.oiTrend}:${snapshot.openInterest.summary?.slice(0, 100) ?? ""}`
        : null,
      cvd: snapshot.orderFlow
        ? `${snapshot.orderFlow.aggression}:${snapshot.orderFlow.summary?.slice(0, 100) ?? ""}`
        : null,
      footprint: snapshot.footprint?.summary?.slice(0, 160) ?? null,
    },
  };
}

export function summarizeDecisionGraphClientSafe(
  graph: DecisionGraphClientSafe,
  opts?: { symbol?: string; evaluatedAtMs?: number },
): KnownDecisionGraphRef {
  const evaluatedAtMs = opts?.evaluatedAtMs ?? Date.now();
  const decisionGraphId = `dg_${graph.templateId}_${evaluatedAtMs}`;
  const hypothesis =
    graph.pathSummaries[0]?.stepLabels[0] ?? graph.primaryOutcome ?? null;
  return {
    decisionGraphId,
    symbol: opts?.symbol,
    capturedAt: new Date(evaluatedAtMs).toISOString(),
    source: "DECISION_GRAPH_PASSIVE",
    decisionState: {
      hypothesis: hypothesis ? String(hypothesis).slice(0, 280) : null,
      confirmations: [...graph.confirmationLabels].slice(0, 8),
      invalidations: [...graph.invalidationLabels].slice(0, 8),
      confidence: null,
      evidenceQuality: graph.quality,
      dataFreshness:
        graph.contextTrust === "NO_MARKET"
          ? "MISSING"
          : graph.primaryOutcome === "CONTEXT_STALE"
            ? "STALE"
            : graph.contextTrust === "UNTRUSTED_SCENARIO"
              ? "UNCERTAIN"
              : "FRESH",
    },
  };
}

export function registerKnownMarketSnapshot(
  snapshot: Parameters<typeof summarizeMarketSnapshot>[0],
): void {
  const ref = summarizeMarketSnapshot(snapshot);
  const key = normalizeSymbol(ref.symbol);
  if (!state.bySymbolMarket.has(key)) state.orderMarket.push(key);
  state.bySymbolMarket.set(key, ref);
  trimCap(state.orderMarket, state.bySymbolMarket, DECISION_CONTEXT_REF_REGISTRY_CAP);
}

export function registerKnownDecisionGraph(
  graph: DecisionGraphClientSafe,
  opts?: { symbol?: string; evaluatedAtMs?: number },
): void {
  const ref = summarizeDecisionGraphClientSafe(graph, opts);
  state.lastGraph = ref;
  if (ref.symbol) {
    const key = normalizeSymbol(ref.symbol);
    if (!state.bySymbolGraph.has(key)) state.orderGraph.push(key);
    state.bySymbolGraph.set(key, ref);
    trimCap(state.orderGraph, state.bySymbolGraph, DECISION_CONTEXT_REF_REGISTRY_CAP);
  }
}

export function lookupMarketRef(symbol: string): KnownMarketRef | null {
  return lookupMarketRefEligible(symbol).ref;
}

export function lookupDecisionGraphRef(symbol: string): KnownDecisionGraphRef | null {
  return lookupDecisionGraphRefEligible(symbol).ref;
}

export function lookupMarketRefEligible(
  symbol: string,
  nowMs = Date.now(),
): RefLookupResult<KnownMarketRef> {
  const key = normalizeSymbol(symbol);
  const ref = state.bySymbolMarket.get(key) ?? null;
  if (!ref) return { ref: null, reasonCode: "MS_REF_MISSING" };
  if (normalizeSymbol(ref.symbol) !== key) {
    return { ref: null, reasonCode: "MS_REF_SYMBOL_MISMATCH" };
  }
  const age = ageMs(ref.capturedAt, nowMs);
  if (age == null) return { ref: null, reasonCode: "MS_REF_INVALID_TIMESTAMP" };
  if (age > DECISION_CONTEXT_REF_MAX_AGE_MS) {
    return { ref: null, reasonCode: "MS_REF_STALE_AGE" };
  }
  if (ref.source && ref.source !== "MARKET_SNAPSHOT_PASSIVE") {
    return { ref: null, reasonCode: "MS_REF_SOURCE_INELIGIBLE" };
  }
  return { ref, reasonCode: null };
}

export function lookupDecisionGraphRefEligible(
  symbol: string,
  nowMs = Date.now(),
): RefLookupResult<KnownDecisionGraphRef> {
  const key = normalizeSymbol(symbol);
  const bySym = state.bySymbolGraph.get(key) ?? null;
  if (bySym) {
    const age = ageMs(bySym.capturedAt, nowMs);
    if (age == null) return { ref: null, reasonCode: "DG_REF_INVALID_TIMESTAMP" };
    if (age > DECISION_CONTEXT_REF_MAX_AGE_MS) {
      return { ref: null, reasonCode: "DG_REF_STALE_AGE" };
    }
    return { ref: bySym, reasonCode: null };
  }
  // Do not attach lastGraph from a different symbol — ineligible
  if (state.lastGraph) {
    if (state.lastGraph.symbol && normalizeSymbol(state.lastGraph.symbol) !== key) {
      return { ref: null, reasonCode: "DG_REF_SYMBOL_MISMATCH" };
    }
    if (!state.lastGraph.symbol) {
      return { ref: null, reasonCode: "DG_REF_SYMBOL_UNSPECIFIED" };
    }
  }
  return { ref: null, reasonCode: "DG_REF_MISSING" };
}

export function resetContextRefRegistryForTests(): void {
  state = empty();
}
