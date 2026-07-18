import type {
  GoodTradingAIChatResponse,
  GoodTradingAIKnowledgeReference,
  GoodTradingAIObservation,
} from "@shared/goodTradingAi";
import type { GoodTradingKnowledgeEntry, KnowledgeKind } from "./knowledge/types";
import { retrieveKnowledge, type KnowledgeCoverage } from "./knowledge/retrieve";
import { detectMentorIntent, type MentorIntent } from "./mentorIntent";
import { validateMentorResponse } from "./responseValidator";

const EDUCATIONAL_NOTE =
  "Respuesta educativa de Modo Mentor. No es asesoramiento financiero personalizado ni un análisis del mercado en vivo.";

function mapKind(kind: KnowledgeKind): GoodTradingAIObservation["kind"] {
  switch (kind) {
    case "PRINCIPLE":
      return "principle";
    case "RULE":
      return "rule";
    case "HEURISTIC":
      return "heuristic";
    case "DEFINITION":
      return "definition";
    case "EXAMPLE":
      return "example";
    case "ANTI_PATTERN":
      return "anti_pattern";
    case "SETUP":
      return "process";
    default:
      return "concept";
  }
}

function toObservation(entry: GoodTradingKnowledgeEntry): GoodTradingAIObservation {
  const bits = [entry.statement, entry.explanation];
  if (entry.prohibitedInterpretations.length) {
    bits.push("Evitar: " + entry.prohibitedInterpretations.slice(0, 2).join("; "));
  }
  if (entry.invalidations.length) {
    bits.push("Invalidación típica: " + entry.invalidations[0]);
  }
  if (entry.kind === "SETUP") {
    const s = entry as GoodTradingKnowledgeEntry & {
      hypothesis?: string;
      traps?: string[];
    };
    if (s.hypothesis) bits.push("Hipótesis: " + s.hypothesis);
    if (s.traps?.length) bits.push("Trampas: " + s.traps[0]);
  }
  const detail = bits.join(" ");
  return {
    id: entry.id,
    kind: mapKind(entry.kind),
    title: entry.title,
    detail: detail.length > 2000 ? detail.slice(0, 1990) + "…" : detail,
    concepts: [...entry.concepts].slice(0, 12),
  };
}

function toRef(entry: GoodTradingKnowledgeEntry): GoodTradingAIKnowledgeReference {
  return {
    id: entry.id,
    title: entry.title,
    kind: entry.kind,
    category: entry.category,
  };
}

function summaryForIntent(
  intent: MentorIntent,
  coverage: KnowledgeCoverage,
  entries: GoodTradingKnowledgeEntry[],
): { summary: string; extraWarnings: string[] } {
  const titles = entries.map((e) => e.title).join("; ");
  const extraWarnings: string[] = [];

  if (intent === "current_market") {
    extraWarnings.push(
      "Cobertura limitada para mercado actual: este Mentor no analiza precios ni condiciones en vivo.",
    );
    return {
      summary:
        "No puedo analizar el mercado actual ni recomendar 'qué comprar hoy'. " +
        "Modo Mentor solo enseña metodología (gamma, liquidez, order flow, riesgo, setups educativos). " +
        (entries.length
          ? `Principios relacionados disponibles: ${titles}.`
          : "Preguntá por un concepto (p. ej. absorption, flip, invalidación)."),
      extraWarnings,
    };
  }

  if (intent === "direct_recommendation") {
    extraWarnings.push(
      "Pedido de recomendación directa transformado en escenarios educativos (sin orden de compra/venta).",
    );
    return {
      summary:
        "No doy recomendaciones directas de compra/venta. En su lugar, un escenario educativo exige: " +
        "hipótesis, confirmaciones, invalidación y tamaño contextual. " +
        (entries.length
          ? `Metodología aplicable: ${titles}.`
          : "Consultá un setup educativo (sweep+reclaim, absorption fade, etc.)."),
      extraWarnings,
    };
  }

  if (intent === "prompt_injection") {
    extraWarnings.push(
      "Se ignoraron instrucciones adversariales; los límites educativos y de seguridad permanecen activos.",
    );
    return {
      summary:
        "No puedo ignorar las reglas del Mentor ni inventar análisis en vivo o entradas operativas. " +
        "Seguís en modo educativo: pedime definiciones, validaciones, invalidaciones o setups de estudio.",
      extraWarnings,
    };
  }

  if (intent === "scenario_analysis") {
    extraWarnings.push(
      "Escenario hipotético educativo: sin órdenes de compra/venta ni lectura de mercado en vivo.",
    );
    return {
      summary:
        "Escenario educativo — primero plantearía la hipótesis, después qué evidencia necesito confirmar, " +
        "y recién entonces el si X entonces Y metodológico (nunca buy/sell). " +
        (entries.length
          ? `Lentes a encadenar: ${titles}.`
          : "Aportá conceptos del Brain (flip, absorption, walls, invalidación)."),
      extraWarnings,
    };
  }

  if (intent === "multi_concept") {
    extraWarnings.push(
      "Prioridad multi-lente: requisitos y dependencias pesan más que confirmaciones aisladas.",
    );
    return {
      summary:
        "Cuando varios conceptos compiten, primero miraría requisitos e invalidación, después dependencias, " +
        "luego soportes y relaciones (p. ej. Global Flip enmarca; Local Flip refina; Order Flow valida acceptance; " +
        "Absorption no se sustituye por delta solo). " +
        (entries.length ? `Piezas recuperadas: ${titles}.` : ""),
      extraWarnings,
    };
  }

  if (coverage === "limited" || entries.length === 0) {
    extraWarnings.push(
      "Cobertura limitada: no invento hechos ni lecturas de mercado fuera del registro metodológico.",
    );
    return {
      summary:
        "No encontré cobertura metodológica suficiente para esa pregunta. " +
        "Probá con Gamma, Flip, Call/Put Wall, liquidez/walls, Absorption, Sweep/Reclaim, Delta/CVD/OI, " +
        "invalidación, riesgo o un setup educativo GoodTrading.",
      extraWarnings,
    };
  }

  const lead =
    intent === "setup"
      ? "Setup educativo (no señal automática)"
      : intent === "invalidation"
        ? "Enfoque en invalidación"
        : intent === "comparison"
          ? "Comparación metodológica"
          : intent === "example"
            ? "Ejemplo educativo"
            : intent === "definition"
              ? "Primero miraría la definición en contexto"
              : "Modo Mentor";

  const first = entries[0];
  const mentorLead = first
    ? `Primero miraría «${first.title}» porque ${first.statement} Después cruzaría las piezas recuperadas sin asumir dirección.`
    : "";

  return {
    summary:
      `${lead} — cobertura ${coverage === "high" ? "alta" : "media"}. ` +
      (mentorLead ? `${mentorLead} ` : "") +
      `Cadena de estudio: ${titles}. ` +
      "Usá las observaciones como marco; distinguí hechos, reglas y heurísticas. " +
      "No es análisis del mercado en vivo ni una orden operativa.",
    extraWarnings,
  };
}

