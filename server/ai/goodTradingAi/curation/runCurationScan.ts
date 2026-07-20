import { randomUUID } from "node:crypto";
import type {
  CurationIssue,
  KnowledgeHealthMetrics,
  RunCurationScanRequest,
} from "@shared/goodTradingAiCuration";
import { computeKnowledgeHealth } from "./knowledgeHealth";
import { buildMergeSuggestions } from "./mergeSuggestion";
import { validateIssueBatch, validateHealthMetrics } from "./curationValidator";
import {
  appendVersions,
  listVersions,
  replaceIssues,
  saveHealthMetrics,
} from "./curationStore";
import { seedBaselineVersions } from "./versioning";
import type { UsageSignals } from "./qualityScore";

export type CurationScanResult = {
  metrics: KnowledgeHealthMetrics;
  issues: CurationIssue[];
  issueCount: number;
  autoAppliedToBrain: false;
  durationMs: number;
};

function issueId(kind: string, parts: string[]): string {
  const base = `${kind}:${parts.sort().join("+")}`.slice(0, 72);
  return `cur_${base.replace(/[^a-zA-Z0-9:_+-]/g, "_")}`;
}

/**
 * Full curation scan → compact issues → persist for human review.
 * NEVER mutates the Knowledge Graph / registry.
 */
export function runCurationScan(
  input: RunCurationScanRequest = {},
  signals: UsageSignals = {},
): CurationScanResult {
  const started = Date.now();
  const maxIssues = input.maxIssues ?? 200;
  const health = computeKnowledgeHealth(signals);
  const vMetrics = validateHealthMetrics(health.metrics);
  const metrics = vMetrics.metrics;

  const merges = buildMergeSuggestions(health.duplicates, 40);
  const mergeByPair = new Map(
    merges.map((m) => {
      const key = m.keepId < m.dropId ? `${m.keepId}|${m.dropId}` : `${m.dropId}|${m.keepId}`;
      return [key, m] as const;
    }),
  );

  const now = new Date().toISOString();
  const raw: CurationIssue[] = [];

  for (const d of health.duplicates) {
    const key = d.aId < d.bId ? `${d.aId}|${d.bId}` : `${d.bId}|${d.aId}`;
    const merge = mergeByPair.get(key);
    raw.push({
      id: issueId(d.kind, [d.aId, d.bId]),
      kind: d.kind,
      status: "PENDING",
      title: `${d.kind}: ${d.aTitle.slice(0, 40)} ↔ ${d.bTitle.slice(0, 40)}`,
      summary: d.reason.slice(0, 500),
      entryIds: [d.aId, d.bId],
      entryTitles: [d.aTitle, d.bTitle],
      similarity: d.similarity,
      severity: d.kind === "DUPLICATE" ? "high" : d.kind === "POSSIBLE_MERGE" ? "medium" : "low",
      merge,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const c of health.conflicts) {
    raw.push({
      id: issueId("CONFLICT", [c.aId, c.bId, c.code]),
      kind: "CONFLICT",
      status: "PENDING",
      title: `Conflict: ${c.aTitle.slice(0, 50)}`,
      summary: c.explanation.slice(0, 500),
      entryIds: [c.aId, c.bId],
      entryTitles: [c.aTitle, c.bTitle],
      severity: c.severity,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const m of health.relations.missing) {
    raw.push({
      id: issueId("MISSING_RELATION", [m.entryId]),
      kind: "MISSING_RELATION",
      status: "PENDING",
      title: `Missing relations: ${m.title.slice(0, 80)}`,
      summary: m.reason.slice(0, 500),
      entryIds: [m.entryId],
      entryTitles: [m.title],
      severity: "medium",
      suggestedRelations: m.suggestedRelations,
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const o of health.relations.orphans.slice(0, 40)) {
    // Avoid duplicating if already in missing
    if (raw.some((i) => i.kind === "MISSING_RELATION" && i.entryIds[0] === o.entryId)) continue;
    raw.push({
      id: issueId("ORPHAN", [o.entryId]),
      kind: "ORPHAN",
      status: "PENDING",
      title: `Orphan: ${o.title.slice(0, 80)}`,
      summary: o.reason.slice(0, 500),
      entryIds: [o.entryId],
      entryTitles: [o.title],
      severity: "low",
      createdAt: now,
      updatedAt: now,
    });
  }

  for (const d of health.deprecations) {
    raw.push({
      id: issueId("DEPRECATION", [d.entryId]),
      kind: "DEPRECATION",
      status: "PENDING",
      title: `Deprecate?: ${d.title.slice(0, 80)}`,
      summary: d.reason.slice(0, 500),
      entryIds: [d.entryId],
      entryTitles: [d.title],
      severity: d.severity,
      createdAt: now,
      updatedAt: now,
    });
  }

  if (input.includeQuality !== false) {
    for (const q of health.qualities.filter((x) => x.qualityScore < 0.35).slice(0, 30)) {
      raw.push({
        id: issueId("LOW_QUALITY", [q.entryId]),
        kind: "LOW_QUALITY",
        status: "PENDING",
        title: `Low quality: ${q.title.slice(0, 80)}`,
        summary: `qualityScore=${q.qualityScore} (suggest-only; no auto-edit).`,
        entryIds: [q.entryId],
        entryTitles: [q.title],
        severity: "low",
        quality: q,
        createdAt: now,
        updatedAt: now,
      });
    }
  }

  const capped = raw.slice(0, maxIssues);
  const { issues } = validateIssueBatch(capped);

  // Version baseline (never lose history)
  const existing = listVersions();
  const seeded = seedBaselineVersions(existing);
  if (seeded.length) appendVersions(seeded);

  replaceIssues(issues);
  saveHealthMetrics(metrics);

  return {
    metrics,
    issues,
    issueCount: issues.length,
    autoAppliedToBrain: false,
    durationMs: Date.now() - started,
  };
}

/** Stable id helper exposed for tests */
export function makeCurationIssueId(kind: string, parts: string[]): string {
  return issueId(kind, parts);
}

export function newScanRequestId(): string {
  return `scan_${randomUUID().slice(0, 10)}`;
}
