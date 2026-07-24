/**
 * AI-8.1.1 — Decision Context storage health.
 * States: DURABLE_READY | DEGRADED | UNSAFE_MEMORY | UNAVAILABLE | RECORDER_DISABLED
 */
import type { DecisionContextStorageHealthStatus } from "./flags";
import {
  canCaptureDecisionContext,
  getDecisionContextRepositoryMode,
  isDecisionContextRecorderEnabled,
  isPostgresUrlConfigured,
  isUnsafeNonDurableDecisionContextStore,
  UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE,
} from "./flags";
import { pool } from "../../../db";
import { ensureDecisionContextPostgresSchema } from "./postgresSchema";

export type DecisionContextStorageHealth = {
  status: DecisionContextStorageHealthStatus;
  mode: "memory" | "postgres";
  recorderEnabled: boolean;
  canCapture: boolean;
  repositoryDurable: boolean;
  postgresAvailable: boolean;
  unsafeNonDurable: boolean;
  code: string | null;
  evidence: string[];
  mentorEligible: false;
  brainMutate: false;
  learning: false;
  autoApply: false;
};

export async function assessDecisionContextStorageHealth(): Promise<DecisionContextStorageHealth> {
  const mode = getDecisionContextRepositoryMode();
  const recorderEnabled = isDecisionContextRecorderEnabled();
  const unsafeNonDurable = isUnsafeNonDurableDecisionContextStore();
  const evidence: string[] = [`mode=${mode}`, `recorderEnabled=${recorderEnabled}`];
  let postgresAvailable = false;
  let repositoryDurable = false;
  let status: DecisionContextStorageHealthStatus;

  if (!recorderEnabled) {
    status = "RECORDER_DISABLED";
    evidence.push("recorder default/off");
  } else if (unsafeNonDurable) {
    status = "UNSAFE_MEMORY";
    evidence.push(UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE);
  } else if (mode === "postgres") {
    if (!isPostgresUrlConfigured() || !pool) {
      status = "UNAVAILABLE";
      evidence.push("DATABASE_URL missing or pool null");
    } else {
      try {
        await pool.query("SELECT 1 AS ok");
        await ensureDecisionContextPostgresSchema();
        postgresAvailable = true;
        repositoryDurable = true;
        status = "DURABLE_READY";
        evidence.push("postgres SELECT 1 ok", "schema ensured");
      } catch {
        status = "DEGRADED";
        evidence.push("postgres probe or schema failed");
      }
    }
  } else {
    // memory mode — allowed for test/local only when not production+recorder
    repositoryDurable = false;
    status = "DEGRADED";
    evidence.push("memory repository (non-durable)");
  }

  return {
    status,
    mode,
    recorderEnabled,
    canCapture: canCaptureDecisionContext() && status !== "UNAVAILABLE" && status !== "UNSAFE_MEMORY",
    repositoryDurable,
    postgresAvailable,
    unsafeNonDurable,
    code: unsafeNonDurable ? UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE : null,
    evidence: evidence.slice(0, 40),
    mentorEligible: false,
    brainMutate: false,
    learning: false,
    autoApply: false,
  };
}
