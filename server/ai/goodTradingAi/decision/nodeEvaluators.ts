/**
 * AI-7 — Pure node evaluators (deterministic, no I/O, no OpenAI).
 */
import type { DecisionNodeState } from "@shared/goodTradingAiDecisionGraph";
import type { DecisionContext } from "./decisionContext";
import type { ContradictionFinding } from "../reasoning/contradictionDetector";

export type EvalEnv = {
  context: DecisionContext;
  questionLower: string;
  conflicts: ContradictionFinding[];
};

export type EvalResult = {
  state: DecisionNodeState;
  detail?: string;
  fired?: boolean;
};

function hasAny(q: string, words: string[]): boolean {
  return words.some((w) => q.includes(w));
}

export function evaluateNode(evalKey: string, env: EvalEnv): EvalResult {
  switch (evalKey) {
    case "context_trust": {
      if (env.context.trust === "UNTRUSTED_SCENARIO") {
        return { state: "BLOCKED", detail: "UNTRUSTED_SCENARIO", fired: true };
      }
      if (env.context.snapshotStale) {
        return { state: "STALE", detail: "SNAPSHOT_STALE", fired: true };
      }
      if (env.context.trust === "NO_MARKET") {
        return { state: "INSUFFICIENT", detail: "NO_MARKET", fired: true };
      }
      return { state: "ACTIVE", fired: true };
    }
    case "guard_stale": {
      if (env.context.snapshotStale || env.context.warnings.includes("SNAPSHOT_STALE")) {
        return { state: "BLOCKED", detail: "STALE_BLOCKS_SUPPORT", fired: true };
      }
      return { state: "SKIPPED", fired: false };
    }
    case "guard_untrusted": {
      if (env.context.trust === "UNTRUSTED_SCENARIO") {
        return { state: "BLOCKED", detail: "UNTRUSTED_GUARD", fired: true };
      }
      return { state: "SKIPPED", fired: false };
    }
    case "hypothesis_open":
      return { state: "ACTIVE", detail: "HYPOTHESIS_OPEN", fired: true };
    case "confirmation_keywords": {
      const ok = hasAny(env.questionLower, [
        "confirm",
        "confirmación",
        "acceptance",
        "pasivo",
        "reclaim",
        "absorption",
        "multi",
        "evidencia",
        "confluence",
      ]);
      return ok
        ? { state: "SUPPORTED", detail: "CONFIRMATION_HIT", fired: true }
        : { state: "INSUFFICIENT", detail: "CONFIRMATION_MISSING", fired: false };
    }
    case "invalidation_keywords": {
      const ok = hasAny(env.questionLower, [
        "invalid",
        "sin reclaim",
        "no reclaim",
        "rompe",
        "fails",
        "falla",
      ]);
      return ok
        ? { state: "INVALIDATED", detail: "INVALIDATION_HIT", fired: true }
        : { state: "SKIPPED", fired: false };
    }
    case "invalidation_delta_alone": {
      const ok = /solo (con )?delta|delta alcanza|delta basta/.test(env.questionLower);
      return ok
        ? { state: "INVALIDATED", detail: "DELTA_ALONE", fired: true }
        : { state: "SKIPPED", fired: false };
    }
    case "invalidation_gamma_binary": {
      const ok = /gamma = direc|gamma confirma|gamma dice compr|gamma dice vend/.test(
        env.questionLower,
      );
      return ok
        ? { state: "INVALIDATED", detail: "GAMMA_BINARY", fired: true }
        : { state: "SKIPPED", fired: false };
    }
    case "invalidation_wall_reversal": {
      const ok = /wall confirma reversi|wall = revers|wall garantiza/.test(env.questionLower);
      return ok
        ? { state: "INVALIDATED", detail: "WALL_REVERSAL", fired: true }
        : { state: "SKIPPED", fired: false };
    }
    case "conflict_scan": {
      if (env.conflicts.length > 0) {
        return {
          state: "CONFLICTED",
          detail: env.conflicts.map((c) => c.code).join(","),
          fired: true,
        };
      }
      return { state: "SKIPPED", fired: false };
    }
    case "conclusion_from_path":
      return { state: "ACTIVE", fired: true };
    default:
      return { state: "INSUFFICIENT", detail: "UNKNOWN_EVAL", fired: false };
  }
}
