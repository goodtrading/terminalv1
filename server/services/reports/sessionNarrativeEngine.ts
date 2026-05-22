import type { ExecutionContextSnapshot } from "./executionContextTypes";
import type { PlaybookMatchResult } from "./playbookMatchTypes";
import type { TradeReviewRow } from "./executionReportTypes";
import type { SessionExecutionNarrative } from "./sessionNarrativeTypes";

type NarrativeSource = "paper" | "bingx" | "all";

type MistakeBucket = {
  id: string;
  label: string;
  impact: "low" | "medium" | "high";
};

const MISTAKE_DEFS: Record<string, MistakeBucket> = {
  no_stop_loss: {
    id: "no_stop_loss",
    label: "No stop loss protection",
    impact: "high",
  },
  no_playbook_match: {
    id: "no_playbook_match",
    label: "No institutional playbook match",
    impact: "medium",
  },
  early_exit: {
    id: "early_exit",
    label: "Early exit vs playbook",
    impact: "medium",
  },
  late_exit: {
    id: "late_exit",
    label: "Late exit / held too long",
    impact: "medium",
  },
  held_invalidated_trade: {
    id: "held_invalidated_trade",
    label: "Held trade after playbook invalidation",
    impact: "high",
  },
  low_confidence_entries: {
    id: "low_confidence_entries",
    label: "Low-confidence playbook entries (<60%)",
    impact: "medium",
  },
  trading_against_context: {
    id: "trading_against_context",
    label: "Entry against conflicted/danger context",
    impact: "high",
  },
  repeated_same_direction: {
    id: "repeated_same_direction",
    label: "Repeated same-direction entries",
    impact: "low",
  },
  poor_rr: {
    id: "poor_rr",
    label: "Poor R-multiple outcomes",
    impact: "medium",
  },
  market_data_degraded: {
    id: "market_data_degraded",
    label: "Entries with degraded market data",
    impact: "low",
  },
};

function primaryPlaybook(row: TradeReviewRow): PlaybookMatchResult | undefined {
  return row.playbookAtEntry ?? row.playbookMatch ?? row.playbookAtExit;
}

function playbookId(row: TradeReviewRow): string {
  const p = primaryPlaybook(row)?.primary;
  return p?.id ?? "unknown";
}

function playbookName(row: TradeReviewRow): string {
  const p = primaryPlaybook(row)?.primary;
  if (!p || p.id === "no_match") return "No Playbook Match";
  return p.name;
}

function isNoMatch(row: TradeReviewRow): boolean {
  const p = primaryPlaybook(row)?.primary;
  return !p || p.id === "no_match" || p.status === "no_match";
}

function isImpulsive(row: TradeReviewRow): boolean {
  const tags = primaryPlaybook(row)?.primary?.tags ?? [];
  return tags.includes("impulsive") && !tags.includes("structural");
}

function isStructural(row: TradeReviewRow): boolean {
  const tags = primaryPlaybook(row)?.primary?.tags ?? [];
  return tags.includes("structural");
}

function ctxEntry(row: TradeReviewRow): ExecutionContextSnapshot | undefined {
  return row.contextAtEntry ?? row.contextAtExit;
}

function hasRichContext(row: TradeReviewRow): boolean {
  const ctx = ctxEntry(row);
  return Boolean(ctx?.risk && ctx?.diagnostics);
}

