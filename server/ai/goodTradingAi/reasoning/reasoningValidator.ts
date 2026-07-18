import { knowledgeRegistry } from "../knowledge/registry";
import type { MentorReasoningBlock } from "./reasoningSteps";
import { MAX_REASONING_CHAIN_STEPS } from "./reasoningSteps";

export type ReasoningValidationIssue = { code: string; message: string };

/**
 * Validate reasoning block coherence vs summary / registry.
 */
export function validateReasoningBlock(params: {
  reasoning: MentorReasoningBlock | undefined;
  summary: string;
  allowedKnowledgeIds: string[];
}): { ok: boolean; reasoning?: MentorReasoningBlock; issues: ReasoningValidationIssue[] } {
  const issues: ReasoningValidationIssue[] = [];
  if (!params.reasoning) {
    return { ok: true, issues };
  }

  const allowed = new Set(params.allowedKnowledgeIds);
  const steps = [...(params.reasoning.steps ?? [])];
  const cleanedSteps = [];
  let expectedIndex = 1;

  for (const step of steps.slice(0, MAX_REASONING_CHAIN_STEPS)) {
    if (!step?.label?.trim() || !step?.detail?.trim()) {
      issues.push({ code: "EMPTY_STEP", message: "empty reasoning step" });
      continue;
    }
    if (step.knowledgeId) {
      if (!knowledgeRegistry.getById(step.knowledgeId)) {
        issues.push({
          code: "INVENTED_CONCEPT",
          message: `unknown knowledgeId ${step.knowledgeId}`,
        });
        continue;
      }
      if (allowed.size > 0 && !allowed.has(step.knowledgeId)) {
        // Allow 1–2 level expansion ids even if not in original retrieval, if they exist in registry
        // but flag if completely unrelated empty allowed set is fine
      }
    }
    if (step.index !== expectedIndex) {
      issues.push({ code: "SKIPPED_STEP", message: `expected index ${expectedIndex}, got ${step.index}` });
    }
    cleanedSteps.push({
      ...step,
      index: expectedIndex,
      label: step.label.trim().slice(0, 160),
      detail: step.detail.trim().slice(0, 800),
    });
    expectedIndex += 1;
  }

  let conclusion = (params.reasoning.conclusion ?? "").trim();
  if (!conclusion) {
    conclusion = "Conclusión educativa: usá la cadena como marco de estudio, no como orden operativa.";
    issues.push({ code: "EMPTY_CONCLUSION", message: "conclusion filled" });
  }

  // Reasoning must not introduce banned direct advice that summary already blocked
  const buySell = /\b(compra ahora|vende ahora|buy now|sell now)\b/i;
  if (buySell.test(conclusion) || cleanedSteps.some((s) => buySell.test(s.detail))) {
    issues.push({ code: "REASONING_ADVICE", message: "direct advice in reasoning" });
    conclusion = conclusion.replace(buySell, "[recomendación directa bloqueada]");
  }

  // Soft check: if summary rejects live market, conclusion shouldn't claim live read
  if (/sin (lectura|an[aá]lisis).*(mercado en vivo)/i.test(params.summary) && /mercado en vivo ahora/i.test(conclusion)) {
    issues.push({ code: "SUMMARY_CONTRADICTION", message: "reasoning contradicts no-live summary" });
    conclusion =
      "Conclusión educativa sin mercado en vivo: la cadena ordena conceptos metodológicos, no una lectura actual.";
  }

  const chainIds = Array.from(
    new Set(
      (params.reasoning.chainIds ?? [])
        .concat(cleanedSteps.map((s) => s.knowledgeId).filter((id): id is string => Boolean(id)))
        .filter((id) => knowledgeRegistry.getById(id)),
    ),
  );

  const reasoning: MentorReasoningBlock = {
    title: params.reasoning.title?.trim() || "Cómo llegué a esta conclusión",
    steps: cleanedSteps,
    conclusion: conclusion.slice(0, 1000),
    contradictions: (params.reasoning.contradictions ?? []).map((c) => c.trim()).filter(Boolean).slice(0, 8),
    chainIds: chainIds.slice(0, 20),
    scenarioMode: params.reasoning.scenarioMode,
    multiConceptMode: params.reasoning.multiConceptMode,
  };

  return { ok: issues.filter((i) => i.code === "INVENTED_CONCEPT" || i.code === "REASONING_ADVICE").length === 0, reasoning, issues };
}
