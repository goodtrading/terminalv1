import { existsSync, mkdirSync, readFileSync, readdirSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import type {
  CalibrationObservation,
  CalibrationQuestion,
  ImprovementProposal,
} from "@shared/goodTradingAiCriticalCalibration";
import { CRITICAL_CALIBRATION_SCHEMA_VERSION } from "@shared/goodTradingAiCriticalCalibration";
import { canAcceptProposal } from "./proposalEngine";

export type CalibrationRunRecord = {
  id: string;
  seed: string;
  count: number;
  reviewCount: number;
  proposalCount: number;
  startedAtMs: number;
  finishedAtMs: number;
  mentorEligible: false;
  version: typeof CRITICAL_CALIBRATION_SCHEMA_VERSION;
};

export type CriticalCalibrationSessionRecord = {
  id: string;
  seed: string;
  questionIds: string[];
  createdAtMs: number;
  mentorEligible: false;
  brainMutate: false;
  autoApply: false;
  appendOnly: true;
  version: typeof CRITICAL_CALIBRATION_SCHEMA_VERSION;
  /** HUMAN = Ignacio production; TECHNICAL = automated/tech probes. */
  kind: "HUMAN" | "TECHNICAL";
  revealedQuestionIds: string[];
  deferredQuestionIds: string[];
  archived: boolean;
  label?: string;
};

function defaultRootDir(): string {
  const env = process.env.GOODTRADING_AI_CRITICAL_CALIBRATION_DIR?.trim();
  if (env) return env;
  return join(process.cwd(), "server", "storage", "critical-calibration");
}

export class CriticalCalibrationMemory {
  readonly rootDir: string;

  constructor(rootDir = defaultRootDir()) {
    this.rootDir = rootDir;
  }

  private proposalsDir(): string {
    return join(this.rootDir, "proposals");
  }
  private questionsPath(): string {
    return join(this.rootDir, "questions-queue.json");
  }
  private runsDir(): string {
    return join(this.rootDir, "runs");
  }
  private sessionsDir(): string {
    return join(this.rootDir, "sessions");
  }
  private observationsDir(): string {
    return join(this.rootDir, "private", "observations");
  }
  private notesDir(): string {
    return join(this.rootDir, "private", "notes");
  }

  ensureDirs(): void {
    for (const d of [
      this.rootDir,
      this.proposalsDir(),
      this.runsDir(),
      this.sessionsDir(),
      this.observationsDir(),
      this.notesDir(),
    ]) {
      if (!existsSync(d)) mkdirSync(d, { recursive: true });
    }
  }

  saveProposal(proposal: ImprovementProposal): ImprovementProposal {
    this.ensureDirs();
    const file = join(this.proposalsDir(), `${proposal.id}.json`);
    writeFileSync(file, JSON.stringify(proposal, null, 2), { encoding: "utf8" });
    return proposal;
  }

  listProposals(): ImprovementProposal[] {
    this.ensureDirs();
    if (!existsSync(this.proposalsDir())) return [];
    return readdirSync(this.proposalsDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.proposalsDir(), f), "utf8")) as ImprovementProposal);
  }

  decideProposal(id: string, status: "ACCEPTED" | "REJECTED", note?: string): ImprovementProposal | null {
    const all = this.listProposals();
    const p = all.find((x) => x.id === id);
    if (!p) return null;
    if (status === "ACCEPTED") {
      const gate = canAcceptProposal(p, this.listObservations());
      if (!gate.ok) {
        throw new Error(`PROPOSAL_SUPPORT_INSUFFICIENT: ${gate.reason}`);
      }
    }
    const updated: ImprovementProposal = {
      ...p,
      status,
      decidedAtMs: Date.now(),
      decisionNote: note?.slice(0, 600),
      autoApply: false,
      brainMutate: false,
      mentorEligible: false,
    };
    this.saveProposal(updated);
    if (note) {
      writeFileSync(join(this.notesDir(), `${id}.txt`), note, { encoding: "utf8" });
    }
    return updated;
  }

  saveQuestionQueue(questions: CalibrationQuestion[]): CalibrationQuestion[] {
    this.ensureDirs();
    writeFileSync(this.questionsPath(), JSON.stringify({ questions, savedAtMs: Date.now() }, null, 2), {
      encoding: "utf8",
    });
    return questions;
  }

  listQuestions(): CalibrationQuestion[] {
    this.ensureDirs();
    if (!existsSync(this.questionsPath())) return [];
    const raw = JSON.parse(readFileSync(this.questionsPath(), "utf8")) as { questions?: CalibrationQuestion[] };
    return raw.questions ?? [];
  }

  saveRunRecord(record: CalibrationRunRecord): CalibrationRunRecord {
    this.ensureDirs();
    writeFileSync(join(this.runsDir(), `${record.id}.json`), JSON.stringify(record, null, 2), { encoding: "utf8" });
    return record;
  }

  listRuns(): CalibrationRunRecord[] {
    this.ensureDirs();
    if (!existsSync(this.runsDir())) return [];
    return readdirSync(this.runsDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.runsDir(), f), "utf8")) as CalibrationRunRecord);
  }

  saveSession(session: CriticalCalibrationSessionRecord): CriticalCalibrationSessionRecord {
    this.ensureDirs();
    writeFileSync(join(this.sessionsDir(), `${session.id}.json`), JSON.stringify(session, null, 2), {
      encoding: "utf8",
    });
    return session;
  }

  getSession(id: string): CriticalCalibrationSessionRecord | null {
    const file = join(this.sessionsDir(), `${id}.json`);
    if (!existsSync(file)) return null;
    return JSON.parse(readFileSync(file, "utf8")) as CriticalCalibrationSessionRecord;
  }

  listSessions(): CriticalCalibrationSessionRecord[] {
    this.ensureDirs();
    return readdirSync(this.sessionsDir())
      .filter((f) => f.endsWith(".json"))
      .map((f) => JSON.parse(readFileSync(join(this.sessionsDir(), f), "utf8")) as CriticalCalibrationSessionRecord);
  }

  saveObservation(obs: CalibrationObservation): CalibrationObservation {
    this.ensureDirs();
    const dir = join(this.observationsDir(), obs.sessionId);
    if (!existsSync(dir)) mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, `${obs.id}.json`), JSON.stringify(obs, null, 2), { encoding: "utf8" });
    return obs;
  }

  listObservations(sessionId?: string): CalibrationObservation[] {
    this.ensureDirs();
    if (!existsSync(this.observationsDir())) return [];
    const sessions = sessionId
      ? [sessionId]
      : readdirSync(this.observationsDir()).filter((d) => {
          try {
            return true;
          } catch {
            return false;
          }
        });
    const out: CalibrationObservation[] = [];
    for (const sid of sessions) {
      const dir = join(this.observationsDir(), sid);
      if (!existsSync(dir)) continue;
      for (const f of readdirSync(dir).filter((x) => x.endsWith(".json"))) {
        out.push(JSON.parse(readFileSync(join(dir, f), "utf8")) as CalibrationObservation);
      }
    }
    return out;
  }

  resetForTests(): void {
    if (existsSync(this.rootDir)) rmSync(this.rootDir, { recursive: true, force: true });
    this.ensureDirs();
  }
}

let singleton: CriticalCalibrationMemory | null = null;
export function getCriticalCalibrationMemory(rootDir?: string): CriticalCalibrationMemory {
  if (!singleton || rootDir) singleton = new CriticalCalibrationMemory(rootDir);
  return singleton;
}

export function resetCriticalCalibrationMemoryForTests(rootDir?: string): void {
  singleton = new CriticalCalibrationMemory(rootDir);
  singleton.resetForTests();
}
