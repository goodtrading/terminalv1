import type { CalibrationAiSnapshot, CalibrationCase } from "@shared/goodTradingAiCalibration";
import { buildValidatedMentorFields } from "../mentorResponseEngine";
import { detectMentorIntent } from "../mentorIntent";
import { getKnowledgeRegistryVersion } from "./registryVersion";

/**
 * Build deterministic educational prompt from case → Mentor engine.
 * No live market, no external provider, no randomness.
 */
export function buildCaseMentorPrompt(caseItem: CalibrationCase): string {
  return [
    caseItem.question.trim(),
    "",
    "Contexto educativo (no datos en vivo):",
    caseItem.context.trim(),
    caseItem.relatedConceptHints?.length
      ? `Conceptos sugeridos de estudio: ${caseItem.relatedConceptHints.join(", ")}`
      : "",
  ]
    .filter(Boolean)
    .join("\n");
}

export function buildCurrentAiResponseForCase(caseItem: CalibrationCase): CalibrationAiSnapshot {
  const prompt = buildCaseMentorPrompt(caseItem);
  const intent = detectMentorIntent(prompt);
  const { fields, coverage } = buildValidatedMentorFields(prompt);

  return {
    summary: fields.summary,
    observations: fields.observations.map((o) => ({
      id: o.id,
      title: o.title,
      kind: String(o.kind),
    })),
    knowledgeReferences: (fields.knowledgeReferences ?? []).map((r) => ({
      id: r.id,
      title: r.title,
      kind: r.kind,
      category: r.category,
    })),
    coverage: coverage ?? fields.coverage ?? "limited",
    intent,
    warnings: fields.warnings.slice(0, 12),
    registryVersion: getKnowledgeRegistryVersion(),
    generatedAt: new Date().toISOString(),
  };
}
