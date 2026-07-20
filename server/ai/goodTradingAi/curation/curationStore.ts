/**
 * Local file persistence for Knowledge Curation (AI-5.5).
 * Path: server/ai/goodTradingAi/curation/data/ (gitignored).
 * CJS-safe via process.cwd() — never import.meta.
 * NEVER writes to knowledge registry.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  CurationIssue,
  CurationReviewInput,
  CurationReviewRecord,
  CurationIssueStatus,
  KnowledgeHealthMetrics,
  VersionHistoryEntry,
} from "@shared/goodTradingAiCuration";

export const CURATION_DATA_DIR = join(
  process.cwd(),
  "server",
  "ai",
  "goodTradingAi",
  "curation",
  "data",
);

type StoreShape = {
  issues: CurationIssue[];
  reviews: CurationReviewRecord[];
  versions: VersionHistoryEntry[];
  lastHealth: KnowledgeHealthMetrics | null;
};

const EMPTY: StoreShape = { issues: [], reviews: [], versions: [], lastHealth: null };

function storePath(): string {
  return join(CURATION_DATA_DIR, "curation-store.json");
}

function ensureDir(): void {
  if (!existsSync(CURATION_DATA_DIR)) {
    mkdirSync(CURATION_DATA_DIR, { recursive: true });
  }
}

let memory: StoreShape | null = null;

function load(): StoreShape {
  if (memory) return memory;
  ensureDir();
  const p = storePath();
  if (!existsSync(p)) {
    memory = structuredClone(EMPTY);
    return memory;
  }
  try {
    const raw = readFileSync(p, "utf8");
    const parsed = JSON.parse(raw) as StoreShape;
    memory = {
      issues: Array.isArray(parsed.issues) ? parsed.issues : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      versions: Array.isArray(parsed.versions) ? parsed.versions : [],
      lastHealth: parsed.lastHealth ?? null,
    };
  } catch {
    memory = structuredClone(EMPTY);
  }
  return memory;
}

function persist(data: StoreShape): void {
  ensureDir();
  const p = storePath();
  const tmp = `${p}.${process.pid}.tmp`;
  writeFileSync(tmp, JSON.stringify(data, null, 2), "utf8");
  renameSync(tmp, p);
  memory = data;
}

export function resetCurationStoreForTests(): void {
  memory = structuredClone(EMPTY);
  ensureDir();
  persist(memory);
}

export function saveHealthMetrics(metrics: KnowledgeHealthMetrics): void {
  const data = load();
  data.lastHealth = metrics;
  persist(data);
}

export function getLastHealth(): KnowledgeHealthMetrics | null {
  return load().lastHealth;
}

export function replaceIssues(issues: CurationIssue[]): void {
  const data = load();
  // Keep non-pending reviewed issues; replace pending from new scan
  const kept = data.issues.filter((i) => i.status !== "PENDING");
  const keptIds = new Set(kept.map((i) => i.id));
  const next = [...kept];
  for (const issue of issues) {
    if (keptIds.has(issue.id)) continue;
    next.push(issue);
  }
  data.issues = next.slice(0, 2000);
  persist(data);
}

export function upsertIssues(issues: CurationIssue[]): void {
  const data = load();
  for (const issue of issues) {
    const idx = data.issues.findIndex((x) => x.id === issue.id);
    if (idx >= 0) data.issues[idx] = issue;
    else data.issues.push(issue);
  }
  data.issues = data.issues.slice(0, 2000);
  persist(data);
}

export function listIssues(filter?: { status?: CurationIssueStatus; kind?: string }): CurationIssue[] {
  let list = [...load().issues];
  if (filter?.status) list = list.filter((i) => i.status === filter.status);
  if (filter?.kind) list = list.filter((i) => i.kind === filter.kind);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getIssue(id: string): CurationIssue | undefined {
  return load().issues.find((i) => i.id === id);
}

export function appendVersions(entries: VersionHistoryEntry[]): void {
  const data = load();
  data.versions = [...entries, ...data.versions].slice(0, 5000);
  persist(data);
}

export function listVersions(entryId?: string): VersionHistoryEntry[] {
  const all = load().versions;
  if (!entryId) return [...all].sort((a, b) => b.date.localeCompare(a.date));
  return all.filter((v) => v.entryId === entryId).sort((a, b) => b.date.localeCompare(a.date));
}

export function listReviews(): CurationReviewRecord[] {
  return [...load().reviews];
}

/**
 * Apply human review. Updates issue status only — NEVER mutates Brain entries.
 */
export function applyCurationReview(params: {
  input: CurationReviewInput;
  reviewedByUserId: number;
  reviewedByEmail?: string;
}): { review: CurationReviewRecord; issue: CurationIssue } {
  const data = load();
  const issue = data.issues.find((i) => i.id === params.input.issueId);
  if (!issue) throw new Error("ISSUE_NOT_FOUND");

  const decision = params.input.decision;
  let status: CurationIssueStatus = issue.status;
  const now = new Date().toISOString();
  let next: CurationIssue = { ...issue, updatedAt: now };

  if (decision === "ACCEPT") status = "ACCEPTED";
  else if (decision === "IGNORE") status = "IGNORED";
  else if (decision === "EDIT") {
    status = "EDITED";
    if (params.input.editedSummary?.trim()) {
      next.summary = params.input.editedSummary.trim().slice(0, 500);
    }
  } else if (decision === "MERGE") {
    status = "MERGED";
  }

  next = { ...next, status };
  const idx = data.issues.findIndex((i) => i.id === issue.id);
  data.issues[idx] = next;

  const review: CurationReviewRecord = {
    id: `crev_${randomUUID().slice(0, 12)}`,
    issueId: issue.id,
    decision,
    notes: params.input.notes,
    editedSummary: params.input.editedSummary,
    mergeKeepId: params.input.mergeKeepId,
    mergeDropId: params.input.mergeDropId,
    reviewedByUserId: params.reviewedByUserId,
    reviewedByEmail: params.reviewedByEmail,
    createdAt: now,
    resultingStatus: status,
  };
  data.reviews.unshift(review);
  persist(data);
  return { review, issue: next };
}

export function curationQueueStats(): {
  pending: number;
  accepted: number;
  ignored: number;
  edited: number;
  merged: number;
  total: number;
  byKind: Record<string, number>;
} {
  const issues = load().issues;
  const byKind: Record<string, number> = {};
  for (const i of issues) {
    byKind[i.kind] = (byKind[i.kind] ?? 0) + 1;
  }
  return {
    pending: issues.filter((i) => i.status === "PENDING").length,
    accepted: issues.filter((i) => i.status === "ACCEPTED").length,
    ignored: issues.filter((i) => i.status === "IGNORED").length,
    edited: issues.filter((i) => i.status === "EDITED").length,
    merged: issues.filter((i) => i.status === "MERGED").length,
    total: issues.length,
    byKind,
  };
}