function isActionableTrade(row: TradeReviewRow): boolean {
  return (
    row.status !== "cancelled" &&
    row.status !== "rejected" &&
    row.entry != null
  );
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function collectTradeMistakes(row: TradeReviewRow): string[] {
  const keys: string[] = [];
  const ctx = ctxEntry(row);
  const pb = primaryPlaybook(row);
  const conf = pb?.primary?.confidence ?? 0;
  const delta = row.playbookDelta;

  if (ctx?.risk && !ctx.risk.stopLossDetected) {
    keys.push("no_stop_loss");
  }
  const mistakesLower = (row.mistakes ?? "").toLowerCase();
  if (
    mistakesLower.includes("no sl") ||
    mistakesLower.includes("no stop") ||
    mistakesLower.includes("stop-loss")
  ) {
    keys.push("no_stop_loss");
  }

  if (isNoMatch(row)) keys.push("no_playbook_match");
  if (conf > 0 && conf < 60 && !isNoMatch(row)) {
    keys.push("low_confidence_entries");
  }

  const alignment = ctx?.diagnostics?.contextAlignment;
  if (alignment === "conflicted" || alignment === "danger") {
    keys.push("trading_against_context");
  }

  if (ctx?.market?.marketDataHealth === "degraded" || ctx?.market?.marketDataHealth === "error") {
    keys.push("market_data_degraded");
  }

  if (delta?.exitQuality === "early_exit") keys.push("early_exit");
  if (
    delta?.exitQuality === "late_exit" ||
    delta?.exitQuality === "unjustified_hold"
  ) {
    keys.push("late_exit");
  }
  if (delta?.status === "invalidated") keys.push("held_invalidated_trade");

  if (row.r != null && row.r < -0.5) keys.push("poor_rr");
  if (row.status === "closed" && (row.pnlUsdt ?? 0) < 0 && row.r != null && row.r < 0) {
    keys.push("poor_rr");
  }

  for (const w of delta?.warnings ?? []) {
    const wl = w.toLowerCase();
    if (wl.includes("early")) keys.push("early_exit");
    if (wl.includes("late") || wl.includes("held")) keys.push("late_exit");
  }

  for (const ev of row.timeline?.events ?? []) {
    if (ev.severity === "danger" && ev.type === "risk_update") {
      keys.push("no_stop_loss");
    }
  }

  return [...new Set(keys)];
}

function buildPlaybookStats(trades: TradeReviewRow[]) {
  const map = new Map<
    string,
    {
      playbookId: string;
      name: string;
      count: number;
      wins: number;
      losses: number;
      pnlSum: number;
      pnlCount: number;
      rSum: number;
      rCount: number;
      confSum: number;
      invalidated: number;
      noMatch: number;
    }
  >();

  for (const row of trades) {
    const id = playbookId(row);
    const name = playbookName(row);
    let bucket = map.get(id);
    if (!bucket) {
      bucket = {
        playbookId: id,
        name,
        count: 0,
        wins: 0,
        losses: 0,
        pnlSum: 0,
        pnlCount: 0,
        rSum: 0,
        rCount: 0,
        confSum: 0,
        invalidated: 0,
        noMatch: 0,
      };
      map.set(id, bucket);
    }
    bucket.count += 1;
    const conf = primaryPlaybook(row)?.primary?.confidence;
    if (conf != null && Number.isFinite(conf)) bucket.confSum += conf;
    if (isNoMatch(row)) bucket.noMatch += 1;
    if (row.playbookDelta?.status === "invalidated") bucket.invalidated += 1;

    if (row.status === "closed" && row.pnlUsdt != null) {
      bucket.pnlSum += row.pnlUsdt;
      bucket.pnlCount += 1;
      if (row.pnlUsdt > 0) bucket.wins += 1;
      else if (row.pnlUsdt < 0) bucket.losses += 1;
    }
    if (row.r != null && Number.isFinite(row.r)) {
      bucket.rSum += row.r;
      bucket.rCount += 1;
    }
  }

  return [...map.values()]
    .map((b) => {
      const closed = b.wins + b.losses;
      return {
        playbookId: b.playbookId,
        name: b.name,
        count: b.count,
        winRate: closed > 0 ? Math.round((b.wins / closed) * 100) : undefined,
        avgPnlUsdt:
          b.pnlCount > 0 ? round2(b.pnlSum / b.pnlCount) : undefined,
        avgR: b.rCount > 0 ? round2(b.rSum / b.rCount) : undefined,
        avgConfidence:
          b.count > 0 ? Math.round(b.confSum / b.count) : undefined,
        _invalidated: b.invalidated,
        _noMatch: b.noMatch,
      };
    })
    .sort((a, b) => b.count - a.count);
}

function aggregateMistakes(trades: TradeReviewRow[]): SessionExecutionNarrative["repeatedMistakes"] {
  const counts = new Map<string, number>();
  for (const row of trades) {
    for (const key of collectTradeMistakes(row)) {
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
  }

  const longs = trades.filter((t) => t.direction === "Long").length;
  const shorts = trades.filter((t) => t.direction === "Short").length;
  if (trades.length >= 3 && (longs >= trades.length * 0.8 || shorts >= trades.length * 0.8)) {
    counts.set(
      "repeated_same_direction",
      Math.max(longs, shorts),
    );
  }

  return [...counts.entries()]
    .filter(([, c]) => c >= 1)
    .map(([id, count]) => {
      const def = MISTAKE_DEFS[id] ?? {
        id,
        label: id.replace(/_/g, " "),
        impact: "low" as const,
      };
      return {
        id: def.id,
        label: def.label,
        count,
        impact: def.impact,
      };
    })
    .sort((a, b) => b.count - a.count)
    .slice(0, 8);
}

function collectPositives(trades: TradeReviewRow[]): string[] {
  const out: string[] = [];
  let slCount = 0;
  let alignedCount = 0;
  let goodExitCount = 0;
  let heldCount = 0;
  let highConfCount = 0;

  for (const row of trades) {
    const ctx = ctxEntry(row);
    if (ctx?.risk?.stopLossDetected) slCount += 1;
    if (ctx?.diagnostics?.contextAlignment === "aligned") alignedCount += 1;
    const conf = primaryPlaybook(row)?.primary?.confidence ?? 0;
    if (conf >= 70 && !isNoMatch(row)) highConfCount += 1;
    if (row.playbookDelta?.exitQuality === "good_exit") goodExitCount += 1;
    if (
      row.playbookDelta?.status === "held" ||
      row.playbookDelta?.status === "improved"
    ) {
      heldCount += 1;
    }
    if (row.playbookDelta?.exitQuality === "forced_exit") {
      out.push("Forced exit respected on at least one trade.");
    }
  }

  if (slCount > 0) {
    out.push(
      `Stop loss detected on ${slCount} of ${trades.length} trade(s).`,
    );
  }
  if (alignedCount > 0) {
    out.push(`Context aligned on ${alignedCount} trade(s).`);
  }
  if (highConfCount > 0) {
    out.push(`High-confidence playbook (≥70%) on ${highConfCount} trade(s).`);
  }
  if (goodExitCount > 0) {
    out.push(`Good exit quality on ${goodExitCount} closed trade(s).`);
  }
  if (heldCount > 0) {
    out.push(`Playbook held through exit on ${heldCount} trade(s).`);
  }

  const bingxReadOnly = trades.some((t) => t.source === "bingx");
  if (bingxReadOnly) {
    out.push("BingX session remained read-only — no live execution.");
  }

  return [...new Set(out)].slice(0, 6);
}

function buildSummary(
  source: NarrativeSource,
  trades: TradeReviewRow[],
  stats: ReturnType<typeof buildPlaybookStats>,
  mistakes: SessionExecutionNarrative["repeatedMistakes"],
  impulsivePct: number,
  withContextPct: number,
): string {
  if (trades.length === 0) {
    return "No execution data for this session.";
  }

  const top = stats[0];
  const topName = top?.name ?? "mixed setups";
  const invalidatedTotal = mistakes.find(
    (m) => m.id === "held_invalidated_trade",
  )?.count ?? 0;
  const noSl = mistakes.find((m) => m.id === "no_stop_loss")?.count ?? 0;
  const lowConf = mistakes.find((m) => m.id === "low_confidence_entries")?.count ?? 0;

  if (source === "bingx" && trades.every((t) => t.status === "open")) {
    return "Real BingX read-only position under review. Session narrative is partial until exit history is available.";
  }

  if (impulsivePct >= 0.55 && (lowConf >= 2 || invalidatedTotal >= 2)) {
    return `Session was dominated by low-confidence ${topName} attempts. Multiple trades closed after playbook weakening, suggesting reactive execution and weak selectivity.`;
  }

  if (
    top &&
    top.playbookId !== "no_match" &&
    (top.avgConfidence ?? 0) >= 65 &&
    noSl <= 1 &&
    invalidatedTotal === 0
  ) {
    return `Session showed disciplined execution around ${topName} setups. Most trades had SL protection and playbook structure remained valid into exit.`;
  }

  if (withContextPct < 0.5) {
    return `Session had ${trades.length} trade(s) with mixed capture quality. Structural bias appeared around ${topName}, but context/playbook data is incomplete on older trades.`;
  }

  return `Session had a clear bias toward ${topName} but execution quality was mixed. Best trades respected protection; weakest trades came from partial matches near conflicted context.`;
}

function buildNextSessionFocus(
  mistakes: SessionExecutionNarrative["repeatedMistakes"],
  stats: ReturnType<typeof buildPlaybookStats>,
  trades: TradeReviewRow[],
): string[] {
  const focus: string[] = [];
  const top = stats[0];

  if (mistakes.some((m) => m.id === "no_stop_loss" && m.count >= 1)) {
    focus.push("Require structural stop loss before every new entry.");
  }
  if (mistakes.some((m) => m.id === "low_confidence_entries" && m.count >= 2)) {
    focus.push("Avoid entries below 60% playbook confidence.");
  }
  if (mistakes.some((m) => m.id === "held_invalidated_trade" && m.count >= 2)) {
    focus.push("Stop trading after two consecutive invalidated playbooks.");
  }
  if (top?.playbookId === "flip_rejection") {
    focus.push("Only take Flip Rejection if SL is structurally beyond the flip.");
  }
  if (mistakes.some((m) => m.id === "trading_against_context" && m.count >= 1)) {
    focus.push("Prioritize trades with Risk Mirror aligned or neutral.");
  }
  if (mistakes.some((m) => m.id === "market_data_degraded" && m.count >= 1)) {
    focus.push("Do not enter if market data health is degraded.");
  }
  if (mistakes.some((m) => m.id === "late_exit" && m.count >= 2)) {
    focus.push("Define exit rules before entry to avoid late reactive closes.");
  }
  if (mistakes.some((m) => m.id === "repeated_same_direction" && m.count >= 3)) {
    focus.push("Review whether repeated same-direction entries were intentional.");
  }

  if (focus.length === 0 && trades.length > 0) {
    focus.push("Maintain current selectivity and journal each trade with SL/TP in place.");
    focus.push("Review Execution tab timeline before the next session.");
  }

  return [...new Set(focus)].slice(0, 5);
}

export function buildSessionExecutionNarrative(params: {
  source: NarrativeSource;
  symbol: string;
  trades: TradeReviewRow[];
}): SessionExecutionNarrative {
  const symbol = params.symbol.trim() || "BTC-USDT";
  const actionable = params.trades.filter(isActionableTrade);
  const withContext = actionable.filter(hasRichContext);
  const withContextPct =
    actionable.length > 0 ? withContext.length / actionable.length : 0;

  if (actionable.length === 0) {
    return {
      status: "unavailable",
      generatedAt: Date.now(),
      source: params.source,
      symbol,
      summary: "No execution data for this session.",
      dominantBehavior: {
        title: "No activity",
        description: "No trades available to analyze.",
        severity: "neutral",
      },
      bestBehavior: {
        title: "—",
        description: "No trades to evaluate.",
      },
      worstBehavior: {
        title: "—",
        description: "No trades to evaluate.",
      },
      playbookStats: [],
      repeatedMistakes: [],
      positives: [],
      warnings: [],
      nextSessionFocus: ["Complete at least one paper or read-only session trade to generate narrative."],
    };
  }

  const statsRaw = buildPlaybookStats(actionable);
  const playbookStats = statsRaw.map(
    ({ playbookId, name, count, winRate, avgPnlUsdt, avgR, avgConfidence }) => ({
      playbookId,
      name,
      count,
      winRate,
      avgPnlUsdt,
      avgR,
      avgConfidence,
    }),
  );

  const repeatedMistakes = aggregateMistakes(actionable);
  const positives = collectPositives(actionable);
  const impulsiveCount = actionable.filter(isImpulsive).length;
  const structuralCount = actionable.filter(isStructural).length;
  const impulsivePct = impulsiveCount / actionable.length;

  const warnings: string[] = [];
  if (withContextPct < 1) {
    warnings.push("Some trades lack context/playbook capture.");
  }
  if (params.source === "bingx") {
    warnings.push("BingX narrative is read-only — no execution actions.");
  }
  if (params.source === "all") {
    warnings.push("Combined paper + BingX view — interpret sources separately.");
  }

  const top = statsRaw[0];
  const bestStat = [...statsRaw]
    .filter((s) => s.playbookId !== "no_match" && (s.count ?? 0) >= 1)
    .sort((a, b) => (b.winRate ?? 0) - (a.winRate ?? 0) || (b.avgPnlUsdt ?? 0) - (a.avgPnlUsdt ?? 0))[0];
  const worstStat = [...statsRaw]
    .filter((s) => s.count >= 1)
    .sort(
      (a, b) =>
        (a.avgPnlUsdt ?? 0) - (b.avgPnlUsdt ?? 0) ||
        (a.winRate ?? 100) - (b.winRate ?? 100),
    )[0];

  let dominantTitle = "Mixed execution";
  let dominantDesc = "No single playbook dominated the session.";
  let dominantSeverity: SessionExecutionNarrative["dominantBehavior"]["severity"] =
    "neutral";

  if (impulsivePct >= 0.5) {
    dominantTitle = "Impulsive / reactive bias";
    dominantDesc = `${impulsiveCount} of ${actionable.length} trades tagged impulsive or low-structure.`;
    dominantSeverity = "warning";
  } else if (top && top.playbookId !== "no_match") {
    dominantTitle = `${top.name} dominated`;
    dominantDesc = `${top.count} trade(s) · avg confidence ${top.avgConfidence ?? "—"}%.`;
    dominantSeverity =
      (top.avgConfidence ?? 0) >= 65 ? "positive" : "neutral";
  } else if (top?.playbookId === "no_match") {
    dominantTitle = "Low playbook selectivity";
    dominantDesc = `${top.count} trade(s) without institutional playbook match.`;
    dominantSeverity = "warning";
  }

  if (structuralCount > impulsiveCount && structuralCount >= actionable.length * 0.4) {
    dominantTitle = "Structural playbook bias";
    dominantDesc = `${structuralCount} trade(s) tagged structural — aligned institutional framing.`;
    dominantSeverity = "positive";
  }

  const bestBehavior = {
    title:
      repeatedMistakes.find((m) => m.id === "no_stop_loss")?.count === 0
        ? "Protection respected"
        : bestStat
          ? `${bestStat.name} efficiency`
          : "Disciplined subset",
    description:
      repeatedMistakes.find((m) => m.id === "no_stop_loss")?.count === 0
        ? "Trades with stop loss detected in context."
        : bestStat
          ? `Win rate ${bestStat.winRate ?? "—"}% · avg PnL ${bestStat.avgPnlUsdt ?? "—"} USDT.`
          : positives[0] ?? "Some trades followed context alignment.",
  };

  const worstMistake = repeatedMistakes[0];
  const worstBehavior = {
    title: worstMistake
      ? worstMistake.label
      : worstStat
        ? `${worstStat.name} underperformed`
        : "Weak selectivity",
    description: worstMistake
      ? `Occurred ${worstMistake.count} time(s) this session.`
      : worstStat
        ? `Avg PnL ${worstStat.avgPnlUsdt ?? "—"} USDT · ${worstStat.count} trade(s).`
        : "Review mistakes column and timeline replay per trade.",
  };

  const summary = buildSummary(
    params.source,
    actionable,
    statsRaw,
    repeatedMistakes,
    impulsivePct,
    withContextPct,
  );

  let status: SessionExecutionNarrative["status"] = "available";
  if (withContextPct < 0.35) status = "partial";
  if (params.source === "bingx" && actionable.some((t) => t.status === "open")) {
    status = "partial";
  }

  return {
    status,
    generatedAt: Date.now(),
    source: params.source,
    symbol,
    summary,
    dominantBehavior: {
      title: dominantTitle,
      description: dominantDesc,
      severity: dominantSeverity,
    },
    bestBehavior,
    worstBehavior,
    repeatedMistakes,
    playbookStats,
    positives,
    warnings,
    nextSessionFocus: buildNextSessionFocus(
      repeatedMistakes,
      statsRaw,
      actionable,
    ),
  };
}
