import { knowledgeRegistry } from "../knowledge/registry";
import type { MentorIntent } from "../mentorIntent";
import { detectReasoningContradictions } from "./contradictionDetector";
import { buildTemporaryReasoningGraph, orderReasoningChain } from "./reasoningGraph";
import { validateReasoningBlock } from "./reasoningValidator";
import type { MentorReasoningBlock, ReasoningChainStep } from "./reasoningSteps";

export type BuildMentorReasoningInput = {
  message: string;
  summary: string;
  knowledgeIds: string[];
  intent: MentorIntent;
};

function stepLabel(step: ReasoningChainStep): string {
  switch (step.role) {
    case "requires":
      return `Requisito — ${step.title}`;
    case "dependsOn":
      return `Dependencia — ${step.title}`;
    case "supports":
      return `Soporte — ${step.title}`;
    case "invalidates":
      return `Invalidación — ${step.title}`;
    case "contradicts":
      return `Tensión — ${step.title}`;
    case "hypothesis":
      return `Hipótesis — ${step.title}`;
    case "confirmation":
      return `Confirmación — ${step.title}`;
    case "conclusion":
      return `Cierre — ${step.title}`;
    default:
      return step.title;
  }
}

function mentorSummaryFromChain(params: {
  intent: MentorIntent;
  chain: ReasoningChainStep[];
  contradictions: string[];
  scenarioMode: boolean;
  multiConceptMode: boolean;
  fallbackSummary: string;
}): string {
  const { chain, intent, contradictions, scenarioMode, multiConceptMode, fallbackSummary } = params;
  if (chain.length === 0) return fallbackSummary;

  if (intent === "current_market" || intent === "direct_recommendation" || intent === "prompt_injection") {
    return fallbackSummary;
  }

  const lines: string[] = [];
  if (scenarioMode) {
    lines.push(
      "Escenario educativo (hipotético): no es una predicción ni una orden. Primero plantearía la hipótesis, después qué necesito confirmar, y recién ahí el si X entonces Y metodológico.",
    );
  } else if (multiConceptMode) {
    lines.push(
      "Cuando varios lentes compiten, no elijo dirección: priorizo requisitos y dependencias metodológicas antes que confirmaciones agresivas.",
    );
  } else {
    lines.push("Primero miraría el marco metodológico en este orden:");
  }

  for (const step of chain.slice(0, 5)) {
    const because =
      step.role === "requires"
        ? "Porque sin este requisito la tesis no es operable."
        : step.role === "dependsOn"
          ? "Porque depende de este concepto previo."
          : step.role === "supports"
            ? "Después lo usaría como soporte de evidencia."
            : "Después lo cruzaría para refinar la lectura.";
    lines.push(`${step.index}) ${step.title}: ${step.detail} ${because}`);
  }

  if (contradictions.length) {
    lines.push(`Atención a conflictos: ${contradictions[0]}`);
  }

  lines.push(
    "Conclusión: es un encadenamiento educativo de estudio — no análisis en vivo ni recomendación de compra/venta.",
  );
  return lines.join(" ");
}

/**
 * Deterministic Mentors reasoning — no LLM. Attached server-side after provider.
 */
export function buildMentorReasoning(input: BuildMentorReasoningInput): {
  reasoning: MentorReasoningBlock;
  mentorSummary?: string;
  buildMs: number;
} {
  const started = Date.now();
  const seedIds = input.knowledgeIds.filter((id) => knowledgeRegistry.getById(id));
  const seedEntries = seedIds
    .map((id) => knowledgeRegistry.getById(id)!)
    .filter(Boolean);

  const graph = buildTemporaryReasoningGraph(seedIds);
  const chain = orderReasoningChain(graph);
  const findings = detectReasoningContradictions({
    message: input.message,
    entries: seedEntries.length
      ? seedEntries
      : graph.nodeIds.map((id) => knowledgeRegistry.getById(id)!).filter(Boolean),
  });
  const contradictions = findings.map((f) => f.message);

  const scenarioMode = input.intent === "scenario_analysis";
  const multiConceptMode = input.intent === "multi_concept";

  const steps: MentorReasoningBlock["steps"] = chain.map((s) => ({
    index: s.index,
    label: stepLabel(s),
    detail: s.detail,
    knowledgeId: s.knowledgeId,
    role: s.role,
  }));

  // Scenario framing steps prepended when needed
  if (scenarioMode && steps.length) {
    steps.unshift({
      index: 0,
      label: "Hipótesis del escenario",
      detail:
        "Trato la pregunta como escenario condicional: hipótesis explícita → evidencia que faltaría confirmar → ramas si X / si no X. Sin buy/sell.",
      role: "hypothesis",
    });
    // reindex
    steps.forEach((s, i) => {
      s.index = i + 1;
    });
  }

  if (multiConceptMode && steps.length) {
    steps.unshift({
      index: 0,
      label: "Prioridad multi-lente",
      detail:
        "Orden de peso metodológico: requisitos → dependencias → soportes → relaciones. Global Flip enmarca régimen; Local Flip refina; Order Flow valida acceptance; Absorption no se reemplaza por delta solo.",
      role: "anchor",
    });
    steps.forEach((s, i) => {
      s.index = i + 1;
    });
  }

  for (const f of findings) {
    steps.push({
      index: steps.length + 1,
      label: "Conflicto detectado",
      detail: f.message,
      knowledgeId: f.knowledgeIds[0],
      role: "contradicts",
    });
  }

  const conclusion = scenarioMode
    ? "Conclusión de escenario: si se confirman las condiciones A y se invalida B, la rama educativa es C; si no, se aborta la tesis. Nunca es una orden de compra/venta."
    : contradictions.length
      ? "Conclusión: hay tensiones metodológicas que impiden asumir dirección; resolvé el conflicto de lentes antes de hablar de ejecución."
      : chain.length
        ? `Conclusión: la cadena ${chain.map((c) => c.title).join(" → ")} ordena el estudio; confirmá acceptance e invalidación antes de cualquier plan.`
        : "Conclusión: cobertura limitada — reformulá con conceptos del Brain (flip, absorption, walls, riesgo).";

  const draft: MentorReasoningBlock = {
    title: "Cómo llegué a esta conclusión",
    steps: steps.slice(0, 10).map((s, i) => ({ ...s, index: i + 1 })),
    conclusion,
    contradictions,
    chainIds: chain.map((c) => c.knowledgeId),
    scenarioMode,
    multiConceptMode,
  };

  const allowed = Array.from(new Set([...seedIds, ...graph.nodeIds]));
  const { reasoning } = validateReasoningBlock({
    reasoning: draft,
    summary: input.summary,
    allowedKnowledgeIds: allowed,
  });

  const mentorSummary = mentorSummaryFromChain({
    intent: input.intent,
    chain,
    contradictions,
    scenarioMode,
    multiConceptMode,
    fallbackSummary: input.summary,
  });

  return {
    reasoning: reasoning!,
    mentorSummary,
    buildMs: Date.now() - started,
  };
}
