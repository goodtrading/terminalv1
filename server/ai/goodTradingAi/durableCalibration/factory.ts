/**
 * AI-7.3.9 — Repository factory. No silent memory fallback when durable required.
 */
import { join } from "node:path";
import { tmpdir } from "node:os";
import { HumanDecisionReviewRepository } from "../decision/humanReview/repository";
import {
  CriticalCalibrationMemory,
  getCriticalCalibrationMemory,
} from "../criticalCalibration/memoryStore";
import {
  KnowledgeDistillationMemory,
  getKnowledgeDistillationMemory,
} from "../knowledgeDistillation/memoryStore";
import {
  getReviewRepositoryMode,
  resolveDurableRootDirs,
} from "./config";
import {
  FileCriticalCalibrationRepository,
  FileHumanReviewRepository,
  FileKnowledgeDistillationRepository,
} from "./fileAdapters";
import {
  PostgresCriticalCalibrationRepository,
  PostgresHumanReviewRepository,
  PostgresKnowledgeDistillationRepository,
} from "./postgresRepositories";
import type {
  CriticalCalibrationRepository,
  HumanReviewRepository,
  KnowledgeDistillationRepository,
} from "./interfaces";
import { ensureCalibrationPostgresSchema, getDoc, listDocs, upsertDoc } from "./postgresSchema";
import type { CriticalCalibrationSessionRecord } from "../criticalCalibration/memoryStore";
import type { CalibrationObservation, CalibrationQuestion, ImprovementProposal } from "@shared/goodTradingAiCriticalCalibration";
import type { CalibrationRunRecord } from "../criticalCalibration/memoryStore";

export type DurableRepos = {
  mode: ReturnType<typeof getReviewRepositoryMode>;
  humanReview: HumanReviewRepository;
  criticalCalibration: CriticalCalibrationRepository;
  knowledgeDistillation: KnowledgeDistillationRepository;
  /** Sync file/memory facade used by legacy CC/KD/HR sync call sites after hydrate. */
  ccMemory: CriticalCalibrationMemory;
  hrFile: HumanDecisionReviewRepository;
  kdMemory: KnowledgeDistillationMemory;
};

let cached: DurableRepos | null = null;
let hydratePromise: Promise<DurableRepos> | null = null;

function fileRoots() {
  const mode = getReviewRepositoryMode();
  const dirs = resolveDurableRootDirs(mode);
  const base =
    mode === "postgres"
      ? join(tmpdir(), "goodtrading-ai-review-pg-cache")
      : null;
  return {
    hr:
      dirs.humanReviewDir ||
      (base ? join(base, "human-decision-review") : undefined),
    cc:
      dirs.criticalCalibrationDir ||
      (base ? join(base, "critical-calibration") : undefined),
    kd:
      dirs.knowledgeDistillationDir ||
      (base ? join(base, "knowledge-distillation") : undefined),
  };
}

async function hydrateCcFromPostgres(mem: CriticalCalibrationMemory): Promise<void> {
  await ensureCalibrationPostgresSchema();
  const sessions = await listDocs<CriticalCalibrationSessionRecord>("cc", "sessions");
  for (const s of sessions) mem.saveSession(s);
  const observations = await listDocs<CalibrationObservation>("cc", "observations");
  for (const o of observations) mem.saveObservation(o);
  const proposals = await listDocs<ImprovementProposal>("cc", "proposals");
  for (const p of proposals) mem.saveProposal(p);
  const runs = await listDocs<CalibrationRunRecord>("cc", "runs");
  for (const r of runs) mem.saveRunRecord(r);
  const queue = await getDoc<{ questions?: CalibrationQuestion[] }>("cc", "meta", "questions-queue");
  if (queue?.questions?.length) mem.saveQuestionQueue(queue.questions);
}

function installCcWriteThrough(mem: CriticalCalibrationMemory): void {
  const origSession = mem.saveSession.bind(mem);
  mem.saveSession = (session) => {
    const out = origSession(session);
    void upsertDoc({ namespace: "cc", collection: "sessions", id: session.id, payload: session });
    return out;
  };
  const origObs = mem.saveObservation.bind(mem);
  mem.saveObservation = (obs) => {
    const out = origObs(obs);
    void upsertDoc({
      namespace: "cc",
      collection: "observations",
      id: obs.id,
      parentId: obs.sessionId,
      payload: obs,
    });
    return out;
  };
  const origProp = mem.saveProposal.bind(mem);
  mem.saveProposal = (proposal) => {
    const out = origProp(proposal);
    void upsertDoc({ namespace: "cc", collection: "proposals", id: proposal.id, payload: proposal });
    return out;
  };
  const origQueue = mem.saveQuestionQueue.bind(mem);
  mem.saveQuestionQueue = (questions) => {
    const out = origQueue(questions);
    void upsertDoc({
      namespace: "cc",
      collection: "meta",
      id: "questions-queue",
      payload: { questions, savedAtMs: Date.now() },
    });
    return out;
  };
  const origRun = mem.saveRunRecord.bind(mem);
  mem.saveRunRecord = (record) => {
    const out = origRun(record);
    void upsertDoc({ namespace: "cc", collection: "runs", id: record.id, payload: record });
    return out;
  };
}

export async function getDurableRepos(force = false): Promise<DurableRepos> {
  if (cached && !force) return cached;
  if (hydratePromise && !force) return hydratePromise;
  hydratePromise = (async () => {
    const mode = getReviewRepositoryMode();
    const roots = fileRoots();

    const ccMemory = getCriticalCalibrationMemory(roots.cc);
    ccMemory.ensureDirs();

    const hrFile = new HumanDecisionReviewRepository(roots.hr);
    hrFile.ensureDirs();

    const kdMemory = getKnowledgeDistillationMemory(roots.kd);
    kdMemory.ensureDirs();

    let humanReview: HumanReviewRepository;
    let criticalCalibration: CriticalCalibrationRepository;
    let knowledgeDistillation: KnowledgeDistillationRepository;

    if (mode === "postgres") {
      await ensureCalibrationPostgresSchema();
      await hydrateCcFromPostgres(ccMemory);
      installCcWriteThrough(ccMemory);
      humanReview = new PostgresHumanReviewRepository();
      criticalCalibration = new PostgresCriticalCalibrationRepository();
      knowledgeDistillation = new PostgresKnowledgeDistillationRepository();
    } else {
      humanReview = new FileHumanReviewRepository(hrFile);
      criticalCalibration = new FileCriticalCalibrationRepository(ccMemory);
      knowledgeDistillation = new FileKnowledgeDistillationRepository(kdMemory);
    }

    cached = {
      mode,
      humanReview,
      criticalCalibration,
      knowledgeDistillation,
      ccMemory,
      hrFile,
      kdMemory,
    };
    return cached;
  })();
  return hydratePromise;
}

export function resetDurableReposForTests(): void {
  cached = null;
  hydratePromise = null;
}
