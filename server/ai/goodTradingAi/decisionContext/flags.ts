/** AI-8.1 / AI-8.1.1 Decision Context Recorder feature flags. Defaults OFF / safe. */

export type DecisionContextRepositoryMode = "memory" | "postgres";

export type DecisionContextStorageHealthStatus =
  | "DURABLE_READY"
  | "DEGRADED"
  | "UNSAFE_MEMORY"
  | "UNAVAILABLE"
  | "RECORDER_DISABLED";

function envBool(key: string, fallback: boolean): boolean {
  const v = process.env[key];
  if (v == null || v === "") return fallback;
  const n = v.trim().toLowerCase();
  if (n === "true" || n === "1" || n === "yes" || n === "on") return true;
  if (n === "false" || n === "0" || n === "no" || n === "off") return false;
  return fallback;
}

/** Master switch — when false, recorder is a no-op. Default false (AI-8.1.1). */
export function isDecisionContextRecorderEnabled(): boolean {
  return envBool("GOODTRADING_DECISION_CONTEXT_RECORDER_ENABLED", false);
}

/**
 * Repository mode: memory | postgres.
 * Defaults: test/local → memory; production → postgres.
 * Explicit env always wins when valid.
 */
export function getDecisionContextRepositoryMode(): DecisionContextRepositoryMode {
  const raw = process.env.GOODTRADING_DECISION_CONTEXT_REPOSITORY?.trim().toLowerCase();
  if (raw === "memory" || raw === "postgres") return raw;
  if (process.env.NODE_ENV === "production") return "postgres";
  return "memory";
}

export function isPostgresUrlConfigured(): boolean {
  return Boolean(process.env.DATABASE_URL?.trim());
}

export function isProductionRuntime(): boolean {
  return process.env.NODE_ENV === "production";
}

/**
 * Production + recorder ON + memory repository is unsafe — no silent fallback,
 * no real capture. Surfaces UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE.
 */
export function isUnsafeNonDurableDecisionContextStore(): boolean {
  return (
    isDecisionContextRecorderEnabled() &&
    isProductionRuntime() &&
    getDecisionContextRepositoryMode() === "memory"
  );
}

/** True only when recorder may perform real capture (not disabled / not unsafe). */
export function canCaptureDecisionContext(): boolean {
  if (!isDecisionContextRecorderEnabled()) return false;
  if (isUnsafeNonDurableDecisionContextStore()) return false;
  if (getDecisionContextRepositoryMode() === "postgres" && !isPostgresUrlConfigured()) {
    return false;
  }
  return true;
}

export const DECISION_CONTEXT_STORE_CAP = 500;
export const DECISION_CONTEXT_TIMELINE_CAP = 200;
export const DECISION_CONTEXT_REF_REGISTRY_CAP = 64;
/** Max age for passive MS/DG refs to be eligible at freeze time. */
export const DECISION_CONTEXT_REF_MAX_AGE_MS = 15 * 60 * 1000;

export const UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE =
  "UNSAFE_NON_DURABLE_DECISION_CONTEXT_STORE" as const;
