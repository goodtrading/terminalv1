/**
 * GoodTrading Knowledge Model v1 — server-only structured methodology.
 * Not for public client bundle (full statements/explanations stay server-side).
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

/** Factory for compact module authors. */
export function ke(
  partial: Omit<GoodTradingKnowledgeEntry, "version" | "source" | "confidence"> &
    Partial<Pick<GoodTradingKnowledgeEntry, "version" | "source" | "confidence">> & {
      conditions?: string[];
      confirmations?: string[];
      invalidations?: string[];
      risks?: string[];
      examples?: string[];
      prohibitedInterpretations?: string[];
      aliases?: string[];
      prerequisites?: string[];
      relatedEntryIds?: string[];
      concepts?: string[];
    },
): GoodTradingKnowledgeEntry {
  return {
    version: partial.version ?? "1",
    source: partial.source ?? "GOODTRADING_METHOD",
    confidence: partial.confidence ?? "high",
    concepts: partial.concepts ?? [],
    aliases: partial.aliases ?? [],
    prerequisites: partial.prerequisites ?? [],
    relatedEntryIds: partial.relatedEntryIds ?? [],
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
  };
}

export function setup(
  partial: Omit<GoodTradingSetup, "version" | "source" | "confidence" | "kind" | "category"> &
    Partial<Pick<GoodTradingSetup, "version" | "source" | "confidence">> & {
      conditions?: string[];
      confirmations?: string[];
      invalidations?: string[];
      risks?: string[];
      examples?: string[];
      prohibitedInterpretations?: string[];
      aliases?: string[];
      prerequisites?: string[];
      relatedEntryIds?: string[];
      concepts?: string[];
      traps?: string[];
      managementNotes?: string[];
      relatedKnowledgeIds?: string[];
    },
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
