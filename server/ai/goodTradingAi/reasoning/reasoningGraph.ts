import { knowledgeRegistry } from "../knowledge/registry";
import type { GoodTradingKnowledgeEntry, KnowledgeRelationKind } from "../knowledge/types";
import {
  MAX_REASONING_CHAIN_STEPS,
  MAX_REASONING_EXPAND_LEVELS,
  RELATION_PRIORITY,
  type ReasoningChainStep,
  type ReasoningStepRole,
} from "./reasoningSteps";

export type TemporaryReasoningGraph = {
  seedIds: string[];
  nodeIds: string[];
  edges: Array<{ from: string; to: string; kind: KnowledgeRelationKind }>;
  entriesById: Map<string, GoodTradingKnowledgeEntry>;
};

/**
 * Build a temporary subgraph from retrieved seeds — expand at most 1–2 levels.
 * Never walks the full corpus.
 */
export function buildTemporaryReasoningGraph(seedIds: string[]): TemporaryReasoningGraph {
  const uniqueSeeds = Array.from(new Set(seedIds.filter(Boolean)));
  const entriesById = new Map<string, GoodTradingKnowledgeEntry>();
  const nodeIds = new Set<string>();
  const edges: TemporaryReasoningGraph["edges"] = [];
  const edgeKey = new Set<string>();

  const addNode = (id: string) => {
    const e = knowledgeRegistry.getById(id);
    if (!e) return false;
    nodeIds.add(id);
    entriesById.set(id, e);
    return true;
  };

  for (const id of uniqueSeeds) addNode(id);

  let frontier = [...uniqueSeeds];
  for (let level = 0; level < MAX_REASONING_EXPAND_LEVELS; level++) {
    const next: string[] = [];
    for (const from of frontier) {
      const e = knowledgeRegistry.getById(from);
      if (!e) continue;
      for (const kind of RELATION_PRIORITY) {
        for (const to of e[kind] ?? []) {
          if (!knowledgeRegistry.getById(to)) continue;
          const key = `${from}|${kind}|${to}`;
          if (edgeKey.has(key)) continue;
          edgeKey.add(key);
          addNode(to);
          edges.push({ from, to, kind });
          if (!uniqueSeeds.includes(to) && level < MAX_REASONING_EXPAND_LEVELS - 1) {
            next.push(to);
          } else if (level === 0) {
            next.push(to);
          }
        }
      }
    }
    frontier = Array.from(new Set(next)).filter((id) => !uniqueSeeds.includes(id));
    if (frontier.length === 0) break;
  }

  return {
    seedIds: uniqueSeeds,
    nodeIds: Array.from(nodeIds),
    edges,
    entriesById,
  };
}

function roleForRelation(kind: KnowledgeRelationKind): ReasoningStepRole {
  return kind as ReasoningStepRole;
}

/**
 * Order a deterministic logical chain: requires → dependsOn → supports → related → child.
 */
export function orderReasoningChain(graph: TemporaryReasoningGraph): ReasoningChainStep[] {
  const steps: ReasoningChainStep[] = [];
  const used = new Set<string>();

  const pushEntry = (
    entry: GoodTradingKnowledgeEntry,
    role: ReasoningStepRole,
    viaRelation?: KnowledgeRelationKind,
  ) => {
    if (used.has(entry.id) || steps.length >= MAX_REASONING_CHAIN_STEPS) return;
    used.add(entry.id);
    steps.push({
      index: steps.length + 1,
      knowledgeId: entry.id,
      title: entry.title,
      detail: entry.statement,
      role,
      viaRelation,
    });
  };

  // 1) Constitution / requires anchors among seeds first
  const seedEntries = graph.seedIds
    .map((id) => graph.entriesById.get(id))
    .filter((e): e is GoodTradingKnowledgeEntry => Boolean(e));

  const constitution = seedEntries.filter((e) => e.category === "constitution");
  for (const e of constitution) pushEntry(e, "anchor");

  // 2) Walk priority relations from seeds
  for (const kind of RELATION_PRIORITY) {
    for (const seed of graph.seedIds) {
      const e = graph.entriesById.get(seed);
      if (!e) continue;
      if (!used.has(seed) && kind === "requires") {
        // include seed itself early if not constitution
        if (e.category !== "constitution") pushEntry(e, "anchor");
      }
      for (const edge of graph.edges.filter((ed) => ed.from === seed && ed.kind === kind)) {
        const target = graph.entriesById.get(edge.to);
        if (target) pushEntry(target, roleForRelation(kind), kind);
      }
    }
  }

  // 3) Remaining seeds
  for (const e of seedEntries) pushEntry(e, "relatedTo");

  // 4) Cap and reindex
  return steps.slice(0, MAX_REASONING_CHAIN_STEPS).map((s, i) => ({ ...s, index: i + 1 }));
}
