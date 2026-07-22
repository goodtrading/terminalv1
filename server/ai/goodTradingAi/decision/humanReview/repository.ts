/**
 * AI-7.2 — File-backed HumanDecisionReviewRepository.
 *
 * Authority is filesystem JSON under:
 *   process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR
 *   or default: server/storage/human-decision-review/
 *
 * NOT Redis. NOT localStorage. Private answers must stay gitignored
 * (see .gitignore: server/storage/human-decision-review/ and private/ under that tree).
 *
 * Answers are append-only by revision (new revision appends; never mutate prior).
 */
import {
  existsSync,
  mkdirSync,
  readFileSync,
  writeFileSync,
  readdirSync,
  rmSync,
} from "node:fs";
import { join } from "node:path";
import { randomUUID } from "node:crypto";
import type {
  HumanDecisionAnswer,
  MethodologyChangeProposal,
} from "@shared/goodTradingAiHumanReview";
import type { HoldoutSnapshot } from "./holdout";

export type HumanReviewSessionRecord = {
  id: string;
  createdAtMs: number;
  seed: string | null;
  caseOrder: string[];
  owner: "IGNACIO";
  mentorEligible: false;
};

function defaultRootDir(): string {
  const env = process.env.GOODTRADING_AI_HUMAN_REVIEW_DIR?.trim();
  if (env) return env;
  return join(process.cwd(), "server", "storage", "human-decision-review");
}

export class HumanDecisionReviewRepository {
  readonly rootDir: string;

  constructor(rootDir = defaultRootDir()) {
    this.rootDir = rootDir;
  }

  private sessionsDir(): string {
    return join(this.rootDir, "sessions");
  }

  /** Private answers directory (gitignored). */
  private answersDir(): string {
    return join(this.rootDir, "private", "answers");
  }

  private proposalsDir(): string {
    return join(this.rootDir, "proposals");
  }

  private holdoutPath(): string {
    return join(this.rootDir, "holdout-snapshot.json");
  }

  ensureDirs(): void {
    for (const d of [this.rootDir, this.sessionsDir(), this.answersDir(), this.proposalsDir()]) {
      if (!existsSync(d)) mkdirSync(d, { recursive: true });
    }
  }

  createSession(input: {
    caseOrder: string[];
    seed?: string | null;
    nowMs?: number;
  }): HumanReviewSessionRecord {
    this.ensureDirs();
    const session: HumanReviewSessionRecord = {
      id: randomUUID(),
      createdAtMs: input.nowMs ?? Date.now(),
      seed: input.seed ?? null,
      caseOrder: [...input.caseOrder],
      owner: "IGNACIO",
      mentorEligible: false,
    };
    writeFileSync(
      join(this.sessionsDir(), `${session.id}.json`),
      JSON.stringify(session, null, 2),
      "utf8",
    );
    return session;
  }

  getSession(sessionId: string): HumanReviewSessionRecord | null {
    const p = join(this.sessionsDir(), `${sessionId}.json`);
    if (!existsSync(p)) return null;
    try {
      return JSON.parse(readFileSync(p, "utf8")) as HumanReviewSessionRecord;
    } catch {
      return null;
    }
  }

