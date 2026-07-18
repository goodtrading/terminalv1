/**
 * GoodTrading Knowledge Model v1 — server-only structured methodology.
 * Not for public client bundle (full statements/explanations stay server-side).
 * AI-4: typed knowledge-graph relations (IDs only).
 */

export type KnowledgeKind =
  | "PRINCIPLE"
  | "RULE"
  | "HEURISTIC"
  | "DEFINITION"
  | "EXAMPLE"
  | "ANTI_PATTERN"
  | "SETUP";

export type KnowledgeCategory =
  | "constitution"
  | "gamma"
  | "liquidity"
  | "order_flow"
  | "delta_cvd"
  | "open_interest"
  | "execution"
  | "risk"
  | "setups"
  | "teaching"
  | "glossary"
  | "cross";

export type KnowledgeSource = "GOODTRADING_METHOD" | "Ignacio" | "reviewed";

export type KnowledgeConfidence = "high" | "medium" | "low";

/** Typed graph edges — values must be existing entry IDs (validated in registry). */
export type KnowledgeRelationKind =
  | "supports"
  | "dependsOn"
  | "requires"
  | "invalidates"
  | "contradicts"
  | "relatedTo"
  | "parentConcept"
  | "childConcept";

export const KNOWLEDGE_RELATION_KINDS: readonly KnowledgeRelationKind[] = [
  "supports",
  "dependsOn",
  "requires",
  "invalidates",
  "contradicts",
  "relatedTo",
  "parentConcept",
  "childConcept",
] as const;

export type GoodTradingKnowledgeEntry = {
  id: string;
  version: string;
  title: string;
  category: KnowledgeCategory;
  kind: KnowledgeKind;
  confidence: KnowledgeConfidence;
  concepts: string[];
  aliases: string[];
  prerequisites: string[];
  relatedEntryIds: string[];
  statement: string;
  explanation: string;
  conditions: string[];
  confirmations: string[];
  invalidations: string[];
  risks: string[];
  examples: string[];
  prohibitedInterpretations: string[];
  source: KnowledgeSource;
  /** AI-4 typed relations (IDs only). */
  supports: string[];
  dependsOn: string[];
  requires: string[];
  invalidates: string[];
  contradicts: string[];
  relatedTo: string[];
  parentConcept: string[];
  childConcept: string[];
};

/** Educational setup — not an auto-signal. */
export type GoodTradingSetup = GoodTradingKnowledgeEntry & {
  kind: "SETUP";
  category: "setups";
  hypothesis: string;
  traps: string[];
  managementNotes: string[];
  relatedKnowledgeIds: string[];
};

export function isSetup(entry: GoodTradingKnowledgeEntry): entry is GoodTradingSetup {
  return entry.kind === "SETUP" && entry.category === "setups";
}

type RelationPartial = Partial<
  Pick<
    GoodTradingKnowledgeEntry,
    | "supports"
    | "dependsOn"
    | "requires"
    | "invalidates"
    | "contradicts"
    | "relatedTo"
    | "parentConcept"
    | "childConcept"
  >
>;

type KnowledgeEntryInput = {
  id: string;
  title: string;
  category: KnowledgeCategory;
  kind: KnowledgeKind;
  statement: string;
  explanation: string;
  version?: string;
  source?: KnowledgeSource;
  confidence?: KnowledgeConfidence;
  concepts?: string[];
  aliases?: string[];
  prerequisites?: string[];
  relatedEntryIds?: string[];
  conditions?: string[];
  confirmations?: string[];
  invalidations?: string[];
  risks?: string[];
  examples?: string[];
  prohibitedInterpretations?: string[];
} & RelationPartial;

/** Factory for compact module authors. */
export function ke(partial: KnowledgeEntryInput): GoodTradingKnowledgeEntry {
  const prerequisites = partial.prerequisites ?? [];
  const relatedEntryIds = partial.relatedEntryIds ?? [];
  return {
    version: partial.version ?? "1",
    source: partial.source ?? "GOODTRADING_METHOD",
    confidence: partial.confidence ?? "high",
    concepts: partial.concepts ?? [],
    aliases: partial.aliases ?? [],
    prerequisites,
    relatedEntryIds,
    conditions: partial.conditions ?? [],
    confirmations: partial.confirmations ?? [],
    invalidations: partial.invalidations ?? [],
    risks: partial.risks ?? [],
    examples: partial.examples ?? [],
    prohibitedInterpretations: partial.prohibitedInterpretations ?? [],
    id: partial.id,
    title: partial.title,
    category: partial.category,
    kind: partial.kind,
    statement: partial.statement,
    explanation: partial.explanation,
    // Seed typed graph from legacy fields when not explicit.
    supports: partial.supports ?? [],
    dependsOn: partial.dependsOn ?? [],
    requires: partial.requires ?? [...prerequisites],
    invalidates: partial.invalidates ?? [],
    contradicts: partial.contradicts ?? [],
    relatedTo: partial.relatedTo ?? [...relatedEntryIds],
    parentConcept: partial.parentConcept ?? [],
    childConcept: partial.childConcept ?? [],
  };
}

export function setup(
  partial: Omit<KnowledgeEntryInput, "kind" | "category"> & {
    hypothesis: string;
    traps?: string[];
    managementNotes?: string[];
    relatedKnowledgeIds?: string[];
    version?: string;
    source?: KnowledgeSource;
    confidence?: KnowledgeConfidence;
  } & RelationPartial,
): GoodTradingSetup {
  const base = ke({
    ...partial,
    kind: "SETUP",
    category: "setups",
    relatedEntryIds: partial.relatedEntryIds ?? partial.relatedKnowledgeIds ?? [],
  });
  return {
    ...base,
    kind: "SETUP",
    category: "setups",
    hypothesis: partial.hypothesis,
    traps: partial.traps ?? [],
    managementNotes: partial.managementNotes ?? [],
    relatedKnowledgeIds: partial.relatedKnowledgeIds ?? partial.relatedEntryIds ?? [],
  };
}

/** Merge curated relation overlays (IDs only; duplicates removed). */
export function mergeKnowledgeRelations(
  entry: GoodTradingKnowledgeEntry,
  overlay: RelationPartial,
): GoodTradingKnowledgeEntry {
  const merge = (a: string[], b?: string[]) =>
    Array.from(new Set([...(a ?? []), ...(b ?? [])].filter(Boolean)));
  return {
    ...entry,
    supports: merge(entry.supports, overlay.supports),
    dependsOn: merge(entry.dependsOn, overlay.dependsOn),
    requires: merge(entry.requires, overlay.requires),
    invalidates: merge(entry.invalidates, overlay.invalidates),
    contradicts: merge(entry.contradicts, overlay.contradicts),
    relatedTo: merge(entry.relatedTo, overlay.relatedTo),
    parentConcept: merge(entry.parentConcept, overlay.parentConcept),
    childConcept: merge(entry.childConcept, overlay.childConcept),
  };
}
