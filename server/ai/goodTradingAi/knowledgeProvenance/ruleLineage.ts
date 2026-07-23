/**
 * Rule Lineage — temporal graph. Detect and break cycles.
 */
import type {
  JustificationEvent,
  LineageEdge,
  LineageGraph,
  LineageRelation,
  ProvenanceRecord,
} from "@shared/goodTradingAiKnowledgeProvenance";
import { lineageEdgeSchema, lineageGraphSchema } from "@shared/goodTradingAiKnowledgeProvenance";

function edgeId(from: string, to: string, relation: LineageRelation): string {
  return `lin_${from}__${relation}__${to}`.slice(0, 96);
}

function breakCycles(edges: LineageEdge[]): { edges: LineageEdge[]; broken: number } {
  const adj = new Map<string, string[]>();
  for (const e of edges) {
    const list = adj.get(e.fromRuleId) ?? [];
    list.push(e.toRuleId);
    adj.set(e.fromRuleId, list);
  }
  const WHITE = 0, GRAY = 1, BLACK = 2;
  const color = new Map<string, number>();
  const nodes = new Set<string>();
  for (const e of edges) {
    nodes.add(e.fromRuleId);
    nodes.add(e.toRuleId);
  }
  for (const n of nodes) color.set(n, WHITE);
  const cycleEdgeIds = new Set<string>();

  function dfs(u: string): void {
    color.set(u, GRAY);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) {
        const hit = edges.find((e) => e.fromRuleId === u && e.toRuleId === v);
        if (hit) cycleEdgeIds.add(hit.id);
      } else if (c === WHITE) {
        dfs(v);
      }
    }
    color.set(u, BLACK);
  }

  for (const n of nodes) {
    if ((color.get(n) ?? WHITE) === WHITE) dfs(n);
  }
  if (!cycleEdgeIds.size) return { edges, broken: 0 };
  const kept = edges.filter((e) => !cycleEdgeIds.has(e.id));
  const again = breakCycles(kept);
  return { edges: again.edges, broken: cycleEdgeIds.size + again.broken };
}

export function buildLineageGraph(input: {
  registry: ProvenanceRecord[];
  events: JustificationEvent[];
}): LineageGraph {
  const edges: LineageEdge[] = [];
  const now = Date.now();
  const byOrigin = new Map<string, ProvenanceRecord[]>();
  for (const r of input.registry) {
    const list = byOrigin.get(r.origin) ?? [];
    list.push(r);
    byOrigin.set(r.origin, list);
  }

  // Related rules sharing origin family / similar id prefixes
  for (let i = 0; i < input.registry.length; i++) {
    for (let j = i + 1; j < input.registry.length; j++) {
      const a = input.registry[i]!;
      const b = input.registry[j]!;
      const aParts = a.stableRuleId.split("_");
      const bParts = b.stableRuleId.split("_");
      const shared = aParts.filter((p) => bParts.includes(p) && p !== "RULE" && p.length > 2);
      if (shared.length >= 1) {
        edges.push(
          lineageEdgeSchema.parse({
            id: edgeId(a.stableRuleId, b.stableRuleId, "relatedRules"),
            fromRuleId: a.stableRuleId,
            toRuleId: b.stableRuleId,
            relation: "relatedRules",
            atMs: Math.max(a.createdAtMs, b.createdAtMs),
            mentorEligible: false,
          }),
        );
      }
    }
  }

  // Parent/child from DERIVED origin or merge/split/replace events
  for (const e of input.events) {
    if (e.kind === "MERGED" || e.kind === "REPLACED" || e.kind === "SPLIT" || e.kind === "DEPRECATED") {
      // Link to related rules mentioned in rationale supportingEvidence ids if RULE_*
      const candidates = [...e.rationale.supportingEvidence, ...e.rationale.opposingEvidence]
        .filter((s) => /^RULE_[A-Z0-9_]+$/.test(s))
        .slice(0, 5);
      for (const other of candidates) {
        if (other === e.stableRuleId) continue;
        let relation: LineageRelation = "relatedRules";
        if (e.kind === "MERGED") relation = "mergedFrom";
        else if (e.kind === "SPLIT") relation = "splitInto";
        else if (e.kind === "REPLACED" || e.kind === "DEPRECATED") relation = "supersededBy";
        edges.push(
          lineageEdgeSchema.parse({
            id: edgeId(e.stableRuleId, other, relation),
            fromRuleId: e.stableRuleId,
            toRuleId: other as typeof e.stableRuleId,
            relation,
            atMs: e.atMs,
            mentorEligible: false,
          }),
        );
      }
    }
  }

  // Synthetic parent: earlier CREATED rule with overlapping tokens becomes parent of later one
  const created = input.events.filter((e) => e.kind === "CREATED").sort((a, b) => a.atMs - b.atMs);
  for (let i = 0; i < created.length; i++) {
    for (let j = i + 1; j < created.length; j++) {
      const parent = created[i]!;
      const child = created[j]!;
      const pParts = new Set(parent.stableRuleId.split("_"));
      const cParts = child.stableRuleId.split("_");
      const overlap = cParts.filter((p) => pParts.has(p) && p !== "RULE").length;
      if (overlap >= 2 && parent.stableRuleId !== child.stableRuleId) {
        edges.push(
          lineageEdgeSchema.parse({
            id: edgeId(parent.stableRuleId, child.stableRuleId, "parentRule"),
            fromRuleId: parent.stableRuleId,
            toRuleId: child.stableRuleId,
            relation: "parentRule",
            atMs: child.atMs,
            mentorEligible: false,
          }),
        );
        edges.push(
          lineageEdgeSchema.parse({
            id: edgeId(child.stableRuleId, parent.stableRuleId, "childRule"),
            fromRuleId: child.stableRuleId,
            toRuleId: parent.stableRuleId,
            relation: "childRule",
            atMs: child.atMs,
            mentorEligible: false,
          }),
        );
      }
    }
  }

  // Deduplicate by id
  const uniq = new Map<string, LineageEdge>();
  for (const e of edges) uniq.set(e.id, e);
  const capped = [...uniq.values()].slice(0, 5000);
  const { edges: acyclic, broken } = breakCycles(capped);

  return lineageGraphSchema.parse({
    edges: acyclic,
    cyclesBroken: broken,
    mentorEligible: false,
  });
}

/** Explicit merge/split/supersede helpers for tests and admin ingestion (append edges only). */
export function lineageEdge(
  fromRuleId: string,
  toRuleId: string,
  relation: LineageRelation,
  atMs = Date.now(),
): LineageEdge {
  return lineageEdgeSchema.parse({
    id: edgeId(fromRuleId, toRuleId, relation),
    fromRuleId,
    toRuleId,
    relation,
    atMs,
    mentorEligible: false,
  });
}