import type { GoodTradingKnowledgeEntry } from "../knowledge/types";
import { knowledgeRegistry } from "../knowledge/registry";
import type { EntryQualityScore } from "@shared/goodTradingAiCuration";
import { allRelationIds, normalizeCurationText } from "./textUtils";

export type DeprecationFinding = {
  entryId: string;
  title: string;
  reason: string;
  severity: "low" | "medium" | "high";
};

const OBSOLETE_MARKERS =
  /\b(obsolet|deprecat|legacy|ya no (usar|aplica)|reemplazad|superseded)\b/i;

/**
 * Suggest deprecation candidates — mark only, never delete.
 */
export function analyzeDeprecations(params?: {
  entries?: readonly GoodTradingKnowledgeEntry[];
  qualities?: EntryQualityScore[];
  maxFindings?: number;
}): DeprecationFinding[] {
  const entries = params?.entries ?? knowledgeRegistry.getAll();
  const qMap = new Map((params?.qualities ?? []).map((q) => [q.entryId, q]));
  const findings: DeprecationFinding[] = [];

  // Incoming reference counts
  const inbound = new Map<string, number>();
  for (const e of entries) {
    for (const id of allRelationIds(e)) {
      inbound.set(id, (inbound.get(id) ?? 0) + 1);
    }
  }

  for (const e of entries) {
    const text = `${e.title} ${e.statement} ${e.explanation}`;
    const q = qMap.get(e.id);
    const reasons: string[] = [];

    if (OBSOLETE_MARKERS.test(text)) {
      reasons.push("Lenguaje de obsolescencia en el texto.");
    }
    if (e.confidence === "low" && (inbound.get(e.id) ?? 0) === 0 && allRelationIds(e).length === 0) {
      reasons.push("Baja confianza, sin inbound ni outbound relations.");
    }
    if (q && q.qualityScore < 0.28 && q.timesReferenced === 0 && q.timesUsedInReasoning === 0) {
      reasons.push(`Quality score bajo (${q.qualityScore}) sin uso registrado.`);
    }
    // Very short / thin entries
    if (e.statement.length < 40 && e.explanation.length < 40 && e.kind !== "DEFINITION") {
      reasons.push("Contenido muy delgado para una regla/heurística.");
    }

    // Heuristic: ANTI_PATTERN that duplicates a RULE title tokens heavily — soft
    if (
      e.kind === "EXAMPLE" &&
      e.confidence === "low" &&
      normalizeCurationText(e.statement).split(" ").length < 8
    ) {
      reasons.push("Ejemplo corto y low-confidence — candidata a archivar o enriquecer.");
    }

    if (!reasons.length) continue;
    findings.push({
      entryId: e.id,
      title: e.title,
      reason: reasons.join(" "),
      severity: reasons.length >= 2 ? "high" : reasons.some((r) => /obsolescencia/i.test(r)) ? "high" : "medium",
    });
    if (findings.length >= (params?.maxFindings ?? 80)) break;
  }

  return findings;
}