  listSessions(): HumanReviewSessionRecord[] {
    this.ensureDirs();
    const out: HumanReviewSessionRecord[] = [];
    for (const name of readdirSync(this.sessionsDir())) {
      if (!name.endsWith(".json")) continue;
      const s = this.getSession(name.replace(/\.json$/, ""));
      if (s) out.push(s);
    }
    return out.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  private answersFile(sessionId: string, caseId: string): string {
    const dir = join(this.answersDir(), sessionId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    return join(dir, `${caseId}.json`);
  }

  private readAnswerRevisions(sessionId: string, caseId: string): HumanDecisionAnswer[] {
    const p = this.answersFile(sessionId, caseId);
    if (!existsSync(p)) return [];
    try {
      const raw = JSON.parse(readFileSync(p, "utf8")) as { revisions?: HumanDecisionAnswer[] };
      return Array.isArray(raw.revisions) ? raw.revisions : [];
    } catch {
      return [];
    }
  }

  /**
   * Append-only: never mutates prior revisions. New answer must have revision = max+1.
   */
  appendAnswer(sessionId: string, answer: HumanDecisionAnswer): HumanDecisionAnswer {
    this.ensureDirs();
    const prior = this.readAnswerRevisions(sessionId, answer.reviewCaseId);
    const maxRev = prior.reduce((m, a) => Math.max(m, a.revision), 0);
    if (answer.revision !== maxRev + 1) {
      throw new Error(
        `Answer revision must be ${maxRev + 1} (got ${answer.revision}); append-only`,
      );
    }
    const sealedPrior = prior.map((a) => structuredClone(a));
    const next = [...sealedPrior, structuredClone(answer)];
    writeFileSync(
      this.answersFile(sessionId, answer.reviewCaseId),
      JSON.stringify({ revisions: next }, null, 2),
      "utf8",
    );
    return answer;
  }

  getAnswersForSession(sessionId: string): HumanDecisionAnswer[] {
    const dir = join(this.answersDir(), sessionId);
    if (!existsSync(dir)) return [];
    const latest: HumanDecisionAnswer[] = [];
    for (const name of readdirSync(dir)) {
      if (!name.endsWith(".json")) continue;
      const caseId = name.replace(/\.json$/, "");
      const rev = this.getLatestAnswer(sessionId, caseId);
      if (rev) latest.push(rev);
    }
    return latest;
  }

  getLatestAnswer(sessionId: string, caseId: string): HumanDecisionAnswer | null {
    const revs = this.readAnswerRevisions(sessionId, caseId);
    if (revs.length === 0) return null;
    return revs.reduce((a, b) => (b.revision > a.revision ? b : a));
  }

  appendProposal(proposal: MethodologyChangeProposal): MethodologyChangeProposal {
    this.ensureDirs();
    writeFileSync(
      join(this.proposalsDir(), `${proposal.id}.json`),
      JSON.stringify(proposal, null, 2),
      "utf8",
    );
    return proposal;
  }

  listProposals(): MethodologyChangeProposal[] {
    this.ensureDirs();
    const out: MethodologyChangeProposal[] = [];
    for (const name of readdirSync(this.proposalsDir())) {
      if (!name.endsWith(".json")) continue;
      try {
        out.push(
          JSON.parse(readFileSync(join(this.proposalsDir(), name), "utf8")) as MethodologyChangeProposal,
        );
      } catch {
        /* skip */
      }
    }
    return out.sort((a, b) => b.createdAtMs - a.createdAtMs);
  }

  saveHoldoutSnapshot(snapshot: HoldoutSnapshot): HoldoutSnapshot {
    this.ensureDirs();
    writeFileSync(this.holdoutPath(), JSON.stringify(snapshot, null, 2), "utf8");
    return snapshot;
  }

  loadHoldoutSnapshot(): HoldoutSnapshot | null {
    if (!existsSync(this.holdoutPath())) return null;
    try {
      return JSON.parse(readFileSync(this.holdoutPath(), "utf8")) as HoldoutSnapshot;
    } catch {
      return null;
    }
  }

  /** Wipe repository root (tests only). */
  resetForTests(): void {
    if (existsSync(this.rootDir)) {
      rmSync(this.rootDir, { recursive: true, force: true });
    }
    this.ensureDirs();
  }
}

let singleton: HumanDecisionReviewRepository | null = null;

export function getHumanDecisionReviewRepository(): HumanDecisionReviewRepository {
  if (!singleton) singleton = new HumanDecisionReviewRepository();
  return singleton;
}

export function setHumanDecisionReviewRepositoryForTests(
  repo: HumanDecisionReviewRepository | null,
): void {
  singleton = repo;
}
