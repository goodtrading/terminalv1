import type { GoodTradingKnowledgeEntry } from "./types";

export type RegistryValidationIssue = {
  code: string;
  message: string;
  entryId?: string;
};

export type RegistryValidationResult = {
  ok: boolean;
  entryCount: number;
  setupCount: number;
  issues: RegistryValidationIssue[];
};

/**
 * Validate once at test/boot — not on every request.
 */
export function validateKnowledgeRegistry(
  entries: readonly GoodTradingKnowledgeEntry[],
): RegistryValidationResult {
  const issues: RegistryValidationIssue[] = [];
  const ids = new Set<string>();

  for (const e of entries) {
    if (!e.id || !e.id.trim()) {
      issues.push({ code: "EMPTY_ID", message: "Entry with empty id" });
      continue;
    }
    if (ids.has(e.id)) {
      issues.push({ code: "DUPLICATE_ID", message: `Duplicate id ${e.id}`, entryId: e.id });
    }
    ids.add(e.id);

    if (!e.title?.trim()) {
      issues.push({ code: "EMPTY_TITLE", message: "Empty title", entryId: e.id });
    }
    if (!e.statement?.trim()) {
      issues.push({ code: "EMPTY_STATEMENT", message: "Empty statement", entryId: e.id });
    }
    if (!e.explanation?.trim()) {
      issues.push({ code: "EMPTY_EXPLANATION", message: "Empty explanation", entryId: e.id });
    }
    if (!e.version?.trim()) {
      issues.push({ code: "EMPTY_VERSION", message: "Empty version", entryId: e.id });
    }
  }

  for (const e of entries) {
    for (const rel of e.relatedEntryIds) {
      if (!ids.has(rel)) {
        issues.push({
          code: "BROKEN_RELATION",
          message: `relatedEntryId missing: ${rel}`,
          entryId: e.id,
        });
      }
    }
    for (const pre of e.prerequisites) {
      if (!ids.has(pre)) {
        issues.push({
          code: "BROKEN_PREREQ",
          message: `prerequisite missing: ${pre}`,
          entryId: e.id,
        });
      }
    }
    if (e.kind === "SETUP") {
      const s = e as GoodTradingKnowledgeEntry & { relatedKnowledgeIds?: string[] };
      for (const rel of s.relatedKnowledgeIds ?? []) {
        if (!ids.has(rel)) {
          issues.push({
            code: "BROKEN_SETUP_RELATION",
            message: `relatedKnowledgeId missing: ${rel}`,
            entryId: e.id,
          });
        }
      }
    }
  }

  const setupCount = entries.filter((e) => e.kind === "SETUP").length;
  if (entries.length < 70) {
    issues.push({
      code: "TOO_FEW_ENTRIES",
      message: `Expected ≥70 entries, got ${entries.length}`,
    });
  }
  if (setupCount < 5 || setupCount > 8) {
    issues.push({
      code: "SETUP_COUNT",
      message: `Expected 5–8 setups, got ${setupCount}`,
    });
  }

  return {
    ok: issues.length === 0,
    entryCount: entries.length,
    setupCount,
    issues,
  };
}
