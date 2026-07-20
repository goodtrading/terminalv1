/**
 * Local file persistence for Knowledge Acquisition Inbox (AI-5).
 * Path: server/ai/goodTradingAi/extractor/data/ (gitignored).
 * CJS-safe via process.cwd() — never import.meta.
 * NEVER writes to knowledge registry.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type {
  KnowledgeAcquisitionProposal,
  ProposalReviewRecord,
  ExtractorJobMemory,
  ProposalReviewInput,
  ProposalStatus,
} from "@shared/goodTradingAiExtractor";
import { randomUUID } from "node:crypto";

export const EXTRACTOR_DATA_DIR = join(
  process.cwd(),
  "server",
  "ai",
  "goodTradingAi",
  "extractor",
  "data",
);

type StoreShape = {
  proposals: KnowledgeAcquisitionProposal[];
  reviews: ProposalReviewRecord[];
  jobs: ExtractorJobMemory[];
};

const EMPTY: StoreShape = { proposals: [], reviews: [], jobs: [] };

function storePath(): string {
  return join(EXTRACTOR_DATA_DIR, "extractor-store.json");
}

function ensureDir(): void {
  if (!existsSync(EXTRACTOR_DATA_DIR)) {
    mkdirSync(EXTRACTOR_DATA_DIR, { recursive: true });
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
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      jobs: Array.isArray(parsed.jobs) ? parsed.jobs : [],
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

export function resetExtractorStoreForTests(): void {
  memory = structuredClone(EMPTY);
  ensureDir();
  persist(memory);
}

export function upsertProposals(proposals: KnowledgeAcquisitionProposal[]): void {
  const data = load();
  for (const p of proposals) {
    const idx = data.proposals.findIndex((x) => x.id === p.id);
    if (idx >= 0) data.proposals[idx] = p;
    else data.proposals.push(p);
  }
  persist(data);
}

export function listProposals(filter?: { status?: ProposalStatus }): KnowledgeAcquisitionProposal[] {
  let list = [...load().proposals];
  if (filter?.status) list = list.filter((p) => p.status === filter.status);
  return list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function getProposal(id: string): KnowledgeAcquisitionProposal | undefined {
  return load().proposals.find((p) => p.id === id);
}

export function appendJobMemory(job: ExtractorJobMemory): void {
  const data = load();
  data.jobs.unshift(job);
  data.jobs = data.jobs.slice(0, 500);
  persist(data);
}

export function listJobs(): ExtractorJobMemory[] {
  return [...load().jobs];
}

export function listReviews(): ProposalReviewRecord[] {
  return [...load().reviews];
}

/**
 * Apply human review. Updates proposal status only — NEVER mutates Brain entries.
 */
export function applyProposalReview(params: {
  input: ProposalReviewInput;
  reviewedByUserId: number;
  reviewedByEmail?: string;
}): { review: ProposalReviewRecord; proposal: KnowledgeAcquisitionProposal } {
  const data = load();
  const proposal = data.proposals.find((p) => p.id === params.input.proposalId);
  if (!proposal) {
    throw new Error("PROPOSAL_NOT_FOUND");
  }

  const decision = params.input.decision;
  let status: ProposalStatus = proposal.status;
  const now = new Date().toISOString();
  let next: KnowledgeAcquisitionProposal = { ...proposal, updatedAt: now };

  if (decision === "ACCEPT") {
    status = "ACCEPTED";
  } else if (decision === "REJECT") {
    status = "REJECTED";
  } else if (decision === "EDIT") {
    status = "EDITED";
    if (params.input.editedTitle?.trim()) next.title = params.input.editedTitle.trim().slice(0, 160);
    if (params.input.editedStatement?.trim()) {
      next.statement = params.input.editedStatement.trim().slice(0, 800);
    }
    if (params.input.editedExplanation?.trim()) {
      next.explanation = params.input.editedExplanation.trim().slice(0, 1200);
    }
  } else if (decision === "MERGE") {
    status = "MERGED";
    // mergeTargetId recorded on review only — no registry write
  }

  next = { ...next, status };
  const idx = data.proposals.findIndex((p) => p.id === proposal.id);
  data.proposals[idx] = next;

  const review: ProposalReviewRecord = {
    id: `rev_${randomUUID().slice(0, 12)}`,
    proposalId: proposal.id,
    decision,
    editedTitle: params.input.editedTitle,
    editedStatement: params.input.editedStatement,
    editedExplanation: params.input.editedExplanation,
    mergeTargetId: params.input.mergeTargetId,
    notes: params.input.notes,
    reviewedByUserId: params.reviewedByUserId,
    reviewedByEmail: params.reviewedByEmail,
    createdAt: now,
    resultingStatus: status,
  };
  data.reviews.unshift(review);
  persist(data);
  return { review, proposal: next };
}

export function inboxStats(): {
  pending: number;
  accepted: number;
  rejected: number;
  edited: number;
  merged: number;
  total: number;
  goldenCandidates: number;
} {
  const proposals = load().proposals;
  return {
    pending: proposals.filter((p) => p.status === "PENDING").length,
    accepted: proposals.filter((p) => p.status === "ACCEPTED").length,
    rejected: proposals.filter((p) => p.status === "REJECTED").length,
    edited: proposals.filter((p) => p.status === "EDITED").length,
    merged: proposals.filter((p) => p.status === "MERGED").length,
    total: proposals.length,
    goldenCandidates: proposals.filter((p) => p.goldenCaseCandidate?.isCandidate).length,
  };
}
