/**
 * AI-6.3 — Real market telemetry source boundary.
 * Pure selectors only. NO React hooks/components/canvas/renderer.
 * Accepts already-reduced read models (never raw book/trades/heatmap arrays).
 */
import {
  buildCompactMarketTelemetry,
  type CompactMarketTelemetry,
  type CompactTelemetrySelectorInput,
  type TelemetryMode,
} from "@shared/goodTradingAiMarketTelemetry";
import { assessRealTelemetryQuality } from "./quality";
import {
  getRealTelemetrySelectorSnapshot,
  type RealTelemetrySelectorSnapshot,
} from "./selectorRegistry";

/** Reduced OF summary — mirrors BookmapTradeSessionSummary fields used by the bridge. */
export type RealOrderFlowSummary = {
  tradeCount: number;
  buyVolume: number;
  sellVolume: number;
  delta: number;
  cvd: number;
  imbalancePct: number;
  windowMs?: number;
  firstTimestamp?: number | null;
  lastTimestamp?: number | null;
};

/** Reduced footprint flags — stacked/POC only; absorption/exhaustion stay unknown. */
export type RealFootprintSummary = {
  totalBars: number;
  totalDelta: number;
  stackedBuy?: boolean;
  stackedSell?: boolean;
  hasPoc?: boolean;
};

/** Reduced lifecycle counts — hypothesis only (DERIVED). */
export type RealLifecycleAudit = {
  pullingCandidateCount?: number;
  spoofingCandidateCount?: number;
  refilledLevelCount?: number;
};

export type RealMarketTelemetryReadModel = {
  symbol: string;
  orderFlowSummary?: RealOrderFlowSummary | null;
  footprintSummary?: RealFootprintSummary | null;
  lifecycleAudit?: RealLifecycleAudit | null;
  capturedAtMs?: number;
};

export type BridgeableClass = "YES" | "PARTIAL" | "NO";

export const REAL_SELECTOR_AUDIT: ReadonlyArray<{
  metric: string;
  path: string;
  bridgeable: BridgeableClass;
  notes: string;
}> = [
  {
    metric: "CVD / delta / imbalance",
    path: "bookmapTradeAggregation.summary → selectOrderFlowFromTradeSummary",
    bridgeable: "YES",
    notes: "Stable reduced summary; never trade arrays",
  },
  {
    metric: "Footprint stacked / POC",
    path: "FootprintBar flags → selectFootprintFromBars",
    bridgeable: "PARTIAL",
    notes: "Stable flags only when bars present",
  },
  {
    metric: "Footprint absorption / exhaustion",
    path: "FootprintBar.absorption/exhaustion",
    bridgeable: "NO",
    notes: "Fields exist but never assigned in builders → UNAVAILABLE",
  },
  {
    metric: "Pulling / spoofing counts",
    path: "BookmapLiquidityLifecycleAudit counts",
    bridgeable: "PARTIAL",
    notes: "Counts → DERIVED hypothesis only",
  },
  {
    metric: "Raw book / trades / heatmap / candles",
    path: "forbidden — not bridgeable",
    bridgeable: "NO",
    notes: "Forbidden in telemetry payload",
  },
];

/** Map BookmapTradeSessionSummary-like object → bridge OF input (no fixtures-as-real). */
export function selectOrderFlowFromTradeSummary(
  summary: RealOrderFlowSummary | null | undefined,
): RealOrderFlowSummary | null {
  if (!summary) return null;
  if (!Number.isFinite(summary.tradeCount) || summary.tradeCount < 1) return null;
  if (
    !Number.isFinite(summary.delta) ||
    !Number.isFinite(summary.cvd) ||
    !Number.isFinite(summary.imbalancePct)
  ) {
    return null;
  }
  let windowMs = summary.windowMs;
  if (
    windowMs == null &&
    summary.firstTimestamp != null &&
    summary.lastTimestamp != null &&
    Number.isFinite(summary.firstTimestamp) &&
    Number.isFinite(summary.lastTimestamp) &&
    summary.lastTimestamp >= summary.firstTimestamp
  ) {
    windowMs = Math.max(1, summary.lastTimestamp - summary.firstTimestamp);
  }
  return {
    tradeCount: summary.tradeCount,
    buyVolume: summary.buyVolume,
    sellVolume: summary.sellVolume,
    delta: summary.delta,
    cvd: summary.cvd,
    imbalancePct: summary.imbalancePct,
    windowMs,
  };
}

