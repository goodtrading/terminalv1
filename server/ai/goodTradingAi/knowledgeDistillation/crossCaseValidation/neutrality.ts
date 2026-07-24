/**
 * AI-7.3.13 — Adversarial neutrality pre-audit for cross-case questions.
 */
import type { NeutralityClass } from "@shared/goodTradingAiCrossCaseValidation";
import type { ScenarioSimilarityClass } from "@shared/goodTradingAiIndependentEvidence";
import { FORBIDDEN_TRADING_OUTCOME_TOKENS } from "@shared/goodTradingAiDecisionGraph";

function normalize(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenSet(s: string): Set<string> {
  return new Set(normalize(s).split(" ").filter((t) => t.length > 3));
}

function jaccard(a: Set<string>, b: Set<string>): number {
  if (!a.size || !b.size) return 0;
  let inter = 0;
  for (const t of a) if (b.has(t)) inter++;
  return inter / (a.size + b.size - inter);
}

const LEADING_PATTERNS = [
  /\bconfirm[aá]s\b/i,
  /\bconfirm that\b/i,
  /\bdo you confirm\b/i,
  /\bonly (vale|valid|counts)\b/i,
  /\bsolo vale\b/i,
  /\bas we (said|established)\b/i,
  /\bcomo (dijimos|establecimos)\b/i,
  /\byou (should|must) agree\b/i,
  /\bthe (correct|right) (answer|rule)\b/i,
  /\bla (respuesta|regla) (correcta|adecuada)\b/i,
];

export function auditQuestionNeutrality(input: {
  prompt: string;
  priorPrompts: string[];
  challengePrompt: string;
  relationToOriginal: ScenarioSimilarityClass;
}): { class: NeutralityClass; reason: string } {
  const upper = input.prompt.toUpperCase();
  for (const tok of FORBIDDEN_TRADING_OUTCOME_TOKENS) {
    if (new RegExp("\\b" + tok + "\\b").test(upper)) {
      return { class: "POTENTIALLY_LEADING", reason: `Forbidden trading token: ${tok}` };
    }
  }
  for (const re of LEADING_PATTERNS) {
    if (re.test(input.prompt)) {
      return { class: "POTENTIALLY_LEADING", reason: `Leading pattern: ${re}` };
    }
  }
  if (input.relationToOriginal === "DUPLICATE") {
    return { class: "DUPLICATE_SCENARIO", reason: "relationToOriginal=DUPLICATE" };
  }
  if (input.relationToOriginal === "METAMORPHIC_VARIANT") {
    return {
      class: "LOW_INFORMATION",
      reason: "METAMORPHIC_VARIANT not preferred for independent cross-case support",
    };
  }

  const promptTokens = tokenSet(input.prompt);
  for (const prior of input.priorPrompts) {
    if (jaccard(promptTokens, tokenSet(prior)) >= 0.72) {
      return { class: "DUPLICATE_SCENARIO", reason: "Near-identical wording vs prior session prompt" };
    }
  }
  // Challenge engine prompts are templates — reject if we reuse them verbatim
  if (input.challengePrompt && normalize(input.prompt) === normalize(input.challengePrompt)) {
    return { class: "DUPLICATE_SCENARIO", reason: "Verbatim challenge prompt reuse" };
  }
  if (input.prompt.length < 40) {
    return { class: "LOW_INFORMATION", reason: "Prompt too short" };
  }
  const allowsDepends =
    /\bdepende\b/i.test(input.prompt) ||
    /\bdepends\b/i.test(input.prompt) ||
    /\bo si\b/i.test(input.prompt) ||
    /\bcontraejemplo\b/i.test(input.prompt) ||
    /\bqu[eé] (evidencia|condici[oó]n|stack)\b/i.test(input.prompt);
  if (!allowsDepends) {
    return { class: "LOW_INFORMATION", reason: "Does not invite depends/conditions/refutation" };
  }
  return { class: "BLIND_SAFE", reason: "Neutral distinct cross-case prompt" };
}
