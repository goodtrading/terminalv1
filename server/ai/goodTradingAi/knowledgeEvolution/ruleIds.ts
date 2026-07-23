/**
 * Stable rule ID factory — never free-text IDs.
 * Pattern: RULE_<LENS[+LENS]>_<KIND>
 */
import type { EvidenceLens } from "@shared/goodTradingAiCriticalCalibration";
import type { RuleKind, StableRuleId } from "@shared/goodTradingAiKnowledgeEvolution";
import { stableRuleIdSchema } from "@shared/goodTradingAiKnowledgeEvolution";
import { normalizeText } from "../knowledgeDistillation/normalize";

const PRIORITY_HINTS = ["pesa mas", "weighs more", "priority", "prioriza", ">", "over", "antes que"];
const CONFLICT_HINTS = ["conflict", "vs", "versus", "disagree", "contra"];
const INVALIDATION_HINTS = ["invalidate", "invalidation", "invalidacion"];
const CONFIRM_HINTS = ["confirm", "confirmation", "confirmacion", "requires"];

export function inferRuleKind(text: string, lenses: EvidenceLens[]): RuleKind {
  const n = normalizeText(text);
  if (PRIORITY_HINTS.some((h) => n.includes(normalizeText(h)))) return "PRIORITY";
  if (CONFLICT_HINTS.some((h) => n.includes(h))) return "CONFLICT";
  if (INVALIDATION_HINTS.some((h) => n.includes(normalizeText(h)))) return "INVALIDATION";
  if (CONFIRM_HINTS.some((h) => n.includes(normalizeText(h)))) return "CONFIRMATION";
  if (lenses.length >= 2) return "DEPENDENCY";
  return "GENERAL";
}

export function buildStableRuleId(lenses: EvidenceLens[], kind: RuleKind): StableRuleId {
  const lensPart = [...new Set(lenses)].sort().slice(0, 3).join("_") || "CONTEXT";
  const raw = `RULE_${lensPart}_${kind}`;
  return stableRuleIdSchema.parse(raw.slice(0, 96));
}

export function labelForRule(id: StableRuleId, kind: RuleKind, lenses: EvidenceLens[]): string {
  return `${id.replace(/^RULE_/, "").replace(/_/g, " ")} (${kind}; ${lenses.join("+")})`.slice(0, 160);
}