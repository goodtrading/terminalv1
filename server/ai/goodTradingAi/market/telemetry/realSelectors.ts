/**
 * AI-6.3 — Pure real selectors (server-testable mirror of client boundary logic).
 * Free of React hooks/components and renderer APIs.
 * Client `realMarketTelemetrySource.ts` is the browser runtime source.
 */
import {
  buildCompactMarketTelemetry,
  type CompactMarketTelemetry,
  type CompactTelemetrySelectorInput,
  type TelemetryMode,
} from "@shared/goodTradingAiMarketTelemetry";

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

export type RealFootprintSummary = {
  totalBars: number;
  totalDelta: number;
  stackedBuy?: boolean;
  stackedSell?: boolean;
  hasPoc?: boolean;
};

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

export const REAL_SELECTOR_AUDIT: ReadonlyArray<{
  metric: string;
  path: string;
  bridgeable: "YES" | "PARTIAL" | "NO";
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
    notes: "Fields exist but never assigned → UNAVAILABLE",
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

export function selectFootprintFromBars(
  bars: Array<{
    delta: number;
    stackedBuyImbalance?: boolean;
    stackedSellImbalance?: boolean;
    pocPrice?: number | null;
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
  }
  return { totalBars: bars.length, totalDelta, stackedBuy, stackedSell, hasPoc };
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

export function assessRealTelemetryQuality(input: {
  mode: TelemetryMode;
  orderFlow: RealOrderFlowSummary | null;
  footprint: RealFootprintSummary | null;
  lifecycle: RealLifecycleAudit | null;
}): {
  ok: boolean;
  issues: string[];
  orderFlowOk: boolean;
  footprintOk: boolean;
  lifecycleOk: boolean;
} {
  const issues: string[] = [];
  let orderFlowOk = false;
  let footprintOk = false;
  let lifecycleOk = false;
  if (input.mode === "unavailable") {
    return { ok: false, issues: ["mode=unavailable"], orderFlowOk, footprintOk, lifecycleOk };
  }
  if (input.orderFlow) {
    const o = input.orderFlow;
    if (o.tradeCount < 1) issues.push("orderFlow.tradeCount<1");
    else if (!Number.isFinite(o.delta) || !Number.isFinite(o.cvd)) issues.push("orderFlow.nonFinite");
    else if (Math.abs(o.imbalancePct) > 100.0001) issues.push("orderFlow.imbalanceOutOfRange");
    else orderFlowOk = true;
  } else if (input.mode === "real") {
    issues.push("orderFlow.missing");
  }
  if (input.footprint) {
    if (input.footprint.totalBars < 1) issues.push("footprint.totalBars<1");
    else footprintOk = true;
  }
  if (input.lifecycle) lifecycleOk = true;
  const ok =
    input.mode === "synthetic_debug"
      ? orderFlowOk || footprintOk || lifecycleOk
      : orderFlowOk;
  return { ok, issues, orderFlowOk, footprintOk, lifecycleOk };
}

/** In-test registry (controlled harness state). */
const harnessBySymbol = new Map<string, RealMarketTelemetryReadModel>();

export function pushHarnessRealSelectors(model: RealMarketTelemetryReadModel): void {
  const symbol = (model.symbol || "BTCUSDT").toUpperCase();
  harnessBySymbol.set(symbol, { ...model, symbol });
}

export function clearHarnessRealSelectors(): void {
  harnessBySymbol.clear();
}

export function readHarnessModel(symbol: string): RealMarketTelemetryReadModel {
  return (
    harnessBySymbol.get(symbol.toUpperCase()) ?? {
      symbol: symbol.toUpperCase(),
      orderFlowSummary: null,
      footprintSummary: null,
      lifecycleAudit: null,
    }
  );
}

export function buildTelemetryFromRealSource(params: {
  readModel: RealMarketTelemetryReadModel;
  sessionId: string;
  sequence: number;
  previousFingerprint?: string | null;
  forceHeartbeat?: boolean;
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
  return { ...buildCompactMarketTelemetry(input), quality };
}
