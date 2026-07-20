/**
 * AI-6.3 — Real data quality checks (anti-synthetic / anti-garbage).
 */
import type { TelemetryMode } from "@shared/goodTradingAiMarketTelemetry";
import type {
  RealFootprintSummary,
  RealLifecycleAudit,
  RealOrderFlowSummary,
} from "./realMarketTelemetrySource";

export type RealTelemetryQuality = {
  ok: boolean;
  issues: string[];
  orderFlowOk: boolean;
  footprintOk: boolean;
  lifecycleOk: boolean;
};

export function assessRealTelemetryQuality(input: {
  mode: TelemetryMode;
  orderFlow: RealOrderFlowSummary | null;
  footprint: RealFootprintSummary | null;
  lifecycle: RealLifecycleAudit | null;
}): RealTelemetryQuality {
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

  if (input.lifecycle) {
    lifecycleOk = true;
  }

  // Real mode requires at least OF to be "ok" for overall ok; synthetic may be partial
  const ok =
    input.mode === "synthetic_debug"
      ? orderFlowOk || footprintOk || lifecycleOk
      : orderFlowOk;

  return { ok, issues, orderFlowOk, footprintOk, lifecycleOk };
}
