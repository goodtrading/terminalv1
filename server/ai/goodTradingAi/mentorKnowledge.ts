/**
 * AI-1 compatibility shim over Knowledge Model v1 + local retrieval.
 * Full entries live in ./knowledge/* (server-only).
 */
import { knowledgeRegistry } from "./knowledge/registry";
import { retrieveKnowledge } from "./knowledge/retrieve";
import type { GoodTradingKnowledgeEntry } from "./knowledge/types";

/** @deprecated AI-1 shape — prefer GoodTradingKnowledgeEntry */
export type MentorKnowledgeKind =
  | "concept"
  | "principle"
  | "definition"
  | "limitation"
  | "process";

/** @deprecated AI-1 shape */
export type MentorKnowledgeEntry = {
  id: string;
  title: string;
  concepts: string[];
  kind: MentorKnowledgeKind;
  content: string;
  version: string;
};

function toLegacy(entry: GoodTradingKnowledgeEntry): MentorKnowledgeEntry {
  const kind: MentorKnowledgeKind =
    entry.kind === "PRINCIPLE"
      ? "principle"
      : entry.kind === "DEFINITION"
        ? "definition"
        : entry.kind === "ANTI_PATTERN"
          ? "limitation"
          : entry.kind === "SETUP" || entry.kind === "RULE"
            ? "process"
            : "concept";
  return {
    id: entry.id,
    title: entry.title,
    concepts: [...entry.concepts],
    kind,
    content: `${entry.statement} ${entry.explanation}`.trim(),
    version: entry.version,
  };
}

/** Legacy list view — maps all registry entries to AI-1 shape. */
export const MENTOR_KNOWLEDGE: readonly MentorKnowledgeEntry[] = knowledgeRegistry
  .getAll()
  .map(toLegacy);

/**
 * Deterministic selection via Knowledge Retrieval v1.
 */
export function selectMentorKnowledge(message: string, limit = 3): MentorKnowledgeEntry[] {
  const result = retrieveKnowledge({ query: message, maxResults: limit, preferConstitution: true });
  return result.matches.map((m) => toLegacy(m.entry));
}

export function getMentorKnowledgeById(id: string): MentorKnowledgeEntry | undefined {
  const e = knowledgeRegistry.getById(id);
  return e ? toLegacy(e) : undefined;
}