/** Reduce footprint bars to compact flags — never candles/levels arrays in output. */
export function selectFootprintFromBars(
  bars: Array<{
    delta: number;
    stackedBuyImbalance?: boolean;
    stackedSellImbalance?: boolean;
    pocPrice?: number | null;
    absorption?: string | null;
    exhaustion?: string | null;
  }> | null | undefined,
): RealFootprintSummary | null {
  if (!bars || bars.length === 0) return null;
  let totalDelta = 0;
  let stackedBuy = false;
  let stackedSell = false;
  let hasPoc = false;
  for (const b of bars) {
    if (Number.isFinite(b.delta)) totalDelta += b.delta;
    if (b.stackedBuyImbalance) stackedBuy = true;
    if (b.stackedSellImbalance) stackedSell = true;
    if (b.pocPrice != null && Number.isFinite(b.pocPrice)) hasPoc = true;
    // Intentionally ignore absorption/exhaustion even if set — not stable for bridge
  }
  return {
    totalBars: bars.length,
    totalDelta,
    stackedBuy,
    stackedSell,
    hasPoc,
  };
}

export function selectLifecycleFromAudit(
  audit: RealLifecycleAudit | null | undefined,
): RealLifecycleAudit | null {
  if (!audit) return null;
  return {
    pullingCandidateCount: Math.max(0, Math.floor(audit.pullingCandidateCount ?? 0)),
    spoofingCandidateCount: Math.max(0, Math.floor(audit.spoofingCandidateCount ?? 0)),
    refilledLevelCount: Math.max(0, Math.floor(audit.refilledLevelCount ?? 0)),
  };
}

export function readModelFromRegistry(
  symbol: string,
  snap?: RealTelemetrySelectorSnapshot | null,
): RealMarketTelemetryReadModel {
  const s = snap ?? getRealTelemetrySelectorSnapshot(symbol);
  if (!s) {
    return { symbol, orderFlowSummary: null, footprintSummary: null, lifecycleAudit: null };
  }
  return {
    symbol: s.symbol,
    orderFlowSummary: selectOrderFlowFromTradeSummary(s.orderFlowSummary),
    footprintSummary: s.footprintSummary ?? null,
    lifecycleAudit: selectLifecycleFromAudit(s.lifecycleAudit),
    capturedAtMs: s.capturedAtMs,
  };
}

/**
 * Build compact telemetry from a real (or controlled-harness) read model.
 * Never invents synthetic demo numbers when mode=real.
 */
export function buildTelemetryFromRealSource(params: {
  readModel: RealMarketTelemetryReadModel;
  sessionId: string;
  sequence: number;
  previousFingerprint?: string | null;
  forceHeartbeat?: boolean;
  /** Override — default real */
  telemetryMode?: TelemetryMode;
}): {
  telemetry: CompactMarketTelemetry;
  bytes: number;
  unavailableReason?: string;
  quality: ReturnType<typeof assessRealTelemetryQuality>;
} {
  const mode = params.telemetryMode ?? "real";
  const of = selectOrderFlowFromTradeSummary(params.readModel.orderFlowSummary);
  const fp =
    params.readModel.footprintSummary && params.readModel.footprintSummary.totalBars > 0
      ? params.readModel.footprintSummary
      : null;
  const life = selectLifecycleFromAudit(params.readModel.lifecycleAudit);

  const input: CompactTelemetrySelectorInput = {
    symbol: params.readModel.symbol,
    sessionId: params.sessionId,
    sequence: params.sequence,
    nowMs: params.readModel.capturedAtMs,
    telemetryMode: mode,
    telemetrySource:
      mode === "real"
        ? "bookmapTradeAggregation.summary+lifecycleAudit"
        : mode === "synthetic_debug"
          ? "synthetic_debug"
          : "unavailable",
    orderFlowSummary: of,
    footprintSummary: fp,
    lifecycleAudit: life,
    previousFingerprint: params.previousFingerprint,
    forceHeartbeat: params.forceHeartbeat,
  };

  const quality = assessRealTelemetryQuality({
    mode,
    orderFlow: of,
    footprint: fp,
    lifecycle: life,
  });

  const built = buildCompactMarketTelemetry(input);
  return { ...built, quality };
}
