import type { VersionHistoryEntry } from "@shared/goodTradingAiCuration";
import { randomUUID } from "node:crypto";
import { knowledgeRegistry } from "../knowledge/registry";

/**
 * Version history lives in curation store — never rewrites knowledge modules.
 * Seed baseline snapshots from current registry versions (idempotent by entry+version).
 */
export function seedBaselineVersions(existing: VersionHistoryEntry[]): VersionHistoryEntry[] {
  const have = new Set(existing.map((v) => `${v.entryId}@${v.toVersion}`));
  const now = new Date().toISOString();
  const seeded: VersionHistoryEntry[] = [];
  for (const e of knowledgeRegistry.getAll()) {
    const key = `${e.id}@${e.version}`;
    if (have.has(key)) continue;
    seeded.push({
      id: `ver_${randomUUID().slice(0, 12)}`,
      entryId: e.id,
      date: now,
      editor: "system:baseline",
      reason: "Snapshot baseline del registry (curation, no rewrite).",
      fromVersion: "—",
      toVersion: e.version,
      diffSummary: `Baseline v${e.version}: «${e.title.slice(0, 80)}»`,
    });
    have.add(key);
  }
  return seeded;
}

export function appendVersionEvent(params: {
  entryId: string;
  editor: string;
  reason: string;
  fromVersion: string;
  toVersion: string;
  diffSummary: string;
}): VersionHistoryEntry {
  return {
    id: `ver_${randomUUID().slice(0, 12)}`,
    entryId: params.entryId,
    date: new Date().toISOString(),
    editor: params.editor.slice(0, 120),
    reason: params.reason.slice(0, 400),
    fromVersion: params.fromVersion.slice(0, 40),
    toVersion: params.toVersion.slice(0, 40),
    diffSummary: params.diffSummary.slice(0, 800),
  };
}

export function listVersionsForEntry(
  all: VersionHistoryEntry[],
  entryId: string,
): VersionHistoryEntry[] {
  return all
    .filter((v) => v.entryId === entryId)
    .sort((a, b) => b.date.localeCompare(a.date));
}

/** Compact diff helper for editorial notes (string-level, deterministic). */
export function summarizeFieldDiff(
  before: string,
  after: string,
  field: string,
): string {
  if (before === after) return `${field}: sin cambios`;
  const bLen = before.length;
  const aLen = after.length;
  return `${field}: ${bLen}→${aLen} chars`;
}
