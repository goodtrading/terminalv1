/**
 * AI-7.3.9 — Legitimate recovery attempt only. Never invent answers from engine/golden.
 */
import { existsSync, readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { RecoveryOutcome } from "@shared/goodTradingAiDurableCalibration";
import { getCriticalCalibrationMemory } from "../criticalCalibration/memoryStore";
import { getDurableRepos } from "./factory";
import { getReviewRepositoryMode, isPostgresUrlConfigured } from "./config";

export type RecoveryReport = {
  outcome: RecoveryOutcome;
  humanSessionsFound: number;
  humanObservationsFound: number;
  sourcesChecked: string[];
  evidence: string[];
  inventRecovery: false;
  mentorEligible: false;
  brainMutate: false;
};

export async function attemptLegitimateRecovery(): Promise<RecoveryReport> {
  const sourcesChecked: string[] = [];
  const evidence: string[] = [];
  let humanSessionsFound = 0;
  let humanObservationsFound = 0;

  sourcesChecked.push("critical-calibration-file-store");
  try {
    const mem = getCriticalCalibrationMemory();
    const sessions = mem.listSessions().filter((s) => s.kind === "HUMAN");
    humanSessionsFound += sessions.length;
    for (const s of sessions) {
      humanObservationsFound += mem.listObservations(s.id).length;
    }
    evidence.push(`file_store humanSessions=${sessions.length}`);
  } catch {
    evidence.push("file_store_unreadable");
  }

  sourcesChecked.push(`durable-mode:${getReviewRepositoryMode()}`);
  try {
    const repos = await getDurableRepos();
    const sessions = (await repos.criticalCalibration.listSessions()).filter((s) => s.kind === "HUMAN");
    if (sessions.length > humanSessionsFound) humanSessionsFound = sessions.length;
    let obs = 0;
    for (const s of sessions) {
      obs += (await repos.criticalCalibration.listObservations(s.id)).length;
    }
    if (obs > humanObservationsFound) humanObservationsFound = obs;
    evidence.push(`durable_repo humanSessions=${sessions.length} obs=${obs}`);
  } catch {
    evidence.push("durable_repo_unavailable");
  }

  sourcesChecked.push("postgres-configured-boolean");
  evidence.push(`DATABASE_URL_configured=${isPostgresUrlConfigured()}`);

  sourcesChecked.push("local-backup-json");
  const backupDir = join(process.cwd(), "server", "storage", "calibration-backups");
  if (existsSync(backupDir)) {
    const files = readdirSync(backupDir).filter((f) => f.endsWith(".json"));
    evidence.push(`backup_files=${files.length}`);
    for (const f of files.slice(0, 5)) {
      try {
        const raw = JSON.parse(readFileSync(join(backupDir, f), "utf8")) as {
          sessions?: Array<{ kind?: string }>;
          observations?: unknown[];
        };
        const hs = (raw.sessions ?? []).filter((s) => s.kind === "HUMAN").length;
        humanSessionsFound = Math.max(humanSessionsFound, hs);
        humanObservationsFound = Math.max(
          humanObservationsFound,
          Array.isArray(raw.observations) ? raw.observations.length : 0,
        );
      } catch {
        evidence.push(`backup_unreadable:${f}`);
      }
    }
  } else {
    evidence.push("no_local_backup_dir");
  }

  sourcesChecked.push("engine-golden-excluded");
  sourcesChecked.push("redis-telemetry-excluded");
  evidence.push("no_invented_recovery");

  let outcome: RecoveryOutcome = "NOT_RECOVERABLE";
  if (humanSessionsFound > 0 && humanObservationsFound >= 15) outcome = "RECOVERED";
  else if (humanSessionsFound > 0 || humanObservationsFound > 0) outcome = "PARTIALLY_RECOVERED";

  return {
    outcome,
    humanSessionsFound,
    humanObservationsFound,
    sourcesChecked,
    evidence: evidence.slice(0, 40),
    inventRecovery: false,
    mentorEligible: false,
    brainMutate: false,
  };
}
