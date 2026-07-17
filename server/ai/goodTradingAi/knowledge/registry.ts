import { CONSTITUTION_ENTRIES } from "./constitution";
import { LIQUIDITY_ENTRIES } from "./liquidity";
import { ORDER_FLOW_ENTRIES } from "./orderFlow";
import { GAMMA_ENTRIES } from "./gamma";
import { DELTA_CVD_ENTRIES } from "./deltaCvd";
import { OPEN_INTEREST_ENTRIES } from "./openInterest";
import { EXECUTION_ENTRIES } from "./execution";
import { RISK_ENTRIES } from "./risk";
import { SETUP_ENTRIES } from "./setups";
import { TEACHING_ENTRIES } from "./teaching";
import { GLOSSARY_ENTRIES } from "./glossary";
import type { GoodTradingKnowledgeEntry, KnowledgeCategory, KnowledgeKind } from "./types";
import { validateKnowledgeRegistry } from "./validateRegistry";

const RAW_ENTRIES: GoodTradingKnowledgeEntry[] = [
  ...CONSTITUTION_ENTRIES,
  ...LIQUIDITY_ENTRIES,
  ...ORDER_FLOW_ENTRIES,
  ...GAMMA_ENTRIES,
  ...DELTA_CVD_ENTRIES,
  ...OPEN_INTEREST_ENTRIES,
  ...EXECUTION_ENTRIES,
  ...RISK_ENTRIES,
  ...SETUP_ENTRIES,
  ...TEACHING_ENTRIES,
  ...GLOSSARY_ENTRIES,
];

Object.freeze(RAW_ENTRIES);
for (const e of RAW_ENTRIES) {
  Object.freeze(e);
  Object.freeze(e.concepts);
  Object.freeze(e.aliases);
  Object.freeze(e.prerequisites);
  Object.freeze(e.relatedEntryIds);
}

const BY_ID = new Map<string, GoodTradingKnowledgeEntry>();
const BY_CONCEPT = new Map<string, GoodTradingKnowledgeEntry[]>();
const BY_CATEGORY = new Map<KnowledgeCategory, GoodTradingKnowledgeEntry[]>();

function normKey(s: string): string {
  return s
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

for (const e of RAW_ENTRIES) {
  BY_ID.set(e.id, e);
  const catList = BY_CATEGORY.get(e.category) ?? [];
  catList.push(e);
  BY_CATEGORY.set(e.category, catList);

  const keys = new Set<string>();
  for (const c of e.concepts) keys.add(normKey(c));
  for (const a of e.aliases) keys.add(normKey(a));
  for (const k of keys) {
    if (!k) continue;
    const list = BY_CONCEPT.get(k) ?? [];
    list.push(e);
    BY_CONCEPT.set(k, list);
  }
}

for (const [, list] of BY_CATEGORY) Object.freeze(list);
for (const [, list] of BY_CONCEPT) Object.freeze(list);

let validated = false;
let lastValidation = validateKnowledgeRegistry(RAW_ENTRIES);

/** Run registry validation once (tests / explicit boot). */
export function ensureKnowledgeRegistryValid(): typeof lastValidation {
  if (!validated) {
    lastValidation = validateKnowledgeRegistry(RAW_ENTRIES);
    validated = true;
  }
  return lastValidation;
}

export const knowledgeRegistry = {
  /** Read-only list of all entries. */
  getAll(): readonly GoodTradingKnowledgeEntry[] {
    return RAW_ENTRIES;
  },
  getById(id: string): GoodTradingKnowledgeEntry | undefined {
    return BY_ID.get(id);
  },
  getByConcept(concept: string): readonly GoodTradingKnowledgeEntry[] {
    return BY_CONCEPT.get(normKey(concept)) ?? [];
  },
  getByCategory(category: KnowledgeCategory): readonly GoodTradingKnowledgeEntry[] {
    return BY_CATEGORY.get(category) ?? [];
  },
  getByKind(kind: KnowledgeKind): readonly GoodTradingKnowledgeEntry[] {
    return RAW_ENTRIES.filter((e) => e.kind === kind);
  },
  count(): number {
    return RAW_ENTRIES.length;
  },
  setupCount(): number {
    return RAW_ENTRIES.filter((e) => e.kind === "SETUP").length;
  },
} as const;

export type { GoodTradingKnowledgeEntry };
