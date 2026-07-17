/**
 * Local file persistence for Calibration Lab (dev/internal).
 * Path: server/ai/goodTradingAi/calibration/data/ (gitignored ideally via .gitignore note).
 * NOT for multi-instance production without a real store.
 *
 * CJS-safe: resolve via process.cwd() — esbuild empties import.meta in the Railway
 * CommonJS bundle, so fileURLToPath(import.meta.url) crashes healthcheck at boot.
 */
import { existsSync, mkdirSync, readFileSync, writeFileSync, renameSync } from "node:fs";
import { join } from "node:path";
import type {
  CalibrationReview,
  KnowledgeChangeProposal,
  GoodTradingGoldenCase,
} from "@shared/goodTradingAiCalibration";

export const CALIBRATION_DATA_DIR = join(
  process.cwd(),
  "server",
  "ai",
  "goodTradingAi",
  "calibration",
  "data",
);

type StoreShape = {
  reviews: CalibrationReview[];
  proposals: KnowledgeChangeProposal[];
  goldenCases: GoodTradingGoldenCase[];
  drafts: Record<string, unknown>;
};

const EMPTY: StoreShape = { reviews: [], proposals: [], goldenCases: [], drafts: {} };

function storePath(): string {
  return join(CALIBRATION_DATA_DIR, "calibration-store.json");
}

function ensureDir(): void {
  if (!existsSync(CALIBRATION_DATA_DIR)) {
    mkdirSync(CALIBRATION_DATA_DIR, { recursive: true });
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
      reviews: Array.isArray(parsed.reviews) ? parsed.reviews : [],
      proposals: Array.isArray(parsed.proposals) ? parsed.proposals : [],
      goldenCases: Array.isArray(parsed.goldenCases) ? parsed.goldenCases : [],
      drafts: parsed.drafts && typeof parsed.drafts === "object" ? parsed.drafts : {},
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

export function resetCalibrationStoreForTests(): void {
  memory = structuredClone(EMPTY);
  ensureDir();
  persist(memory);
}

export function listReviews(): CalibrationReview[] {
  return [...load().reviews];
}

export function getReview(id: string): CalibrationReview | undefined {
  return load().reviews.find((r) => r.id === id);
}

export function getReviewByCaseId(caseId: string): CalibrationReview | undefined {
  const all = load().reviews.filter((r) => r.caseId === caseId);
  return all.sort((a, b) => b.version - a.version)[0];
}

export function upsertReview(review: CalibrationReview): CalibrationReview {
  const data = load();
  const idx = data.reviews.findIndex((r) => r.id === review.id);
  if (idx >= 0) data.reviews[idx] = review;
  else data.reviews.push(review);
  persist(data);
  return review;
}

export function listProposals(): KnowledgeChangeProposal[] {
  return [...load().proposals];
}

export function getProposal(id: string): KnowledgeChangeProposal | undefined {
  return load().proposals.find((p) => p.id === id);
}

export function upsertProposal(proposal: KnowledgeChangeProposal): KnowledgeChangeProposal {
  const data = load();
  const idx = data.proposals.findIndex((p) => p.id === proposal.id);
  if (idx >= 0) data.proposals[idx] = proposal;
  else data.proposals.push(proposal);
  persist(data);
  return proposal;
}

export function listGoldenCases(): GoodTradingGoldenCase[] {
  return [...load().goldenCases];
}

export function addGoldenCase(g: GoodTradingGoldenCase): GoodTradingGoldenCase {
  const data = load();
  data.goldenCases.push(g);
  persist(data);
  return g;
}

export function saveDraft(userId: number, caseId: string, draft: unknown): void {
  const data = load();
  data.drafts[`${userId}:${caseId}`] = draft;
  persist(data);
}

export function getDraft(userId: number, caseId: string): unknown {
  return load().drafts[`${userId}:${caseId}`];
}

export function exportStoreJson(): string {
  return JSON.stringify(load(), null, 2);
}
