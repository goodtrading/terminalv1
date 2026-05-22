import type { ExecutionDrilldownFilter } from "../useReportsDrilldown";
import type { ExecutionTradeReviewRow } from "./executionReportTypes";

export function matchTradeAgainstDrilldown(
  row: ExecutionTradeReviewRow,
  filter: NonNullable<ExecutionDrilldownFilter>,
): boolean {
  switch (filter.type) {
    case "playbook":
      return matchPlaybookFilter(row, filter.playbookId);
    case "mistake":
      return matchMistakeFilter(row, filter.mistakeId);
    case "delta":
      return matchDeltaFilter(row, filter.deltaStatus);
    case "quality":
      return matchQualityFilter(row, filter.quality);
    case "risk":
      return matchRiskFilter(row, filter.riskKey);
    default:
      return false;
  }
}

function matchPlaybookFilter(row: ExecutionTradeReviewRow, playbookId: string): boolean {
  // Check playbook at entry
  if (row.playbookAtEntry?.primary?.id === playbookId) return true;
  // Check playbook match
  if (row.playbookMatch?.primary?.id === playbookId) return true;
  // Check playbook at exit
  if (row.playbookAtExit?.primary?.id === playbookId) return true;
  // Fallback: check if playbook label includes the filter label
  const playbookName = row.playbookMatch?.primary?.name || row.playbookAtEntry?.primary?.name;
  if (playbookName?.toLowerCase().includes(playbookId.toLowerCase())) return true;
  return false;
}

function matchMistakeFilter(row: ExecutionTradeReviewRow, mistakeId: string): boolean {
  const mistakeIdLower = mistakeId.toLowerCase();
  const mistakesLower = row.mistakes.toLowerCase();

  // Direct string match in mistakes field
  if (mistakesLower.includes(mistakeIdLower)) return true;

  // Check context at entry for specific mistake patterns
  const ctx = row.contextAtEntry || row.contextAtExit;
  if (!ctx) return false;

  // no_stop_loss
  if (mistakeIdLower === "no_stop_loss") {
    if (!ctx.risk.stopLossDetected) return true;
    if (mistakesLower.includes("stop")) return true;
    if (row.timeline?.events.some(e => 
      e.severity === "danger" && e.message.toLowerCase().includes("no sl")
    )) return true;
  }

  // no_playbook_match
  if (mistakeIdLower === "no_playbook_match") {
    if (row.playbookMatch?.primary?.id === "no_match") return true;
    if (row.playbookMatch?.primary?.status === "no_match") return true;
  }

  // low_confidence_entries
  if (mistakeIdLower === "low_confidence_entries") {
    const playbook = row.playbookAtEntry?.primary || row.playbookMatch?.primary;
    if (playbook && playbook.confidence < 60) return true;
  }

  // trading_against_context
  if (mistakeIdLower === "trading_against_context") {
    const alignment = ctx.diagnostics.contextAlignment;
    if (alignment === "conflicted" || alignment === "danger") return true;
    if (ctx.risk.riskMirrorStatus === "conflicted" || ctx.risk.riskMirrorStatus === "danger") {
      return true;
    }
  }

  // early_exit
  if (mistakeIdLower === "early_exit") {
    if (row.playbookDelta?.exitQuality === "early_exit") return true;
  }

  // late_exit
  if (mistakeIdLower === "late_exit") {
    if (row.playbookDelta?.exitQuality === "late_exit") return true;
  }

  // held_invalidated_trade
  if (mistakeIdLower === "held_invalidated_trade") {
    if (row.playbookDelta?.status === "invalidated") return true;
    if (row.playbookDelta?.exitQuality === "late_exit" || row.playbookDelta?.exitQuality === "unjustified_hold") {
      return true;
    }
  }

  // market_data_degraded
  if (mistakeIdLower === "market_data_degraded") {
    if (ctx.market.marketDataHealth === "degraded") return true;
    if (row.timeline?.events.some(e => 
      e.message.toLowerCase().includes("market degraded") || 
      e.message.toLowerCase().includes("data degraded")
    )) return true;
  }

  return false;
}

function matchDeltaFilter(row: ExecutionTradeReviewRow, deltaStatus: string): boolean {
  if (!row.playbookDelta) return false;
  return row.playbookDelta.status === deltaStatus.toLowerCase();
}

function matchQualityFilter(row: ExecutionTradeReviewRow, quality: string): boolean {
  return row.quality === quality;
}

function matchRiskFilter(row: ExecutionTradeReviewRow, riskKey: string): boolean {
  const riskKeyLower = riskKey.toLowerCase();
  const ctx = row.contextAtEntry || row.contextAtExit;
  if (!ctx) return false;

  // no_sl
  if (riskKeyLower === "no_sl" || riskKeyLower === "no_stop_loss") {
    return !ctx.risk.stopLossDetected;
  }

  // danger
  if (riskKeyLower === "danger") {
    return ctx.diagnostics.contextAlignment === "danger" ||
           ctx.risk.riskMirrorStatus === "danger";
  }

  // conflicted
  if (riskKeyLower === "conflicted") {
    return ctx.diagnostics.contextAlignment === "conflicted" ||
           ctx.risk.riskMirrorStatus === "conflicted";
  }

  // liquidation
  if (riskKeyLower === "liquidation" || riskKeyLower === "liquidation_warning") {
    return ctx.risk.distanceToLiquidationPct != null && ctx.risk.distanceToLiquidationPct < 10;
  }

  // market_data_degraded
  if (riskKeyLower === "market_data_degraded") {
    return ctx.market.marketDataHealth === "degraded";
  }

  return false;
}
