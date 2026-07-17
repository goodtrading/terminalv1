import type {
  GoodTradingAICoverage,
  GoodTradingAIKnowledgeReference,
  GoodTradingAIObservation,
} from "@shared/goodTradingAi";
import type { GoodTradingKnowledgeEntry } from "../knowledge/types";
import type { MentorStructuredOutput } from "./mentorStructuredSchema";
import { GoodTradingAIError } from "../errors";

const OBS_KINDS = new Set<GoodTradingAIObservation["kind"]>([
  "concept",
  "principle",
  "definition",
  "limitation",
  "process",
  "rule",
  "heuristic",
  "example",
  "anti_pattern",
]);

export type NormalizedOpenAIMentorFields = {
  summary: string;
  observations: GoodTradingAIObservation[];
  educationalNote: string;
  warnings: string[];
  knowledgeReferences: GoodTradingAIKnowledgeReference[];
  coverage: GoodTradingAICoverage;
  usedKnowledgeIds: string[];
  strippedInventedIds: string[];
};

/**
 * Parse model JSON → strip invented IDs → build refs from registry entries only.
 */
export function parseAndNormalizeMentorOutput(params: {
  outputText: string;
  retrievedEntries: GoodTradingKnowledgeEntry[];
  requestId: string;
  allowLocalRepair?: boolean;
}): NormalizedOpenAIMentorFields {
  const allowed = new Map(params.retrievedEntries.map((e) => [e.id, e]));
  let raw = params.outputText?.trim() ?? "";
  if (!raw) {
    throw new GoodTradingAIError("OPENAI_BAD_RESPONSE", undefined, params.requestId);
  }

  let parsed: unknown;
  try {
    parsed = JSON.parse(raw);
  } catch {
    if (params.allowLocalRepair !== false) {
      const repaired = tryLocalJsonRepair(raw);
      if (repaired) {
        try {
          parsed = JSON.parse(repaired);
        } catch {
          throw new GoodTradingAIError("OPENAI_BAD_RESPONSE", undefined, params.requestId);
        }
      } else {
        throw new GoodTradingAIError("OPENAI_BAD_RESPONSE", undefined, params.requestId);
      }
    } else {
      throw new GoodTradingAIError("OPENAI_BAD_RESPONSE", undefined, params.requestId);
    }
  }

  const obj = parsed as Partial<MentorStructuredOutput>;
  if (!obj || typeof obj !== "object") {
    throw new GoodTradingAIError("OPENAI_BAD_RESPONSE", undefined, params.requestId);
  }

  const strippedInventedIds: string[] = [];
  const filterIds = (ids: unknown): string[] => {
    if (!Array.isArray(ids)) return [];
    const out: string[] = [];
    for (const id of ids) {
      if (typeof id !== "string" || !id.trim()) continue;
      if (!allowed.has(id)) {
        strippedInventedIds.push(id);
        continue;
      }
      if (!out.includes(id)) out.push(id);
    }
    return out;
  };

  const usedKnowledgeIds = filterIds(obj.usedKnowledgeIds);
  const warnings = Array.isArray(obj.warnings)
    ? obj.warnings.filter((w): w is string => typeof w === "string" && w.trim().length > 0).map((w) => w.trim())
    : [];

  if (strippedInventedIds.length) {
    warnings.push("Se omitieron referencias internas no recuperadas en esta consulta.");
  }

  const observationsIn = Array.isArray(obj.observations) ? obj.observations : [];
  const observations: GoodTradingAIObservation[] = [];
  for (let i = 0; i < Math.min(observationsIn.length, 8); i++) {
    const o = observationsIn[i];
    if (!o || typeof o !== "object") continue;
    const title = typeof o.title === "string" ? o.title.trim() : "";
    const detail = typeof o.detail === "string" ? o.detail.trim() : "";
    if (!title || !detail) continue;
    const kid = filterIds(o.knowledgeIds);
    const primaryId = kid[0] ?? usedKnowledgeIds[0] ?? `obs_${i + 1}`;
    const kindRaw = typeof o.kind === "string" ? o.kind : "concept";
    const kind = OBS_KINDS.has(kindRaw as GoodTradingAIObservation["kind"])
      ? (kindRaw as GoodTradingAIObservation["kind"])
      : "concept";
    observations.push({
      id: primaryId.slice(0, 80),
      kind,
      title: title.slice(0, 160),
      detail: detail.slice(0, 2000),
    });
  }

  // Final refs strictly from retrieved registry entries.
  const refIds = usedKnowledgeIds.length
    ? usedKnowledgeIds
    : observations.map((o) => o.id).filter((id) => allowed.has(id));
  const knowledgeReferences: GoodTradingAIKnowledgeReference[] = [];
  for (const id of refIds) {
    const e = allowed.get(id);
    if (!e) continue;
    knowledgeReferences.push({
      id: e.id,
      title: e.title,
      kind: e.kind,
      category: e.category,
    });
  }

  let coverage: GoodTradingAICoverage = "limited";
  if (obj.coverageAssessment === "high" || obj.coverageAssessment === "medium" || obj.coverageAssessment === "limited") {
    coverage = obj.coverageAssessment;
  } else if (knowledgeReferences.length >= 3) coverage = "high";
  else if (knowledgeReferences.length > 0) coverage = "medium";

  const summary =
    typeof obj.summary === "string" && obj.summary.trim()
      ? obj.summary.trim()
      : "No pude construir un resumen educativo válido a partir de la metodología recuperada.";

  const educationalNote =
    typeof obj.educationalNote === "string" && obj.educationalNote.trim()
      ? obj.educationalNote.trim()
      : "Respuesta educativa de Modo Mentor. No es asesoramiento financiero personalizado ni un análisis del mercado en vivo.";

  return {
    summary,
    observations,
    educationalNote,
    warnings,
    knowledgeReferences,
    coverage,
    usedKnowledgeIds: knowledgeReferences.map((r) => r.id),
    strippedInventedIds,
  };
}

/** At most one controlled local repair: extract first JSON object. */
function tryLocalJsonRepair(raw: string): string | null {
  const start = raw.indexOf("{");
  const end = raw.lastIndexOf("}");
  if (start < 0 || end <= start) return null;
  return raw.slice(start, end + 1);
}
