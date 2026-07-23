/**
 * Rule Dependency Graph — directed edges; detect/break cycles.
 */
import type {
  DependencyEdge,
  DependencyGraph,
  DependencyRelation,
  RegisteredRule,
} from "@shared/goodTradingAiKnowledgeEvolution";
import { dependencyGraphSchema, dependencyEdgeSchema } from "@shared/goodTradingAiKnowledgeEvolution";

function edgeId(from: string, to: string, relation: DependencyRelation): string {
  return `${from}__${relation}__${to}`.slice(0, 96);
}

/** Detect cycle; return edge ids to drop (break weakest/newest edges in SCC). */
function breakCycles(edges: DependencyEdge[]): { edges: DependencyEdge[]; broken: number } {
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

  const cycleEdges = new Set<string>();
  const stack: string[] = [];

  function dfs(u: string): void {
    color.set(u, GRAY);
    stack.push(u);
    for (const v of adj.get(u) ?? []) {
      const c = color.get(v) ?? WHITE;
      if (c === GRAY) {
        // back edge — mark last edge u->v
        const hit = edges.find((e) => e.fromRuleId === u && e.toRuleId === v);
        if (hit) cycleEdges.add(hit.id);
      } else if (c === WHITE) {
        dfs(v);
      }
    }
    stack.pop();
    color.set(u, BLACK);
  }

  for (const n of nodes) {
    if ((color.get(n) ?? WHITE) === WHITE) dfs(n);
  }

  if (!cycleEdges.size) return { edges, broken: 0 };
  const kept = edges.filter((e) => !cycleEdges.has(e.id));
  // re-check recursively once
  const again = breakCycles(kept);
  return { edges: again.edges, broken: cycleEdges.size + again.broken };
}

export function buildDependencyGraph(rules: RegisteredRule[]): DependencyGraph {
  const edges: DependencyEdge[] = [];
  let i = 0;
  for (let a = 0; a < rules.length; a++) {
    for (let b = 0; b < rules.length; b++) {
      if (a === b) continue;
      const ra = rules[a]!;
      const rb = rules[b]!;
      const shared = ra.lenses.filter((l) => rb.lenses.includes(l));
      if (!shared.length) continue;

      let relation: DependencyRelation | null = null;
      let weight = 0.4;
      if (ra.kind === "CONFIRMATION" && rb.kind === "PRIORITY") {
        relation = "supports";
        weight = 0.7;
      } else if (ra.kind === "PRIORITY" && rb.kind === "CONFIRMATION") {
        relation = "requires";
        weight = 0.65;
      } else if (ra.kind === "INVALIDATION") {
        relation = "invalidates";
        weight = 0.8;
      } else if (ra.kind === "CONFLICT" && rb.kind === "PRIORITY") {
        relation = "weakens";
        weight = 0.6;
      } else if (ra.kind === "PRIORITY" && rb.kind === "GENERAL") {
        relation = "strengthens";
        weight = 0.5;
      } else if (shared.length >= 2) {
        relation = "dependsOn";
        weight = 0.45;
      }
      if (!relation) continue;
      i++;
      // Avoid immediate A<->A self; skip duplicate undirected reverse for dependsOn when a>b to reduce density
      if (relation === "dependsOn" && a > b) continue;
      edges.push(
        dependencyEdgeSchema.parse({
          id: edgeId(ra.id, rb.id, relation) || `dep_${i}`,
          fromRuleId: ra.id,
          toRuleId: rb.id,
          relation,
          weight,
          mentorEligible: false,
        }),
      );
    }
  }

  // Cap edges
  const capped = edges.slice(0, 2000);
  const { edges: acyclic, broken } = breakCycles(capped);
  return dependencyGraphSchema.parse({
    edges: acyclic,
    cyclesBroken: broken,
    mentorEligible: false,
  });
}