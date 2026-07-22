/**
 * AI-7 — Decision context from question/scenario + knowledge + optional validated snapshot.
 */
import type { MarketSnapshot } from "@shared/goodTradingAiMarket";
import type { DecisionContextTrust } from "@shared/goodTradingAiDecisionGraph";
import type { GoodTradingKnowledgeEntry } from "../knowledge/types";
import { validateMarketSnapshot } from "../market/snapshotValidator";

export type DecisionContextInput = {
  question: string;
  scenarioLabel?: string;
  knowledgeEntries: GoodTradingKnowledgeEntry[];
  marketSnapshot?: MarketSnapshot | null;
  forceUntrusted?: boolean;
  nowMs?: number;
};

export type DecisionContext = {
  question: string;
  scenarioLabel: string | null;
  trust: DecisionContextTrust;
  knowledgeIds: string[];
  knowledgeTitles: Record<string, string>;
  snapshotPresent: boolean;
  snapshotSymbol: string | null;
  snapshotStale: boolean;
  snapshotQualityHint: "high" | "medium" | "low" | "unknown";
  provenance: string[];
  warnings: string[];
  nowMs: number;
};

function snapshotLooksStale(snap: MarketSnapshot, nowMs: number): boolean {
  if (snap.staleness?.some((s) => s.stale)) return true;
  const ts = Date.parse(snap.timestamp);
  if (Number.isFinite(ts) && nowMs - ts > 60_000) return true;
  return false;
}

function qualityHint(snap: MarketSnapshot): "high" | "medium" | "low" | "unknown" {
  const q = snap.scores?.snapshotQuality;
  if (typeof q === "number") {
    if (q >= 70) return "high";
    if (q >= 40) return "medium";
    return "low";
  }
  return "unknown";
}

/**
 * Build decision context. Invalid snapshots are dropped (not trusted).
 * Untrusted scenario never upgrades to VALIDATED_LIVE.
 */
export function buildDecisionContext(input: DecisionContextInput): DecisionContext {
  const nowMs = input.nowMs ?? Date.now();
  const warnings: string[] = [];
  const provenance: string[] = ["question", "retrieved_knowledge"];
  const knowledgeIds = input.knowledgeEntries.map((e) => e.id);
  const knowledgeTitles: Record<string, string> = {};
  for (const e of input.knowledgeEntries) knowledgeTitles[e.id] = e.title;

  let trust: DecisionContextTrust = "NO_MARKET";
  let snapshotPresent = false;
  let snapshotSymbol: string | null = null;
  let snapshotStale = false;
  let snapshotQualityHint: DecisionContext["snapshotQualityHint"] = "unknown";

  if (input.forceUntrusted) {
    trust = "UNTRUSTED_SCENARIO";
    warnings.push("CONTEXT_FORCE_UNTRUSTED");
  } else if (input.marketSnapshot) {
    const v = validateMarketSnapshot(input.marketSnapshot);
    if (!v.ok) {
      warnings.push("SNAPSHOT_REJECTED_INVALID");
      trust = "UNTRUSTED_SCENARIO";
    } else {
      const snap = v.snapshot;
      snapshotPresent = true;
      snapshotSymbol = snap.symbol ?? null;
      snapshotStale = snapshotLooksStale(snap, nowMs);
      snapshotQualityHint = qualityHint(snap);
      provenance.push("validated_market_snapshot");

      if (snap.source === "stub") {
        trust = "VALIDATED_STUB";
      } else if (snap.source === "simulate") {
        trust = "SYNTHETIC_DEBUG";
      } else if (snap.source === "live_internal" || snap.source === "partial") {
        trust = "VALIDATED_LIVE";
        if (snapshotStale) warnings.push("SNAPSHOT_STALE");
      } else {
        trust = "SYNTHETIC_DEBUG";
      }
    }
  }

  if (input.scenarioLabel && /hypothetical|what if|supongamos|imagin/i.test(input.question)) {
    if (trust === "VALIDATED_LIVE") {
      warnings.push("SCENARIO_OVER_LIVE_DOWNGRADED");
      trust = "UNTRUSTED_SCENARIO";
    } else if (trust === "NO_MARKET") {
      trust = "UNTRUSTED_SCENARIO";
    }
  }

  return {
    question: input.question.trim().slice(0, 2000),
    scenarioLabel: input.scenarioLabel?.trim().slice(0, 120) ?? null,
    trust,
    knowledgeIds,
    knowledgeTitles,
    snapshotPresent,
    snapshotSymbol,
    snapshotStale,
    snapshotQualityHint,
    provenance,
    warnings,
    nowMs,
  };
}
