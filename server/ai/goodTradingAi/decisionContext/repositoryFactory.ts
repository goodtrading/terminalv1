/**
 * AI-8.1.1 — Resolve DecisionContextRepository (memory | postgres).
 * Never silently falls back from postgres→memory in production capture path.
 */
import type { DecisionContextRepository } from "./interfaces";
import {
  getDecisionContextRepositoryMode,
  isPostgresUrlConfigured,
  isUnsafeNonDurableDecisionContextStore,
  UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE,
} from "./flags";
import { MemoryDecisionContextRepository } from "./memoryRepository";
import { PostgresDecisionContextRepository } from "./postgresRepository";

let cached: DecisionContextRepository | null = null;
let cachedMode: string | null = null;

export function getDecisionContextRepository(): DecisionContextRepository {
  if (isUnsafeNonDurableDecisionContextStore()) {
    throw new Error(UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE);
  }
  const mode = getDecisionContextRepositoryMode();
  if (mode === "postgres") {
    if (!isPostgresUrlConfigured()) {
      throw new Error("DATABASE_UNAVAILABLE");
    }
    if (!cached || cachedMode !== "postgres") {
      cached = new PostgresDecisionContextRepository();
      cachedMode = "postgres";
    }
    return cached;
  }
  if (!cached || cachedMode !== "memory") {
    cached = new MemoryDecisionContextRepository();
    cachedMode = "memory";
  }
  return cached;
}

export function resetDecisionContextRepositoryForTests(): void {
  cached = null;
  cachedMode = null;
}
