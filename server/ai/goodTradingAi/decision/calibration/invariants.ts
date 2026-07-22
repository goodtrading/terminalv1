/**
 * AI-7.1 — 20 methodological invariants (must hold 100%).
 */
import type { DecisionGraphInternal } from "@shared/goodTradingAiDecisionGraph";
import { FORBIDDEN_TRADING_OUTCOME_TOKENS } from "@shared/goodTradingAiDecisionGraph";
import {
  MAX_INTERNAL_NODES,
  MAX_PATHS,
  MAX_RENDERED_NODES,
} from "../limits";
import type { DecisionGraphClientSafe } from "@shared/goodTradingAiDecisionGraph";

export type InvariantResult = { id: string; ok: boolean; detail?: string };

export const METHODOLOGICAL_INVARIANT_IDS = [
  "INV_MENTOR_ELIGIBLE_FALSE",
  "INV_NO_TRADING_OUTCOME_TOKENS",
  "INV_INTERNAL_NODES_LE_20",
  "INV_PATHS_LE_2",
  "INV_RENDERED_NODES_LE_12",
  "INV_STALE_CANNOT_FULL_SUPPORT_QUALITY",
  "INV_UNTRUSTED_NOT_WELL_SUPPORTED_LIVE",
  "INV_TRIGGERED_INVALIDATION_NOT_DROPPED_FOR_LOW",
  "INV_PRIMARY_PATH_PRESENT_OR_EMPTY",
  "INV_QUALITY_NOT_WINRATE",
  "INV_SCHEMA_VERSION",
  "INV_TEMPLATE_ID_PRESENT",
  "INV_WARNINGS_BOUNDED",
  "INV_CONFLICT_CODES_NO_TRADE",
  "INV_CONFIRMATION_NOT_MANDATE",
  "INV_GUARD_BLOCKS_UNTRUSTED",
  "INV_NO_OPENAI_IN_GRAPH_META",
  "INV_PATH_OUTCOMES_EDUCATIONAL",
  "INV_CLIENT_SAFE_PATHS_LE_2",
  "INV_ALTERNATIVE_PATH_PRIORITY",
] as const;

export function runMethodologicalInvariants(params: {
  graph: DecisionGraphInternal;
  clientSafe: DecisionGraphClientSafe;
}): InvariantResult[] {
  const { graph, clientSafe } = params;
  const dump = JSON.stringify({ graph, clientSafe });
  const results: InvariantResult[] = [];

  const check = (id: string, ok: boolean, detail?: string) => {
    results.push({ id, ok, detail });
  };

  check("INV_MENTOR_ELIGIBLE_FALSE", graph.mentorEligible === false && clientSafe.mentorEligible === false);
  check(
    "INV_NO_TRADING_OUTCOME_TOKENS",
    !FORBIDDEN_TRADING_OUTCOME_TOKENS.some((t) => new RegExp(`\\b${t}\\b`).test(dump)),
  );
  check("INV_INTERNAL_NODES_LE_20", graph.nodes.length <= MAX_INTERNAL_NODES, `n=${graph.nodes.length}`);
  check("INV_PATHS_LE_2", graph.paths.length <= MAX_PATHS, `p=${graph.paths.length}`);
  check(
    "INV_RENDERED_NODES_LE_12",
    (clientSafe.renderedNodeCount ?? 0) <= MAX_RENDERED_NODES,
  );
  check(
    "INV_STALE_CANNOT_FULL_SUPPORT_QUALITY",
    !(graph.contextTrust === "VALIDATED_LIVE" && graph.warnings.includes("SNAPSHOT_STALE") && graph.quality === "WELL_SUPPORTED" && graph.nodes.every((n) => n.kind !== "CONFIRMATION")),
  );
  check(
    "INV_UNTRUSTED_NOT_WELL_SUPPORTED_LIVE",
    !(graph.contextTrust === "UNTRUSTED_SCENARIO" && graph.quality === "WELL_SUPPORTED" && clientSafe.primaryOutcome === "HYPOTHESIS_SUPPORTED" && !graph.warnings.length),
  );
  const lowConf = graph.nodes.filter(
    (n) => n.kind === "CONFIRMATION" && n.priority === "LOW" && n.state !== "SUPPORTED",
  );
  const trigInv = graph.nodes.filter((n) => n.kind === "INVALIDATION" && n.state === "INVALIDATED");
  check(
    "INV_TRIGGERED_INVALIDATION_NOT_DROPPED_FOR_LOW",
    trigInv.length === 0 || graph.nodes.some((n) => n.kind === "INVALIDATION" && n.state === "INVALIDATED"),
    lowConf.length ? `lowConf=${lowConf.length}` : undefined,
  );
  check(
    "INV_PRIMARY_PATH_PRESENT_OR_EMPTY",
    graph.paths.length === 0 || graph.primaryPathId != null,
  );
  check(
    "INV_QUALITY_NOT_WINRATE",
    !/win\s*rate|winrate|expectancy|pnl/i.test(dump),
  );
  check("INV_SCHEMA_VERSION", graph.schemaVersion === "1.0");
  check("INV_TEMPLATE_ID_PRESENT", graph.templateId.length > 0);
  check("INV_WARNINGS_BOUNDED", graph.warnings.length <= 20);
  check(
    "INV_CONFLICT_CODES_NO_TRADE",
    !graph.paths.some((p) => p.conflictCodes.some((c) => /BUY|SELL|LONG|SHORT/.test(c))),
  );
  check(
    "INV_CONFIRMATION_NOT_MANDATE",
    !/must buy|debes comprar|orden de mercado/i.test(dump),
  );
  check(
    "INV_GUARD_BLOCKS_UNTRUSTED",
    graph.contextTrust !== "UNTRUSTED_SCENARIO" ||
      graph.quality === "UNTRUSTED_SCENARIO" ||
      clientSafe.primaryOutcome === "CONTEXT_UNTRUSTED" ||
      clientSafe.primaryOutcome === "GUARD_BLOCKED" ||
      clientSafe.primaryOutcome === "EVIDENCE_INSUFFICIENT" ||
      clientSafe.primaryOutcome === "HYPOTHESIS_OPEN",
  );
  check("INV_NO_OPENAI_IN_GRAPH_META", !/openai|embedding/i.test(graph.templateId));
  check(
    "INV_PATH_OUTCOMES_EDUCATIONAL",
    graph.paths.every((p) => !/BUY|SELL|LONG|SHORT/.test(p.outcome)),
  );
  check("INV_CLIENT_SAFE_PATHS_LE_2", clientSafe.pathSummaries.length <= 2);
  check(
    "INV_ALTERNATIVE_PATH_PRIORITY",
    graph.paths.length < 2 ||
      graph.paths.some((p) => p.priority === "CRITICAL" || p.id.includes("alt")),
  );

  if (results.length !== 20) {
    throw new Error(`Expected 20 invariants, got ${results.length}`);
  }
  return results;
}

export function invariantsAllPass(results: InvariantResult[]): boolean {
  return results.every((r) => r.ok);
}