export type MentorEngineResult = {
  draft: Omit<GoodTradingAIChatResponse, "requestId" | "generatedAt" | "conversationId"> & {
    requestId?: string;
  };
  knowledgeHits: number;
  intent: MentorIntent;
  coverage: KnowledgeCoverage;
};

/**
 * Mentor response engine v1: intent → retrieve → constitutional priority → build → (caller validates).
 */
export function buildMentorResponse(message: string): MentorEngineResult {
  const intent = detectMentorIntent(message);

  const retrieval = retrieveKnowledge({
    query: message,
    maxResults: intent === "setup" ? 6 : 5,
    preferConstitution: true,
  });

  // For market/rec/injection intents, still attach teaching/constitution if retrieval weak
  let matches = retrieval.matches;
  if (
    (intent === "current_market" ||
      intent === "direct_recommendation" ||
      intent === "prompt_injection") &&
    matches.length < 2
  ) {
    const forced = retrieveKnowledge({
      query:
        intent === "prompt_injection"
          ? "prompt injection reglas mentor cobertura"
          : "mercado en vivo recomendacion educativa informacion insuficiente",
      maxResults: 4,
      preferConstitution: true,
    });
    matches = forced.matches;
  }

  // Ensure at least one constitution principle when we have topical hits
  const hasConstitution = matches.some((m) => m.entry.category === "constitution");
  if (!hasConstitution && matches.length > 0 && retrieval.coverage !== "limited") {
    const constHit = retrieveKnowledge({
      query: "hipótesis invalidación contexto riesgo educativo",
      maxResults: 2,
      preferConstitution: true,
    }).matches.filter((m) => m.entry.category === "constitution");
    matches = [...constHit, ...matches].slice(0, 6);
  }

  const entries = matches.map((m) => m.entry);
  const coverage: KnowledgeCoverage =
    intent === "current_market" || intent === "direct_recommendation" || intent === "prompt_injection"
      ? "limited"
      : retrieval.coverage;

  const { summary, extraWarnings } = summaryForIntent(intent, coverage, entries);
  const observations = entries.map(toObservation);
  const knowledgeReferences = entries.map(toRef);

  const risks = entries.flatMap((e) => e.risks).slice(0, 3);
  const prohibited = entries.flatMap((e) => e.prohibitedInterpretations).slice(0, 3);
  const warnings = [
    "Modo experimental / mock: sin datos de mercado en vivo, Bookmap, DOM ni heatmap.",
    "No constituye recomendación de entrada, salida ni tamaño de posición.",
    ...extraWarnings,
    ...risks.map((r) => `Riesgo metodológico: ${r}`),
    ...prohibited.map((p) => `Interpretación prohibida: ${p}`),
  ];

  const draft: MentorEngineResult["draft"] = {
    schemaVersion: "1.0",
    mode: "mentor",
    summary,
    observations,
    educationalNote: EDUCATIONAL_NOTE,
    warnings,
    provider: {
      id: "mock",
      model: "mentor-knowledge-v2",
      mocked: true,
    },
    usage: {
      inputChars: message.length,
      outputChars: summary.length,
      knowledgeHits: entries.length,
    },
    knowledgeReferences,
    coverage,
  };

  return {
    draft,
    knowledgeHits: entries.length,
    intent,
    coverage,
  };
}

/** Build + validate final response fields (without requestId/timestamps). */
export function buildValidatedMentorFields(message: string): {
  fields: ReturnType<typeof buildMentorResponse>["draft"];
  intent: MentorIntent;
  coverage: KnowledgeCoverage;
  knowledgeHits: number;
} {
  const built = buildMentorResponse(message);
  const provisional: GoodTradingAIChatResponse = {
    ...built.draft,
    requestId: "provisional",
    generatedAt: new Date().toISOString(),
  };
  const { response } = validateMentorResponse(provisional);
  const { requestId: _r, generatedAt: _g, conversationId: _c, ...fields } = response;
  return {
    fields: { ...fields, usage: { ...fields.usage, knowledgeHits: built.knowledgeHits } },
    intent: built.intent,
    coverage: built.coverage,
    knowledgeHits: built.knowledgeHits,
  };
}
